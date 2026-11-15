import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat, type Message, type ChatAction } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCallStore } from '../../../store/useCallStore';
import { callSoundService } from '../../../services/callSoundService';
import { getPusher, CLIENT_SESSION_ID } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { supabaseService } from '../../../services/supabaseService';
import { DoubleRatchet } from '../../../lib/double-ratchet';

import { messageQueue } from '../../../lib/message-queue';
import { showNotification } from '../../../utils/notification';
import { isAppInFocusAndVisible } from './layoutSyncUtils';
import { receiptQueue } from '../../../services/receiptService';
import { p2pDataService } from '../../../services/p2pDataService';

const isValidProfileString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0 && val.trim() !== 'undefined' && val.trim() !== 'null';

export interface UsePrivateChatSubscriptionsParams {
  activeSubscriptions: React.MutableRefObject<Map<string, { channel: any; handler: (data: any) => void }>>;
  processedMessageIds: React.MutableRefObject<Set<string>>;
  ablyMessageUnsubscribes: React.MutableRefObject<Map<string, () => void>>;
  deliveryUnsubscribes: React.MutableRefObject<Map<string, () => void>>;
  decryptQueues: React.MutableRefObject<Map<string, Promise<void>>>;
  pingIntervals: React.MutableRefObject<Map<string, ReturnType<typeof setInterval>>>;
  lastPongTime: React.MutableRefObject<Map<string, number>>;
  codeChannelRef: React.MutableRefObject<any>;
  processedChatIds: React.MutableRefObject<Set<string>>;
  nickname: string | null;
  myCode: string | null;
  chats: Chat[];
  deletedChatSessions: Record<string, Chat> | undefined;
  addMessage: (chatId: string, message: Message, ciphertext?: string, messageIndex?: number) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  subscribeToGroupChat: (chatId: string) => any;
  subscribeToPublicChannel: (channelId: string) => any;
}

export const usePrivateChatSubscriptions = ({
  activeSubscriptions,
  processedMessageIds,
  ablyMessageUnsubscribes,
  deliveryUnsubscribes,
  decryptQueues,
  pingIntervals,
  lastPongTime,
  codeChannelRef,
  processedChatIds,
  nickname,
  myCode,
  chats,
  deletedChatSessions,
  addMessage,
  updateChat,
  subscribeToGroupChat,
  subscribeToPublicChannel,
}: UsePrivateChatSubscriptionsParams) => {
  void subscribeToGroupChat;
  void subscribeToPublicChannel;
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const startPingForChat = useCallback((chatId: string) => {
    
    void chatId;
  }, []);

  const subscribeToChat = useCallback((chatId: string, sharedSecret: string) => {
    void sharedSecret;

    const pusher = getPusher();
    if (activeSubscriptions.current.has(chatId)) {
      console.log(`[subscribeToChat] Already subscribed to ${chatId}, skipping.`);
      return activeSubscriptions.current.get(chatId)!.channel;
    }
    console.log(`[Pusher] Subscribing to private-chat-${chatId}`);
    const channel = pusher.subscribe(`private-chat-${chatId}`);

    const handleMessage = (data: any) => {
      if (useChatStore.getState().deletedChatIds?.includes(chatId)) return;
      let chat = useChatStore.getState().chats.find((c) => c.id === chatId);
      if (!chat && data.senderCode) {
        chat = useChatStore.getState().chats.find((c) => c.type === 'private' && (c.peerCode === data.senderCode || c.originalPeerCode === data.senderCode));
      }
      if (!chat) {
        chat = useChatStore.getState().restoreDeletedChat(chatId) || undefined;
      }
      const targetChatId = chat?.id || chatId;
      const myUserId = useAuthStore.getState().userId;
      const currentNickname = useAuthStore.getState().nickname || nickname;
      const isSelf = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
        (currentNickname && (data.sender === currentNickname || data.senderNickname === currentNickname)) ||
        data.sender === 'YOU' ||
        (data.messageId && processedMessageIds.current.has(data.messageId))
      );

      if (isSelf) return;

      if (data.type === 'p2p-signal') {
        p2pDataService.handleSignal(chatId, data);
        return;
      }

      if (data.type === 'reaction' && data.emoji && data.sender) {
        if (data.sessionId === CLIENT_SESSION_ID) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(targetChatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
        return;
      }

      if (data.type === 'delivered') {
        const rawIds: string[] = Array.isArray(data.messageIds) ? data.messageIds : (data.messageId ? [data.messageId] : []);
        const targetIds = new Set(rawIds);
        const currentMessages = useChatStore.getState().messagesByChatId[targetChatId] || [];
        const updatedMessages = currentMessages.map((msg) => {
          const isTarget = (msg.id && targetIds.has(msg.id)) || (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing);
          if (isTarget) {
            if (msg.status === 'read' || msg.read) return msg;
            return { ...msg, status: 'delivered' as const, deliveredAt: data.timestamp || Date.now() };
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [targetChatId]: updatedMessages,
          }
        }));
        return;
      }

      if (data.type === 'read') {
        const rawIds: string[] = Array.isArray(data.messageIds) ? data.messageIds : (data.messageId ? [data.messageId] : []);
        const targetIds = new Set(rawIds);
        const currentMessages = useChatStore.getState().messagesByChatId[targetChatId] || [];
        const readIds: string[] = [];
        const readMediaUrls: string[] = [];
        const readMsgObjects: Message[] = [];
        const updatedMessages = currentMessages.map((msg) => {
          const isTarget = (msg.id && targetIds.has(msg.id)) || (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing);
          if (isTarget) {
            const readMsg = { ...msg, read: true, status: 'read' as const, readAt: data.timestamp || Date.now() };
            if (readMsg.id) readIds.push(readMsg.id);
            readMsgObjects.push(readMsg);
            if (readMsg.mediaUrl) readMediaUrls.push(readMsg.mediaUrl);
            if (readMsg.mediaItems && Array.isArray(readMsg.mediaItems)) {
              for (const item of readMsg.mediaItems) {
                if (item?.url) readMediaUrls.push(item.url);
              }
            }
            return readMsg;
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [targetChatId]: updatedMessages,
          }
        }));
        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(targetChatId, readIds);
        }
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const rm of readMsgObjects) {
            if (rm.id) {
              (window as any).orbita.storageAddMessage(targetChatId, rm.id, rm).catch(() => {});
            }
          }
        }
        return;
      }

      if (data.type === 'message-ack') {
        messageQueue.handleAcknowledgment({
          messageId: data.messageId,
          chatId: data.chatId,
          receivedBy: data.receivedBy,
          timestamp: data.timestamp,
        });
        return;
      }

      if (data.type === 'chat-deleted' || (data.type === 'system' && data.action === 'delete-chat') || data.action === 'delete-chat') {
        const targetChat = useChatStore.getState().chats.find(c => c.id === targetChatId);
        const eventTime = data.timestamp || data.time;
        if (targetChat && targetChat.createdAt && eventTime && eventTime < targetChat.createdAt) {
          return;
        }
        useChatStore.getState().deleteChat(targetChatId);
        if (useChatStore.getState().activeChatId === targetChatId) {
          useChatStore.getState().setActiveChat(null);
        }
        if (activeSubscriptions.current.has(chatId)) {
          const sub = activeSubscriptions.current.get(chatId)!;
          sub.channel.unbind_all();
          pusher.unsubscribe(`private-chat-${chatId}`);
          activeSubscriptions.current.delete(chatId);
        }
        if (ablyMessageUnsubscribes.current.has(chatId)) {
          ablyMessageUnsubscribes.current.get(chatId)!();
          ablyMessageUnsubscribes.current.delete(chatId);
        }
        return;
      }

      if (data.type === 'system') {
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetChatId]: [],
            }
          }));
          updateChat(targetChatId, {
            lastMsg: tRef.current('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
          });
          return;
        }
        return;
      }

      if (!chat) return;

      if (data.type === 'profile-update') {
        const myCode = useChatStore.getState().myCode;
        const myUserId = useAuthStore.getState().userId;
        const isMine =
          (myUserId && (data.userId === myUserId || data.senderUserId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode));
        if (isMine) {
          return;
        }
        const updates: Partial<Chat> = {};
        if (isValidProfileString(data.avatarUrl)) updates.avatarUrl = data.avatarUrl.trim();
        if (isValidProfileString(data.bannerUrl)) updates.bannerUrl = data.bannerUrl.trim();
        if (isValidProfileString(data.nickname)) updates.name = data.nickname.trim();
        if (isValidProfileString(data.bio)) updates.description = data.bio.trim();
        if (isValidProfileString(data.username)) updates.username = data.username.trim();
        if (isValidProfileString(data.birthday)) updates.birthday = data.birthday.trim();
        if (isValidProfileString(data.senderCode) && (!myCode || data.senderCode !== myCode)) {
          updates.peerCode = data.senderCode.trim();
          updates.originalPeerCode = data.senderCode.trim();
        }
        if (Object.keys(updates).length > 0) {
          updateChat(targetChatId, updates);
        }
        return;
      }

      if (data.type === 'message') {
        const messageKey = data.messageId || `${chatId}_${data.index}_${data.ciphertext?.slice(0, 16)}`;
        if (processedMessageIds.current.has(messageKey)) {
          return;
        }
        processedMessageIds.current.add(messageKey);

        const prevQueue = decryptQueues.current.get(targetChatId) || Promise.resolve();
        const nextQueue = prevQueue.then(async () => {
          let currentChat = useChatStore.getState().chats.find((c) => c.id === targetChatId);
          if (!currentChat && data.senderCode) {
            currentChat = useChatStore.getState().chats.find((c) => c.type === 'private' && (c.peerCode === data.senderCode || c.originalPeerCode === data.senderCode));
          }
          if (!currentChat) {
            currentChat = useChatStore.getState().restoreDeletedChat(targetChatId) || undefined;
          }
          const actualChatId = currentChat?.id || targetChatId;
          let messageData: any = null;
          if (data.dhPublicKey === 'PRE_HANDSHAKE' || (!data.dhPublicKey && data.ciphertext?.startsWith('{'))) {
            try {
              messageData = JSON.parse(data.ciphertext);
            } catch {
              return;
            }
          } else {
            if (!currentChat || !currentChat.ratchetState) {
              processedMessageIds.current.delete(messageKey);
              return;
            }
            const ratchet = DoubleRatchet.fromState(currentChat.ratchetState);
            const decrypted = await ratchet.decrypt(
              data.ciphertext,
              data.index,
              data.dhPublicKey ?? '',
              data.prevChainCount,
            );
            if (decrypted === null) {
              return;
            }
            updateChat(actualChatId, { ratchetState: ratchet.getState() });

            try {
              messageData = JSON.parse(decrypted);
            } catch {
              return;
            }
          }

          if (messageData?.type === 'receipt' || messageData?.type === 'read' || messageData?.receiptType === 'read') {
            const targetIds = new Set((messageData.messageIds || [messageData.messageId]).filter(Boolean));
            const targetTime = messageData.time;

            const currentMessages = useChatStore.getState().messagesByChatId[actualChatId] || [];
            const updatedMessages = currentMessages.map((m) => {
              const isTarget = (m.id && targetIds.has(m.id)) || (targetTime && m.time <= targetTime && m.isOutgoing);
              if (isTarget) {
                return { ...m, read: true, status: 'read' as const, readAt: messageData.time || Date.now() };
              }
              return m;
            });

            useChatStore.setState((s) => ({
              messagesByChatId: {
                ...s.messagesByChatId,
                [actualChatId]: updatedMessages,
              },
            }));

            try {
              if (data.messageId) {
                supabaseService.markMessageDelivered(data.messageId).catch(() => {});
              }
            } catch {}
            return;
          }

          const msgId = messageData?.id || data.messageId || data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const senderCode = messageData?.senderCode || data.senderCode || (!messageData?.senderId?.includes('-') ? messageData?.senderId : undefined) || chat.peerCode;
          const senderNick = messageData?.sender || data.sender;
          const senderAvatar = messageData?.avatarUrl || data.avatarUrl;

          const chatUpdates: Partial<Chat> = {};
          if (senderNick && (!nickname || senderNick !== nickname) && senderNick !== 'YOU' && senderNick !== 'undefined' && senderNick !== 'null') {
            if (chat.name.length === 36 || (nickname && chat.name === nickname) || !chat.name) {
              chatUpdates.name = senderNick;
            }
          }
          const myAvatarUrl = useAuthStore.getState().avatarUrl;
          if (senderAvatar && (!chat.avatarUrl || chat.avatarUrl === myAvatarUrl)) {
            chatUpdates.avatarUrl = senderAvatar;
          }
          if (senderCode && !senderCode.includes('-') && !chat.peerCode) {
            chatUpdates.peerCode = senderCode;
          }
          if (Object.keys(chatUpdates).length > 0) {
            updateChat(actualChatId, chatUpdates);
          }

          const isCurrentActive = useChatStore.getState().activeChatId === actualChatId && typeof document !== 'undefined' && document.visibilityState === 'visible';

          addMessage(
            actualChatId,
            {
              id: msgId,
              senderId: senderCode || messageData?.senderId || data.senderId || data.senderCode || chat.peerCode,
              sender: senderNick || data.sender || chat.name || 'User',
              isOutgoing: false,
              text: messageData.text || '',
              time: data.time || Date.now(),
              read: isCurrentActive,
              index: data.index,
              mediaType: messageData.mediaType || null,
              mediaUrl: messageData.mediaUrl || null,
              mediaName: messageData.mediaName || null,
              mediaKey: messageData.mediaKey || null,
              mime: messageData.mime || null,
              mediaItems: messageData.mediaItems || undefined,
              audioMetadata: messageData.audioMetadata || undefined,
              fileSize: messageData.fileSize || messageData.size || undefined,
              duration: messageData.duration || undefined,
              waveform: messageData.waveform || undefined,
              linkPreview: messageData.linkPreview || undefined,
              width: messageData.width || undefined,
              height: messageData.height || undefined,
              blurPreview: messageData.blurPreview || messageData.thumbnail || undefined,
            },
            data.ciphertext,
            data.index
          );

          try {
            if (data.messageId) {
              supabaseService.markMessageDelivered(data.messageId).catch((err: any) => {
                console.error('[MainLayout] Failed to mark message as delivered in Supabase:', err);
              });
              console.log('[MainLayout] Message marked as delivered in Supabase:', data.messageId);
            }
          } catch (err: any) {
            console.error('[MainLayout] Failed to mark message as delivered in Supabase:', err);
          }

          if (!isSelf && chat) {
            const activeChatId = useChatStore.getState().activeChatId;
            const isRecent = !data.time || (Date.now() - Number(data.time) < 15000);
            if (isRecent && (activeChatId !== actualChatId || !isAppInFocusAndVisible())) {
              let notifBody = messageData.text;
              if (
                messageData.mediaType === 'sticker' ||
                (typeof notifBody === 'string' && (/^\[Sticker\]/i.test(notifBody.trim()) || /(\.stickers|\/stickers|stickers\/|bisquit)/i.test(notifBody)))
              ) {
                notifBody = tRef.current('chatWindow.sticker') || 'Стикер';
              } else if (
                messageData.mediaType === 'voice' ||
                (typeof notifBody === 'string' && (/^\[Audio\]\s+voice_/i.test(notifBody.trim()) || /^voice_\d+/i.test(notifBody.trim()) || notifBody.includes('voice_')))
              ) {
                notifBody = tRef.current('chatWindow.voice_message') || 'Голосовое сообщение';
              } else if (
                messageData.mediaType === 'image' ||
                messageData.mediaType === 'photo' ||
                (typeof notifBody === 'string' && /^\[Photo\]/i.test(notifBody.trim()))
              ) {
                notifBody = tRef.current('chatWindow.photo') || 'Фотография';
              } else if (
                messageData.mediaType === 'video' ||
                (typeof notifBody === 'string' && /^\[Video\]/i.test(notifBody.trim()))
              ) {
                notifBody = tRef.current('chatWindow.video') || 'Видео';
              } else if (
                messageData.mediaType === 'audio' ||
                (typeof notifBody === 'string' && /^\[Audio\]/i.test(notifBody.trim()))
              ) {
                notifBody = messageData.mediaName || tRef.current('chatWindow.audio') || 'Аудиозапись';
              } else if (
                messageData.mediaType === 'file' ||
                (typeof notifBody === 'string' && /^\[File\]/i.test(notifBody.trim()))
              ) {
                notifBody = messageData.mediaName || tRef.current('chatWindow.file') || 'Файл';
              } else if (!notifBody) {
                notifBody = tRef.current('chatWindow.new_message') || 'Новое сообщение';
              }
              const notifAvatar = chat.avatarUrl || null;
              showNotification(data.sender, notifBody, chatId, notifAvatar);
            }
          }

          if (!isSelf && data.messageId) {
            if (isCurrentActive) {
              receiptQueue.queueRead(chatId, data.messageId);
            } else {
              receiptQueue.queueDelivered(chatId, data.messageId);
            }
          }
        }).catch(() => {});
        decryptQueues.current.set(chatId, nextQueue);
        return;
      }
      if (data.type === 'edit') {
        const messages = useChatStore.getState().messagesByChatId[chatId] || [];
        const targetMsg = (data.targetMessageId || data.messageId)
          ? messages.find((m) => m.id === (data.targetMessageId || data.messageId))
          : (data.editIndex !== undefined ? messages[data.editIndex] : null);
        if (!targetMsg) return;
        if (targetMsg.senderId && data.senderId && targetMsg.senderId !== data.senderId) return;
        const prevQueue = decryptQueues.current.get(chatId) || Promise.resolve();
        const nextQueue = prevQueue.then(async () => {
          const freshChat = useChatStore.getState().chats.find((c) => c.id === chatId) || chat;
          if (!freshChat?.ratchetState) return;
          const ratchet = DoubleRatchet.fromState(freshChat.ratchetState);
          const decrypted = await ratchet.decrypt(
            data.text,
            data.index,
            data.dhPublicKey ?? '',
            data.prevChainCount,
          );
          if (decrypted === null) return;
          updateChat(chatId, { ratchetState: ratchet.getState() });
          let resolvedText = decrypted;
          try {
            const parsed = JSON.parse(decrypted);
            if (parsed && typeof parsed.text === 'string') resolvedText = parsed.text;
          } catch {}
          const currentMsgs = useChatStore.getState().messagesByChatId[chatId] || [];
          const targetIndex = (data.targetMessageId || data.messageId)
            ? currentMsgs.findIndex((m) => m.id === (data.targetMessageId || data.messageId))
            : (data.editIndex !== undefined ? data.editIndex : -1);
          if (targetIndex >= 0 && currentMsgs[targetIndex]) {
            const updatedMessages = [...currentMsgs];
            const updatedItem = {
              ...updatedMessages[targetIndex],
              text: resolvedText,
              encryptedText: data.text,
              index: data.index,
              isEdited: true,
              editedAt: Date.now(),
            };
            updatedMessages[targetIndex] = updatedItem;
            useChatStore.setState((state) => ({
              messagesByChatId: {
                ...state.messagesByChatId,
                [chatId]: updatedMessages,
              }
            }));
            if (updatedItem.id && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
              (window as any).orbita.storageAddMessage(chatId, updatedItem.id, updatedItem).catch(() => {});
            }
          }
        }).catch(() => {});
        decryptQueues.current.set(chatId, nextQueue);
        return;
      }

      if (data.type === 'delete' || data.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(chatId, targetId);
        } else if (data.deleteIndex !== undefined) {
          const messages = useChatStore.getState().messagesByChatId[chatId] || [];
          const updated = messages.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            }
          }));
          updateChat(chatId, {
            lastMsg: updated.length > 0 ? updated[updated.length - 1].text : tRef.current('common.history_cleared'),
          });
        }
        return;
      }

      if (data.type === 'pin' || data.type === 'pin-message') {
        updateChat(chatId, { pinnedMessage: data.pinData });
        const actor = data.sender || data.actorNickname || data.pinData?.pinnedBy || '';
        const isAlreadyAdded = (useChatStore.getState().messagesByChatId[chatId] || []).some(
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
          useChatStore.getState().addMessage(chatId, sysMsg);
          try {
            (window as any).orbita?.storageAddMessage?.(chatId, sysMsg.id, sysMsg);
          } catch {}
        }
        return;
      }

      if (data.type === 'unpin' || data.type === 'unpin-message') {
        updateChat(chatId, { pinnedMessage: null });
        return;
      }

      if (data.type === 'ping') {
        const updates: Partial<Chat> = {};
        if (data.senderCode) updates.peerCode = data.senderCode;
        if (Object.keys(updates).length > 0) updateChat(chatId, updates);
        lastPongTime.current.set(chatId, Date.now());
      }

      if (data.type === 'chat-deleted' || (data.type === 'system' && data.action === 'delete-chat') || data.action === 'delete-chat') {
        const targetChat = useChatStore.getState().chats.find(c => c.id === targetChatId);
        const eventTime = data.timestamp || data.time;
        if (targetChat && targetChat.createdAt && eventTime && eventTime < targetChat.createdAt) {
          return;
        }
        if (activeSubscriptions.current.has(chatId)) {
          const sub = activeSubscriptions.current.get(chatId)!;
          sub.channel.unbind_all();
          getPusher().unsubscribe(`private-chat-${chatId}`);
          activeSubscriptions.current.delete(chatId);
        }
        if (ablyMessageUnsubscribes.current.has(chatId)) {
          const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
          unsub();
          ablyMessageUnsubscribes.current.delete(chatId);
        }
        useChatStore.getState().deleteChat(targetChatId);
        if (useChatStore.getState().activeChatId === targetChatId) {
          useChatStore.getState().setActiveChat(null);
        }
        return;
      }

      if (data.type === 'system') {
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [],
            }
          }));
          updateChat(chatId, {
            lastMsg: tRef.current('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now()
          });
          return;
        }
      }

      if (typeof data.type === 'string' && data.type.startsWith('call-')) {
        const myNick = nickname || useAuthStore.getState().nickname || useCallStore.getState().myNickname;
        const myCurrentCode = myCode || useChatStore.getState().myCode;
        const myUserId = useAuthStore.getState().userId;
        const isSelfSignal = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCurrentCode && (data.senderCode === myCurrentCode || data.senderId === myCurrentCode)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender && myNick && data.sender === myNick)
        );
        if (isSelfSignal) {
          return;
        }

        if (data.type !== 'call-offer') {
          const state = useCallStore.getState();
          const currentRoom = state.activeCall?.roomName || state.incomingCall?.roomName;
          if (data.roomName && currentRoom && data.roomName !== currentRoom) {
            return;
          }
        }
      }

      if (data.type === 'call-offer') {
        const currentState = useCallStore.getState();
        if (
          (currentState.incomingCall && currentState.incomingCall.roomName === data.roomName) ||
          (currentState.activeCall && currentState.activeCall.roomName === data.roomName) ||
          currentState.processedRoomNames.includes(data.roomName)
        ) {
          return;
        }

        if (currentState.activeCall || currentState.incomingCall) {
          const pusher = getPusher();
          const channel = pusher.subscribe(`private-chat-${chatId}`);
          const sendBusy = () => {
            const myUserId = useAuthStore.getState().userId;
            const myCurrentCode = myCode || useChatStore.getState().myCode;
            const busyPayload = {
              type: 'call-busy',
              sender: nickname,
              senderUserId: myUserId || undefined,
              senderCode: myCurrentCode || undefined,
              senderId: myUserId || myCurrentCode || nickname,
              text: '',
              roomName: data.roomName,
            };
            try {
              channel.trigger('client-message', busyPayload);
            } catch {}
            try {
              ablyService.sendMessage(chatId, busyPayload);
            } catch {}
          };
          if (channel.subscribed) sendBusy();
          else channel.bind('pusher:subscription_succeeded', sendBusy);
          return;
        }
        useCallStore.getState().setIncomingCall({
          from: data.sender,
          chatId,
          callType: data.callType,
          roomName: data.roomName,
          timestamp: Date.now(),
          verificationSalt: data.verificationSalt,
        });
        return;
      }

      if (data.type === 'call-accept') {
        useCallStore.getState().handleAccept(data.roomName);
        return;
      }

      if (data.type === 'call-connected') {
        useCallStore.getState().handleConnected(data.connectedAt, data.roomName);
        return;
      }

      if (data.type === 'call-reject') {
        callSoundService.stop();
        if (data.roomName) {
          useCallStore.getState().addProcessedRoomName(data.roomName);
        }
        useCallStore.getState().handleReject(data.roomName);
        return;
      }

      if (data.type === 'call-busy') {
        callSoundService.stop();
        useCallStore.getState().handleBusy(data.roomName);
        return;
      }

      if (data.type === 'call-cancel') {
        callSoundService.stop();
        if (data.roomName) {
          useCallStore.getState().addProcessedRoomName(data.roomName);
        }
        useCallStore.getState().handleCancel(data.roomName);
        return;
      }

      if (data.type === 'call-hangup') {
        const targetChat = useChatStore.getState().chats.find((c) => c.id === chatId);
        if (targetChat?.type === 'group') return;
        useCallStore.getState().handleHangup(data.roomName);
        return;
      }
    };

    const handleReaction = (data: any) => {
      const myUserId = useAuthStore.getState().userId;
      const isSelf = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode))
      );
      if (isSelf) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    p2pDataService.onMessage(chatId, handleMessage);

    channel.bind('client-message', handleMessage);
    channel.bind('reaction', handleReaction);
    activeSubscriptions.current.set(chatId, { channel, handler: handleMessage });
    console.log(`[Pusher] Subscribed to private-chat-${chatId}`);

    if (!ablyMessageUnsubscribes.current.has(chatId)) {
      const unsub = ablyService.subscribeToChatMessages(chatId, handleMessage);
      ablyMessageUnsubscribes.current.set(chatId, unsub);
      console.log(`[Ably] Subscribed to chat:${chatId}`);
    }

    startPingForChat(chatId);
    return channel;
  }, [addMessage, updateChat, startPingForChat]);

  const subscribeToDeliveryUpdates = useCallback((chatId: string) => {
    if (deliveryUnsubscribes.current.has(chatId)) {
      return;
    }
    const unsubscribe = ablyService.subscribeToDeliveryUpdates(
      chatId,
      (messageId, _userId, status) => {
        const chat = useChatStore.getState().chats.find(c => c.id === chatId);
        if (!chat) return;
        useChatStore.getState().updateMessageStatus(chatId, messageId, status);
      }
    );
    deliveryUnsubscribes.current.set(chatId, unsubscribe);
  }, [updateChat]);

  const typingTimers = useRef<Map<string, Map<string, { nickname: string; action: ChatAction; timer: ReturnType<typeof setTimeout> }>>>(new Map());
  const typingUnsubscribes = useRef<Map<string, () => void>>(new Map());

  const subscribeToTypingUpdates = useCallback((chatId: string) => {
    if (!chatId || chatId === 'notes' || typingUnsubscribes.current.has(chatId)) {
      return;
    }
    const unsubscribe = ablyService.subscribeToTyping(chatId);
    typingUnsubscribes.current.set(chatId, unsubscribe);
  }, []);

  const relevantChatIds = useMemo(() => {
    return [
      ...chats.map((c) => `${c.id}:${c.type}:${Boolean(c.sharedSecret)}`),
      ...Object.keys(deletedChatSessions || {}),
    ].join('|');
  }, [chats, deletedChatSessions]);

  useEffect(() => {
    const allRelevantChats = [
      ...chats,
      ...Object.values(deletedChatSessions || {}),
    ];
    for (const chat of allRelevantChats) {
      if (!chat?.id || chat.id === 'notes') continue;
      if (!activeSubscriptions.current.has(chat.id)) {
        if (chat.type === 'private' && chat.sharedSecret) {
          subscribeToChat(chat.id, chat.sharedSecret);
          subscribeToDeliveryUpdates(chat.id);
        }
      }
    }
  }, [relevantChatIds, subscribeToChat, subscribeToDeliveryUpdates]);

  useEffect(() => {
    const handleAccountSwitched = () => {
      const pusher = getPusher();
      activeSubscriptions.current.forEach((sub) => { try { sub.channel.unbind_all(); pusher.unsubscribe(sub.channel.name); } catch {} });
      activeSubscriptions.current.clear();

      pingIntervals.current.forEach(t => clearInterval(t)); pingIntervals.current.clear();
      if (codeChannelRef.current) { codeChannelRef.current.unbind_all(); pusher.unsubscribe(codeChannelRef.current.name); }
      processedChatIds.current.clear();
      processedMessageIds.current.clear();
      messageQueue.destroy();
      deliveryUnsubscribes.current.forEach((unsubscribe) => unsubscribe());
      deliveryUnsubscribes.current.clear();
      typingUnsubscribes.current.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      typingUnsubscribes.current.clear();
      typingTimers.current.forEach((userMap) => {
        userMap.forEach((entry) => clearTimeout(entry.timer));
      });
      typingTimers.current.clear();
      ablyMessageUnsubscribes.current.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      ablyMessageUnsubscribes.current.clear();
    };

    window.addEventListener('orbita:account-switched', handleAccountSwitched);

    return () => {
      window.removeEventListener('orbita:account-switched', handleAccountSwitched);
      handleAccountSwitched();
    };
  }, []);


  return {
    subscribeToChat,
    subscribeToDeliveryUpdates,
    subscribeToTypingUpdates,
  };
};
