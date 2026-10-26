import React, { useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat, type Message, type IncomingFriendRequest } from '../../../store/useChatStore';
import { useAuthStore, getInitialNumericId } from '../../../store/useAuthStore';
import { getPusher, getGroupPusher } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { supabaseService } from '../../../services/supabaseService';
import { generateKeyPair, derivePublicKey, deriveSharedSecret, deriveRootKey } from '../../../lib/crypto';
import { deriveGroupKey, isValidGroupCode } from '../../../lib/groupCrypto';
import { DoubleRatchet } from '../../../lib/double-ratchet';
import { revalidateDevelopersOnConnection } from '../../ui/DeveloperBadge';

export interface UseHandshakeListenersParams {
  chats: Chat[];
  myCode: string | null;
  nickname: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  username?: string | null;
  bio?: string | null;
  birthday?: string | null;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  addChat: (chat: Partial<Chat>) => void;
  addMessage: (chatId: string, message: Message) => void;
  addIncomingFriendRequest: (req: IncomingFriendRequest) => void;
  removeIncomingFriendRequest: (id: string) => void;
  setActiveChat: (id: string | null) => void;
  setShowFriendRequestsModal: (val: boolean) => void;
  subscribeToChat: (chatId: string, sharedSecret: string) => any;
  processedMessageIds: React.MutableRefObject<Set<string>>;
  handshakeGuard: React.MutableRefObject<boolean>;
  activeSubscriptions: React.MutableRefObject<Map<string, { channel: any; handler: (data: any) => void }>>;
  ablyMessageUnsubscribes: React.MutableRefObject<Map<string, () => void>>;
}

export const useHandshakeListeners = ({
  chats,
  myCode,
  nickname,
  avatarUrl,
  bannerUrl,
  username,
  bio: _bio,
  birthday: _birthday,
  updateChat,
  addChat,
  addMessage,
  addIncomingFriendRequest,
  removeIncomingFriendRequest,
  setActiveChat,
  setShowFriendRequestsModal,
  subscribeToChat,
  processedMessageIds,
  handshakeGuard: _handshakeGuard,
  activeSubscriptions,
  ablyMessageUnsubscribes,
}: UseHandshakeListenersParams) => {
  const { t } = useTranslation();

  useEffect(() => {
    const pusher = getGroupPusher();
    const groupOwnerChannels: any[] = [];

    chats.forEach((chat) => {
      if (chat.type !== 'group' || !chat.inviteCode) return;
      if (chat.role !== 'owner' && chat.role !== 'admin') return;

      const channelName = `private-group-invite-${chat.inviteCode}`;
      const ch = pusher.subscribe(channelName);

      const handleJoinRequest = (data: any) => {
        const currentChat = useChatStore.getState().chats.find(c => c.id === chat.id);
        if (!currentChat) return;

        if (currentChat.inviteCodeTTL && Date.now() > currentChat.inviteCodeTTL) {
          ch.trigger('client-invite-response', { error: t('connectModal.invite_expired') });
          return;
        }

        const candidateId = data.userId || data.userCode;
        const alreadyMember = currentChat.members?.some(m => {
          const mId = m.userId || (m as any).userCode;
          if (mId && candidateId) return mId === candidateId;
          return false;
        });
        if (alreadyMember) {
          ch.trigger('client-invite-response', {
            chatId: currentChat.id,
            name: currentChat.name,
            sharedSecret: currentChat.sharedSecret,
            members: currentChat.members,
            inviteCodeTTL: currentChat.inviteCodeTTL,
          });
          return;
        }

        const newMember = {
          userId: candidateId,
          userCode: candidateId,
          nickname: data.nickname,
          role: 'member' as const,
          lastSeen: Date.now(),
        };
        const updatedMembers = [...(currentChat.members || []), newMember];
        updateChat(currentChat.id, { members: updatedMembers });

        const respond = () => ch.trigger('client-invite-response', {
          chatId: currentChat.id,
          name: currentChat.name,
          sharedSecret: currentChat.sharedSecret,
          members: updatedMembers,
          inviteCodeTTL: currentChat.inviteCodeTTL,
        });

        if (ch.subscribed) respond();
        else ch.bind('pusher:subscription_succeeded', respond);

        const groupChannel = pusher.subscribe(`presence-group-${currentChat.id}`);
        const notifyMembers = () => groupChannel.trigger('client-message', {
          type: 'member-joined',
          nickname: data.nickname,
          userId: candidateId,
          userCode: candidateId,
          members: updatedMembers,
        });
        if (groupChannel.subscribed) notifyMembers();
        else groupChannel.bind('pusher:subscription_succeeded', notifyMembers);
      };

      ch.bind('client-join-request', handleJoinRequest);
      groupOwnerChannels.push({ ch, channelName });
    });

    return () => {
      groupOwnerChannels.forEach(({ ch, channelName }) => {
        ch.unbind_all();
        pusher.unsubscribe(channelName);
      });
    };
  }, [chats.map(c => c.id + (c.inviteCode || '')).join(','), updateChat, t]);

  useEffect(() => {
    if (!myCode && !nickname) return;
    const pusher = getPusher();
    const unsubscribes: (() => void)[] = [];
    const currentNumericId = useAuthStore.getState().numericId;
    const currentUserId = useAuthStore.getState().userId;
    const cleanUsername = username ? username.replace(/^@+/, '').trim() : null;
    const keysToListen = Array.from(new Set([
      myCode,
      myCode?.toUpperCase(),
      myCode?.toLowerCase(),
      currentUserId,
      currentNumericId,
      nickname,
      nickname?.toUpperCase(),
      nickname?.toLowerCase(),
      cleanUsername,
      cleanUsername ? `@${cleanUsername}` : null,
      cleanUsername ? cleanUsername.toLowerCase() : null,
    ].filter(Boolean))) as string[];

    const handleRequest = async (data: any) => {
      console.log('[Handshake] Real-time request received:', data);
      const chatId = data.chatId;

      const existing = useChatStore
        .getState()
        .chats.find(
          (c) =>
            c.type === 'private' &&
            c.id !== 'notes' &&
            (c.id === chatId || (data.senderCode && (c.peerCode === data.senderCode || c.originalPeerCode === data.senderCode)))
        );

      const existingTheirKey = existing?.peerPublicKey || existing?.ratchetState?.theirDHPublic;
      if (existing && existingTheirKey === data.publicKey && existing.sharedSecret && existing.ratchetState) {
        const finalChatId = existing.id || chatId;
        const myCurrentUsername = useAuthStore.getState().username;
        const myCurrentBio = useAuthStore.getState().bio;
        const myCurrentBirthday = useAuthStore.getState().birthday;
        const myCurrentNumericId = useAuthStore.getState().numericId;
        const ourKey = existing.ratchetState.ourDHPublic;

        ablyService.sendHandshakeConfirm(data.senderCode, {
          nickname,
          publicKey: ourKey,
          chatId: finalChatId,
          avatarUrl,
          bannerUrl,
          senderCode: myCode,
          numericId: myCurrentNumericId,
          username: myCurrentUsername,
          bio: myCurrentBio,
          birthday: myCurrentBirthday,
        }).catch(() => {});

        const pusher = getPusher();
        const senderChannel = pusher.subscribe(`private-handshake-${data.senderCode}`);
        const sendConfirm = () =>
          senderChannel.trigger('client-identity-confirmed', {
            nickname,
            publicKey: ourKey,
            chatId: finalChatId,
            avatarUrl,
            bannerUrl,
            senderCode: myCode,
            numericId: myCurrentNumericId,
            username: myCurrentUsername,
            bio: myCurrentBio,
            birthday: myCurrentBirthday,
          });

        if (senderChannel.subscribed) sendConfirm();
        senderChannel.bind('pusher:subscription_succeeded', () => {
          sendConfirm();
        });
        return;
      }

      let sharedSecret: string;
      let ratchet: DoubleRatchet;
      let myKeys: { publicKey: string; privateKey: string } | undefined;

      if (data.isX3DH) {
        
        const myAuth = useAuthStore.getState();
        if (!myAuth.identityKeyPair || !myAuth.signedPreKeyPair) {
          console.warn('[X3DH] Cannot respond to X3DH: missing local identity keys. Falling back to legacy.');
          myKeys = generateKeyPair();
          sharedSecret = deriveSharedSecret(myKeys.privateKey, data.publicKey);
          const rootKey = deriveRootKey(sharedSecret);
          ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, data.publicKey);
        } else {
          const { x3dhResponder } = await import('../../../lib/x3dh');
          try {
            const usedOneTimePreKey = data.usedOneTimePreKey
              ? myAuth.oneTimePreKeys?.find(k => k.publicKey === data.usedOneTimePreKey)
              : undefined;

            sharedSecret = await x3dhResponder(
              myAuth.identityKeyPair,
              myAuth.signedPreKeyPair,
              data.identityKey,
              data.publicKey, 
              usedOneTimePreKey
            );
            const rootKey = deriveRootKey(sharedSecret);
            
            ratchet = DoubleRatchet.initSymmetric(rootKey, myAuth.signedPreKeyPair.privateKey, myAuth.signedPreKeyPair.publicKey, data.publicKey);
          } catch (err) {
            console.error('[X3DH] Responder failed, falling back to legacy:', err);
            myKeys = generateKeyPair();
            sharedSecret = deriveSharedSecret(myKeys.privateKey, data.publicKey);
            const rootKey = deriveRootKey(sharedSecret);
            ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, data.publicKey);
          }
        }
      } else {
        
        myKeys = generateKeyPair();
        sharedSecret = deriveSharedSecret(myKeys.privateKey, data.publicKey);
        const rootKey = deriveRootKey(sharedSecret);
        ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, data.publicKey);
      }

      const finalChatId = existing?.id || chatId;
      const senderNumericId = data.numericId || data.numeric_id || (data.senderCode ? getInitialNumericId(data.senderCode) : undefined);
      addChat({
        id: finalChatId,
        type: 'private',
        name: data.senderNickname,
        lastMsg: 'E2EE_SECURE_CHANNEL_READY',
        online: false,
        sharedSecret: sharedSecret,
        isChatInitiator: false,
        ratchetState: ratchet.getState(),
        avatarUrl: data.avatarUrl ?? undefined,
        bannerUrl: data.bannerUrl ?? undefined,
        peerCode: data.senderCode,
        originalPeerCode: data.senderCode,
        numericId: senderNumericId,
        username: data.username || undefined,
        description: data.bio || undefined,
        birthday: data.birthday || undefined,
        peerPublicKey: data.publicKey,
      });

      if (!data.isX3DH) {
        const myCurrentUsername = useAuthStore.getState().username;
        const myCurrentBio = useAuthStore.getState().bio;
        const myCurrentBirthday = useAuthStore.getState().birthday;
        const myCurrentNumericId = useAuthStore.getState().numericId;
        const confirmPubKey = myKeys?.publicKey || ratchet.getState().ourDHPublic;

        ablyService.sendHandshakeConfirm(data.senderCode, {
          nickname,
          publicKey: confirmPubKey,
          chatId: finalChatId,
          avatarUrl,
          bannerUrl,
          senderCode: myCode,
          numericId: myCurrentNumericId,
          username: myCurrentUsername,
          bio: myCurrentBio,
          birthday: myCurrentBirthday,
        }).catch((err) => console.warn('[Ably] Handshake confirm send error:', err));

        const pusher = getPusher();
        const senderChannel = pusher.subscribe(`private-handshake-${data.senderCode}`);
        const sendConfirm = () =>
          senderChannel.trigger('client-identity-confirmed', {
            nickname,
            publicKey: confirmPubKey,
            chatId: finalChatId,
            avatarUrl,
            bannerUrl,
            senderCode: myCode,
            numericId: myCurrentNumericId,
            username: myCurrentUsername,
            bio: myCurrentBio,
            birthday: myCurrentBirthday,
          });

        if (senderChannel.subscribed) sendConfirm();
        else senderChannel.bind('pusher:subscription_succeeded', sendConfirm);

        supabaseService.sendOfflineHandshake(
          finalChatId,
          `CONFIRM:${data.senderCode}`,
          nickname || '',
          myKeys?.publicKey || '',
          avatarUrl || null,
          myCode || ''
        ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by code:', err));

        if (data.senderNickname && data.senderNickname !== data.senderCode) {
          supabaseService.sendOfflineHandshake(
            chatId,
            `CONFIRM:${data.senderNickname}`,
            nickname || '',
            myKeys?.publicKey || '',
            avatarUrl || null,
            myCode || ''
          ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by nick:', err));
        }
      }

      if (data.senderCode) {
        revalidateDevelopersOnConnection(data.senderCode);
      }
    };

    const handleConfirm = (data: any) => {
      if (!data || !data.chatId || !data.publicKey) return;
      console.log('[Handshake] Real-time confirmation received for chat:', data.chatId, data);
      const currentChats = useChatStore.getState().chats;
      const existing = currentChats.find(c => c.id === data.chatId || (c.type === 'private' && data.senderCode && (c.peerCode === data.senderCode || c.originalPeerCode === data.senderCode)));
      if (!existing) return;

      const peerCode = data.senderCode || existing.peerCode || (existing.name && existing.name.length === 36 ? existing.name : undefined);
      if (peerCode) {
        revalidateDevelopersOnConnection(peerCode);
      }

      const updates: Partial<Chat> = {
        name: data.nickname || existing.name,
        avatarUrl: data.avatarUrl ?? existing.avatarUrl,
        bannerUrl: data.bannerUrl ?? existing.bannerUrl,
        peerCode: peerCode,
        originalPeerCode: peerCode || existing.originalPeerCode || existing.peerCode,
        numericId: data.numericId || data.numeric_id || existing.numericId || (peerCode ? getInitialNumericId(peerCode) : undefined),
        username: data.username !== undefined ? data.username : existing.username,
        description: data.bio !== undefined ? data.bio : existing.description,
        birthday: data.birthday !== undefined ? data.birthday : existing.birthday,
      };

      if (existing.sharedSecret && !existing.ratchetState) {
        const initiatorPrivateKey = existing.sharedSecret;
        const initiatorPublicKey = derivePublicKey(initiatorPrivateKey);
        const sharedSecret = deriveSharedSecret(initiatorPrivateKey, data.publicKey);
        const rootKey = deriveRootKey(sharedSecret);
        const ratchet = DoubleRatchet.initSymmetric(rootKey, initiatorPrivateKey, initiatorPublicKey, data.publicKey);

        updates.sharedSecret = sharedSecret;
        updates.ratchetState = ratchet.getState();
        updates.lastMsg = 'E2EE_SECURE_CHANNEL_READY';
      }

      updateChat(existing.id, updates);
      if (updates.sharedSecret || existing.sharedSecret) {
        subscribeToChat(existing.id, (updates.sharedSecret || existing.sharedSecret)!);
        if (data.chatId !== existing.id) {
          subscribeToChat(data.chatId, (updates.sharedSecret || existing.sharedSecret)!);
        }
      }
    };

    const handleGroupAdded = (data: any) => {
      if (!data?.group) return;
      const g = data.group;
      if (!g.id || !g.code) return;
      const existing = useChatStore.getState().chats.find((c) => c.id === g.id || c.inviteCode === g.code);
      if (existing) return;
      const sharedSecret = g.sharedSecret || (isValidGroupCode(g.code) ? deriveGroupKey(g.code) : undefined);
      useChatStore.setState((s) => ({
        chats: [{
          id: g.id,
          type: 'group' as const,
          name: g.name,
          description: g.description || '',
          lastMsg: 'E2EE_SECURE_CHANNEL_READY',
          online: false,
          sharedSecret,
          role: 'member' as const,
          inviteCode: g.code,
          creatorNickname: g.creatorNickname,
          creatorCode: g.creatorCode || undefined,
          avatarUrl: g.avatarUrl || undefined,
          members: g.members || [],
          membersCount: g.membersCount || 1,
          maxMembers: g.maxMembers || 10,
          createdAt: g.createdAt || Date.now(),
          unreadCount: 0,
          lastReadTimestamp: Date.now(),
          muted: false,
          notificationsEnabled: true,
        }, ...s.chats],
      }));
    };

    const handleDirectMessage = async (data: any) => {
      if (!data || !data.chatId) return;
      const myUserId = useAuthStore.getState().userId;
      const isSelf = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
        (nickname && (data.sender === nickname || data.senderNickname === nickname)) ||
        data.sender === 'YOU' ||
        (data.messageId && processedMessageIds.current.has(data.messageId))
      );
      if (isSelf) return;

      if (data.type === 'chat-deleted' || (data.type === 'system' && data.action === 'delete-chat') || data.action === 'delete-chat') {
        const targetChat = useChatStore.getState().chats.find(c => c.id === data.chatId);
        const eventTime = data.timestamp || data.time;
        if (targetChat && targetChat.createdAt && eventTime && eventTime < targetChat.createdAt) {
          return;
        }
        if (activeSubscriptions.current.has(data.chatId)) {
          const sub = activeSubscriptions.current.get(data.chatId)!;
          sub.channel.unbind_all();
          getPusher().unsubscribe(`private-chat-${data.chatId}`);
          activeSubscriptions.current.delete(data.chatId);
        }
        if (ablyMessageUnsubscribes.current.has(data.chatId)) {
          const unsub = ablyMessageUnsubscribes.current.get(data.chatId)!;
          unsub();
          ablyMessageUnsubscribes.current.delete(data.chatId);
        }
        useChatStore.getState().deleteChat(data.chatId);
        if (useChatStore.getState().activeChatId === data.chatId) {
          useChatStore.getState().setActiveChat(null);
        }
        return;
      }

      if (data.type === 'system') {
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [data.chatId]: [],
            }
          }));
          updateChat(data.chatId, {
            lastMsg: t('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now()
          });
          return;
        }
      }

      if (data.type === 'delete' || data.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(data.chatId, targetId);
        }
        return;
      }

      if (data.type === 'reaction') {
        const targetId = data.messageId || data.id;
        if (data.chatId && targetId) {
          useChatStore.getState().setReaction(data.chatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
        return;
      }

      if (data.type === 'pin' || data.type === 'pin-message') {
        if (data.chatId && data.pinData) {
          updateChat(data.chatId, { pinnedMessage: data.pinData });
          const actor = data.sender || data.actorNickname || data.pinData?.pinnedBy || '';
          const isAlreadyAdded = (useChatStore.getState().messagesByChatId[data.chatId] || []).some(
            (m) => m.systemType === 'pin' && Math.abs((m.time || 0) - (data.pinData?.pinnedAt || Date.now())) < 5000
          );
          if (!isAlreadyAdded) {
            const sysMsg: Message = data.systemMessage || {
              id: `sys_pin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              sender: 'system',
              text: `${actor || 'Собеседник'} закрепил(а) сообщение`,
              time: data.pinData?.pinnedAt || Date.now(),
              status: 'sent',
              mediaType: 'system',
              systemType: 'pin',
              actorNickname: actor,
            };
            useChatStore.getState().addMessage(data.chatId, sysMsg);
            try {
              (window as any).orbita?.storageAddMessage?.(data.chatId, sysMsg.id, sysMsg);
            } catch {}
          }
        }
        return;
      }

      if (data.type === 'unpin' || data.type === 'unpin-message') {
        if (data.chatId) {
          updateChat(data.chatId, { pinnedMessage: null });
        }
        return;
      }

      if (data.type === 'read') {
        if (data.chatId) {
          const currentMessages = useChatStore.getState().messagesByChatId[data.chatId] || [];
          const updatedMessages = currentMessages.map((msg) => {
            const isTarget = (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing);
            if (isTarget) {
              return { ...msg, read: true, status: 'read' as const, readAt: data.timestamp || Date.now() };
            }
            return msg;
          });
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [data.chatId]: updatedMessages,
            }
          }));
        }
        return;
      }

      if (data.type === 'delivered') {
        if (data.chatId) {
          const currentMessages = useChatStore.getState().messagesByChatId[data.chatId] || [];
          const updatedMessages = currentMessages.map((msg) => {
            const isTarget = (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing);
            if (isTarget) {
              if (msg.status === 'read' || msg.read) return msg;
              return { ...msg, status: 'delivered' as const, deliveredAt: data.timestamp || Date.now() };
            }
            return msg;
          });
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [data.chatId]: updatedMessages,
            }
          }));
        }
        return;
      }

      if (data.type === 'ping' || data.type === 'pong' || data.type === 'profile-update') {
        return;
      }

      if (useChatStore.getState().deletedChatIds?.includes(data.chatId)) {
        return;
      }

      let textContent = data.ciphertext || data.text || '';
      let mediaType = data.mediaType;
      let mediaUrl = data.mediaUrl;
      let mediaName = data.mediaName;
      let mime = data.mime;
      if (typeof textContent === 'string' && textContent.startsWith('{')) {
        try {
          const parsed = JSON.parse(textContent);
          if (parsed.text !== undefined) textContent = parsed.text;
          if (parsed.mediaType) mediaType = parsed.mediaType;
          if (parsed.mediaUrl) mediaUrl = parsed.mediaUrl;
          if (parsed.mediaName) mediaName = parsed.mediaName;
          if (parsed.mime) mime = parsed.mime;
        } catch {}
      }

      const hasContent = Boolean(
        (typeof textContent === 'string' && textContent.trim().length > 0) ||
        mediaType ||
        mediaUrl ||
        mediaName ||
        (data.mediaItems && data.mediaItems.length > 0)
      );
      if (!hasContent) {
        return;
      }

      const senderCode = data.senderCode || data.senderId;
      let chat = useChatStore.getState().chats.find((c) =>
        c.id === data.chatId ||
        (c.type === 'private' && senderCode && (c.peerCode === senderCode || c.originalPeerCode === senderCode))
      );
      if (!chat) {
        let senderNick = data.sender || 'User';
        let senderAvatar = data.avatarUrl;
        let senderBanner = data.bannerUrl;
        let senderUsername: string | undefined = undefined;
        let senderBio: string | undefined = undefined;
        let senderBirthday: string | undefined = undefined;
        let senderNumericId: string | undefined = undefined;

        if (data.senderCode || data.senderId) {
          const senderCode = data.senderCode || data.senderId;
          try {
            const pub = await supabaseService.lookupPublicProfile(senderCode);
            if (pub) {
              if (pub.nickname) senderNick = pub.nickname;
              if (pub.avatar_url) senderAvatar = pub.avatar_url;
              if (pub.banner_url) senderBanner = pub.banner_url;
              if (pub.username) senderUsername = pub.username;
              if (pub.bio) senderBio = pub.bio;
              if (pub.birthday) senderBirthday = pub.birthday;
              if (pub.numeric_id) senderNumericId = pub.numeric_id;
            }
          } catch {}
          if (!senderNumericId) senderNumericId = getInitialNumericId(senderCode);
        }

        const newChatObj: Partial<Chat> = {
          id: data.chatId,
          type: 'private',
          name: senderNick,
          peerCode: data.senderCode || data.senderId,
          originalPeerCode: data.senderCode || data.senderId,
          avatarUrl: senderAvatar,
          bannerUrl: senderBanner,
          username: senderUsername,
          description: senderBio,
          birthday: senderBirthday,
          numericId: senderNumericId,
          lastMsg: '',
          online: false,
          unreadCount: 0,
          createdAt: Date.now(),
          notificationsEnabled: true,
        };
        addChat(newChatObj);
        subscribeToChat(data.chatId, data.chatId);
      }

      if (data.messageId) {
        processedMessageIds.current.add(data.messageId);
      }


      const newMsg: Message = {
        id: data.messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        senderId: data.senderCode || data.senderId || data.sender,
        sender: data.sender || chat?.name || 'User',
        isOutgoing: false,
        text: textContent,
        time: data.time || Date.now(),
        read: useChatStore.getState().activeChatId === data.chatId,
        mediaType: mediaType || null,
        mediaUrl: mediaUrl || null,
        mediaName: mediaName || null,
        mime: mime || null,
      };
      const targetChatId = chat ? chat.id : data.chatId;
      addMessage(targetChatId, newMsg);
      updateChat(targetChatId, {
        lastMsg: textContent || (mediaType ? `[${mediaType}]` : ''),
      });
    };

    keysToListen.forEach((key) => {
      const channel = pusher.subscribe(`private-handshake-${key}`);
      channel.bind('client-request-identity', handleRequest);
      channel.bind('client-identity-confirmed', handleConfirm);
      channel.bind('client-group-added', handleGroupAdded);
      channel.bind('client-message', handleDirectMessage);
      const unsubAbly = ablyService.subscribeToHandshake(key, handleRequest, handleConfirm);

      unsubscribes.push(() => {
        unsubAbly();
        channel.unbind_all();
        pusher.unsubscribe(`private-handshake-${key}`);
      });
    });

    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [myCode, nickname, addIncomingFriendRequest, updateChat]);

  const chatPresenceKey = useMemo(() => {
    return chats
      .filter((c) => c.type === 'private' && c.id !== 'notes')
      .map((c) => `${c.id}:${c.peerCode || ''}`)
      .join('|');
  }, [chats]);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    chats.forEach((chat) => {
      if (chat.type === 'private' && chat.id !== 'notes') {
        const peerId = (chat.peerCode && chat.peerCode !== 'Unknown' && chat.peerCode.trim())
          ? chat.peerCode.trim()
          : (chat.id && chat.id.length === 36 && !chat.id.includes('-'))
            ? chat.id.trim()
            : null;
        if (!peerId) return;

        const unsubscribe = ablyService.subscribeToUserPresence(
          peerId,
          (isOnline, lastSeen) => {
            const current = useChatStore.getState().chats.find(c => c.id === chat.id);
            if (current && current.online === isOnline && (lastSeen ? current.lastSeen === lastSeen : true)) return;
            updateChat(chat.id, {
              online: isOnline,
              ...(lastSeen ? { lastSeen } : {}),
            });
          }
        );
        unsubscribes.push(unsubscribe);
      }
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [chatPresenceKey, updateChat]);

  const handleAcceptFriendRequest = useCallback(async (req: IncomingFriendRequest) => {
    const myKeys = generateKeyPair();
    const sharedSecret = deriveSharedSecret(myKeys.privateKey, req.senderPublicKey);
    const rootKey = deriveRootKey(sharedSecret);

    const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, req.senderPublicKey);

    addChat({
      id: req.chatId,
      type: 'private',
      name: req.senderNickname,
      lastMsg: 'E2EE_SECURE_CHANNEL_READY',
      online: false,
      sharedSecret: sharedSecret,
      isChatInitiator: false,
      ratchetState: ratchet.getState(),
      avatarUrl: req.avatarUrl ?? undefined,
      bannerUrl: req.bannerUrl ?? undefined,
      peerCode: req.senderCode,
      originalPeerCode: req.senderCode,
      username: req.username || undefined,
      description: req.bio || undefined,
      birthday: req.birthday || undefined,
    });

    const myCurrentUsername = useAuthStore.getState().username;
    const myCurrentBio = useAuthStore.getState().bio;
    const myCurrentBirthday = useAuthStore.getState().birthday;

    ablyService.sendHandshakeConfirm(req.senderCode, {
      nickname,
      publicKey: myKeys.publicKey,
      chatId: req.chatId,
      avatarUrl,
      senderCode: myCode,
      username: myCurrentUsername,
      bio: myCurrentBio,
      birthday: myCurrentBirthday,
    }).catch((err) => console.warn('[Ably] Handshake confirm send error:', err));

    const pusher = getPusher();
    const senderChannel = pusher.subscribe(`private-handshake-${req.senderCode}`);
    const sendConfirm = () =>
      senderChannel.trigger('client-identity-confirmed', {
        nickname,
        publicKey: myKeys.publicKey,
        chatId: req.chatId,
        avatarUrl,
        senderCode: myCode,
        username: myCurrentUsername,
        bio: myCurrentBio,
        birthday: myCurrentBirthday,
      });

    if (senderChannel.subscribed) sendConfirm();
    else senderChannel.bind('pusher:subscription_succeeded', sendConfirm);

    
    supabaseService.sendOfflineHandshake(
      req.chatId,
      `CONFIRM:${req.senderCode}`,
      nickname || '',
      myKeys.publicKey,
      avatarUrl || null,
      myCode || ''
    ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by code:', err));

    if (req.senderNickname && req.senderNickname !== req.senderCode) {
      supabaseService.sendOfflineHandshake(
        req.chatId,
        `CONFIRM:${req.senderNickname}`,
        nickname || '',
        myKeys.publicKey,
        avatarUrl || null,
        myCode || ''
      ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by nick:', err));
    }

    try {
      await supabaseService.markHandshakeConsumed(req.id);
    } catch {}

    removeIncomingFriendRequest(req.id);
    setShowFriendRequestsModal(false);
    setActiveChat(req.chatId);
  }, [nickname, avatarUrl, addChat, removeIncomingFriendRequest, setActiveChat]);

  const handleRejectFriendRequest = useCallback(async (req: IncomingFriendRequest) => {
    try {
      await supabaseService.markHandshakeConsumed(req.id);
    } catch {}
    removeIncomingFriendRequest(req.id);
  }, [removeIncomingFriendRequest]);


  return {
    handleAcceptFriendRequest,
    handleRejectFriendRequest,
  };
};
