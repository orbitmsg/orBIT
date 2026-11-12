import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat } from '../../../store/useChatStore';
import { useAuthStore, getInitialNumericId } from '../../../store/useAuthStore';
import { getPusher } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { supabaseService, type UserDirectoryRecord } from '../../../services/supabaseService';
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

const isValidProfileString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0 && val.trim() !== 'undefined' && val.trim() !== 'null';

const pickNonEmptyProfileValue = (incoming: unknown, existing?: string | null): string | undefined =>
  isValidProfileString(incoming) ? incoming.trim() : (isValidProfileString(existing) ? existing : undefined);

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
        const existingChat = currentChats.find((c) => c.id === chatId);
        if (existingChat) {
          updateChat(chatId, {
            name: pickNonEmptyProfileValue(data.nickname, existingChat.name) || existingChat.name,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            sharedSecret: sharedSecret,
            ratchetState: ratchet.getState(),
            avatarUrl: pickNonEmptyProfileValue(data.avatarUrl, existingChat.avatarUrl),
            bannerUrl: pickNonEmptyProfileValue(data.bannerUrl, existingChat.bannerUrl),
            peerCode: peerCode,
            originalPeerCode: peerCode || friendCode,
            numericId: pickNonEmptyProfileValue(data.numericId || data.numeric_id, existingChat.numericId) || peerNumericId,
            username: pickNonEmptyProfileValue(data.username, existingChat.username),
            description: pickNonEmptyProfileValue(data.bio, existingChat.description),
            birthday: pickNonEmptyProfileValue(data.birthday, existingChat.birthday),
            peerPublicKey: data.publicKey,
          });
        } else {
          addChat({
            id: chatId,
            type: 'private',
            name: isValidProfileString(data.nickname) ? data.nickname.trim() : friendCode,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: sharedSecret,
            isChatInitiator: true,
            ratchetState: ratchet.getState(),
            avatarUrl: isValidProfileString(data.avatarUrl) ? data.avatarUrl.trim() : undefined,
            bannerUrl: isValidProfileString(data.bannerUrl) ? data.bannerUrl.trim() : undefined,
            peerCode: peerCode,
            originalPeerCode: peerCode || friendCode,
            numericId: peerNumericId,
            username: isValidProfileString(data.username) ? data.username.trim() : undefined,
            description: isValidProfileString(data.bio) ? data.bio.trim() : undefined,
            birthday: isValidProfileString(data.birthday) ? data.birthday.trim() : undefined,
            peerPublicKey: data.publicKey,
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

      const initialName = isValidProfileString(initialProfile?.nickname)
        ? initialProfile.nickname.trim()
        : (existingPeerChat?.name || friendCode);
      const initialAvatar = isValidProfileString(initialProfile?.avatar_url) ? initialProfile.avatar_url.trim() : undefined;
      const initialBanner = isValidProfileString(initialProfile?.banner_url) ? initialProfile.banner_url.trim() : undefined;
      const initialUsername = isValidProfileString(initialProfile?.username) ? initialProfile.username.trim() : undefined;
      const initialBio = isValidProfileString(initialProfile?.bio) ? initialProfile.bio.trim() : undefined;
      const initialBirthday = isValidProfileString(initialProfile?.birthday) ? initialProfile.birthday.trim() : undefined;
      const initialNumeric = initialProfile?.numeric_id || existingPeerChat?.numericId || getInitialNumericId(friendCode);

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

        if (friendProfile) {
          const friendNumericId = isValidProfileString(friendProfile.numeric_id) ? friendProfile.numeric_id.trim() : initialNumeric;
          if (friendProfile.user_code) targetsToSend.add(friendProfile.user_code);
          if (friendProfile.numeric_id) targetsToSend.add(friendProfile.numeric_id);
          if (friendProfile.username) targetsToSend.add(friendProfile.username);

          const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
          const profileUpdates: Partial<Chat> = {
            peerCode: friendProfile.user_code || currentChat?.peerCode || friendCode,
            originalPeerCode: friendProfile.user_code || currentChat?.originalPeerCode || friendCode,
            numericId: pickNonEmptyProfileValue(friendNumericId, currentChat?.numericId),
          };
          const nextName = pickNonEmptyProfileValue(friendProfile.nickname, currentChat?.name);
          if (nextName) profileUpdates.name = nextName;
          const nextAvatar = pickNonEmptyProfileValue(friendProfile.avatar_url, currentChat?.avatarUrl);
          if (nextAvatar) profileUpdates.avatarUrl = nextAvatar;
          const nextBanner = pickNonEmptyProfileValue(friendProfile.banner_url, currentChat?.bannerUrl);
          if (nextBanner) profileUpdates.bannerUrl = nextBanner;
          const nextUsername = pickNonEmptyProfileValue(friendProfile.username, currentChat?.username);
          if (nextUsername) profileUpdates.username = nextUsername;
          const nextBio = pickNonEmptyProfileValue(friendProfile.bio, currentChat?.description);
          if (nextBio) profileUpdates.description = nextBio;
          const nextBirthday = pickNonEmptyProfileValue(friendProfile.birthday, currentChat?.birthday);
          if (nextBirthday) profileUpdates.birthday = nextBirthday;

          if (!settled && friendProfile.public_key && !currentChat?.ratchetState) {
            const sharedSecret = deriveSharedSecret(myKeys.privateKey, friendProfile.public_key);
            const rootKey = deriveRootKey(sharedSecret);
            const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, friendProfile.public_key);
            profileUpdates.sharedSecret = sharedSecret;
            profileUpdates.ratchetState = ratchet.getState();
            profileUpdates.lastMsg = 'E2EE_SECURE_CHANNEL_READY';
          }

          updateChat(chatId, profileUpdates);

          if (!settled) {
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
        window.dispatchEvent(new CustomEvent('orbita:open-group-invite', { detail: { url } }));
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
