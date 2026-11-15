import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { supabaseService } from '../../services/supabaseService';
import { groupService } from '../../services/groupService';
import { lobbyService } from '../../services/lobbyService';
import { ablyService } from '../../services/ablyService';
import { getPusher, getGroupPusher } from '../../utils/pusher';
import i18n from '../../i18n';

export type ProfileField = 'nickname' | 'avatarUrl' | 'bannerUrl' | 'bio' | 'username' | 'birthday';

export interface ProfileUpdates {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  nickname?: string;
  bio?: string | null;
  username?: string | null;
  birthday?: string | null;
  clearedFields?: ProfileField[];
}

export const broadcastProfileUpdate = async (updates: ProfileUpdates): Promise<boolean> => {
  const clearedSet = new Set<ProfileField>(updates.clearedFields || []);
  const currentNickname = useAuthStore.getState().nickname;
  const currentAvatar = useAuthStore.getState().avatarUrl;
  const currentBanner = useAuthStore.getState().bannerUrl;
  const currentUserId = useAuthStore.getState().userId;
  const currentBio = useAuthStore.getState().bio;
  const currentUsername = useAuthStore.getState().username;
  const currentBirthday = useAuthStore.getState().birthday;
  const currentNumericId = useAuthStore.getState().numericId;
  const myCode = useChatStore.getState().myCode;
  const finalNickname = updates.nickname !== undefined ? updates.nickname : currentNickname;
  const finalAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl : (clearedSet.has('avatarUrl') ? null : currentAvatar);
  const finalBanner = updates.bannerUrl !== undefined ? updates.bannerUrl : (clearedSet.has('bannerUrl') ? null : currentBanner);
  const finalBio = updates.bio !== undefined ? updates.bio : (clearedSet.has('bio') ? null : currentBio);
  const finalUsername = updates.username !== undefined ? updates.username : (clearedSet.has('username') ? null : currentUsername);
  const finalBirthday = updates.birthday !== undefined ? updates.birthday : (clearedSet.has('birthday') ? null : currentBirthday);

  const resolveServerOptional = (explicit: string | null | undefined, field: ProfileField): string | null | undefined => {
    if (explicit !== undefined) return explicit;
    if (clearedSet.has(field)) return null;
    return undefined;
  };

  const resolvePayloadField = (
    explicit: string | null | undefined,
    field: ProfileField,
    resolved: string | null
  ): string | null | undefined => {
    if (explicit !== undefined || clearedSet.has(field)) return resolved;
    return resolved || undefined;
  };

  const serverBio = resolveServerOptional(updates.bio, 'bio');
  const serverUsername = resolveServerOptional(updates.username, 'username');
  const serverBirthday = resolveServerOptional(updates.birthday, 'birthday');
  const serverBanner = resolveServerOptional(updates.bannerUrl, 'bannerUrl');

  const payload = {
    type: 'profile-update',
    sender: finalNickname,
    senderUserId: currentUserId,
    userId: currentUserId,
    senderCode: myCode,
    numericId: currentNumericId,
    senderId: currentUserId || myCode,
    avatarUrl: finalAvatar,
    bannerUrl: resolvePayloadField(updates.bannerUrl, 'bannerUrl', finalBanner),
    nickname: finalNickname,
    bio: resolvePayloadField(updates.bio, 'bio', finalBio),
    username: resolvePayloadField(updates.username, 'username', finalUsername),
    birthday: resolvePayloadField(updates.birthday, 'birthday', finalBirthday),
  };

  const persistenceTasks: Promise<unknown>[] = [];
  const publicCode = myCode || currentUserId;
  if (publicCode) {
    persistenceTasks.push(
      supabaseService.publishPublicProfile(
        publicCode,
        finalNickname,
        finalAvatar,
        null,
        serverBio,
        serverUsername,
        serverBirthday,
        serverBanner
      )
    );
  }

  if (currentUserId || myCode) {
    const userProfilePatch = {
      nickname: finalNickname,
      avatarUrl: finalAvatar,
      bio: finalBio,
      username: finalUsername,
      birthday: finalBirthday,
      bannerUrl: finalBanner,
    };
    if (currentUserId) {
      useChatStore.getState().setUserProfile(currentUserId, userProfilePatch);
    }
    if (myCode && myCode !== currentUserId) {
      useChatStore.getState().setUserProfile(myCode, userProfilePatch);
    }
  }

  groupService.updateMemberProfile(currentUserId, myCode, finalNickname, finalAvatar).catch(() => {});
  lobbyService.updateMemberProfile(currentUserId, myCode, finalNickname, finalAvatar).catch(() => {});

  const chats = useChatStore.getState().chats;
  chats.forEach((chat) => {
    if (chat.type === 'private' && chat.id !== 'notes') {
      persistenceTasks.push(
        supabaseService.saveProfileUpdate(
          chat.id,
          finalNickname,
          finalAvatar,
          myCode,
          serverBio,
          serverUsername,
          serverBirthday,
          serverBanner
        )
      );
      ablyService.sendMessage(chat.id, payload).catch(() => {});
      const pusher = getPusher();
      const channel = pusher.subscribe(`private-chat-${chat.id}`);
      const send = () => {
        channel.trigger('client-message', payload);
      };
      if (channel.subscribed) send();
      else channel.bind('pusher:subscription_succeeded', send);

      const recipientTargets = Array.from(new Set([
        chat.peerCode,
        chat.name && chat.name.length === 36 ? chat.name : undefined,
      ].filter((t): t is string => Boolean(t && t !== myCode))));

      for (const target of recipientTargets) {
        supabaseService.saveNonMessage(
          chat.id,
          myCode || 'user',
          target,
          JSON.stringify(payload),
          `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        ).catch(() => {});
      }
    } else if (chat.type === 'group') {
      const groupPayload = {
        type: 'member-profile-updated',
        groupId: chat.id,
        chatId: chat.id,
        userId: currentUserId,
        userCode: myCode,
        oldNickname: currentNickname,
        nickname: finalNickname,
        avatarUrl: finalAvatar,
        bannerUrl: resolvePayloadField(updates.bannerUrl, 'bannerUrl', finalBanner),
        bio: resolvePayloadField(updates.bio, 'bio', finalBio),
        username: resolvePayloadField(updates.username, 'username', finalUsername),
        birthday: resolvePayloadField(updates.birthday, 'birthday', finalBirthday),
        sender: finalNickname,
        senderUserId: currentUserId,
        senderCode: myCode,
        senderId: currentUserId || myCode,
      };

      try {
        const groupPusher = getGroupPusher();
        const grpChan = groupPusher.subscribe(`presence-group-${chat.id}`);
        const sendGrp = () => {
          try { grpChan.trigger('member-profile-updated', groupPayload); } catch {}
          try { grpChan.trigger('client-message', groupPayload); } catch {}
        };
        if (grpChan.subscribed) sendGrp();
        else grpChan.bind('pusher:subscription_succeeded', sendGrp);
      } catch {}

      ablyService.sendMessage(chat.id, groupPayload).catch(() => {});

      const isSelfMember = (m: any) => {
        const mId = m.userId || m.userCode;
        if (currentUserId && mId) return mId === currentUserId;
        if (myCode && mId) return mId === myCode;
        return m.nickname === currentNickname;
      };
      const updatedMembers = (chat.members || []).map((m: any) =>
        isSelfMember(m)
          ? { ...m, nickname: finalNickname, avatarUrl: finalAvatar || null }
          : m
      );
      const chatUpdates: any = { members: updatedMembers };
      if (chat.creatorNickname && currentNickname && chat.creatorNickname === currentNickname) {
        chatUpdates.creatorNickname = finalNickname;
      }
      useChatStore.getState().updateChat(chat.id, chatUpdates);
    }
  });

  if (persistenceTasks.length > 0) {
    const results = await Promise.allSettled(persistenceTasks);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (rejected) {
      const msg = rejected.reason instanceof Error ? rejected.reason.message : '';
      if (msg === 'USERNAME_TAKEN') {
        useToastStore.getState().showToast(i18n.t('profile.username_taken', 'Это имя пользователя уже занято'), 'text');
      } else {
        useToastStore.getState().showToast(i18n.t('profile.save_error', 'Не удалось сохранить профиль'), 'text');
      }
      return false;
    }
  }
  return true;
};
