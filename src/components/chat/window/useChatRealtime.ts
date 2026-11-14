import { sqliteStorage } from '../../../services/sqliteStorage';
import { useEffect } from 'react';
import { useChatStore, type Message, isMessageOutgoing } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { groupService } from '../../../services/groupService';
import { lobbyService } from '../../../services/lobbyService';
import { ablyService } from '../../../services/ablyService';
import { supabaseService } from '../../../services/supabaseService';

import { getPusher, getGroupPusher, CLIENT_SESSION_ID } from '../../../utils/pusher';
import { isValidGroupCode, deriveGroupKey } from '../../../lib/groupCrypto';
import { deriveChannelKey, decryptMessage, ensureValidUuid } from '../../../lib/crypto';
import { saveChatScroll, restoreChatScroll, chatScrollRegistry, mergeReactions } from './chatWindowHelpers';

export interface UseChatRealtimeProps {
  activeChatId: string | null;
  activeChat: any;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  myCode: string;
  myNickname: string;
  myUserId?: string;
  notifyPeerReadBatch: (lastMsgId: string, lastTime: number, readIds?: string[]) => void;
  setMemberAvatars: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export const useChatRealtime = ({
  activeChatId,
  activeChat,
  messagesContainerRef,
  myCode,
  myNickname,
  myUserId,
  notifyPeerReadBatch,
  setMemberAvatars,
}: UseChatRealtimeProps) => {
  const activeChannelId = useChatStore((s) => s.activeChannelId);

  useEffect(() => {
    if (!activeChatId) return;

    if (activeChatId !== 'notes' && activeChat?.type !== 'channel') {
      useChatStore.getState().syncReactionsFromSupabase(activeChatId);
    }

    const targetChatId = activeChatId;
    try {
      (window as any).orbita?.storageGetMessages?.(targetChatId).then((cached: any[]) => {
        if (useChatStore.getState().activeChatId !== targetChatId) return;
        if (Array.isArray(cached) && cached.length > 0) {
          const sanitizedCached = cached.map((m) => {
            if (!m) return m;
            const validTime = (typeof m.time === 'number' && !isNaN(m.time) && m.time > 0) ? m.time : Date.now();
            let timeFixed = validTime !== m.time ? { ...m, time: validTime } : m;
            const hasMedia = Boolean(timeFixed.mediaType || (timeFixed.mediaItems && timeFixed.mediaItems.length > 0) || timeFixed.mediaUrl);
            if (hasMedia && !timeFixed.senderId) {
              const fallbackSender = timeFixed.isOutgoing
                ? ensureValidUuid(myUserId || useAuthStore.getState().userId, myCode)
                : ensureValidUuid(timeFixed.sender || activeChat?.peerCode);
              timeFixed = { ...timeFixed, senderId: fallbackSender };
            }
            if (hasMedia && timeFixed.mediaItems && Array.isArray(timeFixed.mediaItems)) {
              timeFixed = {
                ...timeFixed,
                mediaItems: timeFixed.mediaItems.map((it: any) => ({
                  ...it,
                  senderId: it.senderId ? ensureValidUuid(it.senderId, timeFixed.senderId) : timeFixed.senderId,
                })),
              };
            }
            if (timeFixed.uploading || timeFixed.status === 'sending' || timeFixed.status === 'pending') {
              const hasRemoteUrl = Boolean(timeFixed.mediaUrl && !timeFixed.mediaUrl.startsWith('blob:') && (timeFixed.mediaUrl.startsWith('http') || timeFixed.mediaUrl.startsWith('orbita-media:')));
              const hasRemoteItems = Boolean(timeFixed.mediaItems && timeFixed.mediaItems.length > 0 && timeFixed.mediaItems.every((it: any) => it.url && !it.url.startsWith('blob:') && (it.url.startsWith('http') || it.url.startsWith('orbita-media:'))));
              if (hasRemoteUrl || hasRemoteItems || !timeFixed.isOutgoing) {
                const fixed = { ...timeFixed, uploading: false, status: 'sent' as const };
                (window as any).orbita?.storageAddMessage?.(targetChatId, m.id, fixed).catch(() => {});
                return fixed;
              }
              const fixed = { ...timeFixed, uploading: false };
              (window as any).orbita?.storageAddMessage?.(targetChatId, m.id, fixed).catch(() => {});
              return fixed;
            }
            return timeFixed;
          });
          useChatStore.setState((state) => {
            if (useChatStore.getState().activeChatId !== targetChatId) return state;
            const nowMsgs = state.messagesByChatId[targetChatId] || [];
            if (nowMsgs.length === 0) {
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetChatId]: sanitizedCached,
                },
              };
            }
            const map = new Map<string, any>();
            sanitizedCached.forEach((m) => {
              if (m?.id) {
                const live = nowMsgs.find(n => n.id === m.id);
                map.set(m.id, live ? { ...m, reactions: mergeReactions(live.reactions, m.reactions) } : m);
              }
            });
            nowMsgs.forEach((m) => {
              if (m?.id) {
                const prev = map.get(m.id);
                map.set(m.id, prev ? { ...m, reactions: mergeReactions(m.reactions, prev.reactions) } : m);
              }
            });
            const merged = Array.from(map.values()).sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
            const hasDifference = merged.length !== nowMsgs.length || merged.some((m, idx) => {
              const cur = nowMsgs[idx];
              if (!cur || cur.id !== m.id) return true;
              if (JSON.stringify(cur.reactions) !== JSON.stringify(m.reactions)) return true;
              if (cur.status !== m.status || cur.text !== m.text) return true;
              return false;
            });
            if (hasDifference) {
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetChatId]: merged,
                },
              };
            }
            return state;
          });
        }
      });
    } catch {}

    if (activeChat?.type === 'group' && !activeChat.id?.startsWith('lobby_') && !(activeChat as any).isLobby) {
      const targetGroupId = activeChatId;
      const candidateSecrets = [
        activeChat.sharedSecret,
        activeChat.inviteCode && isValidGroupCode(activeChat.inviteCode) ? deriveGroupKey(activeChat.inviteCode) : undefined,
        activeChat.code && isValidGroupCode(activeChat.code) ? deriveGroupKey(activeChat.code) : undefined,
        deriveGroupKey(targetGroupId),
      ].filter(Boolean) as string[];

      groupService.fetchGroupMessages(targetGroupId).then(async (serverMsgs) => {
        if (useChatStore.getState().activeChatId !== targetGroupId) return;
        if (!Array.isArray(serverMsgs) || serverMsgs.length === 0) return;
        const current = useChatStore.getState().messagesByChatId[targetGroupId] || [];
        const existingIds = new Set(current.map((m) => m.id));
        const rowsToProcess = serverMsgs.filter((row) => !existingIds.has(row.id));
        if (rowsToProcess.length === 0) return;

        const newMessages = await Promise.all(
          rowsToProcess.map(async (row) => {
            const isSystem = row.media_type === 'system' || row.sender_nickname === 'system';
            let text = row.ciphertext || '';
            let parsedData: any = null;

            if (isSystem && text && text.startsWith('{')) {
              try {
                parsedData = JSON.parse(text);
                text = parsedData.text !== undefined ? parsedData.text : text;
              } catch {}
            }

            if (!parsedData && text) {
              for (const sec of candidateSecrets) {
                try {
                  const dec = await decryptMessage(text, sec);
                  if (dec && dec !== '[ENCRYPTED MESSAGE]') {
                    try {
                      parsedData = JSON.parse(dec);
                      text = parsedData.text !== undefined ? parsedData.text : dec;
                    } catch {
                      text = dec;
                    }
                    break;
                  }
                } catch {}
              }
            }

            if (isSystem && (!text || text === '[ENCRYPTED MESSAGE]' || text === row.ciphertext)) {
              const actor = parsedData?.actorNickname || (row as any).actor_nickname || (row as any).actorNickname || (row.sender_nickname && row.sender_nickname !== 'system' ? row.sender_nickname : '');
              if (parsedData?.systemType === 'pin') {
                text = actor ? `${actor} закрепил(а) сообщение` : 'Сообщение закреплено';
              } else if (parsedData?.systemType === 'join_link') {
                text = actor ? `${actor} вступил(а) в группу по ссылке-приглашению` : 'Участник вступил в группу по ссылке-приглашению';
              } else {
                text = actor ? `${actor} вступил(а) в группу` : 'Участник вступил(а) в группу';
              }
            }

            const isOutgoing = Boolean(
              (myUserId && (row.sender_id === myUserId || row.sender_code === myUserId)) ||
              (myCode && (row.sender_code === myCode || row.sender_id === myCode))
            );
            const msgSenderUuid = ensureValidUuid(
              isOutgoing ? (myUserId || row.sender_id) : (row.sender_id || parsedData?.senderUserId || parsedData?.senderId),
              isOutgoing ? myCode : (row.sender_code || row.sender_nickname)
            );

            const msgItem: Message = {
              id: row.id,
              senderId: msgSenderUuid,
              sender: row.sender_nickname,
              isOutgoing,
              text,
              time: new Date(row.created_at).getTime(),
              read: true,
              status: 'sent',
              mediaType: parsedData?.mediaType || row.media_type || undefined,
              mediaUrl: parsedData?.mediaUrl || row.media_url || undefined,
              mediaName: parsedData?.mediaName || row.media_name || undefined,
              mediaKey: parsedData?.mediaKey || row.media_key || undefined,
              mime: parsedData?.mime || row.mime || undefined,
              mediaItems: (parsedData?.mediaItems || (row as any).media_items)
                ? (parsedData?.mediaItems || (row as any).media_items).map((it: any, idx: number) => ({
                    ...it,
                    senderId: it.senderId ? ensureValidUuid(it.senderId, msgSenderUuid) : msgSenderUuid,
                    width: it.width || (idx === 0 ? (parsedData?.width || (row as any).width) : undefined),
                    height: it.height || (idx === 0 ? (parsedData?.height || (row as any).height) : undefined),
                  }))
                : undefined,
              width: parsedData?.width || (row as any).width || (parsedData?.mediaItems?.[0]?.width) || undefined,
              height: parsedData?.height || (row as any).height || (parsedData?.mediaItems?.[0]?.height) || undefined,
              duration: parsedData?.duration || row.duration || undefined,
              waveform: parsedData?.waveform || row.waveform || undefined,
              audioMetadata: parsedData?.audioMetadata || row.audio_metadata || undefined,
              linkPreview: parsedData?.linkPreview || row.link_preview || undefined,
              reactions: row.reactions || undefined,
              systemType: parsedData?.systemType || undefined,
              actorNickname: parsedData?.actorNickname || undefined,
              targetNickname: parsedData?.targetNickname || undefined,
            };
            return msgItem;
          })
        );

        newMessages.forEach((msgItem: any) => {
          try {
            (window as any).orbita?.storageAddMessage?.(targetGroupId, msgItem.id, msgItem);
          } catch {}
        });
        if (newMessages.length > 0) {
          if (useChatStore.getState().activeChatId !== targetGroupId) return;
          const el = messagesContainerRef.current;
          const wasAtBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight <= 120) : true;
          const prevScrollTop = el?.scrollTop ?? 0;
          const prevScrollHeight = el?.scrollHeight ?? 0;

          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetGroupId]: [...(state.messagesByChatId[targetGroupId] || []), ...newMessages].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)),
            },
          }));

          requestAnimationFrame(() => {
            const currentEl = messagesContainerRef.current;
            if (!currentEl) return;
            const entry = chatScrollRegistry.get(targetGroupId);
            if (entry && !entry.atBottom) {
              restoreChatScroll(targetGroupId, currentEl);
            } else if (wasAtBottom) {
              currentEl.scrollTop = currentEl.scrollHeight;
              saveChatScroll(targetGroupId, currentEl);
            } else {
              const delta = currentEl.scrollHeight - prevScrollHeight;
              currentEl.scrollTop = prevScrollTop + delta;
              saveChatScroll(targetGroupId, currentEl);
            }
          });
        }
      }).catch(() => {});

      groupService.getActiveCall(targetGroupId).then((call) => {
        if (call && call.status === 'active' && call.roomName) {
          useChatStore.getState().updateChat(targetGroupId, { activeCallRoom: call.roomName });
        }
      }).catch(() => {});
    }

    let unsubLobbyRealtime: (() => void) | null = null;
    if (activeChat?.id?.startsWith('lobby_')) {
      const targetLobbyId = activeChatId;
      const targetKey = activeChannelId ? `${targetLobbyId}:${activeChannelId}` : targetLobbyId;

      const resolveSecretAndLoad = async () => {
        let secret = activeChat?.sharedSecret;
        if (!secret) {
          try {
            const l = await lobbyService.getLobbyById(targetLobbyId);
            if (l?.sharedSecret) {
              secret = l.sharedSecret;
              useChatStore.getState().updateChat(targetLobbyId, { sharedSecret: l.sharedSecret });
            }
          } catch {}
        }
        if (!secret) {
          secret = deriveGroupKey(targetLobbyId);
        }

        try {
          const lobbyMsgs = await lobbyService.getLobbyMessages(targetLobbyId, secret, 50, activeChannelId);
          if (useChatStore.getState().activeChatId !== targetLobbyId) return;
          if (Array.isArray(lobbyMsgs) && lobbyMsgs.length > 0) {
            const current = useChatStore.getState().messagesByChatId[targetKey] || [];
            const existingIds = new Set(current.map((m) => m.id));
            const newOnes: Message[] = lobbyMsgs
              .filter((lm) => !existingIds.has(lm.id))
              .map((lm) => ({
                id: lm.id,
                chatId: targetKey,
                sender: lm.senderNickname,
                senderCode: lm.senderCode,
                senderId: lm.senderId || lm.senderCode,
                avatarUrl: lm.senderAvatarUrl || undefined,
                senderAvatar: lm.senderAvatarUrl || undefined,
                text: lm.text,
                time: lm.createdAt,
                isOutgoing: lm.senderCode === myCode,
                status: 'delivered' as const,
                mediaType: lm.mediaType as any,
                mediaUrl: lm.mediaUrl || undefined,
                mediaName: lm.mediaName || undefined,
                fileSize: lm.mediaSize || undefined,
                mediaKey: lm.mediaKey || undefined,
              }));
            if (newOnes.length > 0) {
              useChatStore.setState((state) => ({
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetKey]: [...(state.messagesByChatId[targetKey] || []), ...newOnes].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)),
                  ...(targetKey !== targetLobbyId ? {
                    [targetLobbyId]: [...(state.messagesByChatId[targetLobbyId] || []), ...newOnes].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)),
                  } : {}),
                },
              }));
            }
          }
        } catch {}

        unsubLobbyRealtime = lobbyService.subscribeToLobby(
          targetLobbyId,
          (msg) => {
            if (msg.senderCode === myCode) return;
            const msgTargetKey = msg.channelId ? `${targetLobbyId}:${msg.channelId}` : targetLobbyId;
            const newMsg: Message = {
              id: msg.id,
              chatId: msgTargetKey,
              sender: msg.senderNickname,
              senderCode: msg.senderCode,
              senderId: msg.senderId || msg.senderCode,
              avatarUrl: msg.senderAvatarUrl || undefined,
              senderAvatar: msg.senderAvatarUrl || undefined,
              text: msg.text,
              time: msg.createdAt,
              isOutgoing: false,
              status: 'delivered',
              mediaType: msg.mediaType as any,
              mediaUrl: msg.mediaUrl || undefined,
              mediaName: msg.mediaName || undefined,
              fileSize: msg.mediaSize || undefined,
              mediaKey: msg.mediaKey || undefined,
            };
            useChatStore.getState().addMessage(msgTargetKey, newMsg);
            if (msgTargetKey !== targetLobbyId) {
              useChatStore.getState().addMessage(targetLobbyId, { ...newMsg, chatId: targetLobbyId });
            }
            try {
              (window as any).orbita?.storageAddMessage?.(targetLobbyId, msg.id, newMsg);
            } catch {}
          },
          undefined,
          secret,
          (deletedMsgId) => {
            useChatStore.setState((state) => {
              const currentChannelMsgs = state.messagesByChatId[targetKey] || [];
              const updatedChannelMsgs = currentChannelMsgs.filter((m) => m.id !== deletedMsgId);
              const currentLobbyMsgs = state.messagesByChatId[targetLobbyId] || [];
              const updatedLobbyMsgs = currentLobbyMsgs.filter((m) => m.id !== deletedMsgId);
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetKey]: updatedChannelMsgs,
                  ...(targetKey !== targetLobbyId ? { [targetLobbyId]: updatedLobbyMsgs } : {}),
                },
              };
            });
            try {
              (window as any).orbita?.storageDeleteMessage?.(deletedMsgId);
            } catch {}
          }
        );
      };

      resolveSecretAndLoad();
    }

    const ablyTopic = activeChat?.type === 'channel' ? `public-channel-${activeChatId}` : activeChatId;
    const unsubAbly = ablyService.subscribeToChatMessages(ablyTopic, async (data: any) => {
      if (data?.type === 'channel-post' && data?.post) {
        const post = data.post;
        if (post && post.id) {
          if (activeChat?.type !== 'channel') return;
          if (post.channelId && post.channelId !== activeChatId) return;
          if (useChatStore.getState().activeChatId !== activeChatId) return;
          let postText = post.text || '';
          if (postText.startsWith('orb_e2e:')) {
            const channelKey = deriveChannelKey(activeChatId);
            const decrypted = await decryptMessage(postText.slice(8), channelKey);
            if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
              postText = decrypted;
            }
          }
          if (useChatStore.getState().activeChatId !== activeChatId) return;
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          const existing = currentMsgs.find((m) => m.id === post.id);
          if (existing) {
            if (existing.text !== postText && !postText.startsWith('orb_e2e:')) {
              useChatStore.setState((state) => ({
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: (state.messagesByChatId[activeChatId] || []).map((m) =>
                    m.id === post.id ? { ...m, text: postText } : m
                  ),
                },
              }));
            }
          }
        }
      } else if (data?.type === 'subscribers-updated' && typeof data?.subscribersCount === 'number') {
        useChatStore.getState().updateChat(activeChatId, {
          subscribersCount: data.subscribersCount,
        });
      } else if (data?.type === 'reaction-updated' && data?.postId && data?.reactions) {
        if (data.sessionId && data.sessionId === CLIENT_SESSION_ID) return;
        const currentMyUserId = useAuthStore.getState().userId;
        const currentMyCode = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (currentMyUserId && (data.userId === currentMyUserId || data.senderUserId === currentMyUserId || data.senderId === currentMyUserId)) ||
          (currentMyCode && (data.senderCode === currentMyCode || data.senderId === currentMyCode || data.userId === currentMyCode)) ||
          data.userId === 'YOU'
        );
        if (isSelf) return;

        const aliases = new Set([currentMyUserId, currentMyCode, 'YOU'].filter(Boolean).map((s) => s!.toLowerCase()));

        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) => {
                if (m.id !== data.postId) return m;
                const merged: Record<string, string[]> = {};
                const allEmojis = new Set([...Object.keys(m.reactions || {}), ...Object.keys(data.reactions || {})]);
                for (const em of allEmojis) {
                  const serverUsers = (data.reactions[em] || []).filter((u: string) => !aliases.has(u.toLowerCase()));
                  const hadSelf = (m.reactions?.[em] || []).some((u: string) => aliases.has(u.toLowerCase()));
                  const finalUsers = hadSelf ? [...serverUsers, 'YOU'] : serverUsers;
                  if (finalUsers.length > 0) {
                    merged[em] = finalUsers;
                  }
                }
                return {
                  ...m,
                  reactions: Object.keys(merged).length > 0 ? merged : undefined,
                };
              }),
            },
          };
        });
        sqliteStorage.get(`orbita_channel_posts_${activeChatId}`).then((cachedStr) => {
          if (!cachedStr) return;
          try {
            const cached = JSON.parse(cachedStr);
            if (Array.isArray(cached)) {
              const updatedCached = cached.map((p: any) => p.id === data.postId ? { ...p, reactions: data.reactions } : p);
              sqliteStorage.set(`orbita_channel_posts_${activeChatId}`, JSON.stringify(updatedCached)).catch(() => {});
            }
          } catch {}
        }).catch(() => {});
      } else if (data?.type === 'reaction' && data?.emoji && data?.sender) {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode))
        );
        if (isSelf) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
      } else if (data?.type === 'delete' || data?.type === 'delete-message' || data?.type === 'delete-messages') {
        const targetIds = data.targetMessageIds || (data.targetMessageId ? [data.targetMessageId] : (data.messageId ? [data.messageId] : []));
        if (targetIds && targetIds.length > 0) {
          if (targetIds.length === 1) {
            useChatStore.getState().deleteMessage(activeChatId, targetIds[0]);
          } else {
            useChatStore.getState().deleteMessages(activeChatId, targetIds);
          }
        } else if (data.deleteIndex !== undefined) {
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          const updated = currentMsgs.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: updated,
            },
          }));
        }
      } else if (data?.type === 'read') {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode))
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
        const readIds: string[] = [];
        const readMediaUrls: string[] = [];
        const readMsgObjects: Message[] = [];
        const updated = currentMsgs.map((msg) => {
          const isOut = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
          if (!isOut) return msg;
          if ((data.messageId && msg.id === data.messageId) || (data.readIds && data.readIds.includes(msg.id)) || (data.time && msg.time <= data.time)) {
            const readMsg = { ...msg, read: true, status: 'read' as const };
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
            [activeChatId]: updated,
          },
        }));
        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(activeChatId, readIds);
        }
        if (readMediaUrls.length > 0) {

        }
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const rm of readMsgObjects) {
            if (rm.id) {
              (window as any).orbita.storageAddMessage(activeChatId, rm.id, rm).catch(() => {});
            }
          }
        }
      } else if (
        data?.type === 'message' ||
        data?.type === 'group-message' ||
        data?.type === 'group-call-started' ||
        data?.type === 'group-call-active' ||
        data?.type === 'group-call-ended' ||
        data?.type === 'client-group-call-started' ||
        data?.type === 'client-group-call-ended' ||
        data?.type === 'client-message'
      ) {
        handleClientMessage(data);
      }
    });

    const pusher = activeChat?.type === 'group' ? getGroupPusher() : getPusher();
    const channelName = activeChat?.type === 'channel'
      ? `public-channel-${activeChatId}`
      : activeChat?.type === 'group'
      ? `presence-group-${activeChatId}`
      : `private-chat-${activeChatId}`;
    const channel = pusher.subscribe(channelName);

    const handleReaction = (data: { chatId?: string; messageIndex?: number; messageId?: string; id?: string; emoji?: string; sender?: string; action?: 'add' | 'remove' | 'toggle'; type?: string; senderUserId?: string; senderId?: string; senderCode?: string; userId?: string }) => {
      const isSelf = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode))
      );
      if (isSelf) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    function handleClientMessage(data: any) {
      if (!activeChatId) return;
      if (data?.type === 'group-call-ended' || data?.type === 'client-group-call-ended') {
        useChatStore.getState().updateChat(activeChatId, { activeCallRoom: null });
        return;
      }
      if (
        data?.type === 'group-call-started' ||
        data?.type === 'client-group-call-started' ||
        data?.type === 'group-call-active' ||
        data?.type === 'client-group-call-active'
      ) {
        useChatStore.getState().updateChat(activeChatId, { activeCallRoom: data.roomName || `group-call-${activeChatId}` });
        return;
      }
      if (activeChat?.type === 'group' && (data.type === 'message' || data.type === 'group-message')) {
        if (data.chatId && data.chatId !== activeChatId) return;
        if (data.groupId && data.groupId !== activeChatId) return;
        if (useChatStore.getState().activeChatId !== activeChatId) return;
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode))
        );
        if (isSelf) return;
        const rawCipher = data.ciphertext || data.text;
        if (!rawCipher) return;
        const isSystem = data.mediaType === 'system' || data.systemType || data.sender === 'system' || data.senderNickname === 'system';
        const candidateKeys = [
          activeChat.sharedSecret,
          activeChat.inviteCode && isValidGroupCode(activeChat.inviteCode) ? deriveGroupKey(activeChat.inviteCode) : undefined,
          activeChat.code && isValidGroupCode(activeChat.code) ? deriveGroupKey(activeChat.code) : undefined,
          deriveGroupKey(activeChatId),
        ].filter(Boolean) as string[];

        (async () => {
          let parsed: any = null;
          let dec: string | null = null;

          if (isSystem && data.text) {
            dec = data.text;
            parsed = { text: data.text };
          } else if (rawCipher && rawCipher.startsWith('{')) {
            try {
              parsed = JSON.parse(rawCipher);
              dec = parsed.text !== undefined ? parsed.text : rawCipher;
            } catch {}
          }

          if (!parsed && rawCipher) {
            for (const key of candidateKeys) {
              try {
                const res = await decryptMessage(rawCipher, key);
                if (res && res !== '[ENCRYPTED MESSAGE]') {
                  dec = res;
                  try { parsed = JSON.parse(res); } catch { parsed = { text: res }; }
                  if (activeChat.sharedSecret !== key) {
                    useChatStore.getState().updateChat(activeChatId, { sharedSecret: key });
                  }
                  break;
                }
              } catch {}
            }
          }

          if (isSystem && (!dec || dec === '[ENCRYPTED MESSAGE]')) {
            dec = data.text || 'Системное сообщение';
            parsed = { text: dec };
          }

          if (!parsed) {
            parsed = { text: dec || rawCipher };
          }

          if (useChatStore.getState().activeChatId !== activeChatId) return;
          const mid = parsed?.id || data.messageId || data.id || `msg_${Date.now()}`;
          const existing = (useChatStore.getState().messagesByChatId[activeChatId] || []).some(m => m.id === mid);
          if (existing) return;
          const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
          const groupIncomingSenderId = ensureValidUuid(
            data.senderUserId || data.senderId || parsed?.senderUserId || parsed?.senderId,
            data.senderCode || data.sender || data.senderNickname
          );
          const item: Message = {
            id: mid,
            sender: data.sender || data.senderNickname,
            senderId: groupIncomingSenderId,
            text: parsed?.text !== undefined ? parsed.text : (dec || rawCipher),
              time: data.time || Date.now(),
              read: isVisible,
              status: isVisible ? 'read' : 'delivered',
              isOutgoing: false,
              mediaType: parsed?.mediaType || data.mediaType || undefined,
              mediaUrl: parsed?.mediaUrl || data.mediaUrl || undefined,
              mediaName: parsed?.mediaName || data.mediaName || undefined,
              mediaKey: parsed?.mediaKey || data.mediaKey || undefined,
              mime: parsed?.mime || data.mime || undefined,
              mediaItems: (parsed?.mediaItems || data.mediaItems)
                ? (parsed?.mediaItems || data.mediaItems).map((it: any, idx: number) => ({
                    ...it,
                    senderId: it.senderId ? ensureValidUuid(it.senderId, groupIncomingSenderId) : groupIncomingSenderId,
                    width: it.width || (idx === 0 ? (parsed?.width || data.width) : undefined),
                    height: it.height || (idx === 0 ? (parsed?.height || data.height) : undefined),
                  }))
                : undefined,
              width: parsed?.width || data.width || (parsed?.mediaItems?.[0]?.width) || (data.mediaItems?.[0]?.width) || undefined,
              height: parsed?.height || data.height || (parsed?.mediaItems?.[0]?.height) || (data.mediaItems?.[0]?.height) || undefined,
              duration: parsed?.duration || data.duration || undefined,
              waveform: parsed?.waveform || data.waveform || undefined,
              audioMetadata: parsed?.audioMetadata || data.audioMetadata || undefined,
              linkPreview: parsed?.linkPreview || data.linkPreview || undefined,
              systemType: parsed?.systemType || data.systemType || undefined,
              actorNickname: parsed?.actorNickname || data.actorNickname || undefined,
              targetNickname: parsed?.targetNickname || data.targetNickname || undefined,
            };
            const targetChatId = data.chatId || data.groupId || activeChatId;
            if (item.systemType === 'call' || item.systemType === 'call_ended') {
              if (item.systemType === 'call_ended') {
                useChatStore.getState().updateChat(targetChatId, { activeCallRoom: null });
              }
              return;
            }
            useChatStore.getState().addMessage(targetChatId, item);
            try {
              (window as any).orbita?.storageAddMessage?.(targetChatId, mid, item);
            } catch {}
            if (isVisible) {
              notifyPeerReadBatch(mid, data.time || Date.now(), [mid]);
            }
          })();
          return;
        }

        if (data.type === 'read') {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode))
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
        const readIds: string[] = [];
        const readMediaUrls: string[] = [];
        const readMsgObjects: Message[] = [];
        const updated = currentMsgs.map((msg) => {
          const isOut = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
          if (!isOut) return msg;
          if ((data.messageId && msg.id === data.messageId) || (data.readIds && data.readIds.includes(msg.id)) || (data.time && msg.time <= data.time)) {
            const readMsg = { ...msg, read: true, status: 'read' as const };
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
            [activeChatId]: updated,
          },
        }));
        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(activeChatId, readIds);
        }
        if (readMediaUrls.length > 0) {

        }
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const rm of readMsgObjects) {
            if (rm.id) {
              (window as any).orbita.storageAddMessage(activeChatId, rm.id, rm).catch(() => {});
            }
          }
        }
        return;
      }

      if (data.type === 'delivered') {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode))
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
        const updated = currentMsgs.map((msg) =>
          (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && (msg.isOutgoing || isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId)))
            ? (msg.status === 'read' || msg.read ? msg : { ...msg, status: 'delivered' as const })
            : msg
        );
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        }));
        return;
      }

      if (data.type === 'reaction' && data.emoji && data.sender) {
        if (data.sessionId === CLIENT_SESSION_ID) return;
        const currentMyUserId = useAuthStore.getState().userId;
        const currentMyCode = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (currentMyUserId && (data.senderUserId === currentMyUserId || data.userId === currentMyUserId || data.senderId === currentMyUserId)) ||
          (currentMyCode && (data.senderCode === currentMyCode || data.senderId === currentMyCode)) ||
          data.sender === 'YOU'
        );
        if (isSelf) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
      } else if (data.type === 'delete' || data.type === 'delete-message' || data.type === 'delete-messages') {
        const targetIds = data.targetMessageIds || (data.targetMessageId ? [data.targetMessageId] : (data.messageId ? [data.messageId] : []));
        if (targetIds && targetIds.length > 0) {
          if (targetIds.length === 1) {
            useChatStore.getState().deleteMessage(activeChatId, targetIds[0]);
          } else {
            useChatStore.getState().deleteMessages(activeChatId, targetIds);
          }
        } else if (data.deleteIndex !== undefined) {
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          const updated = currentMsgs.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: updated,
            },
          }));
        }
      } else if (data.type === 'member-profile-updated' || data.type === 'profile-update') {
        const targetCode = data.userId || data.senderUserId || data.userCode || data.senderCode;
        const newAvatar = data.avatarUrl;
        if (newAvatar && targetCode) {
          setMemberAvatars((prev) => ({
            ...prev,
            [targetCode]: newAvatar,
          }));
        }
      }
    };

    const handleChannelPost = async (post: any) => {
      if (!post || !post.id) return;
      if (activeChat?.type !== 'channel') return;
      if (post.channelId && post.channelId !== activeChatId) return;
      if (useChatStore.getState().activeChatId !== activeChatId) return;
      let postText = post.text || '';
      if (postText.startsWith('orb_e2e:')) {
        const channelKey = deriveChannelKey(activeChatId);
        const decrypted = await decryptMessage(postText.slice(8), channelKey);
        if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
          postText = decrypted;
        }
      }
      if (useChatStore.getState().activeChatId !== activeChatId) return;
      const validPostTime = (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now();
      const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
      const existingById = currentMsgs.find((m) => m.id === post.id);
      if (existingById) {
        if (existingById.text !== postText && !postText.startsWith('orb_e2e:')) {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: (state.messagesByChatId[activeChatId] || []).map((m) =>
                m.id === post.id ? { ...m, text: postText } : m
              ),
            },
          }));
        }
        return;
      }
      const optimisticMatch = currentMsgs.find((m) =>
        m.isOutgoing &&
        m.status === 'sending' &&
        ((post.text && m.text === postText) || (post.mediaUrl && m.mediaUrl === post.mediaUrl) || (post.mediaName && m.mediaName === post.mediaName)) &&
        Math.abs((m.time || 0) - validPostTime) < 120000
      );
      if (optimisticMatch) {
        try {
          (window as any).orbita?.storageDeleteMessage?.(optimisticMatch.id).catch(() => {});
        } catch {}
        useChatStore.setState((state) => {
          const list = state.messagesByChatId[activeChatId] || [];
          const updated = list.map((m) =>
            m.id === optimisticMatch.id
              ? {
                  ...m,
                  id: post.id,
                  time: validPostTime,
                  text: postText,
                  status: 'read' as const,
                  senderId: m.senderId || ensureValidUuid(post.senderId || myUserId, myCode),
                  mediaItems: m.mediaItems ? m.mediaItems.map((it) => ({ ...it, senderId: it.senderId || m.senderId || ensureValidUuid(post.senderId || myUserId, myCode) })) : undefined,
                }
              : m
          );
          const saved = updated.find((m) => m.id === post.id);
          if (saved) {
            try {
              (window as any).orbita?.storageAddMessage?.(activeChatId, post.id, saved).catch(() => {});
            } catch {}
          }
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: updated,
            },
          };
        });
        return;
      }
    };

    const handleChannelReaction = (data: any) => {
      if (data?.postId && data?.reactions) {
        if (data.sessionId && data.sessionId === CLIENT_SESSION_ID) return;
        const currentMyUserId = useAuthStore.getState().userId;
        const currentMyNickname = useAuthStore.getState().nickname;
        const currentMyCode = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (currentMyUserId && (data.userId === currentMyUserId || data.senderUserId === currentMyUserId || data.senderId === currentMyUserId)) ||
          (currentMyCode && (data.senderCode === currentMyCode || data.senderId === currentMyCode || data.userId === currentMyCode)) ||
          (currentMyNickname && (data.userId === currentMyNickname || data.sender === currentMyNickname)) ||
          data.userId === 'YOU'
        );
        if (isSelf) return;

        const aliases = new Set([currentMyUserId, currentMyCode, currentMyNickname, 'YOU'].filter(Boolean).map((s) => s!.toLowerCase()));

        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) => {
                if (m.id !== data.postId) return m;
                const merged: Record<string, string[]> = {};
                const allEmojis = new Set([...Object.keys(m.reactions || {}), ...Object.keys(data.reactions || {})]);
                for (const em of allEmojis) {
                  const serverUsers = (data.reactions[em] || []).filter((u: string) => !aliases.has(u.toLowerCase()));
                  const hadSelf = (m.reactions?.[em] || []).some((u: string) => aliases.has(u.toLowerCase()));
                  const finalUsers = hadSelf ? [...serverUsers, 'YOU'] : serverUsers;
                  if (finalUsers.length > 0) {
                    merged[em] = finalUsers;
                  }
                }
                return {
                  ...m,
                  reactions: Object.keys(merged).length > 0 ? merged : undefined,
                };
              }),
            },
          };
        });
        sqliteStorage.get(`orbita_channel_posts_${activeChatId}`).then((cachedStr) => {
          if (!cachedStr) return;
          try {
            const cached = JSON.parse(cachedStr);
            if (Array.isArray(cached)) {
              const updatedCached = cached.map((p: any) => p.id === data.postId ? { ...p, reactions: data.reactions } : p);
              sqliteStorage.set(`orbita_channel_posts_${activeChatId}`, JSON.stringify(updatedCached)).catch(() => {});
            }
          } catch {}
        }).catch(() => {});
      }
    };

    const handleSubscribersUpdated = (data: any) => {
      if (typeof data?.subscribersCount === 'number') {
        useChatStore.getState().updateChat(activeChatId, {
          subscribersCount: data.subscribersCount,
        });
      }
    };

    const handlePresenceSub = (members: any) => {
      const ids: string[] = [];
      if (members) {
        if (typeof members.each === 'function') {
          members.each((m: any) => {
            if (m.id) ids.push(String(m.id));
            if (m.info?.userId) ids.push(String(m.info.userId));
            if (m.info?.nickname) ids.push(String(m.info.nickname));
          });
        } else if (members.members && typeof members.members === 'object') {
          Object.entries(members.members).forEach(([k, v]: [string, any]) => {
            ids.push(k);
            if (v?.userId) ids.push(String(v.userId));
            if (v?.nickname) ids.push(String(v.nickname));
          });
        }
      }
      const count = typeof members?.count === 'number' ? members.count : (ids.length > 0 ? ids.length : undefined);
      useChatStore.getState().updateChat(activeChatId, {
        ...(count !== undefined ? { onlineCount: count } : {}),
        ...(ids.length > 0 ? { onlineMemberIds: Array.from(new Set(ids)) } : {}),
      });
    };
    const handleMemberAdded = (member: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === activeChatId);
      const newCount = (current?.onlineCount || 1) + 1;
      const curIds = current?.onlineMemberIds || [];
      const addIds = [member?.id, member?.info?.userId, member?.info?.nickname].filter(Boolean).map(String);
      useChatStore.getState().updateChat(activeChatId, {
        onlineCount: newCount,
        onlineMemberIds: Array.from(new Set([...curIds, ...addIds])),
      });
    };
    const handleMemberRemoved = (member: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === activeChatId);
      const newCount = Math.max(1, (current?.onlineCount || 2) - 1);
      const curIds = current?.onlineMemberIds || [];
      const remIds = new Set([member?.id, member?.info?.userId, member?.info?.nickname].filter(Boolean).map(String));
      useChatStore.getState().updateChat(activeChatId, {
        onlineCount: newCount,
        onlineMemberIds: curIds.filter((id) => !remIds.has(id)),
      });
    };

    const handleGroupCallStarted = (data: any) => {
      useChatStore.getState().updateChat(activeChatId, { activeCallRoom: data?.roomName || `group-call-${activeChatId}` });
    };
    const handleGroupCallEnded = () => {
      useChatStore.getState().updateChat(activeChatId, { activeCallRoom: null });
    };

    channel.bind('reaction', handleReaction);
    channel.bind('client-message', handleClientMessage);
    channel.bind('new-post', handleChannelPost);
    channel.bind('reaction-updated', handleChannelReaction);
    channel.bind('subscribers-updated', handleSubscribersUpdated);
    channel.bind('pusher:subscription_succeeded', handlePresenceSub);
    channel.bind('pusher:member_added', handleMemberAdded);
    channel.bind('pusher:member_removed', handleMemberRemoved);
    channel.bind('group-call-started', handleGroupCallStarted);
    channel.bind('client-group-call-started', handleGroupCallStarted);
    channel.bind('group-call-active', handleGroupCallStarted);
    channel.bind('client-group-call-active', handleGroupCallStarted);
    channel.bind('group-call-ended', handleGroupCallEnded);
    channel.bind('client-group-call-ended', handleGroupCallEnded);
    channel.bind('member-profile-updated', handleClientMessage);
    channel.bind('profile-update', handleClientMessage);

    return () => {
      unsubLobbyRealtime?.();
      unsubAbly();
      channel.unbind('reaction', handleReaction);
      channel.unbind('client-message', handleClientMessage);
      channel.unbind('new-post', handleChannelPost);
      channel.unbind('reaction-updated', handleChannelReaction);
      channel.unbind('subscribers-updated', handleSubscribersUpdated);
      channel.unbind('pusher:subscription_succeeded', handlePresenceSub);
      channel.unbind('pusher:member_added', handleMemberAdded);
      channel.unbind('pusher:member_removed', handleMemberRemoved);
      channel.unbind('group-call-started', handleGroupCallStarted);
      channel.unbind('client-group-call-started', handleGroupCallStarted);
      channel.unbind('group-call-active', handleGroupCallStarted);
      channel.unbind('client-group-call-active', handleGroupCallStarted);
      channel.unbind('group-call-ended', handleGroupCallEnded);
      channel.unbind('client-group-call-ended', handleGroupCallEnded);
      channel.unbind('member-profile-updated', handleClientMessage);
      channel.unbind('profile-update', handleClientMessage);
    };
  }, [activeChatId, activeChat?.type, activeChannelId, myNickname]);
};
