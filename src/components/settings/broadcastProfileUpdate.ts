import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { supabaseService } from '../../services/supabaseService';
import { groupService } from '../../services/groupService';
import { ablyService } from '../../services/ablyService';
import { getPusher, getGroupPusher } from '../../utils/pusher';

export interface ProfileUpdates {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  nickname?: string;
  bio?: string | null;
  username?: string | null;
  birthday?: string | null;
}
export const broadcastProfileUpdate = (updates: {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  nickname?: string;
  bio?: string | null;
  username?: string | null;
  birthday?: string | null;
}) => {
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
  const finalAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl : currentAvatar;
  const finalBanner = updates.bannerUrl !== undefined ? updates.bannerUrl : currentBanner;
  const finalBio = updates.bio !== undefined ? updates.bio : currentBio;
  const finalUsername = updates.username !== undefined ? updates.username : currentUsername;
  const finalBirthday = updates.birthday !== undefined ? updates.birthday : currentBirthday;

  const payload = {
    type: 'profile-update',
    sender: finalNickname,
    senderUserId: currentUserId,
    userId: currentUserId,
    senderCode: myCode,
    numericId: currentNumericId,
    senderId: currentUserId || myCode,
    avatarUrl: finalAvatar,
    bannerUrl: finalBanner,
    nickname: finalNickname,
    bio: finalBio,
    username: finalUsername,
    birthday: finalBirthday,
  };

  if (myCode) {
    supabaseService.publishPublicProfile(myCode, finalNickname, finalAvatar, null, finalBio, finalUsername, finalBirthday, finalBanner).catch(() => {});
  }

  if (currentUserId || myCode) {
    useChatStore.getState().setUserProfile(currentUserId || myCode, {
      nickname: finalNickname,
      avatarUrl: finalAvatar,
      bio: finalBio,
      username: finalUsername,
      bannerUrl: finalBanner,
    });
  }

  groupService.updateMemberProfile(currentUserId, myCode, finalNickname, finalAvatar).catch(() => {});

  const chats = useChatStore.getState().chats;
  chats.forEach((chat) => {
    if (chat.type === 'private' && chat.id !== 'notes') {
      supabaseService.saveProfileUpdate(chat.id, finalNickname, finalAvatar, myCode, finalBio, finalUsername, finalBirthday, finalBanner).catch(() => {});
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
        bannerUrl: finalBanner,
        bio: finalBio,
        username: finalUsername,
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
      const updates: any = { members: updatedMembers };
      if (chat.creatorNickname && currentNickname && chat.creatorNickname === currentNickname) {
        updates.creatorNickname = finalNickname;
      }
      useChatStore.getState().updateChat(chat.id, updates);
    }
  });
};
