import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat, type Message } from '../../../store/useChatStore';
import { useAuthStore, getInitialNumericId } from '../../../store/useAuthStore';
import { useConnectionStore } from '../../../store/useConnectionStore';
import { getPusher, reconnectPusher } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { supabaseService, type OfflineMessageRecord } from '../../../services/supabaseService';
import { gatewayManager } from '../../../services/gatewayManager';
import { groupService } from '../../../services/groupService';
import { channelService } from '../../../services/channelService';
import { generateKeyPair, deriveSharedSecret, deriveRootKey, derivePublicKey, encryptMessage } from '../../../lib/crypto';
import { networkManager, type OutboxItem } from '../../../services/networkManager';
import { isValidGroupCode, deriveGroupKey } from '../../../lib/groupCrypto';
import { DoubleRatchet } from '../../../lib/double-ratchet';
import { revalidateDevelopersOnConnection } from '../../ui/DeveloperBadge';
import { sendEncryptedReadReceipt } from '../../../services/receiptService';
import { showNotification } from '../../../utils/notification';
import { isAppInFocusAndVisible } from './layoutSyncUtils';

export interface UseMainLayoutSyncParams {
  nickname: string | null;
  myCode: string | null;
  step: string;
  addChat: (chat: Partial<Chat>) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  addMessage: (chatId: string, message: Message) => void;
  addMessagesBatch: (items: Array<{ chatId: string; message: Message; encryptedText?: string; index?: number }>) => void;
  addIncomingFriendRequest: (req: any) => void;
  setIsNetworkOnline: React.Dispatch<React.SetStateAction<boolean>>;
  subscribeToChat: (chatId: string, sharedSecret: string) => any;
  subscribeToDeliveryUpdates: (chatId: string) => void;
  processedMessageIds: React.MutableRefObject<Set<string>>;
  activeSubscriptions: React.MutableRefObject<Map<string, { channel: any; handler: (data: any) => void }>>;
  ablyMessageUnsubscribes: React.MutableRefObject<Map<string, () => void>>;
}

export const useMainLayoutSync = ({
  nickname,
  myCode,
  step,
  addChat,
  updateChat,
  addMessage,
  addMessagesBatch,
  addIncomingFriendRequest,
  setIsNetworkOnline,
  subscribeToChat,
  subscribeToDeliveryUpdates,
  processedMessageIds,
  activeSubscriptions,
  ablyMessageUnsubscribes,
}: UseMainLayoutSyncParams) => {
  const { t } = useTranslation();
  const isLoadingPendingRef = useRef(false);

  const loadPendingHandshakes = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!nickname && !myCode) return;
    const currentNumericId = useAuthStore.getState().numericId;
    const currentUsername = useAuthStore.getState().username;
    const cleanUsername = currentUsername ? currentUsername.replace(/^@+/, '').trim().toLowerCase() : null;
    const keysToCheck = Array.from(new Set([
      myCode,
      useAuthStore.getState().userId,
      currentNumericId,
      cleanUsername,
      cleanUsername ? `@${cleanUsername}` : null,
    ].filter(Boolean))) as string[];
    const processedIds = new Set<string>();

    try {
      const nestedRecords = await Promise.all(
        keysToCheck.map(key => supabaseService.getPendingHandshakes(key).catch(() => []))
      );
      const records = nestedRecords.flat();

      for (const hs of records) {
        if (processedIds.has(hs.id)) continue;
        processedIds.add(hs.id);

        const currentChats = useChatStore.getState().chats;
        const existingHsChat = currentChats.find(
          c => c.id === hs.chat_id || (c.type === 'private' && (c.peerCode === hs.sender_code || c.originalPeerCode === hs.sender_code || c.peerCode === hs.recipient_code))
        );
        if (existingHsChat || useChatStore.getState().deletedChatIds?.includes(hs.chat_id)) {
          await supabaseService.markHandshakeConsumed(hs.id);
          continue;
        }

        const myKeys = generateKeyPair();
        const sharedSecret = deriveSharedSecret(myKeys.privateKey, hs.sender_public_key);
        const rootKey = deriveRootKey(sharedSecret);

        const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, hs.sender_public_key);
        const peerCodeForOffline = hs.sender_code || hs.recipient_code;

        addChat({
          id: hs.chat_id,
          type: 'private',
          name: hs.sender_nickname,
          lastMsg: 'E2EE_SECURE_CHANNEL_READY',
          online: false,
          sharedSecret: sharedSecret,
          isChatInitiator: false,
          ratchetState: ratchet.getState(),
          avatarUrl: hs.sender_avatar_url ?? undefined,
          peerCode: peerCodeForOffline,
        });

        subscribeToChat(hs.chat_id, sharedSecret);
        subscribeToDeliveryUpdates(hs.chat_id);

        if (peerCodeForOffline) {
          supabaseService.sendOfflineHandshake(
            hs.chat_id,
            `CONFIRM:${peerCodeForOffline}`,
            nickname || '',
            myKeys.publicKey,
            useAuthStore.getState().avatarUrl || null,
            myCode || ''
          ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by code:', err));
        }

        if (hs.sender_nickname && hs.sender_nickname !== peerCodeForOffline) {
          supabaseService.sendOfflineHandshake(
            hs.chat_id,
            `CONFIRM:${hs.sender_nickname}`,
            nickname || '',
            myKeys.publicKey,
            useAuthStore.getState().avatarUrl || null,
            myCode || ''
          ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by nick:', err));
        }

        await supabaseService.markHandshakeConsumed(hs.id);

        if (hs.sender_code) {
          revalidateDevelopersOnConnection(hs.sender_code);
        }
      }

      const confirmKeys = keysToCheck.map(k => `CONFIRM:${k}`);
      const nestedConfirmations = await Promise.all(
        confirmKeys.map(key => supabaseService.getPendingHandshakes(key).catch(() => []))
      );
      const confirmations = nestedConfirmations.flat();

      for (const conf of confirmations) {
        const currentChats = useChatStore.getState().chats;
        const existing = currentChats.find(
          c => c.id === conf.chat_id || (c.type === 'private' && conf.sender_code && (c.peerCode === conf.sender_code || c.originalPeerCode === conf.sender_code))
        );

        if (!existing) {
          if (useChatStore.getState().deletedChatIds?.includes(conf.chat_id)) {
            await supabaseService.markHandshakeConsumed(conf.id).catch(() => {});
          }
          continue;
        }

        if (existing.sharedSecret && !existing.ratchetState) {
          const initiatorPrivateKey = existing.sharedSecret;
          const initiatorPublicKey = derivePublicKey(initiatorPrivateKey);
          const sharedSecret = deriveSharedSecret(initiatorPrivateKey, conf.sender_public_key);
          const rootKey = deriveRootKey(sharedSecret);
          const ratchet = DoubleRatchet.initSymmetric(rootKey, initiatorPrivateKey, initiatorPublicKey, conf.sender_public_key);

          const peerCode = conf.sender_code || existing.peerCode || (existing.name && existing.name.length === 36 ? existing.name : undefined);
          if (peerCode) {
            revalidateDevelopersOnConnection(peerCode);
          }
          const safeLastMsg = existing.lastMsg && existing.lastMsg !== 'Заявка отправлена' && existing.lastMsg !== 'E2EE_SECURE_CHANNEL_READY'
            ? existing.lastMsg
            : 'E2EE_SECURE_CHANNEL_READY';
          updateChat(existing.id, {
            name: conf.sender_nickname,
            lastMsg: safeLastMsg,
            online: false,
            sharedSecret: sharedSecret,
            ratchetState: ratchet.getState(),
            avatarUrl: conf.sender_avatar_url ?? undefined,
            peerCode: peerCode,
          });
          subscribeToChat(existing.id, sharedSecret);
          subscribeToDeliveryUpdates(existing.id);
          if (conf.chat_id !== existing.id) {
            subscribeToChat(conf.chat_id, sharedSecret);
            subscribeToDeliveryUpdates(conf.chat_id);
          }

          await supabaseService.markHandshakeConsumed(conf.id);
        } else if (existing.ratchetState) {
          await supabaseService.markHandshakeConsumed(conf.id);
        }
        }
      } catch (err) {
      console.error('[MainLayout] Failed to load pending handshakes:', err);
    }
  }, [nickname, myCode, addIncomingFriendRequest, updateChat]);

  const lastGroupSyncTimeRef = useRef<number>(0);

  const loadPendingGroups = useCallback(async () => {
    if (!myCode && !nickname) return;
    const now = Date.now();
    if (now - lastGroupSyncTimeRef.current < 600000) return;
    lastGroupSyncTimeRef.current = now;
    try {
      const currentUid = useAuthStore.getState().userId;
      const serverGroups = await groupService.fetchMyGroups(myCode || '', currentUid);
      if (!serverGroups || serverGroups.length === 0) return;
      const currentChats = useChatStore.getState().chats;
      const currentIds = new Set(currentChats.map((c) => c.id));
      for (const g of serverGroups) {
        if (useChatStore.getState().deletedChatIds?.includes(g.id)) continue;
        if (currentIds.has(g.id)) {
          useChatStore.getState().updateChat(g.id, {
            name: g.name,
            description: g.description || '',
            avatarUrl: g.avatarUrl || undefined,
            members: (g.members || []) as any[],
            membersCount: g.membersCount || g.members?.length || 1,
            role: (g.role as any) || 'member',
          });
          continue;
        }
        useChatStore.getState().addChat({
          id: g.id,
          type: 'group',
          name: g.name,
          description: g.description || '',
          lastMsg: 'E2EE_SECURE_CHANNEL_READY',
          online: false,
          sharedSecret: g.sharedSecret,
          role: (g.role as any) || 'member',
          inviteCode: g.code,
          creatorNickname: g.creatorNickname,
          creatorCode: g.creatorCode || undefined,
          avatarUrl: g.avatarUrl || undefined,
          members: (g.members || []) as any[],
          membersCount: g.membersCount || 1,
          createdAt: g.createdAt || Date.now(),
          unreadCount: 0,
          lastReadTimestamp: Date.now(),
          muted: false,
          notificationsEnabled: true,
        });
      }
    } catch {}
  }, [myCode, nickname]);

  const loadPendingMessages = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!nickname && !myCode) return;
    if (isLoadingPendingRef.current) {
      return;
    }
    isLoadingPendingRef.current = true;
    try {
      const currentNumericId = useAuthStore.getState().numericId;
      const currentUsername = useAuthStore.getState().username;
      const cleanUsername = currentUsername ? currentUsername.replace(/^@+/, '').trim().toLowerCase() : null;
      const keysToCheck = Array.from(new Set([
        myCode,
        useAuthStore.getState().userId,
        currentNumericId,
        cleanUsername,
        cleanUsername ? `@${cleanUsername}` : null,
      ].filter(Boolean))) as string[];

      const processBatch = async (batch: OfflineMessageRecord[]) => {
        if (batch.length === 0) return;
        const batchMessages: Array<{ chatId: string; message: any }> = [];
        const deliveredIds: string[] = [];
        const readReceiptsToSend: Array<{ chatId: string; msgId: string }> = [];
        const ratchetStateUpdates = new Map<string, any>();
        const receiptUpdates = new Map<string, { targetIds: Set<string>; targetTime?: number; readAt: number }>();
        const deleteActions: Array<{ chatId: string; messageId: string }> = [];
        const profileCache = new Map<string, any>();

        for (const record of batch) {
          if (processedMessageIds.current.has(record.id)) {
            continue;
          }

          if (useChatStore.getState().deletedChatIds?.includes(record.chat_id)) {
            processedMessageIds.current.add(record.id);
            deliveredIds.push(record.id);
            continue;
          }

          const currentChats = useChatStore.getState().chats;
          let chat = currentChats.find(
            c => c.id === record.chat_id || (c.type === 'private' && record.sender_id && (c.peerCode === record.sender_id || c.originalPeerCode === record.sender_id))
          );
          if (!chat) {
            const restored = useChatStore.getState().restoreDeletedChat(record.chat_id);
            if (restored) {
              chat = restored;
              if (chat.sharedSecret) {
                subscribeToChat(chat.id, chat.sharedSecret);
                subscribeToDeliveryUpdates(chat.id);
              }
            }
          }

          if (!chat) {
            let senderNick = record.sender_id;
            let senderAvatar: string | undefined = undefined;
            let senderBanner: string | undefined = undefined;
            let senderUsername: string | undefined = undefined;
            let senderBio: string | undefined = undefined;
            let senderBirthday: string | undefined = undefined;
            let senderNumericId: string | undefined = undefined;

            if (record.dh_public_key === 'PRE_HANDSHAKE' || (!record.dh_public_key && record.ciphertext?.startsWith('{'))) {
              try {
                const parsed = JSON.parse(record.ciphertext);
                if (parsed.sender) senderNick = parsed.sender;
                if (parsed.avatarUrl) senderAvatar = parsed.avatarUrl;
                if (parsed.bannerUrl) senderBanner = parsed.bannerUrl;
              } catch {}
            }

            try {
              let pub = profileCache.get(record.sender_id);
              if (pub === undefined) {
                pub = await supabaseService.lookupPublicProfile(record.sender_id);
                profileCache.set(record.sender_id, pub || null);
              }
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

            const newChatObj: Partial<Chat> = {
              id: record.chat_id,
              type: 'private',
              name: senderNick,
              peerCode: record.sender_id,
              originalPeerCode: record.sender_id,
              avatarUrl: senderAvatar,
              bannerUrl: senderBanner,
              username: senderUsername,
              description: senderBio,
              birthday: senderBirthday,
              numericId: senderNumericId || getInitialNumericId(record.sender_id),
              lastMsg: '',
              online: false,
              unreadCount: 0,
              createdAt: new Date(record.created_at).getTime() || Date.now(),
              notificationsEnabled: true,
            };
            addChat(newChatObj);
            subscribeToChat(record.chat_id, record.chat_id);
            subscribeToDeliveryUpdates(record.chat_id);
            chat = useChatStore.getState().chats.find(c => c.id === record.chat_id) || (newChatObj as Chat);
          }

          const targetChatId = chat?.id || record.chat_id;
          let messageData: any = null;

          if (record.dh_public_key === 'PRE_HANDSHAKE' || (!record.dh_public_key && record.ciphertext?.startsWith('{'))) {
            try {
              messageData = JSON.parse(record.ciphertext);
            } catch {
              processedMessageIds.current.add(record.id);
              deliveredIds.push(record.id);
              continue;
            }
          } else {
            const activeRatchetState = ratchetStateUpdates.get(targetChatId) || chat?.ratchetState;
            if (!chat || !chat.sharedSecret || !activeRatchetState) {
              continue;
            }

            const ratchet = DoubleRatchet.fromState(activeRatchetState);
            const decrypted = await ratchet.decrypt(
              record.ciphertext,
              record.message_index,
              record.dh_public_key,
              record.prev_chain_count ?? undefined,
            );
            if (decrypted === null) {
              continue;
            }
            ratchetStateUpdates.set(targetChatId, ratchet.getState());

            try {
              messageData = JSON.parse(decrypted);
            } catch {
              processedMessageIds.current.add(record.id);
              deliveredIds.push(record.id);
              continue;
            }
          }

          if (messageData?.type === 'edit') {
            processedMessageIds.current.add(record.id);
            const targetId = messageData.targetMessageId || messageData.messageId;
            const newText = messageData.text || '';
            const currentMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
            const targetIndex = targetId
              ? currentMsgs.findIndex((m) => m.id === targetId)
              : (messageData.editIndex !== undefined ? messageData.editIndex : -1);
            if (targetIndex >= 0 && currentMsgs[targetIndex]) {
              const updatedMsgs = [...currentMsgs];
              const updatedMsg = {
                ...updatedMsgs[targetIndex],
                text: newText,
                isEdited: true,
                editedAt: messageData.editedAt || Date.now(),
              };
              updatedMsgs[targetIndex] = updatedMsg;
              useChatStore.setState((s) => ({
                messagesByChatId: {
                  ...s.messagesByChatId,
                  [targetChatId]: updatedMsgs,
                },
                chats: s.chats.map((c) => c.id === targetChatId ? { ...c, lastMsg: newText } : c),
              }));
              if (updatedMsg.id && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
                (window as any).orbita.storageAddMessage(targetChatId, updatedMsg.id, updatedMsg).catch(() => {});
              }
            }
            deliveredIds.push(record.id);
            continue;
          }

          if (messageData?.type === 'reaction') {
            processedMessageIds.current.add(record.id);
            const targetId = messageData.messageId || messageData.id;
            if (targetId && messageData.emoji) {
              useChatStore.getState().setReaction(
                targetChatId,
                targetId,
                messageData.emoji,
                messageData.senderId || messageData.sender || record.sender_id,
                messageData.action || 'add'
              );
            }
            deliveredIds.push(record.id);
            continue;
          }

          if (messageData?.type === 'pin' || messageData?.type === 'pin-message') {
            processedMessageIds.current.add(record.id);
            if (messageData.pinData) {
              updateChat(targetChatId, { pinnedMessage: messageData.pinData });
              const actor = messageData.sender || messageData.actorNickname || messageData.pinData?.pinnedBy || '';
              const isAlreadyAdded = (useChatStore.getState().messagesByChatId[targetChatId] || []).some(
                (m) => m.systemType === 'pin' && Math.abs((m.time || 0) - (messageData.pinData?.pinnedAt || Date.now())) < 5000
              );
              if (!isAlreadyAdded) {
                const sysMsg: Message = messageData.systemMessage || {
                  id: `sys_pin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  sender: 'system',
                  text: `${actor || 'Собеседник'} закрепил(а) сообщение`,
                  time: messageData.pinData?.pinnedAt || Date.now(),
                  status: 'sent',
                  mediaType: 'system',
                  systemType: 'pin',
                  actorNickname: actor,
                };
                addMessage(targetChatId, sysMsg);
                try {
                  (window as any).orbita?.storageAddMessage?.(targetChatId, sysMsg.id, sysMsg);
                } catch {}
              }
            }
            deliveredIds.push(record.id);
            continue;
          }

          if (messageData?.type === 'unpin' || messageData?.type === 'unpin-message') {
            processedMessageIds.current.add(record.id);
            updateChat(targetChatId, { pinnedMessage: null });
            deliveredIds.push(record.id);
            continue;
          }

          if (messageData?.type === 'delete-message' || messageData?.type === 'delete') {
            processedMessageIds.current.add(record.id);
            const targetId = messageData.targetMessageId || messageData.messageId;
            if (targetId) {
              deleteActions.push({ chatId: targetChatId, messageId: targetId });
            }
            deliveredIds.push(record.id);
            continue;
          }

          if (messageData?.type === 'receipt' || messageData?.type === 'read' || messageData?.receiptType === 'read') {
            processedMessageIds.current.add(record.id);
            const rawIds: unknown[] = messageData.messageIds || [messageData.messageId];
            const targetIds = new Set<string>(rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
            const existingUpdate = receiptUpdates.get(targetChatId);
            if (existingUpdate) {
              targetIds.forEach(id => existingUpdate.targetIds.add(id));
              if (messageData.time && (!existingUpdate.targetTime || messageData.time > existingUpdate.targetTime)) {
                existingUpdate.targetTime = messageData.time;
              }
            } else {
              receiptUpdates.set(targetChatId, {
                targetIds,
                targetTime: messageData.time,
                readAt: messageData.time || Date.now(),
              });
            }
            deliveredIds.push(record.id);
            continue;
          }

          const msgId = messageData?.id || record.id;
          const isActiveChat = useChatStore.getState().activeChatId === targetChatId && typeof document !== 'undefined' && document.visibilityState === 'visible';

          batchMessages.push({
            chatId: targetChatId,
            message: {
              id: msgId,
              senderId: record.sender_id,
              sender: messageData?.sender || chat.name || record.sender_id,
              isOutgoing: false,
              text: messageData.text || '',
              time: (typeof messageData?.time === 'number' && messageData.time > 0) ? messageData.time : new Date(record.created_at).getTime(),
              read: isActiveChat,
              mediaType: messageData.mediaType || null,
              mediaUrl: messageData.mediaUrl || null,
              mediaName: messageData.mediaName || null,
              mediaKey: messageData.mediaKey || null,
              mime: messageData.mime || null,
              mediaItems: messageData.mediaItems || undefined,
              width: messageData.width || undefined,
              height: messageData.height || undefined,
              blurPreview: messageData.blurPreview || undefined,
              thumbnail: messageData.thumbnail || undefined,
              audioMetadata: messageData.audioMetadata || undefined,
              fileSize: messageData.fileSize || messageData.size || undefined,
              duration: messageData.duration || undefined,
              waveform: messageData.waveform || undefined,
              linkPreview: messageData.linkPreview || undefined,
            },
          });

          if (isActiveChat) {
            readReceiptsToSend.push({ chatId: targetChatId, msgId });
          }

          processedMessageIds.current.add(record.id);
          deliveredIds.push(record.id);
        }

        for (const [chatId, rState] of ratchetStateUpdates.entries()) {
          updateChat(chatId, { ratchetState: rState });
        }

        for (const del of deleteActions) {
          useChatStore.getState().deleteMessage(del.chatId, del.messageId);
        }

        if (receiptUpdates.size > 0) {
          useChatStore.setState((s) => {
            const updatedMap = { ...s.messagesByChatId };
            for (const [tChatId, rInfo] of receiptUpdates.entries()) {
              const currentMsgs = updatedMap[tChatId] || [];
              updatedMap[tChatId] = currentMsgs.map((m) => {
                const isTarget = (m.id && rInfo.targetIds.has(m.id)) || (rInfo.targetTime && m.time <= rInfo.targetTime && m.isOutgoing);
                if (isTarget) {
                  return { ...m, read: true, status: 'read' as const, readAt: rInfo.readAt };
                }
                return m;
              });
            }
            return { messagesByChatId: updatedMap };
          });
        }

        if (batchMessages.length > 0) {
          batchMessages.sort((a, b) => {
            const tA = Number(a.message.time) || 0;
            const tB = Number(b.message.time) || 0;
            if (tA !== tB) return tA - tB;
            return (a.message.index ?? 0) - (b.message.index ?? 0);
          });
          addMessagesBatch(batchMessages);
        }

        for (const item of readReceiptsToSend) {
          sendEncryptedReadReceipt(item.chatId, [item.msgId], Date.now());
        }

        if (readReceiptsToSend.length > 0) {
          const byChat = new Map<string, string[]>();
          for (const item of readReceiptsToSend) {
            const list = byChat.get(item.chatId) || [];
            list.push(item.msgId);
            byChat.set(item.chatId, list);
          }
          for (const [cId, ids] of byChat.entries()) {
            supabaseService.purgeServerMessages(cId, ids);
          }
        }

        if (deliveredIds.length > 0) {
          Promise.allSettled(
            deliveredIds.map((id) => supabaseService.markMessageDelivered(id))
          ).catch(() => {});
        }
      };

      const allRecordsArrays = await Promise.all(
        keysToCheck.map((key) => supabaseService.getPendingMessages(key).catch(() => []))
      );
      const recordsMap = new Map<string, OfflineMessageRecord>();
      for (const recArr of allRecordsArrays) {
        for (const record of recArr) {
          if (!recordsMap.has(record.id)) {
            recordsMap.set(record.id, record);
          }
        }
      }
      const records = Array.from(recordsMap.values()).sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.message_index ?? 0) - (b.message_index ?? 0);
      });

      if (records.length > 0) {
        const activeId = useChatStore.getState().activeChatId;
        const visibleChats = useChatStore.getState().chats.slice(0, 10);
        const priorityChatIds = new Set([activeId, ...visibleChats.map((c) => c.id)].filter(Boolean) as string[]);

        const priorityBatch: OfflineMessageRecord[] = [];
        const remainingBatch: OfflineMessageRecord[] = [];

        for (const record of records) {
          if (priorityChatIds.has(record.chat_id)) {
            priorityBatch.push(record);
          } else {
            remainingBatch.push(record);
          }
        }

        await processBatch(priorityBatch);
        if (remainingBatch.length > 0) {
          await processBatch(remainingBatch);
        }
      }

      try {
        const allNonRecordsArrays = await Promise.all(
          keysToCheck.map((key) => supabaseService.getPendingNonMessages(key).catch(() => []))
        );
        const nonRecordsMap = new Map<string, OfflineMessageRecord>();
        for (const recArr of allNonRecordsArrays) {
          for (const record of recArr) {
            if (!nonRecordsMap.has(record.id)) {
              nonRecordsMap.set(record.id, record);
            }
          }
        }
        const nonRecords = Array.from(nonRecordsMap.values());
        const nonDeliveredIds: string[] = [];
        const nonBatchMessages: Array<{ chatId: string; message: any }> = [];

          for (const record of nonRecords) {
            if (processedMessageIds.current.has(record.id)) continue;
            processedMessageIds.current.add(record.id);

            let messageData;
            try {
              messageData = JSON.parse(record.ciphertext);
            } catch {
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'chat-deleted' || (messageData?.type === 'system' && messageData.action === 'delete-chat') || messageData?.action === 'delete-chat') {
              const targetChat = useChatStore.getState().chats.find(c => c.id === record.chat_id);
              const recordTime = new Date(record.created_at).getTime();
              if (targetChat && targetChat.createdAt && recordTime && recordTime < targetChat.createdAt) {
                nonDeliveredIds.push(record.id);
                continue;
              }
              if (activeSubscriptions.current.has(record.chat_id)) {
                const sub = activeSubscriptions.current.get(record.chat_id)!;
                sub.channel.unbind_all();
                getPusher().unsubscribe(`private-chat-${record.chat_id}`);
                activeSubscriptions.current.delete(record.chat_id);
              }
              if (ablyMessageUnsubscribes.current.has(record.chat_id)) {
                const unsub = ablyMessageUnsubscribes.current.get(record.chat_id)!;
                unsub();
                ablyMessageUnsubscribes.current.delete(record.chat_id);
              }
              useChatStore.getState().deleteChat(record.chat_id);
              if (useChatStore.getState().activeChatId === record.chat_id) {
                useChatStore.getState().setActiveChat(null);
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'system') {
              if (messageData.action === 'clear-history') {
                useChatStore.setState((state) => ({
                  messagesByChatId: {
                    ...state.messagesByChatId,
                    [record.chat_id]: [],
                  }
                }));
                updateChat(record.chat_id, {
                  lastMsg: t('common.history_cleared'),
                  unreadCount: 0,
                  lastReadTimestamp: Date.now()
                });
                nonDeliveredIds.push(record.id);
                continue;
              }
            }

            if (useChatStore.getState().deletedChatIds?.includes(record.chat_id)) {
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'group-added' && messageData?.group) {
              const g = messageData.group;
              if (g.id && g.code) {
                const existing = useChatStore.getState().chats.find((c) => c.id === g.id || c.inviteCode === g.code);
                if (!existing) {
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
                }
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            const currentChats = useChatStore.getState().chats;
            const chat = currentChats.find(c => c.id === record.chat_id);
            if (!chat) {
              continue;
            }

            if (messageData?.type === 'edit') {
              processedMessageIds.current.add(record.id);
              const targetId = messageData.targetMessageId || messageData.messageId;
              const newText = messageData.text || '';
              const currentMsgs = useChatStore.getState().messagesByChatId[record.chat_id] || [];
              const targetIndex = targetId
                ? currentMsgs.findIndex((m) => m.id === targetId)
                : (messageData.editIndex !== undefined ? messageData.editIndex : -1);
              if (targetIndex >= 0 && currentMsgs[targetIndex]) {
                const updatedMsgs = [...currentMsgs];
                const updatedMsg = {
                  ...updatedMsgs[targetIndex],
                  text: newText,
                  isEdited: true,
                  editedAt: messageData.editedAt || Date.now(),
                };
                updatedMsgs[targetIndex] = updatedMsg;
                useChatStore.setState((s) => ({
                  messagesByChatId: {
                    ...s.messagesByChatId,
                    [record.chat_id]: updatedMsgs,
                  },
                  chats: s.chats.map((c) => c.id === record.chat_id ? { ...c, lastMsg: newText } : c),
                }));
                if (updatedMsg.id && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
                  (window as any).orbita.storageAddMessage(record.chat_id, updatedMsg.id, updatedMsg).catch(() => {});
                }
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'reaction') {
              processedMessageIds.current.add(record.id);
              const targetId = messageData.messageId || messageData.id;
              if (targetId && messageData.emoji) {
                useChatStore.getState().setReaction(
                  record.chat_id,
                  targetId,
                  messageData.emoji,
                  messageData.senderId || messageData.sender || record.sender_id,
                  messageData.action || 'add'
                );
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'pin' || messageData?.type === 'pin-message') {
              processedMessageIds.current.add(record.id);
              if (messageData.pinData) {
                updateChat(record.chat_id, { pinnedMessage: messageData.pinData });
                const actor = messageData.sender || messageData.actorNickname || messageData.pinData?.pinnedBy || '';
                const isAlreadyAdded = (useChatStore.getState().messagesByChatId[record.chat_id] || []).some(
                  (m) => m.systemType === 'pin' && Math.abs((m.time || 0) - (messageData.pinData?.pinnedAt || Date.now())) < 5000
                );
                if (!isAlreadyAdded) {
                  const sysMsg: Message = messageData.systemMessage || {
                    id: `sys_pin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    sender: 'system',
                    text: `${actor || 'Участник'} закрепил(а) сообщение`,
                    time: messageData.pinData?.pinnedAt || Date.now(),
                    status: 'sent',
                    mediaType: 'system',
                    systemType: 'pin',
                    actorNickname: actor,
                  };
                  addMessage(record.chat_id, sysMsg);
                  try {
                    (window as any).orbita?.storageAddMessage?.(record.chat_id, sysMsg.id, sysMsg);
                  } catch {}
                }
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'unpin' || messageData?.type === 'unpin-message') {
              processedMessageIds.current.add(record.id);
              updateChat(record.chat_id, { pinnedMessage: null });
              nonDeliveredIds.push(record.id);
              continue;
            }

          if (messageData?.type === 'delete-message' || messageData?.type === 'delete') {
              const targetId = messageData.targetMessageId || messageData.messageId;
              if (targetId) {
                useChatStore.getState().deleteMessage(record.chat_id, targetId);
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            if (messageData?.type === 'profile-update') {
              const currentMyCode = useChatStore.getState().myCode;
              const myUserId = useAuthStore.getState().userId;
              const isMine =
                (myUserId && (messageData.userId === myUserId || messageData.senderUserId === myUserId || messageData.senderId === myUserId)) ||
                (currentMyCode && (messageData.senderCode === currentMyCode || messageData.senderId === currentMyCode));
              if (isMine) {
                nonDeliveredIds.push(record.id);
                continue;
              }
              const updates: Partial<Chat> = {};
              if (messageData.avatarUrl !== undefined) updates.avatarUrl = messageData.avatarUrl;
              if (messageData.bannerUrl !== undefined) updates.bannerUrl = messageData.bannerUrl;
              if (messageData.nickname !== undefined) updates.name = messageData.nickname;
              if (messageData.bio !== undefined) updates.description = messageData.bio;
              if (messageData.username !== undefined) updates.username = messageData.username;
              if (messageData.birthday !== undefined) updates.birthday = messageData.birthday;
              if (messageData.senderCode && (!currentMyCode || messageData.senderCode !== currentMyCode)) {
                updates.peerCode = messageData.senderCode;
                updates.originalPeerCode = messageData.senderCode;
              }
              if (Object.keys(updates).length > 0) {
                updateChat(record.chat_id, updates);
              }
              nonDeliveredIds.push(record.id);
              continue;
            }

            const msgId = messageData?.id || record.id;
            const isNonActiveChat = useChatStore.getState().activeChatId === record.chat_id && typeof document !== 'undefined' && document.visibilityState === 'visible';
            nonBatchMessages.push({
              chatId: record.chat_id,
              message: {
                id: msgId,
                senderId: record.sender_id,
                sender: messageData?.sender || chat.name || record.sender_id,
                isOutgoing: false,
                text: messageData.text || '',
                time: new Date(record.created_at).getTime(),
                read: isNonActiveChat,
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
              },
            });

            nonDeliveredIds.push(record.id);
          }

          if (nonBatchMessages.length > 0) {
            addMessagesBatch(nonBatchMessages);
            const activeId = useChatStore.getState().activeChatId;
            for (const item of nonBatchMessages) {
              if (item.chatId !== activeId || !isAppInFocusAndVisible()) {
                const targetChat = useChatStore.getState().chats.find((c) => c.id === item.chatId);
                const senderName = item.message.sender || targetChat?.name || 'Orbita';
                let bodyText = item.message.text || '';
                if (item.message.mediaType === 'voice' || /^\[Audio\]\s+voice_/i.test(bodyText) || /^voice_\d+/i.test(bodyText) || bodyText.includes('voice_')) {
                  bodyText = t('chatWindow.voice_message') || 'Голосовое сообщение';
                } else if (item.message.mediaType === 'sticker' || (/^\[Sticker\]/i.test(bodyText) || /(\.stickers|\/stickers|stickers\/|bisquit)/i.test(bodyText))) {
                  bodyText = t('chatWindow.sticker') || 'Стикер';
                } else if (item.message.mediaType === 'image' || item.message.mediaType === 'photo' || /^\[Photo\]/i.test(bodyText)) {
                  bodyText = t('chatWindow.photo') || 'Фотография';
                } else if (item.message.mediaType === 'video' || /^\[Video\]/i.test(bodyText)) {
                  bodyText = t('chatWindow.video') || 'Видео';
                } else if (item.message.mediaType === 'audio' || /^\[Audio\]/i.test(bodyText)) {
                  bodyText = item.message.mediaName || t('chatWindow.audio') || 'Аудиозапись';
                } else if (item.message.mediaType === 'file' || /^\[File\]/i.test(bodyText)) {
                  bodyText = item.message.mediaName || t('chatWindow.file') || 'Файл';
                } else if (!bodyText) {
                  bodyText = t('chatWindow.new_message') || 'Новое сообщение';
                }
                if (targetChat?.type === 'group') {
                  const groupTitle = targetChat.name || '';
                  const sender = (item.message.sender && item.message.sender !== 'system') ? item.message.sender : '';
                  const isSys = item.message.mediaType === 'system' || (item.message as any).systemType || (typeof bodyText === 'string' && sender && bodyText.startsWith(sender));
                  const finalBody = (sender && !isSys) ? `${sender}: ${bodyText}` : bodyText;
                  showNotification(groupTitle, finalBody, item.chatId, targetChat?.avatarUrl || null, true);
                } else {
                  showNotification(senderName, bodyText, item.chatId, targetChat?.avatarUrl || null);
                }
              }
            }
          }

          if (nonDeliveredIds.length > 0) {
            Promise.allSettled(
              nonDeliveredIds.map((id) => supabaseService.markNonMessageDelivered(id))
            ).catch(() => {});
          }
      } catch (err) {
        console.warn('[MainLayout] Failed to load non_messages:', err);
      }
    } catch (err) {
      console.error('[MainLayout] Failed to load pending messages:', err);
    } finally {
      isLoadingPendingRef.current = false;
    }
  }, [nickname, myCode, addMessage, addMessagesBatch, updateChat]);

  const checkedRecoveryChatsRef = useRef<Set<string>>(new Set());

  const recoverCorruptedFriendProfiles = useCallback(async () => {
    const currentChats = useChatStore.getState().chats;
    const privateChats = currentChats.filter((c) => c.type === 'private' && c.id !== 'notes');
    if (privateChats.length === 0) return;

    for (const chat of privateChats) {
      if (checkedRecoveryChatsRef.current.has(chat.id)) continue;
      const is36CharCode = Boolean(chat.name && chat.name.length === 36 && !chat.name.includes(' '));
      const isCorruptedName =
        Boolean(nickname && chat.name === nickname) ||
        chat.name === 'undefined' ||
        chat.name === 'null' ||
        is36CharCode;

      const isCorruptedAvatar = Boolean(
        chat.avatarUrl === 'undefined' ||
        chat.avatarUrl === 'null'
      );

      const isCorruptedPeerCode = Boolean(myCode && chat.peerCode === myCode);

      if (!isCorruptedName && !isCorruptedAvatar && !isCorruptedPeerCode) continue;

      let recoveredName: string | undefined;
      let recoveredAvatar: string | undefined = isCorruptedAvatar ? undefined : chat.avatarUrl;
      let recoveredPeerCode: string | undefined = (chat.peerCode && chat.peerCode !== 'undefined' && chat.peerCode !== 'null' && (!myCode || chat.peerCode !== myCode)) ? chat.peerCode : undefined;

      const msgs = useChatStore.getState().messagesByChatId[chat.id] || [];
      const myUserId = useAuthStore.getState().userId;
      for (const m of msgs) {
        if (
          !m.isOutgoing &&
          (!myUserId || m.senderId !== myUserId) &&
          (!myCode || m.senderId !== myCode) &&
          m.sender &&
          (!nickname || m.sender !== nickname) &&
          m.sender !== 'YOU' &&
          m.sender !== 'undefined' &&
          m.sender !== 'null' &&
          m.sender.length !== 36
        ) {
          recoveredName = m.sender.trim();
        }
        if (
          m.senderId &&
          myCode &&
          m.senderId !== myCode &&
          m.senderId !== 'undefined' &&
          m.senderId !== 'null' &&
          m.senderId.length >= 8
        ) {
          recoveredPeerCode = m.senderId.trim();
        }
        if (recoveredName && recoveredPeerCode) break;
      }

      try {
        const handshakes = await supabaseService.getHandshakeRecordsForChat(chat.id);
        for (const hs of handshakes) {
          if (hs.sender_code && myCode && hs.sender_code !== myCode && hs.sender_code !== 'undefined' && hs.sender_code !== 'null') {
            if (!recoveredName && hs.sender_nickname && hs.sender_nickname.length !== 36 && hs.sender_nickname !== 'undefined' && hs.sender_nickname !== 'null') {
              recoveredName = hs.sender_nickname.trim();
            }
            if (!recoveredAvatar && hs.sender_avatar_url && hs.sender_avatar_url !== 'undefined' && hs.sender_avatar_url !== 'null' && hs.sender_avatar_url.trim()) {
              recoveredAvatar = hs.sender_avatar_url.trim();
            }
            if (!recoveredPeerCode) {
              recoveredPeerCode = hs.sender_code.trim();
            }
            break;
          } else if (
            hs.sender_code && myCode && hs.sender_code !== myCode &&
            hs.sender_nickname &&
            (!nickname || hs.sender_nickname !== nickname) &&
            hs.sender_nickname !== 'undefined' &&
            hs.sender_nickname !== 'null' &&
            hs.sender_nickname.length !== 36
          ) {
            if (!recoveredName) recoveredName = hs.sender_nickname.trim();
            if (!recoveredAvatar && hs.sender_avatar_url && hs.sender_avatar_url !== 'undefined' && hs.sender_avatar_url !== 'null' && hs.sender_avatar_url.trim()) {
              recoveredAvatar = hs.sender_avatar_url.trim();
            }
          }
          if (
            hs.recipient_code &&
            myCode &&
            hs.recipient_code !== myCode &&
            !hs.recipient_code.startsWith('CONFIRM:') &&
            hs.recipient_code !== 'undefined' &&
            hs.recipient_code !== 'null'
          ) {
            if (!recoveredPeerCode) {
              recoveredPeerCode = hs.recipient_code.trim();
            }
          }
        }
      } catch (err) {
        console.warn('[Recovery] Failed to fetch handshake for chat', chat.id, err);
      }

      const updates: Partial<Chat> = {};
      const targetCode = (recoveredPeerCode || (!myCode || chat.peerCode !== myCode ? chat.peerCode : undefined))?.trim();
      if (targetCode && targetCode !== 'undefined' && targetCode !== 'null' && (!myCode || targetCode !== myCode)) {
        try {
          const profile = await supabaseService.lookupPublicProfile(targetCode);
          if (profile) {
            if (!recoveredName && profile.nickname && profile.nickname.length !== 36 && profile.nickname !== 'undefined' && profile.nickname !== 'null') {
              recoveredName = profile.nickname.trim();
            }
            if (profile.avatar_url && profile.avatar_url !== 'undefined' && profile.avatar_url !== 'null' && profile.avatar_url.trim()) {
              recoveredAvatar = profile.avatar_url.trim();
            }
            if (profile.banner_url && profile.banner_url !== 'undefined' && profile.banner_url !== 'null' && profile.banner_url.trim()) {
              updates.bannerUrl = profile.banner_url.trim();
            }
          }
        } catch {}
      }

      if (isCorruptedAvatar && (recoveredAvatar === 'undefined' || recoveredAvatar === 'null')) {
        recoveredAvatar = undefined;
      }

      const updatesFinal: Partial<Chat> = { ...updates };
      if (recoveredName && recoveredName !== chat.name && recoveredName !== 'undefined' && recoveredName !== 'null') {
        updatesFinal.name = recoveredName;
      }
      if (isCorruptedAvatar) {
        if (recoveredAvatar !== chat.avatarUrl) {
          updatesFinal.avatarUrl = recoveredAvatar;
        }
      } else if (recoveredAvatar && recoveredAvatar !== chat.avatarUrl && recoveredAvatar !== 'undefined' && recoveredAvatar !== 'null') {
        updatesFinal.avatarUrl = recoveredAvatar;
      }
      if (recoveredPeerCode && recoveredPeerCode !== chat.peerCode && recoveredPeerCode !== 'undefined' && recoveredPeerCode !== 'null') {
        updatesFinal.peerCode = recoveredPeerCode;
      } else if (chat.peerCode && myCode && chat.peerCode === myCode && !recoveredPeerCode) {
        updatesFinal.peerCode = undefined;
      }

      if (Object.keys(updatesFinal).length > 0) {
        console.log('[Recovery] Cleaned friend profile for chat', chat.id, updatesFinal);
        updateChat(chat.id, updatesFinal);
      }

      const finalName = updatesFinal.name || chat.name;
      const finalAvatar = updatesFinal.avatarUrl !== undefined ? updatesFinal.avatarUrl : chat.avatarUrl;
      const finalPeerCode = updatesFinal.peerCode !== undefined ? updatesFinal.peerCode : chat.peerCode;
      const stillCorrupted =
        Boolean(nickname && finalName === nickname) ||
        finalAvatar === 'undefined' ||
        finalAvatar === 'null' ||
        (myCode && finalPeerCode === myCode);
      if (!stillCorrupted) {
        checkedRecoveryChatsRef.current.add(chat.id);
      }
    }
  }, [nickname, myCode, updateChat]);

  const lastProfileCheckTimeRef = useRef<Map<string, number>>(new Map());
  const lastChannelCheckTimeRef = useRef<Map<string, number>>(new Map());

  const syncOfflineFriendProfiles = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const myCode = useChatStore.getState().myCode;
    const currentChats = useChatStore.getState().chats;
    const privateChats = currentChats.filter((c) => c.type === 'private' && c.id !== 'notes');
    const now = Date.now();
    const PROFILE_TTL = 900000;

    for (const chat of privateChats) {
      const lastCheck = lastProfileCheckTimeRef.current.get(chat.id) || 0;
      if (now - lastCheck < PROFILE_TTL) {
        continue;
      }
      lastProfileCheckTimeRef.current.set(chat.id, now);
      try {
        const update = await supabaseService.getLatestProfileUpdate(chat.id, myCode || undefined);
        const updates: Partial<Chat> = {};
        const myUserId = useAuthStore.getState().userId;
        const isMyOwnUpdate = update && (
          (myCode && update.sender_code === myCode) ||
          (myUserId && (update.user_id === myUserId || update.sender_id === myUserId))
        );
        const targetPeerCode = (chat.peerCode && chat.peerCode !== myCode)
          ? chat.peerCode
          : (chat.originalPeerCode && chat.originalPeerCode !== myCode)
            ? chat.originalPeerCode
            : (update?.sender_code && update.sender_code !== myCode)
              ? update.sender_code
              : (chat.name && chat.name.length === 36 && chat.name !== myCode)
                ? chat.name
                : undefined;

        if (update && !isMyOwnUpdate) {
          if (update.nickname && update.nickname !== chat.name) updates.name = update.nickname;
          if (update.avatar_url && update.avatar_url !== chat.avatarUrl) updates.avatarUrl = update.avatar_url;
          if (update.banner_url && update.banner_url !== chat.bannerUrl) updates.bannerUrl = update.banner_url;
          if (update.username && update.username !== chat.username) updates.username = update.username;
          if (update.birthday && update.birthday !== chat.birthday) updates.birthday = update.birthday;
          if (update.bio && update.bio !== chat.description) updates.description = update.bio;
          if (update.sender_code && update.sender_code !== myCode && !chat.peerCode) {
            updates.peerCode = update.sender_code;
          }
        }

        if (targetPeerCode) {
          const pub = await supabaseService.lookupPublicProfile(targetPeerCode);
          if (pub) {
            if (pub.nickname && pub.nickname !== chat.name && !updates.name) updates.name = pub.nickname;
            if (pub.avatar_url && pub.avatar_url !== chat.avatarUrl && !updates.avatarUrl) updates.avatarUrl = pub.avatar_url;
            if (pub.banner_url && pub.banner_url !== chat.bannerUrl && !updates.bannerUrl) updates.bannerUrl = pub.banner_url;
            if (pub.username && pub.username !== chat.username && !updates.username) updates.username = pub.username;
            if (pub.birthday && pub.birthday !== chat.birthday && !updates.birthday) updates.birthday = pub.birthday;
            if (pub.bio && pub.bio !== chat.description && !updates.description) updates.description = pub.bio;
          }
        }

        if (chat.username && !updates.bannerUrl) {
          const pubByUname = await supabaseService.lookupProfileByUsername(chat.username);
          if (pubByUname) {
            if (pubByUname.nickname && pubByUname.nickname !== chat.name && !updates.name) updates.name = pubByUname.nickname;
            if (pubByUname.avatar_url && pubByUname.avatar_url !== chat.avatarUrl && !updates.avatarUrl) updates.avatarUrl = pubByUname.avatar_url;
            if (pubByUname.banner_url && pubByUname.banner_url !== chat.bannerUrl && !updates.bannerUrl) updates.bannerUrl = pubByUname.banner_url;
            if (pubByUname.birthday && pubByUname.birthday !== chat.birthday && !updates.birthday) updates.birthday = pubByUname.birthday;
            if (pubByUname.bio && pubByUname.bio !== chat.description && !updates.description) updates.description = pubByUname.bio;
          }
        }
        if (Object.keys(updates).length > 0) {
          updateChat(chat.id, updates);
        }
      } catch {}
    }

    const currentChannels = useChatStore.getState().chats.filter((c) => c.type === 'channel');
    for (const ch of currentChannels) {
      const lastCheck = lastChannelCheckTimeRef.current.get(ch.id) || 0;
      if (now - lastCheck < PROFILE_TTL) {
        continue;
      }
      lastChannelCheckTimeRef.current.set(ch.id, now);
      channelService.getChannel(ch.id).then((info: any) => {
        if (info) {
          const current = useChatStore.getState().chats.find((c) => c.id === ch.id);
          if (current?.updatedAt && info.updatedAt && current.updatedAt > info.updatedAt) {
            return;
          }
          const currentUserId = useAuthStore.getState().userId;
          const isCreator = Boolean(
            current?.isOwner ||
            current?.role === 'owner' ||
            (currentUserId && (
              (info.creatorId && info.creatorId === currentUserId) ||
              (ch.creatorId && ch.creatorId === currentUserId) ||
              (current?.creatorId && current.creatorId === currentUserId) ||
              (current?.members?.some(m => m.userId === currentUserId && (m.role === 'owner' || m.role === 'admin')))
            ))
          );
          const updates: Partial<Chat> = {
            subscribersCount: info.subscribersCount,
            creatorId: info.creatorId || ch.creatorId,
            creatorNickname: info.creatorNickname || ch.creatorNickname,
          };
          if (isCreator) {
            updates.isOwner = true;
          }
          if (info.name) updates.name = info.name;
          if (info.description !== undefined) updates.description = info.description;
          updates.avatarUrl = info.avatarUrl || undefined;
          if (info.updatedAt) updates.updatedAt = info.updatedAt;
          useChatStore.getState().updateChat(ch.id, updates);
        }
      }).catch(() => {});
    }

    const currentGroups = useChatStore.getState().chats.filter((c) => c.type === 'group');
    for (const grp of currentGroups) {
      const lastCheck = lastProfileCheckTimeRef.current.get(grp.id) || 0;
      if (now - lastCheck < PROFILE_TTL) {
        continue;
      }
      lastProfileCheckTimeRef.current.set(grp.id, now);
      groupService.getGroup(grp.id).then((info) => {
        if (info && info.members && info.members.length > 0) {
          const myUid = useAuthStore.getState().userId;
          const myC = useChatStore.getState().myCode;
          const myNick = useAuthStore.getState().nickname;
          const isStillMember = info.members.some((m: any) => {
            const mCodes = [m.userId, m.userCode, m.user_id, m.user_code].filter(Boolean);
            if (myUid && mCodes.includes(myUid)) return true;
            if (myC && mCodes.includes(myC)) return true;
            if (myNick && m.nickname === myNick) return true;
            return false;
          });
          if (!isStillMember) {
            useChatStore.getState().deleteChat(grp.id);
            return;
          }
          useChatStore.getState().updateChat(grp.id, {
            name: info.name,
            description: info.description || '',
            avatarUrl: info.avatarUrl || undefined,
            members: info.members as any[],
            membersCount: (info.members && info.members.length > 0) ? info.members.length : (info.membersCount || 1),
            creatorNickname: info.creatorNickname,
          });
        }
      }).catch(() => {});
    }
  }, [updateChat]);

  const loadPendingHandshakesRef = useRef(loadPendingHandshakes);
  loadPendingHandshakesRef.current = loadPendingHandshakes;
  const loadPendingMessagesRef = useRef(loadPendingMessages);
  loadPendingMessagesRef.current = loadPendingMessages;
  const loadPendingGroupsRef = useRef(loadPendingGroups);
  loadPendingGroupsRef.current = loadPendingGroups;
  const recoverProfilesRef = useRef(recoverCorruptedFriendProfiles);
  recoverProfilesRef.current = recoverCorruptedFriendProfiles;
  const syncOfflineProfilesRef = useRef(syncOfflineFriendProfiles);
  syncOfflineProfilesRef.current = syncOfflineFriendProfiles;

  const lastSyncTimeRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    if (step !== 'main' || (!nickname && !myCode)) return;

    let isDestroyed = false;

    const syncAll = async (force = false) => {
      if (isDestroyed || isSyncingRef.current) return;
      const now = Date.now();
      const minInterval = force ? 2000 : 60000;
      if (now - lastSyncTimeRef.current < minInterval) return;
      lastSyncTimeRef.current = now;
      isSyncingRef.current = true;

      try {
        const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

        const fastestGateway = await gatewayManager.selectFastestGateway(false);
        const isGatewayHealthy = Boolean(fastestGateway && fastestGateway.status !== 'unhealthy');

        if (isGatewayHealthy) {
          setIsNetworkOnline(true);
        } else if (!navOnline) {
          setIsNetworkOnline(false);
          useConnectionStore.getState().setServerConnected(false);
          return;
        }

        const pusher = getPusher();
        const pusherConnected = pusher.connection.state === 'connected';
        if (pusher.connection.state === 'disconnected' || pusher.connection.state === 'unavailable' || pusher.connection.state === 'failed') {
          try {
            pusher.connect();
          } catch (e) {
            console.warn('[Reconnect] Pusher connect error:', e);
          }
        }

        const ablyState = ablyService.getConnectionState();
        if (ablyState === 'disconnected' || ablyState === 'suspended' || ablyState === 'failed') {
          ablyService.reconnect();
        } else if (ablyState === 'initialized' && (nickname || myCode)) {
          ablyService.connect(myCode || nickname || '').catch(() => {});
        }

        await loadPendingHandshakesRef.current();
        await Promise.allSettled([
          loadPendingMessagesRef.current(),
          loadPendingGroupsRef.current(),
          syncOfflineProfilesRef.current(),
        ]);

        const isConnected = isGatewayHealthy || pusherConnected;
        useConnectionStore.getState().setServerConnected(isConnected);
        if (isConnected) {
          setIsNetworkOnline(true);
        }
      } catch (err) {
        console.warn('[SyncManager] Sync cycle warning:', err);
        useConnectionStore.getState().setServerConnected(false);
      } finally {
        isSyncingRef.current = false;
      }
    };

    recoverProfilesRef.current().catch(() => {});
    syncAll(true);

    const handleOnline = () => {
      setIsNetworkOnline(true);
      useConnectionStore.getState().setServerConnected(true);
      ablyService.forceReconnect();
      reconnectPusher();
      syncAll(true);
    };

    const handleOffline = () => {
      setIsNetworkOnline(false);
      useConnectionStore.getState().setServerConnected(false);
    };

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastSyncTimeRef.current >= 30000) {
        syncAll(true);
      }
    };

    const handleSyncNow = () => {
      lastSyncTimeRef.current = 0;
      syncAll(true);
    };

    const unsubResume = window.orbita?.onSystemResume?.(() => {
      setIsNetworkOnline(true);
      useConnectionStore.getState().setServerConnected(true);
      ablyService.forceReconnect();
      reconnectPusher();
      syncAll(true);
    });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('orbita:sync-now', handleSyncNow);

    const interval = setInterval(() => syncAll(false), 60000);
    const checkTimer = setInterval(() => {
      const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!navOnline) {
        setIsNetworkOnline(false);
        useConnectionStore.getState().setServerConnected(false);
      } else {
        const ablyState = ablyService.getConnectionState();
        if (ablyState === 'disconnected' || ablyState === 'suspended' || ablyState === 'failed') {
          ablyService.reconnect();
        }
      }
    }, 10000);

    return () => {
      isDestroyed = true;
      unsubResume?.();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('orbita:sync-now', handleSyncNow);
      clearInterval(interval);
      clearInterval(checkTimer);
    };
  }, [step, nickname, myCode]);

  useEffect(() => {
    const unsubOutbox = networkManager.registerOutboxExecutor(async (item: OutboxItem) => {
      const chat = useChatStore.getState().chats.find((c) => c.id === item.chatId);
      if (!chat) return true;

      const myUserId = useAuthStore.getState().userId;
      const mySenderCode = myCode || '';

      if (item.chatType === 'group') {
        let groupSecret = chat.sharedSecret || deriveGroupKey(chat.id);
        if (!groupSecret) return false;
        const ciphertext = await encryptMessage(JSON.stringify({
          id: item.id,
          senderId: mySenderCode,
          sender: item.sender,
          text: item.text,
          time: item.time,
          mediaType: item.mediaPayload?.type || item.sanitizedMediaItems?.[0]?.type || null,
          mediaUrl: item.mediaPayload?.url || item.sanitizedMediaItems?.[0]?.url || null,
          mediaName: item.mediaPayload?.name || item.sanitizedMediaItems?.[0]?.name || null,
          mime: item.mediaPayload?.mime || item.sanitizedMediaItems?.[0]?.mime || null,
          mediaItems: item.sanitizedMediaItems,
          linkPreview: item.linkPreview,
        }), groupSecret);
        const res = await groupService.sendGroupMessage({
          id: item.id,
          groupId: item.chatId,
          senderCode: mySenderCode,
          senderId: myUserId || mySenderCode,
          senderNickname: item.sender,
          ciphertext,
          mediaType: item.mediaPayload?.type || item.sanitizedMediaItems?.[0]?.type || null,
          mediaUrl: item.mediaPayload?.url || item.sanitizedMediaItems?.[0]?.url || null,
          mediaName: item.mediaPayload?.name || item.sanitizedMediaItems?.[0]?.name || null,
          mime: item.mediaPayload?.mime || item.sanitizedMediaItems?.[0]?.mime || null,
        });
        if (res) {
          useChatStore.getState().updateMessageStatus(item.chatId, item.id, 'sent');
          return true;
        }
        return false;
      }

      const recipientTargets = item.recipientTargets && item.recipientTargets.length > 0
        ? item.recipientTargets
        : [chat.peerCode, chat.originalPeerCode, chat.numericId, chat.username].filter(Boolean) as string[];

      const plaintext = JSON.stringify({
        id: item.id,
        senderId: mySenderCode,
        sender: item.sender,
        text: item.text,
        time: item.time,
        mediaType: item.mediaPayload?.type || item.sanitizedMediaItems?.[0]?.type || null,
        mediaUrl: item.mediaPayload?.url || item.sanitizedMediaItems?.[0]?.url || null,
        mediaName: item.mediaPayload?.name || item.sanitizedMediaItems?.[0]?.name || null,
        mime: item.mediaPayload?.mime || item.sanitizedMediaItems?.[0]?.mime || null,
        mediaItems: item.sanitizedMediaItems,
        linkPreview: item.linkPreview,
      });

      if (!chat.ratchetState) {
        const results = await Promise.allSettled(
          recipientTargets.map((rId) =>
            supabaseService.sendOfflineMessage(
              item.chatId,
              myUserId || mySenderCode || item.sender,
              rId,
              plaintext,
              0,
              'PRE_HANDSHAKE',
              item.id
            )
          )
        );
        const success = results.some((r) => r.status === 'fulfilled');
        if (success) {
          useChatStore.getState().updateMessageStatus(item.chatId, item.id, 'sent');
          return true;
        }
        return false;
      }

      const ratchet = DoubleRatchet.fromState(chat.ratchetState);
      if (!ratchet.canSend()) return false;
      const { ciphertext, index, dhPublicKey, prevChainCount } = await ratchet.encrypt(plaintext);
      useChatStore.getState().updateChat(item.chatId, { ratchetState: ratchet.getState() });

      let ablyOk = false;
      try {
        await ablyService.sendMessage(item.chatId, {
          sender: item.sender,
          senderCode: mySenderCode,
          senderId: myUserId || mySenderCode,
          ciphertext,
          type: 'message',
          index,
          dhPublicKey,
          prevChainCount,
          messageId: item.id,
          chatId: item.chatId,
        });
        ablyOk = true;
      } catch {}

      const offlineResults = await Promise.allSettled(
        recipientTargets.map((rId) =>
          supabaseService.sendOfflineMessage(
            item.chatId,
            myUserId || mySenderCode || item.sender,
            rId,
            ciphertext,
            index,
            dhPublicKey,
            item.id,
            prevChainCount
          )
        )
      );
      const offlineOk = offlineResults.some((r) => r.status === 'fulfilled');

      if (ablyOk || offlineOk) {
        useChatStore.getState().updateMessageStatus(item.chatId, item.id, 'sent');
        return true;
      }
      return false;
    });

    return () => {
      unsubOutbox();
    };
  }, [myCode]);


};
