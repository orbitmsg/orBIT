import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat } from '../../../store/useChatStore';
import { useAuthStore, getInitialNumericId } from '../../../store/useAuthStore';
import { getPusher, getGroupPusher } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { supabaseService, type UserDirectoryRecord } from '../../../services/supabaseService';
import { groupService } from '../../../services/groupService';
import {
  generateKeyPair,
  deriveSharedSecret,
  deriveRootKey,
  generateChatId,
  getDirectChatId,
} from '../../../lib/crypto';
import { extractGroupCode, isValidGroupCode } from '../../../lib/groupCrypto';
import { extractCodeFromInput } from '../../../utils/inviteLink';
import { DoubleRatchet } from '../../../lib/double-ratchet';
import { revalidateDevelopersOnConnection } from '../../ui/DeveloperBadge';

export interface UseConnectRequestHandlerParams {
  nickname: string | null;
  myCode: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  addChat: (chat: Partial<Chat>) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  setActiveChat: (id: string | null) => void;
  setIsHandshaking: (val: boolean) => void;
  handshakeGuard: React.MutableRefObject<boolean>;
  codeChannelRef: React.MutableRefObject<any>;
}

export const useConnectRequestHandler = ({
  nickname,
  myCode,
  avatarUrl,
  bannerUrl,
  addChat,
  updateChat,
  setActiveChat,
  setIsHandshaking,
  handshakeGuard,
  codeChannelRef,
}: UseConnectRequestHandlerParams) => {
  const { t } = useTranslation();

  const handleConnectRequest = useCallback(
    (
      friendCode: string,
      callback: (success: boolean, error?: string) => void,
      initialProfile?: Partial<UserDirectoryRecord>
    ) => {
      if (handshakeGuard.current) {
        callback(false, t('connectModal.already_connecting'));
        return;
      }
      handshakeGuard.current = true;
      setIsHandshaking(true);

      const pusher = getPusher();
      const friendChannel = pusher.subscribe(`private-handshake-${friendCode}`);
      const myKeys = generateKeyPair();
      const storeMyCode = myCode || useChatStore.getState().myCode;
      const targetUserCode = initialProfile?.user_code || friendCode;
      const directChatId = (storeMyCode && targetUserCode) ? getDirectChatId(storeMyCode, targetUserCode) : generateChatId();
      const existingPeerChat = useChatStore.getState().chats.find(
        (c) =>
          c.type === 'private' &&
          c.id !== 'notes' &&
          (c.id === directChatId ||
            (c.peerCode && (c.peerCode === targetUserCode || c.peerCode === friendCode)) ||
            (c.originalPeerCode && (c.originalPeerCode === targetUserCode || c.originalPeerCode === friendCode)) ||
            (initialProfile?.numeric_id && c.numericId === initialProfile.numeric_id) ||
            (initialProfile?.username && c.username && c.username.toLowerCase() === initialProfile.username.toLowerCase()))
      );
      const chatId = existingPeerChat?.id || directChatId;
      let settled = false;

      const allTargets = new Set<string>([friendCode]);
      if (initialProfile?.user_code) allTargets.add(initialProfile.user_code);
      if (initialProfile?.numeric_id) allTargets.add(initialProfile.numeric_id);
      if (initialProfile?.username) allTargets.add(initialProfile.username);

      const sendRequest = () => {
        revalidateDevelopersOnConnection(friendCode);
        const myUsername = useAuthStore.getState().username;
        const myBio = useAuthStore.getState().bio;
        const myBirthday = useAuthStore.getState().birthday;
        const myNumericId = useAuthStore.getState().numericId;
        const reqPayload = {
          senderNickname: nickname,
          senderCode: myCode,
          publicKey: myKeys.publicKey,
          avatarUrl,
          bannerUrl,
          chatId,
          numericId: myNumericId,
          username: myUsername,
          bio: myBio,
          birthday: myBirthday,
        };
        friendChannel.trigger('client-request-identity', reqPayload);
        for (const target of allTargets) {
          if (target !== friendCode) {
            try {
              const extraChan = pusher.subscribe(`private-handshake-${target}`);
              const doExtra = () => {
                try {
                  extraChan.trigger('client-request-identity', reqPayload);
                } catch {}
              };
              if (extraChan.subscribed) doExtra();
              else extraChan.bind('pusher:subscription_succeeded', doExtra);
            } catch {}
          }
          ablyService.sendHandshakeRequest(target, reqPayload).catch((err: any) => console.warn('[Ably] Handshake request error:', err));
        }
      };

      const subscriptionErrorHandler = () => {
        cleanup();
        callback(false, t('connectModal.server_error'));
      };

      const confirmationHandler = (data: any) => {
        if (settled) return;
        const sharedSecret = deriveSharedSecret(myKeys.privateKey, data.publicKey);
        const rootKey = deriveRootKey(sharedSecret);
        const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, data.publicKey);
        const currentChats = useChatStore.getState().chats;
        const peerCode = data.senderCode || friendCode;
        if (peerCode) {
          revalidateDevelopersOnConnection(peerCode);
        }
        const peerNumericId = data.numericId || data.numeric_id || (peerCode ? getInitialNumericId(peerCode) : undefined);
        if (currentChats.some((c) => c.id === chatId)) {
          updateChat(chatId, {
            name: data.nickname,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            sharedSecret: sharedSecret,
            ratchetState: ratchet.getState(),
            avatarUrl: data.avatarUrl ?? undefined,
            bannerUrl: data.bannerUrl ?? undefined,
            peerCode: peerCode,
            originalPeerCode: peerCode || friendCode,
            numericId: peerNumericId,
            username: data.username !== undefined ? data.username : undefined,
            description: data.bio !== undefined ? data.bio : undefined,
            birthday: data.birthday !== undefined ? data.birthday : undefined,
          });
        } else {
          addChat({
            id: chatId,
            type: 'private',
            name: data.nickname,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: sharedSecret,
            isChatInitiator: true,
            ratchetState: ratchet.getState(),
            avatarUrl: data.avatarUrl ?? undefined,
            bannerUrl: data.bannerUrl ?? undefined,
            peerCode: peerCode,
            originalPeerCode: peerCode || friendCode,
            numericId: peerNumericId,
            username: data.username || undefined,
            description: data.bio || undefined,
            birthday: data.birthday || undefined,
          });
        }
        cleanup();
        callback(true);
      };

      const unsubAblyConfirm = ablyService.subscribeToHandshake(myCode || '', () => {}, confirmationHandler);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        unsubAblyConfirm();
        pusher.unsubscribe(`private-handshake-${friendCode}`);
        for (const target of allTargets) {
          if (target !== friendCode) {
            try {
              pusher.unsubscribe(`private-handshake-${target}`);
            } catch {}
          }
        }
        if (codeChannelRef.current) {
          codeChannelRef.current.unbind('client-identity-confirmed', confirmationHandler);
        }
        friendChannel.unbind('pusher:subscription_succeeded', sendRequest);
        friendChannel.unbind('pusher:subscription_error', subscriptionErrorHandler);
        handshakeGuard.current = false;
        setIsHandshaking(false);
      };

      const initialName = initialProfile?.nickname || friendCode;
      const initialAvatar = initialProfile?.avatar_url || undefined;
      const initialBanner = initialProfile?.banner_url || undefined;
      const initialUsername = initialProfile?.username || undefined;
      const initialBio = initialProfile?.bio || undefined;
      const initialBirthday = initialProfile?.birthday || undefined;
      const initialNumeric = initialProfile?.numeric_id || getInitialNumericId(friendCode);

      addChat({
        id: chatId,
        type: 'private',
        name: initialName,
        lastMsg: 'Заявка отправлена',
        online: false,
        isChatInitiator: true,
        sharedSecret: myKeys.privateKey,
        avatarUrl: initialAvatar,
        bannerUrl: initialBanner,
        peerCode: friendCode,
        originalPeerCode: friendCode,
        numericId: initialNumeric,
        username: initialUsername,
        description: initialBio,
        birthday: initialBirthday,
      });
      setActiveChat(chatId);

      (async () => {
        for (const targetKey of allTargets) {
          supabaseService.sendOfflineHandshake(
            chatId,
            targetKey,
            nickname || '',
            myKeys.publicKey,
            avatarUrl || null,
            myCode || ''
          ).catch(() => {});
        }

        let friendProfile = (initialProfile?.public_key ? initialProfile : null) as UserDirectoryRecord | null;
        if (!friendProfile) {
          const [byCodeRes, byUserRes] = await Promise.allSettled([
            supabaseService.lookupPublicProfile(friendCode),
            supabaseService.lookupProfileByUsername(friendCode),
          ]);
          friendProfile =
            (byCodeRes.status === 'fulfilled' ? byCodeRes.value : null) ||
            (byUserRes.status === 'fulfilled' ? byUserRes.value : null);

          if (!friendProfile) {
            const sMatches = await supabaseService.searchPublicProfiles(friendCode, 1).catch(() => null);
            if (sMatches && sMatches.length > 0) friendProfile = sMatches[0];
          }
        }

        const targetsToSend = new Set<string>(allTargets);

        if (friendProfile && !settled) {
          const friendNumericId = friendProfile.numeric_id || initialNumeric;
          if (friendProfile.user_code) targetsToSend.add(friendProfile.user_code);
          if (friendProfile.numeric_id) targetsToSend.add(friendProfile.numeric_id);
          if (friendProfile.username) targetsToSend.add(friendProfile.username);

          if (friendProfile.public_key) {
            const sharedSecret = deriveSharedSecret(myKeys.privateKey, friendProfile.public_key);
            const rootKey = deriveRootKey(sharedSecret);
            const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, friendProfile.public_key);
            updateChat(chatId, {
              name: friendProfile.nickname,
              avatarUrl: friendProfile.avatar_url ?? undefined,
              bannerUrl: friendProfile.banner_url ?? undefined,
              username: friendProfile.username ?? undefined,
              description: friendProfile.bio ?? undefined,
              birthday: friendProfile.birthday ?? undefined,
              numericId: friendNumericId,
              sharedSecret: sharedSecret,
              ratchetState: ratchet.getState(),
              lastMsg: 'E2EE_SECURE_CHANNEL_READY',
              peerCode: friendProfile.user_code || friendCode,
              originalPeerCode: friendProfile.user_code || friendCode,
            });
          } else {
            updateChat(chatId, {
              name: friendProfile.nickname,
              avatarUrl: friendProfile.avatar_url ?? undefined,
              bannerUrl: friendProfile.banner_url ?? undefined,
              username: friendProfile.username ?? undefined,
              description: friendProfile.bio ?? undefined,
              birthday: friendProfile.birthday ?? undefined,
              numericId: friendNumericId,
              peerCode: friendProfile.user_code || friendCode,
              originalPeerCode: friendProfile.user_code || friendCode,
            });
          }

          for (const targetKey of targetsToSend) {
            if (!allTargets.has(targetKey)) {
              supabaseService.sendOfflineHandshake(
                chatId,
                targetKey,
                nickname || '',
                myKeys.publicKey,
                avatarUrl || null,
                myCode || ''
              ).catch(() => {});
            }
          }
        }

        if (!settled) {
          cleanup();
          callback(true);
        }
      })().catch((err) => {
        if (!settled) {
          cleanup();
          callback(false, err?.message || 'Не удалось отправить заявку');
        }
      });

      if (friendChannel.subscribed) sendRequest();
      else friendChannel.bind('pusher:subscription_succeeded', sendRequest);
      friendChannel.bind('pusher:subscription_error', subscriptionErrorHandler);

      if (codeChannelRef.current) {
        codeChannelRef.current.bind('client-identity-confirmed', confirmationHandler);
      }
    },
    [myCode, nickname, avatarUrl, addChat, updateChat, setActiveChat, setIsHandshaking, t]
  );

  useEffect(() => {
    const handleDeepLinkUrl = async (url: string) => {
      if (!url) return;
      const groupCode = extractGroupCode(url);
      if (groupCode && isValidGroupCode(groupCode)) {
        const authData = useAuthStore.getState();
        const nick = authData.nickname || nickname || '';
        const uCode = myCode || (authData.userId?.length === 36 ? authData.userId : undefined);
        const uAvatar = authData.avatarUrl;
        const uId = authData.userId;
        try {
          const result = await groupService.joinGroup(url, nick, uCode, { avatarUrl: uAvatar || undefined, userId: uId || undefined });
          if (result?.group) {
            const existing = useChatStore.getState().chats.find((c) => c.id === result.group.id);
            if (!existing) {
              useChatStore.getState().addChat({
                id: result.group.id,
                type: 'group',
                name: result.group.name,
                description: result.group.description || '',
                lastMsg: 'E2EE_SECURE_CHANNEL_READY',
                online: false,
                sharedSecret: result.sharedSecret,
                role: 'member',
                inviteCode: result.group.code,
                creatorNickname: result.group.creatorNickname,
                creatorCode: result.group.creatorCode || undefined,
                avatarUrl: result.group.avatarUrl || undefined,
                members: (result.group.members || []) as any[],
                membersCount: result.group.membersCount || 2,
                createdAt: result.group.createdAt || Date.now(),
                unreadCount: 0,
                lastReadTimestamp: Date.now(),
                muted: false,
                notificationsEnabled: true,
                isExplicitJoin: true,
              } as any);
            } else {
              const shouldUpdateName = existing.name === 'Группа' || existing.name === 'Group' || (result.group.name && result.group.name !== 'Группа' && result.group.name !== 'Group');
              useChatStore.getState().updateChat(existing.id, {
                ...(shouldUpdateName ? { name: result.group.name } : {}),
                ...(result.group.avatarUrl ? { avatarUrl: result.group.avatarUrl } : {}),
                ...(result.group.creatorNickname ? { creatorNickname: result.group.creatorNickname } : {}),
                sharedSecret: result.sharedSecret || existing.sharedSecret,
                members: (result.group.members && result.group.members.length > (existing.members?.length || 0)) ? (result.group.members as any[]) : existing.members,
                membersCount: Math.max(result.group.membersCount || 1, existing.membersCount || 1, (result.group.members?.length || 1)),
              });
            }
            useChatStore.getState().setActiveChat(result.group.id);

            try {
              const grpChannel = getGroupPusher().subscribe(`presence-group-${result.group.id}`);
              const joinPayload = {
                type: 'member-joined',
                nickname: nick,
                userCode: uCode,
                chatId: result.group.id,
                members: result.group.members,
                membersCount: result.group.membersCount,
              };
              const sendJoinEvent = () => {
                try { grpChannel.trigger('client-message', joinPayload); } catch {}
                try { grpChannel.trigger('member-joined', joinPayload); } catch {}
              };
              if (grpChannel.subscribed) sendJoinEvent();
              else grpChannel.bind('pusher:subscription_succeeded', sendJoinEvent);
            } catch {}
          }
        } catch {}
        return;
      }
      const code = extractCodeFromInput(url);
      if (code && code.length === 36) {
        handleConnectRequest(code.toUpperCase(), () => {});
      }
    };

    const handleCustomDeepLink = (e: any) => {
      const u = e?.detail?.url;
      if (u) handleDeepLinkUrl(u);
    };
    window.addEventListener('orbita:deep-link', handleCustomDeepLink);

    let unsub: any;
    if (typeof window !== 'undefined' && (window as any).orbita?.onDeepLink) {
      unsub = (window as any).orbita.onDeepLink(handleDeepLinkUrl);
    }
    return () => {
      window.removeEventListener('orbita:deep-link', handleCustomDeepLink);
      if (unsub) unsub();
    };
  }, [handleConnectRequest, nickname, myCode]);


  return {
    handleConnectRequest,
  };
};
