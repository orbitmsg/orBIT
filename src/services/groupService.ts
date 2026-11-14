import { createClient } from '@supabase/supabase-js';
import { getVercelBaseUrl, getCloudflareWorkerUrl } from './gatewayManager';
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
import { ablyService } from './ablyService';

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

  private async postToWorker(endpoint: string, body: any): Promise<Response | null> {
    const urls = [getVercelBaseUrl(), getCloudflareWorkerUrl()].filter(Boolean);
    for (const baseUrl of urls) {
      try {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) return res;
      } catch {}
    }
    return null;
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

    const nowIso = new Date().toISOString();
    try {
      await this.supabase.from('groups').upsert({
        id,
        code,
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatarUrl || null,
        creator_id: JSON.stringify({ active: true, expiresAt: null }),
        creator_code: creatorCode || null,
        creator_nickname: creatorNickname,
        max_members: 10,
        members_count: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });
      await this.supabase.from('group_members').upsert({
        group_id: id,
        user_code: creatorCode || creatorNickname,
        user_id: creatorUserId || creatorCode || creatorNickname,
        nickname: creatorNickname,
        role: 'owner',
        avatar_url: creatorAvatarUrl || null,
        joined_at: nowIso,
        last_seen: nowIso,
      });
    } catch {}

    try {
      this.postToWorker('/groups/create', {
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
      });
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
    if (!groupIdOrCode || groupIdOrCode.trim().startsWith('lobby_')) {
      return null;
    }
    const raw = groupIdOrCode.trim();
    const cleanCode = extractGroupCode(raw) || raw.replace(/^#/, '');
    const derivedId = deriveGroupId(cleanCode);

    try {
      const { data: g } = await this.supabase
        .from('groups')
        .select('*')
        .or(`id.eq.${cleanCode},id.eq.${cleanCode.toUpperCase()},code.eq.${cleanCode},code.eq.${raw},id.eq.${derivedId}`)
        .maybeSingle();

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

        let inviteActive = (g as any).inviteActive !== false && (g as any).invite_active !== false;
        let expiresAt: number | null = (g as any).inviteExpiresAt || null;
        if (g.creator_id && typeof g.creator_id === 'string' && g.creator_id.startsWith('{')) {
          try {
            const parsed = JSON.parse(g.creator_id);
            if (parsed.active === false) inviteActive = false;
            if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
          } catch {}
        }

        return {
          id: g.id,
          code: g.code || cleanCode,
          name: g.name,
          description: g.description || '',
          avatarUrl: g.avatar_url || null,
          creatorNickname: g.creator_nickname,
          creatorCode: g.creator_code || null,
          membersCount: g.members_count || members.length || 1,
          maxMembers: g.max_members || 10,
          members,
          createdAt: new Date(g.created_at).getTime(),
          sharedSecret: deriveGroupKey(g.code || cleanCode || g.id),
          inviteActive,
          inviteExpiresAt: expiresAt,
        };
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(cleanCode)}&id=${encodeURIComponent(cleanCode)}`);
      if (res.ok) {
        const data = (await res.json()) as { group: GroupInfo };
        if (data.group) {
          let inviteActive = data.group.inviteActive !== false && (data.group as any).invite_active !== false;
          let expiresAt = data.group.inviteExpiresAt || null;
          const rawCreatorId = (data.group as any).creator_id;
          if (rawCreatorId && typeof rawCreatorId === 'string' && rawCreatorId.startsWith('{')) {
            try {
              const parsed = JSON.parse(rawCreatorId);
              if (parsed.active === false) inviteActive = false;
              if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
            } catch {}
          }
          return {
            ...data.group,
            avatarUrl: data.group.avatarUrl || (data.group as any).avatar_url || null,
            inviteActive,
            inviteExpiresAt: expiresAt,
            code: data.group.code || cleanCode,
            sharedSecret: deriveGroupKey(data.group.code || cleanCode || data.group.id),
          };
        }
      }
    } catch {}

    const localChat = useChatStore.getState().chats.find(
      (c) =>
        c.type === 'group' &&
        (c.id === cleanCode ||
          c.id === cleanCode.toUpperCase() ||
          c.inviteCode === cleanCode ||
          c.code === cleanCode)
    );
    if (localChat) {
      return {
        id: localChat.id,
        code: localChat.inviteCode || localChat.code || cleanCode,
        name: localChat.name,
        description: localChat.description || '',
        avatarUrl: localChat.avatarUrl || null,
        creatorNickname: localChat.creatorNickname || '',
        creatorCode: localChat.creatorCode || null,
        membersCount: localChat.membersCount || localChat.members?.length || 1,
        maxMembers: 10,
        members: (localChat.members || []).map((m: any) => ({
          nickname: m.nickname,
          userCode: m.userCode || m.user_code,
          userId: m.userId || m.user_id,
          role: m.role || 'member',
          joinedAt: m.joinedAt || Date.now(),
          lastSeen: m.lastSeen,
          avatarUrl: m.avatarUrl || null,
        })),
        createdAt: localChat.createdAt || Date.now(),
        sharedSecret: localChat.sharedSecret || deriveGroupKey(localChat.inviteCode || localChat.id),
        inviteActive: localChat.inviteActive !== false,
        inviteExpiresAt: localChat.inviteExpiresAt || null,
      };
    }

    return null;
  }

  async joinGroup(
    codeOrLink: string,
    nickname: string,
    userCode?: string,
    meta?: { name?: string; creator?: string; avatarUrl?: string; description?: string; userId?: string },
    inviterNickname?: string
  ): Promise<{ group: GroupInfo; sharedSecret: string; systemMessage?: Message | null }> {
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

    let inviteActive = groupRow.inviteActive !== false && groupRow.invite_active !== false;
    let expiresAt: number | null = groupRow.inviteExpiresAt || null;
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

      const nowIso = new Date().toISOString();
      try {
        await this.supabase.from('group_members').upsert({
          group_id: realGroupId,
          user_code: memberCode,
          user_id: meta?.userId || candidateId || memberCode,
          nickname,
          role: 'member',
          avatar_url: meta?.avatarUrl || null,
          joined_at: nowIso,
          last_seen: nowIso,
        });
        await this.supabase.from('groups').update({
          members_count: currentMembers.length + 1,
          updated_at: nowIso,
        }).eq('id', realGroupId);
      } catch {}

      try {
        this.postToWorker('/groups/join', {
          id: realGroupId,
          code: secret,
          nickname,
          userCode: memberCode,
          userId: meta?.userId || candidateId || memberCode,
          name: groupRow.name,
          creatorNickname: groupRow.creator_nickname || groupRow.creatorNickname,
          avatarUrl: groupRow.avatar_url || groupRow.avatarUrl || meta?.avatarUrl || null,
        });
      } catch {}
    }

    let systemMessage: Message | null = null;
    if (!isAlreadyMember) {
      if (inviterNickname) {
        systemMessage = await this.sendSystemMessage(realGroupId, sharedSecret, 'invite', inviterNickname, nickname);
      } else {
        systemMessage = await this.sendSystemMessage(realGroupId, sharedSecret, 'join_link', nickname, nickname);
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
      avatarUrl: groupRow.avatar_url || groupRow.avatarUrl || meta?.avatarUrl || null,
      creatorNickname: groupRow.creator_nickname || groupRow.creatorNickname,
      creatorCode: groupRow.creator_code || groupRow.creatorCode || null,
      membersCount: Math.max(formattedMembers.length, 1),
      maxMembers: 10,
      members: formattedMembers,
      createdAt: new Date(groupRow.created_at || groupRow.createdAt || Date.now()).getTime(),
      sharedSecret,
      inviteActive,
      inviteExpiresAt: expiresAt,
    };

    return { group: resultGroup, sharedSecret, systemMessage };
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
      const nowIso = new Date().toISOString();

      try {
        await this.supabase.from('groups').update({
          code: newCode,
          creator_id: JSON.stringify({ active: true, expiresAt: null }),
          updated_at: nowIso,
        }).eq('id', realId);
      } catch {}

      this.postToWorker('/groups/update', {
        groupId: realId,
        code: newCode,
        inviteActive: true,
        creator_id: JSON.stringify({ active: true, expiresAt: null }),
      });

      useChatStore.getState().updateChat(groupId, { inviteCode: newCode, inviteActive: true, inviteExpiresAt: null });
      if (realId !== groupId) {
        useChatStore.getState().updateChat(realId, { inviteCode: newCode, inviteActive: true, inviteExpiresAt: null });
      }
      return newCode;
    } catch {
      useChatStore.getState().updateChat(groupId, { inviteCode: newCode, inviteActive: true, inviteExpiresAt: null });
      return newCode;
    }
  }

  async revokeInviteLink(groupId: string): Promise<boolean> {
    const chat = useChatStore.getState().chats.find((c) => c.id === groupId);
    const realId = chat?.id || groupId;
    useChatStore.getState().updateChat(groupId, { inviteActive: false });
    if (realId !== groupId) {
      useChatStore.getState().updateChat(realId, { inviteActive: false });
    }
    const meta = JSON.stringify({ active: false });
    try {
      await this.supabase.from('groups').update({
        creator_id: meta,
        updated_at: new Date().toISOString(),
      }).eq('id', realId);
    } catch {}
    try {
      this.postToWorker('/groups/update', {
        groupId: realId,
        inviteActive: false,
        creator_id: meta,
      });
      return true;
    } catch {
      return false;
    }
  }

  async enableInviteLink(groupId: string): Promise<boolean> {
    const chat = useChatStore.getState().chats.find((c) => c.id === groupId);
    const realId = chat?.id || groupId;
    useChatStore.getState().updateChat(groupId, { inviteActive: true });
    if (realId !== groupId) {
      useChatStore.getState().updateChat(realId, { inviteActive: true });
    }
    const meta = JSON.stringify({ active: true });
    try {
      await this.supabase.from('groups').update({
        creator_id: meta,
        updated_at: new Date().toISOString(),
      }).eq('id', realId);
    } catch {}
    try {
      this.postToWorker('/groups/update', {
        groupId: realId,
        inviteActive: true,
        creator_id: meta,
      });
      return true;
    } catch {
      return false;
    }
  }

  async setInviteExpiration(groupId: string, expiresAt: number | null): Promise<boolean> {
    const chat = useChatStore.getState().chats.find((c) => c.id === groupId);
    const realId = chat?.id || groupId;
    useChatStore.getState().updateChat(groupId, { inviteExpiresAt: expiresAt });
    if (realId !== groupId) {
      useChatStore.getState().updateChat(realId, { inviteExpiresAt: expiresAt });
    }
    const meta = JSON.stringify({ active: true, expiresAt });
    try {
      await this.supabase.from('groups').update({
        creator_id: meta,
        updated_at: new Date().toISOString(),
      }).eq('id', realId);
    } catch {}
    try {
      this.postToWorker('/groups/update', {
        groupId: realId,
        inviteActive: true,
        inviteExpiresAt: expiresAt,
        creator_id: meta,
      });
      return true;
    } catch {
      return false;
    }
  }

  async leaveGroup(groupId: string, sharedSecret: string, nickname: string, userCode?: string, userId?: string): Promise<void> {
    const orConditions: string[] = [];
    if (userCode) orConditions.push(`user_code.eq.${userCode}`, `user_id.eq.${userCode}`);
    if (userId && userId !== userCode) orConditions.push(`user_code.eq.${userId}`, `user_id.eq.${userId}`);
    if (nickname) orConditions.push(`nickname.eq.${nickname}`);

    try {
      if (orConditions.length > 0) {
        await this.supabase.from('group_members').delete().eq('group_id', groupId).or(orConditions.join(','));
      }
    } catch {}

    const leaveData = {
      type: 'member-left',
      groupId,
      nickname,
      userCode: userCode || null,
      userId: userId || null,
    };

    try {
      await this.postToWorker('/groups/leave', leaveData);
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const sendLeave = () => {
        try { channel.trigger('client-member-left', leaveData); } catch {}
        try { channel.trigger('client-message', { ...leaveData, systemType: 'leave' }); } catch {}
      };
      if (channel.subscribed) sendLeave();
      else channel.bind('pusher:subscription_succeeded', sendLeave);
    } catch {}

    try {
      ablyService.sendMessage(`presence-group-${groupId}`, leaveData).catch(() => {});
      ablyService.sendMessage(groupId, leaveData).catch(() => {});
    } catch {}

    await this.sendSystemMessage(groupId, sharedSecret, 'leave', nickname);
  }

  async kickMember(groupId: string, sharedSecret: string, targetNickname: string, adminNickname: string, targetUserCode?: string, targetUserId?: string): Promise<void> {
    const orConditions: string[] = [];
    if (targetUserCode) orConditions.push(`user_code.eq.${targetUserCode}`, `user_id.eq.${targetUserCode}`);
    if (targetUserId && targetUserId !== targetUserCode) orConditions.push(`user_code.eq.${targetUserId}`, `user_id.eq.${targetUserId}`);
    if (targetNickname) orConditions.push(`nickname.eq.${targetNickname}`);

    try {
      if (orConditions.length > 0) {
        await this.supabase.from('group_members').delete().eq('group_id', groupId).or(orConditions.join(','));
      }
    } catch {}

    const kickData = {
      type: 'kick',
      groupId,
      target: targetNickname,
      targetNickname,
      targetUserCode: targetUserCode || null,
      targetUserId: targetUserId || null,
      admin: adminNickname,
      adminNickname,
    };

    try {
      await this.postToWorker('/groups/kick', kickData);
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const sendKick = () => {
        try { channel.trigger('client-kick', kickData); } catch {}
        try { channel.trigger('client-message', { ...kickData, systemType: 'kick' }); } catch {}
      };
      if (channel.subscribed) sendKick();
      else channel.bind('pusher:subscription_succeeded', sendKick);
    } catch {}

    try {
      ablyService.sendMessage(`presence-group-${groupId}`, kickData).catch(() => {});
      ablyService.sendMessage(groupId, kickData).catch(() => {});
    } catch {}

    await this.sendSystemMessage(groupId, sharedSecret, 'kick', adminNickname, targetNickname);
  }

  async updateGroup(
    groupId: string,
    sharedSecret?: string,
    data?: { name?: string; description?: string; avatarUrl?: string | null },
    actorNickname?: string
  ): Promise<boolean> {
    const actor = actorNickname || useAuthStore.getState().nickname || '';
    const secret = sharedSecret || deriveGroupKey(groupId);
    if (data?.name !== undefined) {
      this.sendSystemMessage(groupId, secret, 'title', actor, undefined);
    }
    if (data?.avatarUrl !== undefined) {
      this.sendSystemMessage(groupId, secret, 'avatar', actor, undefined);
    }

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (data?.name !== undefined) updatePayload.name = data.name.trim();
    if (data?.description !== undefined) updatePayload.description = data.description.trim();
    if (data?.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

    try {
      this.supabase.from('groups').update(updatePayload).eq('id', groupId).then(() => {}, () => {});
    } catch {}

    try {
      const res = await this.postToWorker('/groups/update', {
        groupId,
        name: data?.name,
        description: data?.description,
        avatarUrl: data?.avatarUrl,
      });
      return res ? res.ok : true;
    } catch {
      return true;
    }
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    try {
      await this.supabase.from('groups').delete().eq('id', groupId);
    } catch {}

    const deleteData = { type: 'group-deleted', groupId };

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const sendDelete = () => {
        try { channel.trigger('client-group-deleted', deleteData); } catch {}
        try { channel.trigger('client-message', deleteData); } catch {}
      };
      if (channel.subscribed) sendDelete();
      else channel.bind('pusher:subscription_succeeded', sendDelete);
    } catch {}

    try {
      ablyService.sendMessage(`presence-group-${groupId}`, deleteData).catch(() => {});
      ablyService.sendMessage(groupId, deleteData).catch(() => {});
    } catch {}

    try {
      const res = await this.postToWorker('/groups/delete', { groupId });
      return res ? res.ok : true;
    } catch {
      return true;
    }
  }

  async updateMemberRole(
    groupId: string,
    targetNickname: string,
    role: 'admin' | 'member',
    targetUserCode?: string,
    actorNickname?: string,
    targetUserId?: string
  ): Promise<boolean> {
    const orConditions: string[] = [];
    if (targetUserCode) orConditions.push(`user_code.eq.${targetUserCode}`, `user_id.eq.${targetUserCode}`);
    if (targetUserId && targetUserId !== targetUserCode) orConditions.push(`user_code.eq.${targetUserId}`, `user_id.eq.${targetUserId}`);
    if (targetNickname) orConditions.push(`nickname.eq.${targetNickname}`);

    try {
      if (orConditions.length > 0) {
        await this.supabase.from('group_members').update({ role }).eq('group_id', groupId).or(orConditions.join(','));
      }
    } catch {}

    try {
      await this.postToWorker('/groups/role', {
        groupId,
        targetNickname,
        targetUserCode: targetUserCode || null,
        targetUserId: targetUserId || null,
        role,
      });
    } catch {}

    const actor = actorNickname || useAuthStore.getState().nickname || '';
    const secret = deriveGroupKey(groupId);
    if (role === 'admin') {
      this.sendSystemMessage(groupId, secret, 'admin', actor, targetNickname);
    } else if (role === 'member') {
      this.sendSystemMessage(groupId, secret, 'unadmin', actor, targetNickname);
    }
    return true;
  }

  async fetchGroupMessages(groupId: string, limit = 100): Promise<any[]> {
    if (!groupId || groupId.startsWith('lobby_')) {
      return [];
    }
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
    const gid = payload?.groupId || payload?.group_id;
    if (!gid || gid.startsWith('lobby_')) {
      return null;
    }
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
    eventType: 'join' | 'join_link' | 'title' | 'avatar' | 'admin' | 'unadmin' | 'call' | 'call_ended' | 'kick' | 'create' | 'invite' | 'leave' | 'pin',
    actorNickname: string,
    targetNickname?: string,
    extra?: { roomName?: string }
  ): Promise<Message> {
    const actor = actorNickname || useAuthStore.getState().nickname || 'Участник';
    const textMap: Record<string, string> = {
      create: `${actor} создал(а) лобби`,
      invite: `${actor} пригласил(а) ${targetNickname || ''} в лобби`,
      join: `${actor} вступил(а) в лобби`,
      join_link: `${actor} вступил(а) в лобби по ссылке-приглашению`,
      pin: `${actor} закрепил(а) сообщение`,
      leave: `${actor} покинул(а) лобби`,
      title: `${actor} изменил(а) имя лобби`,
      avatar: `${actor} изменил(а) аватарку лобби`,
      admin: `${actor} назначил(а) ${targetNickname || ''} администратором`,
      unadmin: `${actor} снял(а) ${targetNickname || ''} с администратора`,
      call: `${actor} начал(а) голосовой чат`,
      call_ended: 'Голосовой звонок завершен',
      kick: `${actor} удалил(а) ${targetNickname || ''} из лобби`,
    };
    const text = textMap[eventType] || eventType;
    const msgId = `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const payload = JSON.stringify({
      text,
      mediaType: 'system',
      systemType: eventType,
      actorNickname: actor,
      targetNickname,
      roomName: extra?.roomName,
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
      roomName: extra?.roomName,
    };
    useChatStore.getState().addMessage(groupId, systemMsg);
    try {
      (window as any).orbita?.storageAddMessage?.(groupId, msgId, systemMsg);
    } catch {}

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
      roomName: extra?.roomName,
      time: Date.now(),
      text,
    };

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const doSend = () => {
        try { channel.trigger('client-message', pusherPayload); } catch {}
      };
      if (channel.subscribed) doSend(); else channel.bind('pusher:subscription_succeeded', doSend);
    } catch {}

    try {
      ablyService.sendMessage(groupId, pusherPayload).catch(() => {});
    } catch {}

    await this.sendGroupMessage({
      id: msgId,
      groupId,
      senderNickname: actor || 'system',
      senderCode: 'system',
      ciphertext,
      mediaType: 'system',
    });

    return systemMsg;
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
    if (!payload?.groupId || payload.groupId.startsWith('lobby_')) return;
    try {
      fetch(`${this.getWorkerUrl()}/groups/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }

  async getActiveCall(groupId: string): Promise<any | null> {
    if (!groupId || groupId.startsWith('lobby_')) return null;
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
    if (!groupId || groupId.startsWith('lobby_')) return;
    try {
      fetch(`${this.getWorkerUrl()}/groups/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, roomName, hostCode, hostNickname }),
      }).catch(() => {});
    } catch {}
  }

  async endCall(groupId: string, _actorNickname?: string): Promise<void> {
    if (!groupId || groupId.startsWith('lobby_')) return;
    try {
      fetch(`${this.getWorkerUrl()}/groups/calls/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      }).catch(() => {});
    } catch {}
  }

  async fetchMyGroups(_userCode: string, _userId?: string): Promise<(GroupInfo & { role: string })[]> {
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
