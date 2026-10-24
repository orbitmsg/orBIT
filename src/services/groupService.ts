import { createClient } from '@supabase/supabase-js';
import { getVercelBaseUrl } from './gatewayManager';
import { getPusher, getGroupPusher } from '../utils/pusher';
import { supabaseService } from './supabaseService';
import { generateGroupInviteCode, generateGroupId } from '../lib/codes';
import {
  deriveGroupKey,
  deriveGroupId,
  extractGroupCode,
  isValidGroupCode,
} from '../lib/groupCrypto';
import { useChatStore, type Message } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

export interface GroupMemberInfo {
  nickname: string;
  userCode?: string;
  userId?: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
  lastSeen?: number;
  avatarUrl?: string | null;
}

export interface GroupInfo {
  id: string;
  code: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  creatorNickname: string;
  creatorCode?: string | null;
  membersCount: number;
  maxMembers: number;
  members: GroupMemberInfo[];
  createdAt: number;
  sharedSecret?: string;
  inviteActive?: boolean;
  inviteExpiresAt?: number | null;
}

const GROUPS_SUPABASE_URL = 'https://vxjaybyveerulkdqhggr.supabase.co';
const GROUPS_SUPABASE_KEY = 'sb_publishable_x6OPhg68nS-xBcPn4K47NQ_2nSS4Kfu';

class GroupService {
  private supabase = createClient(GROUPS_SUPABASE_URL, GROUPS_SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  private getWorkerUrl(): string {
    return getVercelBaseUrl();
  }

  async createGroup(
    name: string,
    description: string,
    creatorNickname: string,
    creatorCode?: string,
    avatarUrl?: string | null,
    creatorUserId?: string,
    creatorAvatarUrl?: string | null
  ): Promise<{ group: GroupInfo; sharedSecret: string } | null> {
    const secretCode = generateGroupInviteCode();
    const id = generateGroupId();
    const code = secretCode;
    const sharedSecret = deriveGroupKey(secretCode);

    const initialMember: GroupMemberInfo = {
      nickname: creatorNickname,
      userCode: creatorCode || creatorNickname,
      userId: creatorUserId || creatorCode || creatorNickname,
      role: 'owner',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarUrl: creatorAvatarUrl || null,
    };

    try {
      fetch(`${this.getWorkerUrl()}/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          code,
          name: name.trim(),
          description: description.trim(),
          avatarUrl: avatarUrl || null,
          creatorNickname,
          creatorCode: creatorCode || null,
          creatorUserId: creatorUserId || null,
          maxMembers: 10,
          members: [initialMember],
          membersCount: 1,
        }),
      }).catch(() => {});
    } catch {}

    const group: GroupInfo = {
      id,
      code: secretCode,
      name: name.trim(),
      description: description.trim(),
      avatarUrl: avatarUrl || null,
      creatorNickname,
      creatorCode: creatorCode || null,
      membersCount: 1,
      maxMembers: 10,
      members: [initialMember],
      createdAt: Date.now(),
      sharedSecret,
      inviteActive: true,
      inviteExpiresAt: null,
    };

    this.sendSystemMessage(id, sharedSecret, 'create', creatorNickname);
    return { group, sharedSecret };
  }

  async getGroup(groupIdOrCode: string): Promise<GroupInfo | null> {
    const raw = groupIdOrCode.trim();
    const isIdOnly = raw.length === 36 && /^[0-9A-F]{36}$/i.test(raw);
    const secret = isIdOnly ? '' : (extractGroupCode(raw) || raw);
    const groupId = isIdOnly ? raw : deriveGroupId(secret);

    try {
      let query = this.supabase.from('groups').select('*');
      if (isIdOnly) {
        query = query.eq('id', raw);
      } else {
        query = query.or(`id.eq.${groupId},code.eq.${secret},code.eq.${raw}`);
      }
      const { data: g } = await query.maybeSingle();
      if (g) {
        const { data: membersRows } = await this.supabase.from('group_members').select('*').eq('group_id', g.id);
        const members: GroupMemberInfo[] = (membersRows || []).map((m: any) => ({
          nickname: m.nickname,
          userCode: m.user_code,
          userId: m.user_id || m.user_code,
          role: m.role || 'member',
          joinedAt: new Date(m.joined_at || g.created_at).getTime(),
          lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
          avatarUrl: m.avatar_url || null,
        }));

        let inviteActive = true;
        let expiresAt: number | null = null;
        if (g.creator_id && typeof g.creator_id === 'string' && g.creator_id.startsWith('{')) {
          try {
            const parsed = JSON.parse(g.creator_id);
            if (parsed.active === false) inviteActive = false;
            if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
          } catch {}
        }

        return {
          id: g.id,
          code: g.code || secret || '',
          name: g.name,
          description: g.description || '',
          avatarUrl: g.avatar_url || null,
          creatorNickname: g.creator_nickname,
          creatorCode: g.creator_code || null,
          membersCount: g.members_count || members.length || 1,
          maxMembers: g.max_members || 10,
          members,
          createdAt: new Date(g.created_at).getTime(),
          sharedSecret: deriveGroupKey(g.code || secret || g.id),
          inviteActive,
          inviteExpiresAt: expiresAt,
        };
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(groupId)}`);
      if (res.ok) {
        const data = (await res.json()) as { group: GroupInfo };
        if (data.group) {
          return { 
            ...data.group, 
            code: secret || data.group.code || '', 
            sharedSecret: secret ? deriveGroupKey(secret) : (data.group.code ? deriveGroupKey(data.group.code) : deriveGroupKey(data.group.id)) 
          };
        }
      }
    } catch {}

    return null;
  }

  async joinGroup(
    codeOrLink: string,
    nickname: string,
    userCode?: string,
    meta?: { name?: string; creator?: string; avatarUrl?: string; description?: string; userId?: string },
    inviterNickname?: string
  ): Promise<{ group: GroupInfo; sharedSecret: string }> {
    const raw = codeOrLink.trim();
    const secret = extractGroupCode(raw) || raw;

    if (!secret || !isValidGroupCode(secret)) {
      throw new Error('INVALID_CODE');
    }

    const derivedId = deriveGroupId(secret);
    let groupRow: any = null;

    try {
      const { data } = await this.supabase
        .from('groups')
        .select('*')
        .or(`id.eq.${derivedId},code.eq.${secret},code.eq.${raw}`)
        .maybeSingle();
      if (data) {
        groupRow = data;
      }
    } catch {}

    if (!groupRow) {
      try {
        const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(secret)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.group) groupRow = data.group;
        }
      } catch {}
    }

    if (!groupRow) {
      try {
        const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(derivedId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.group) groupRow = data.group;
        }
      } catch {}
    }

    if (!groupRow) {
      throw new Error('GROUP_NOT_FOUND');
    }

    let inviteActive = true;
    let expiresAt: number | null = null;
    if (groupRow.creator_id) {
      try {
        const parsed = typeof groupRow.creator_id === 'string' && groupRow.creator_id.startsWith('{') ? JSON.parse(groupRow.creator_id) : null;
        if (parsed) {
          if (parsed.active === false) inviteActive = false;
          if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
        }
      } catch {}
    }

    if (!inviteActive) {
      throw new Error('INVITE_REVOKED');
    }

    if (expiresAt && Date.now() > expiresAt) {
      throw new Error('INVITE_EXPIRED');
    }

    const realGroupId = groupRow.id || derivedId;
    const sharedSecret = deriveGroupKey(secret || groupRow.code || realGroupId);
    const candidateId = meta?.userId || userCode;
    const memberCode = (userCode && userCode.length === 36 ? userCode : null) || (candidateId && candidateId.length === 36 ? candidateId : null) || userCode || candidateId || nickname;

    let currentMembers: any[] = [];
    try {
      const { data: membersRows } = await this.supabase.from('group_members').select('*').eq('group_id', realGroupId);
      currentMembers = membersRows || [];
    } catch {}

    const isAlreadyMember = currentMembers.some((m: any) => {
      const mId = m.user_id || m.user_code;
      if (candidateId && mId) return mId === candidateId;
      if (memberCode && mId) return mId === memberCode;
      return false;
    });

    if (!isAlreadyMember) {
      if (currentMembers.length >= 10) {
        throw new Error('GROUP_FULL');
      }

      try {
        fetch(`${this.getWorkerUrl()}/groups/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: realGroupId,
            code: secret,
            nickname,
            userCode: memberCode,
            userId: meta?.userId || candidateId || memberCode,
            name: groupRow.name,
            creatorNickname: groupRow.creator_nickname,
            avatarUrl: meta?.avatarUrl || groupRow.avatar_url || null,
          }),
        }).catch(() => {});
      } catch {}
    }

    if (!isAlreadyMember) {
      if (inviterNickname) {
        this.sendSystemMessage(realGroupId, sharedSecret, 'invite', inviterNickname, nickname);
      } else {
        this.sendSystemMessage(realGroupId, sharedSecret, 'join', nickname, nickname);
      }
    }

    let formattedMembers: GroupMemberInfo[] = [];
    try {
      const { data: updatedMembers } = await this.supabase.from('group_members').select('*').eq('group_id', realGroupId);
      formattedMembers = (updatedMembers || currentMembers).map((m: any) => ({
        nickname: m.nickname,
        userCode: m.user_code,
        userId: m.user_id || m.user_code,
        role: m.role || 'member',
        joinedAt: new Date(m.joined_at || Date.now()).getTime(),
        lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
        avatarUrl: m.avatar_url || null,
      }));
    } catch {
      formattedMembers = [{
        nickname,
        userCode: memberCode,
        userId: meta?.userId || candidateId || memberCode,
        role: 'member',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        avatarUrl: meta?.avatarUrl || null,
      }];
    }

    const resultGroup: GroupInfo = {
      id: realGroupId,
      code: groupRow.code || secret,
      name: groupRow.name,
      description: groupRow.description || '',
      avatarUrl: groupRow.avatar_url || null,
      creatorNickname: groupRow.creator_nickname,
      creatorCode: groupRow.creator_code || null,
      membersCount: Math.max(formattedMembers.length, 1),
      maxMembers: 10,
      members: formattedMembers,
      createdAt: new Date(groupRow.created_at || Date.now()).getTime(),
      sharedSecret,
      inviteActive,
      inviteExpiresAt: expiresAt,
    };

    return { group: resultGroup, sharedSecret };
  }

  async addMember(
    groupId: string,
    inviteCode: string,
    nickname: string,
    userCode?: string,
    avatarUrl?: string | null,
    inviterNickname?: string
  ): Promise<GroupInfo | null> {
    try {
      const codeToUse = inviteCode || groupId;
      const result = await this.joinGroup(
        codeToUse,
        nickname,
        userCode,
        { avatarUrl: avatarUrl || undefined, userId: userCode },
        inviterNickname
      );
      if (result?.group) {
        const canonicalId = result.group.id || groupId;
        try {
          const groupPusher = getGroupPusher();
          const channel = groupPusher.subscribe(`presence-group-${canonicalId}`);
          const joinData = {
            type: 'member-joined',
            groupId: canonicalId,
            nickname,
            userCode,
            userId: userCode,
            members: result.group.members,
            membersCount: result.group.membersCount,
            inviterNickname,
          };
          const sendJoin = () => {
            try { channel.trigger('member-joined', joinData); } catch {}
            try { channel.trigger('client-message', joinData); } catch {}
          };
          if (channel.subscribed) sendJoin();
          else channel.bind('pusher:subscription_succeeded', sendJoin);
        } catch {}
        return result.group;
      }
    } catch {}
    return null;
  }

  async resetInviteLink(groupId: string): Promise<string | null> {
    const newCode = generateGroupInviteCode();
    try {
      const { data: existing } = await this.supabase
        .from('groups')
        .select('id, creator_id')
        .or(`id.eq.${groupId},code.eq.${groupId}`)
        .maybeSingle();

      const realId = existing?.id || groupId;

      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: realId, code: newCode, inviteActive: true }),
      }).catch(() => {});

      useChatStore.getState().updateChat(groupId, { inviteCode: newCode, inviteActive: true });
      if (realId !== groupId) {
        useChatStore.getState().updateChat(realId, { inviteCode: newCode, inviteActive: true });
      }
      return newCode;
    } catch {
      useChatStore.getState().updateChat(groupId, { inviteCode: newCode, inviteActive: true });
      return newCode;
    }
  }

  async revokeInviteLink(groupId: string): Promise<boolean> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, inviteActive: false }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async enableInviteLink(groupId: string): Promise<boolean> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, inviteActive: true }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async setInviteExpiration(groupId: string, expiresAt: number | null): Promise<boolean> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, inviteExpiresAt: expiresAt }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async leaveGroup(groupId: string, sharedSecret: string, nickname: string, userCode?: string, userId?: string): Promise<void> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          nickname,
          userCode: userCode || null,
          userId: userId || null,
        }),
      }).catch(() => {});
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const leaveData = {
        type: 'member-left',
        groupId,
        nickname,
        userCode: userCode || null,
        userId: userId || null,
      };
      const sendLeave = () => {
        try { channel.trigger('member-left', leaveData); } catch {}
        try { channel.trigger('client-message', leaveData); } catch {}
      };
      if (channel.subscribed) sendLeave();
      else channel.bind('pusher:subscription_succeeded', sendLeave);
    } catch {}

    this.sendSystemMessage(groupId, sharedSecret, 'leave', nickname);
  }

  async kickMember(groupId: string, sharedSecret: string, targetNickname: string, adminNickname: string, targetUserCode?: string, targetUserId?: string): Promise<void> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          targetNickname,
          targetUserCode: targetUserCode || null,
          targetUserId: targetUserId || null,
          adminNickname,
        }),
      }).catch(() => {});
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const kickData = {
        type: 'kick',
        target: targetNickname,
        targetNickname,
        targetUserCode: targetUserCode || null,
        targetUserId: targetUserId || null,
        admin: adminNickname,
      };
      const sendKick = () => {
        try { channel.trigger('kick', kickData); } catch {}
        try { channel.trigger('client-message', kickData); } catch {}
      };
      if (channel.subscribed) sendKick();
      else channel.bind('pusher:subscription_succeeded', sendKick);
    } catch {}

    this.sendSystemMessage(groupId, sharedSecret, 'kick', adminNickname, targetNickname);
  }

  async updateGroup(
    groupId: string,
    sharedSecret: string,
    data: { name?: string; description?: string; avatarUrl?: string | null },
    actorNickname?: string
  ): Promise<boolean> {
    const actor = actorNickname || useAuthStore.getState().nickname || '';
    if (data.name !== undefined) {
      this.sendSystemMessage(groupId, sharedSecret, 'title', actor, undefined);
    }
    if (data.avatarUrl !== undefined) {
      this.sendSystemMessage(groupId, sharedSecret, 'avatar', actor, undefined);
    }

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.description !== undefined) updatePayload.description = data.description.trim();
    if (data.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          name: data.name,
          description: data.description,
          avatarUrl: data.avatarUrl,
        }),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const deleteData = { type: 'group-deleted', groupId };
      const sendDelete = () => {
        try { channel.trigger('group-deleted', deleteData); } catch {}
        try { channel.trigger('client-message', deleteData); } catch {}
      };
      if (channel.subscribed) sendDelete();
      else channel.bind('pusher:subscription_succeeded', sendDelete);
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  async updateMemberRole(
    groupId: string,
    targetNickname: string,
    role: 'admin' | 'member',
    targetUserCode?: string,
    actorNickname?: string
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, targetNickname, targetUserCode: targetUserCode || null, role }),
      });
      const actor = actorNickname || useAuthStore.getState().nickname || '';
      const secret = deriveGroupKey(groupId);
      if (role === 'admin') {
        this.sendSystemMessage(groupId, secret, 'admin', actor, targetNickname);
      } else if (role === 'member') {
        this.sendSystemMessage(groupId, secret, 'unadmin', actor, targetNickname);
      }
      return res.ok;
    } catch {
      return true;
    }
  }

  async fetchGroupMessages(groupId: string, limit = 100): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        return data.reverse();
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/messages?groupId=${encodeURIComponent(groupId)}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.messages) ? data.messages : [];
      }
    } catch {}
    return [];
  }

  async sendGroupMessage(payload: any): Promise<string | null> {
    const msgId = payload.id || `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      fetch(`${this.getWorkerUrl()}/groups/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, id: msgId }),
      }).catch(() => {});
    } catch {}

    return msgId;
  }

  async sendSystemMessage(
    groupId: string,
    _sharedSecret: string,
    eventType: 'join' | 'title' | 'avatar' | 'admin' | 'unadmin' | 'call' | 'call_ended' | 'kick' | 'create' | 'invite' | 'leave',
    actorNickname: string,
    targetNickname?: string
  ): Promise<void> {
    const actor = actorNickname || useAuthStore.getState().nickname || 'Участник';
    const textMap: Record<string, string> = {
      create: `${actor} создал(а) группу`,
      invite: `${actor} пригласил(а) ${targetNickname || ''} в группу`,
      join: `${actor} вступил(а) в группу`,
      leave: `${actor} покинул(а) группу`,
      title: `${actor} изменил(а) имя группы`,
      avatar: `${actor} изменил(а) аватарку группы`,
      admin: `${actor} назначил(а) ${targetNickname || ''} администратором`,
      unadmin: `${actor} снял(а) ${targetNickname || ''} с администратора`,
      call: `${actor} начал(а) голосовой чат`,
      call_ended: 'Голосовой звонок завершен',
      kick: `${actor} удалил(а) ${targetNickname || ''} из группы`,
    };
    const text = textMap[eventType] || eventType;
    const msgId = `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const payload = JSON.stringify({
      text,
      mediaType: 'system',
      systemType: eventType,
      actorNickname: actor,
      targetNickname,
    });
    const ciphertext = payload;

    const systemMsg: Message = {
      id: msgId,
      sender: 'system',
      text,
      time: Date.now(),
      status: 'sent',
      mediaType: 'system',
      systemType: eventType,
      actorNickname: actor,
      targetNickname,
    };
    useChatStore.getState().addMessage(groupId, systemMsg);
    try {
      (window as any).orbita?.storageAddMessage?.(groupId, msgId, systemMsg);
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const pusherPayload = {
        id: msgId,
        messageId: msgId,
        chatId: groupId,
        sender: 'system',
        senderNickname: actor || 'system',
        senderCode: 'system',
        ciphertext,
        type: 'message',
        mediaType: 'system',
        systemType: eventType,
        actorNickname: actor,
        targetNickname,
        time: Date.now(),
        text,
      };
      const doSend = () => {
        try { channel.trigger('client-message', pusherPayload); } catch {}
      };
      if (channel.subscribed) doSend(); else channel.bind('pusher:subscription_succeeded', doSend);
    } catch {}

    await this.sendGroupMessage({
      id: msgId,
      groupId,
      senderNickname: actor || 'system',
      senderCode: 'system',
      ciphertext,
      mediaType: 'system',
    });
  }

  async markGroupMessagesRead(payload: {
    groupId: string;
    messageId?: string;
    readIds?: string[];
    time?: number;
    sender?: string;
    senderUserId?: string;
    senderCode?: string;
  }): Promise<void> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }

  async getActiveCall(groupId: string): Promise<any | null> {
    try {
      const { data } = await this.supabase
        .from('group_calls')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'active')
        .maybeSingle();

      if (data) {
        const isStale = data.created_at && (Date.now() - new Date(data.created_at).getTime() > 6 * 60 * 60 * 1000);
        if (isStale) {
          fetch(`${this.getWorkerUrl()}/groups/calls/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId }),
          }).catch(() => {});
          return null;
        }
        return {
          groupId: data.group_id,
          roomName: data.room_name,
          status: data.status,
          hostCode: data.host_code,
          hostNickname: data.host_nickname,
          participantsCount: data.participants_count || 1,
          createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
        };
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/calls/active?groupId=${encodeURIComponent(groupId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.call) {
          const isStale = data.call.created_at && (Date.now() - new Date(data.call.created_at).getTime() > 6 * 60 * 60 * 1000);
          if (isStale) {
            return null;
          }
          return {
            groupId: data.call.group_id,
            roomName: data.call.room_name,
            status: data.call.status,
            hostCode: data.call.host_code,
            hostNickname: data.call.host_nickname,
            participantsCount: data.call.participants_count || 1,
            createdAt: data.call.created_at ? new Date(data.call.created_at).getTime() : Date.now(),
          };
        }
      }
    } catch {}
    return null;
  }

  async startCall(groupId: string, roomName: string, hostCode: string, hostNickname: string): Promise<void> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, roomName, hostCode, hostNickname }),
      }).catch(() => {});
    } catch {}

    const chatSecret = useChatStore.getState().chats.find(c => c.id === groupId)?.sharedSecret;
    const secret = chatSecret || deriveGroupKey(groupId);
    this.sendSystemMessage(groupId, secret, 'call', hostNickname);
  }

  async endCall(groupId: string, actorNickname?: string): Promise<void> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/calls/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      }).catch(() => {});
    } catch {}

    const chatSecret = useChatStore.getState().chats.find(c => c.id === groupId)?.sharedSecret;
    const secret = chatSecret || deriveGroupKey(groupId);
    await this.sendSystemMessage(groupId, secret, 'call_ended', actorNickname || '');
  }

  async fetchMyGroups(userCode: string, userId?: string): Promise<(GroupInfo & { role: string })[]> {
    try {
      const filters: string[] = [];
      if (userCode) {
        filters.push(`user_code.eq.${userCode}`);
        filters.push(`user_id.eq.${userCode}`);
      }
      if (userId && userId !== userCode) {
        filters.push(`user_code.eq.${userId}`);
        filters.push(`user_id.eq.${userId}`);
      }
      if (filters.length > 0) {
        const { data: memberRows } = await this.supabase
          .from('group_members')
          .select('group_id, role')
          .or(filters.join(','));

        if (memberRows && memberRows.length > 0) {
          const groupIds = memberRows.map((r: any) => r.group_id);
          const { data: groups } = await this.supabase.from('groups').select('*').in('id', groupIds);
          const roleMap: Record<string, string> = {};
          memberRows.forEach((r: any) => { roleMap[r.group_id] = r.role; });

          const results = await Promise.all((groups || []).map(async (g: any) => {
            const { data: members } = await this.supabase.from('group_members').select('*').eq('group_id', g.id);
            const formatted = (members || []).map((m: any) => ({
              nickname: m.nickname,
              userCode: m.user_code,
              userId: m.user_id || m.user_code,
              role: m.role || 'member',
              joinedAt: new Date(m.joined_at || g.created_at).getTime(),
              lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
              avatarUrl: m.avatar_url || null,
            }));

            let inviteActive = true;
            let expiresAt: number | null = null;
            if (g.creator_id && typeof g.creator_id === 'string' && g.creator_id.startsWith('{')) {
              try {
                const parsed = JSON.parse(g.creator_id);
                if (parsed.active === false) inviteActive = false;
                if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
              } catch {}
            }

            return {
              id: g.id,
              code: g.code,
              name: g.name,
              description: g.description || '',
              avatarUrl: g.avatar_url || null,
              creatorNickname: g.creator_nickname,
              creatorCode: g.creator_code || null,
              membersCount: g.members_count || formatted.length || 1,
              maxMembers: g.max_members || 10,
              members: formatted,
              createdAt: new Date(g.created_at).getTime(),
              role: roleMap[g.id] || 'member',
              sharedSecret: deriveGroupKey(g.id),
              inviteActive,
              inviteExpiresAt: expiresAt,
            };
          }));

          if (results.length > 0) return results;
        }
      }
    } catch {}

    try {
      const q = new URLSearchParams();
      if (userCode) q.set('userCode', userCode);
      if (userId) q.set('userId', userId);
      const res = await fetch(`${this.getWorkerUrl()}/groups/my?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return (data.groups || []).map((g: any) => ({
          ...g,
          sharedSecret: deriveGroupKey(g.id),
        }));
      }
    } catch {}
    return [];
  }

  async notifyMember(targetUserCode: string, group: GroupInfo, targetUserId?: string): Promise<void> {
    const targets = Array.from(new Set([targetUserCode, targetUserId].filter(Boolean) as string[]));
    try {
      const pusher = getPusher();
      if (pusher) {
        targets.forEach((tCode) => {
          const chan = pusher.subscribe(`private-handshake-${tCode}`);
          const doTrigger = () => {
            try {
              chan.trigger('client-group-added', { group });
            } catch {}
          };
          if (chan.subscribed) {
            doTrigger();
          } else {
            chan.bind('pusher:subscription_succeeded', () => {
              doTrigger();
            });
          }
        });
      }
    } catch {}

    try {
      targets.forEach((tCode) => {
        supabaseService.saveNonMessage(
          `grp_inv_${group.id}`,
          'system',
          tCode,
          JSON.stringify({ type: 'group-added', group }),
          `grp_msg_${group.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        ).catch(() => {});
      });
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/notify-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserCode, targetUserId, group }),
      }).catch(() => {});
    } catch {}
  }

  async updateMemberProfile(
    userId: string,
    userCode: string,
    newNickname: string,
    newAvatarUrl: string | null
  ): Promise<void> {
    const filters: string[] = [];
    if (userId) {
      filters.push(`user_id.eq.${userId}`);
      filters.push(`user_code.eq.${userId}`);
    }
    if (userCode && userCode !== userId) {
      filters.push(`user_code.eq.${userCode}`);
      filters.push(`user_id.eq.${userCode}`);
    }
    const updateData: { nickname?: string; avatar_url: string | null } = {
      avatar_url: newAvatarUrl || null,
    };
    if (newNickname) {
      updateData.nickname = newNickname.trim();
    }

    if (filters.length > 0) {
      try {
        await this.supabase
          .from('group_members')
          .update(updateData)
          .or(filters.join(','));
      } catch {}
    }

    if (newNickname && userCode) {
      try {
        await this.supabase
          .from('groups')
          .update({ creator_nickname: newNickname.trim() })
          .eq('creator_code', userCode);
      } catch {}
    }

    try {
      fetch(`${this.getWorkerUrl()}/groups/update-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || null,
          userCode: userCode || null,
          nickname: newNickname,
          avatarUrl: newAvatarUrl || null,
        }),
      }).catch(() => {});
    } catch {}
  }
}

export const groupService = new GroupService();
