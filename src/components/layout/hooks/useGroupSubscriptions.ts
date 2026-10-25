import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, isMessageOutgoing, type Chat, type Message } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { getPusher, getGroupPusher, CLIENT_SESSION_ID } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { channelService } from '../../../services/channelService';
import { groupService } from '../../../services/groupService';
import { supabaseService } from '../../../services/supabaseService';
import { deriveChannelKey, decryptMessage } from '../../../lib/crypto';
import { deriveGroupKey, isValidGroupCode } from '../../../lib/groupCrypto';
import { mediaManager } from '../../../services/mediaManager';
import { showNotification } from '../../../utils/notification';
import { isAppInFocusAndVisible } from './layoutSyncUtils';

export interface UseGroupSubscriptionsParams {
  activeSubscriptions: React.MutableRefObject<Map<string, { channel: any; handler: (data: any) => void }>>;
  lastPongTime: React.MutableRefObject<Map<string, number>>;
  ablyMessageUnsubscribes: React.MutableRefObject<Map<string, () => void>>;
  nickname: string | null;
  myCode: string | null;
  addMessage: (chatId: string, message: Message) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
}

export const useGroupSubscriptions = ({
  activeSubscriptions,
  lastPongTime,
  ablyMessageUnsubscribes,
  nickname,
  myCode,
  addMessage,
  updateChat,
}: UseGroupSubscriptionsParams) => {
  const { t } = useTranslation();
  const recentNotifsRef = useRef<Map<string, number>>(new Map());

  const sendGroupNotification = useCallback((title: string, body: string, targetChatId: string, avatar: string | null) => {
    const key = `${targetChatId}:${body}`;
    const now = Date.now();
    const lastTime = recentNotifsRef.current.get(key) || 0;
    if (now - lastTime < 6000) return;
    recentNotifsRef.current.set(key, now);
    showNotification(title, body, targetChatId, avatar, true);
  }, []);

  const startPingForChat = useCallback((chatId: string) => {
    void chatId;
  }, []);

  const subscribeToGroupChat = useCallback((chatId: string) => {
    const pusher = getGroupPusher();
    if (activeSubscriptions.current.has(chatId)) return activeSubscriptions.current.get(chatId)!.channel;
    const channel = pusher.subscribe(`presence-group-${chatId}`);
    const handleMessage = (data: any) => {
      if (data.type === 'system') {
        if (data.action === 'delete-chat') {
          useChatStore.setState({ chats: useChatStore.getState().chats.filter(c => c.id !== chatId) });
          if (activeSubscriptions.current.has(chatId)) { const sub = activeSubscriptions.current.get(chatId)!; sub.channel.unbind_all(); pusher.unsubscribe(`presence-group-${chatId}`); activeSubscriptions.current.delete(chatId); }
          return;
        }
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [],
            }
          }));
          updateChat(chatId, {
            lastMsg: t('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now()
          });
          return;
        }
      }
      lastPongTime.current.set(chatId, Date.now());
      const chat = useChatStore.getState().chats.find(c => c.id === chatId);
      if (!chat) return;

      const messages = useChatStore.getState().messagesByChatId[chatId] || [];

      if (data.type === 'delete' || data.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(chatId, targetId);
        } else if (data.deleteIndex !== undefined) {
          const updated = messages.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            }
          }));
          updateChat(chatId, { lastMsg: updated.length > 0 ? updated[updated.length - 1].text : t('common.history_cleared') });
        }
        return;
      }
      if (data.type === 'edit' && messages[data.editIndex]) {
        const decrypted = data.text;
        const updated = [...messages];
        updated[data.editIndex] = { ...updated[data.editIndex], text: decrypted };
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          }
        }));
        return;
      }
      if (data.type === 'pin' || data.type === 'pin-message') { updateChat(chatId, { pinnedMessage: data.pinData }); return; }
      if (data.type === 'unpin' || data.type === 'unpin-message') { updateChat(chatId, { pinnedMessage: null }); return; }
      if (data.type === 'member-joined') {
        if (data.members) {
          updateChat(chatId, { members: data.members, membersCount: data.members.length });
        } else {
          groupService.getGroup(chatId).then((info) => {
            if (info?.members) {
              updateChat(chatId, { members: info.members as any, membersCount: info.membersCount || info.members.length });
            }
          }).catch(() => {});
        }
        const isCurrentActive = useChatStore.getState().activeChatId === chatId && isAppInFocusAndVisible();
        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        const isSelfJoined = Boolean(
          (myUid && (data.userId === myUid || data.userCode === myUid)) ||
          (myC && (data.userCode === myC || data.userId === myC)) ||
          (data.nickname && data.nickname === nickname)
        );
        const joinText = data.inviterNickname
          ? `${data.inviterNickname} добавил(а) ${data.nickname || 'участника'} в группу`
          : `${data.nickname || 'Новый участник'} вступил(а) в группу`;

        const existingMsgs = useChatStore.getState().messagesByChatId[chatId] || [];
        const isAlreadyAdded = existingMsgs.some(
          (m) =>
            (data.id && m.id === data.id) ||
            (data.messageId && m.id === data.messageId) ||
            ((m.systemType === 'join' || m.text === joinText) &&
              (m.actorNickname === (data.nickname || 'Участник') || m.text === joinText) &&
              Math.abs((m.time || 0) - Date.now()) < 8000)
        );

        if (!isAlreadyAdded) {
          const sysMsgId = data.id || data.messageId || `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          const sysMsg: Message = {
            id: sysMsgId,
            sender: 'system',
            text: joinText,
            time: Date.now(),
            status: 'sent',
            mediaType: 'system',
            systemType: 'join',
            actorNickname: data.nickname || 'Участник',
          };
          addMessage(chatId, sysMsg);
          try {
            (window as any).orbita?.storageAddMessage?.(chatId, sysMsgId, sysMsg);
          } catch {}
          if (!isCurrentActive && !isSelfJoined) {
            sendGroupNotification(chat.name || '', joinText, chatId, chat.avatarUrl || null);
          }
        }
        return;
      }
      if (data.type === 'member-left') {
        const isTarget = (member: any) => {
          const mId = member.userId || member.userCode;
          if (data.userId && mId) return mId === data.userId;
          if (data.userCode && mId) return mId === data.userCode;
          return member.nickname === data.nickname;
        };
        const updatedMembers = (chat.members || []).filter((member: any) => !isTarget(member)) as any;
        updateChat(chatId, { members: updatedMembers, membersCount: updatedMembers.length });
        const leaveText = `${data.nickname || 'Участник'} покинул(а) группу`;

        const existingMsgs = useChatStore.getState().messagesByChatId[chatId] || [];
        const isAlreadyAdded = existingMsgs.some(
          (m) =>
            (data.id && m.id === data.id) ||
            (data.messageId && m.id === data.messageId) ||
            ((m.systemType === 'leave' || m.text === leaveText) &&
              (m.actorNickname === (data.nickname || 'Участник') || m.text === leaveText) &&
              Math.abs((m.time || 0) - Date.now()) < 8000)
        );

        if (!isAlreadyAdded) {
          const sysMsgId = data.id || data.messageId || `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          const sysMsg: Message = {
            id: sysMsgId,
            sender: 'system',
            text: leaveText,
            time: Date.now(),
            status: 'sent',
            mediaType: 'system',
            systemType: 'leave',
            actorNickname: data.nickname || 'Участник',
          };
          addMessage(chatId, sysMsg);
          try {
            (window as any).orbita?.storageAddMessage?.(chatId, sysMsgId, sysMsg);
          } catch {}
        }
        return;
      }
      if (data.type === 'member-profile-updated' || data.type === 'profile-update') {
        const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
        if (!currentChat) return;

        const targetUserId = data.userId || data.senderUserId;
        const targetUserCode = data.userCode || data.senderCode;
        const newAvatar = data.avatarUrl;
        const newNickname = data.nickname || data.sender;

        const isTarget = (member: any) => {
          const mId = member.userId || member.userCode;
          if (targetUserId && mId) return mId === targetUserId;
          if (targetUserCode && mId) return mId === targetUserCode;
          return false;
        };

        const updatedMembers = (currentChat.members || []).map((member: any) => {
          if (isTarget(member)) {
            return {
              ...member,
              nickname: newNickname || member.nickname,
              avatarUrl: newAvatar !== undefined ? newAvatar : member.avatarUrl,
            };
          }
          return member;
        });

        const chatUpdates: any = { members: updatedMembers };
        if (currentChat.creatorId && targetUserId && currentChat.creatorId === targetUserId && newNickname) {
          chatUpdates.creatorNickname = newNickname;
        }
        updateChat(chatId, chatUpdates);

        if (targetUserId || targetUserCode) {
          const profileKey = targetUserId || targetUserCode;
          if (profileKey) {
            useChatStore.getState().setUserProfile(profileKey, {
              nickname: newNickname,
              avatarUrl: newAvatar,
            });
          }
        }

        const groupMessages = useChatStore.getState().messagesByChatId[chatId];
        if (groupMessages && groupMessages.length > 0) {
          const updatedMessages = groupMessages.map((msg) => {
            const isMsgTarget = Boolean(
              (targetUserId && msg.senderId && msg.senderId === targetUserId) ||
              (targetUserCode && msg.senderId && msg.senderId === targetUserCode)
            );
            if (isMsgTarget && !msg.isOutgoing) {
              return {
                ...msg,
                sender: newNickname || msg.sender,
                senderAvatar: newAvatar !== undefined ? newAvatar : (msg as any).senderAvatar,
                avatarUrl: newAvatar !== undefined ? newAvatar : (msg as any).avatarUrl,
              };
            }
            return msg;
          });
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updatedMessages,
            },
          }));
        }
        return;
      }
      if (data.type === 'group-deleted' || (data.type === 'system' && data.action === 'group-deleted')) {
        useChatStore.getState().deleteChat(chatId);
        if (useChatStore.getState().activeChatId === chatId) {
          useChatStore.getState().setActiveChat(null);
        }
        if (activeSubscriptions.current.has(chatId)) {
          const sub = activeSubscriptions.current.get(chatId)!;
          sub.channel.unbind_all();
          getGroupPusher().unsubscribe(`presence-group-${chatId}`);
          activeSubscriptions.current.delete(chatId);
        }
        if (ablyMessageUnsubscribes.current.has(chatId)) {
          const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
          unsub();
          ablyMessageUnsubscribes.current.delete(chatId);
        }
        return;
      }
      if (data.type === 'kick') {
        const isTarget = (member: any) => {
          const mId = member.userId || member.userCode;
          if (data.targetUserId && mId) return mId === data.targetUserId;
          if (data.targetUserCode && mId) return mId === data.targetUserCode;
          if (data.targetId && mId) return mId === data.targetId;
          return member.nickname === data.target;
        };
        const updatedMembers = (chat.members || []).filter((member: any) => !isTarget(member)) as any;
        updateChat(chatId, { members: updatedMembers, membersCount: updatedMembers.length });
        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        const isMeKicked = Boolean(
          (data.targetUserId && (data.targetUserId === myUid || data.targetUserId === myC)) ||
          (data.targetUserCode && (data.targetUserCode === myUid || data.targetUserCode === myC)) ||
          (data.targetId && (data.targetId === myUid || data.targetId === myC)) ||
          data.target === nickname
        );
        if (isMeKicked) {
          useChatStore.getState().deleteChat(chatId);
          if (useChatStore.getState().activeChatId === chatId) {
            useChatStore.getState().setActiveChat(null);
          }
          if (activeSubscriptions.current.has(chatId)) {
            const sub = activeSubscriptions.current.get(chatId)!;
            sub.channel.unbind_all();
            getGroupPusher().unsubscribe(`presence-group-${chatId}`);
            activeSubscriptions.current.delete(chatId);
          }
          if (ablyMessageUnsubscribes.current.has(chatId)) {
            const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
            unsub();
            ablyMessageUnsubscribes.current.delete(chatId);
          }
        }
        return;
      }
      if (data.type === 'promote') {
        const isTarget = (member: any) => {
          const mId = member.userId || member.userCode;
          if (data.targetUserId && mId) return mId === data.targetUserId;
          if (data.targetUserCode && mId) return mId === data.targetUserCode;
          return member.nickname === data.target;
        };
        const updatedMembers = (chat.members || []).map((member: any) => isTarget(member) ? { ...member, role: 'admin' } : member) as any;
        updateChat(chatId, { members: updatedMembers });
        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        if ((data.targetUserId && (data.targetUserId === myUid || data.targetUserId === myC)) || data.target === nickname) {
          updateChat(chatId, { role: 'admin' });
        }
        return;
      }
      if (data.type === 'demote') {
        const isTarget = (member: any) => {
          const mId = member.userId || member.userCode;
          if (data.targetUserId && mId) return mId === data.targetUserId;
          if (data.targetUserCode && mId) return mId === data.targetUserCode;
          return member.nickname === data.target;
        };
        const updatedMembers = (chat.members || []).map((member: any) => isTarget(member) ? { ...member, role: 'member' } : member) as any;
        updateChat(chatId, { members: updatedMembers });
        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        if ((data.targetUserId && (data.targetUserId === myUid || data.targetUserId === myC)) || data.target === nickname) {
          updateChat(chatId, { role: 'member' });
        }
        return;
      }
      if (data.type === 'read') {
        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (myUid && (data.senderUserId === myUid || data.userId === myUid || data.senderId === myUid)) ||
          (myC && (data.senderCode === myC || data.senderId === myC)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === nickname)
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[chatId] || messages;
        const readIds: string[] = [];
        const readMediaUrls: string[] = [];
        const readMsgObjects: Message[] = [];
        const updatedMessages = currentMsgs.map((msg) => {
          const isOut = msg.isOutgoing || isMessageOutgoing(msg, myC, nickname, chat, myUid);
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
            [chatId]: updatedMessages,
          }
        }));
        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(chatId, readIds);
        }
        if (readMediaUrls.length > 0) {
          mediaManager.purgeServerMedia(readMediaUrls);
        }
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const rm of readMsgObjects) {
            if (rm.id) {
              (window as any).orbita.storageAddMessage(chatId, rm.id, rm).catch(() => {});
            }
          }
        }
        return;
      }

      if (data.type === 'delivered') {
        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (myUid && (data.senderUserId === myUid || data.userId === myUid || data.senderId === myUid)) ||
          (myC && (data.senderCode === myC || data.senderId === myC)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === nickname)
        );
        if (isSelf) return;
        const updatedMessages = messages.map((msg) =>
          (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && (msg.isOutgoing || isMessageOutgoing(msg, myC, nickname, chat, myUid)))
            ? (msg.status === 'read' || msg.read ? msg : { ...msg, status: 'delivered' as const })
            : msg
        );
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updatedMessages,
          }
        }));
        return;
      }

      if (data.type === 'reaction' && data.emoji && data.sender) {
        if (data.sessionId === CLIENT_SESSION_ID) return;
        const myUserId = useAuthStore.getState().userId;
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
          (nickname && (data.sender === nickname || data.senderNickname === nickname)) ||
          data.sender === 'YOU'
        );
        if (isSelf) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
        return;
      }

      if (data?.type === 'group-call-ended' || data?.type === 'client-group-call-ended') {
        useChatStore.getState().updateChat(chatId, { activeCallRoom: null });
        return;
      }
      if (
        data?.type === 'group-call-started' ||
        data?.type === 'client-group-call-started' ||
        data?.type === 'group-call-active' ||
        data?.type === 'client-group-call-active'
      ) {
        useChatStore.getState().updateChat(chatId, { activeCallRoom: data.roomName || `group-call-${chatId}` });
        return;
      }

      const myUserId = useAuthStore.getState().userId;
      const isSelfMessage = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
        (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === nickname)
      );
      if (isSelfMessage) return;

      const rawCiphertext = data.ciphertext || data.text;
      if (!rawCiphertext) return;

      const resolveSecret = async (): Promise<string | undefined> => {
        if (chat.sharedSecret) return chat.sharedSecret;
        if (chat.inviteCode && isValidGroupCode(chat.inviteCode)) {
          const s = deriveGroupKey(chat.inviteCode);
          updateChat(chatId, { sharedSecret: s });
          return s;
        }
        if (chat.code && isValidGroupCode(chat.code)) {
          const s = deriveGroupKey(chat.code);
          updateChat(chatId, { sharedSecret: s });
          return s;
        }
        try {
          const fetched = await groupService.getGroup(chatId);
          if (fetched?.sharedSecret) {
            updateChat(chatId, { sharedSecret: fetched.sharedSecret });
            return fetched.sharedSecret;
          }
        } catch {}
        return undefined;
      };

      resolveSecret().then(async (secret) => {
        let decrypted = '';
        let parsedData: any = null;
        const isPlaintextJson = typeof rawCiphertext === 'string' && rawCiphertext.trim().startsWith('{');
        const isSystem = data.mediaType === 'system' || data.systemType || data.sender === 'system';

        if (isPlaintextJson || isSystem) {
          try {
            parsedData = JSON.parse(rawCiphertext);
          } catch {}
        }

        if (!parsedData && secret) {
          try {
            decrypted = await decryptMessage(rawCiphertext, secret);
          } catch {}
          if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
            try {
              parsedData = JSON.parse(decrypted);
            } catch {
              parsedData = { text: decrypted };
            }
          }
        }

        if (!parsedData && typeof rawCiphertext === 'string' && rawCiphertext.trim().startsWith('{')) {
          try {
            parsedData = JSON.parse(rawCiphertext);
          } catch {}
        }

        if (!parsedData) {
          parsedData = { text: decrypted || rawCiphertext };
        }

        const msgId = parsedData?.id || data.messageId || data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const isCurrentActive = useChatStore.getState().activeChatId === chatId && typeof document !== 'undefined' && document.visibilityState === 'visible';
        let msgText = parsedData?.text !== undefined ? parsedData.text : (decrypted || rawCiphertext);
        if (msgText === '[ENCRYPTED MESSAGE]' && (isSystem || parsedData?.mediaType === 'system')) {
          msgText = '';
        }

        const msgPayload: any = {
          id: msgId,
          sender: data.sender,
          senderId: data.senderCode || data.senderId,
          senderAvatar: parsedData?.avatarUrl || data.avatarUrl || data.senderAvatar || undefined,
          avatarUrl: parsedData?.avatarUrl || data.avatarUrl || data.senderAvatar || undefined,
          text: msgText,
          time: data.time || Date.now(),
          read: isCurrentActive,
          status: isCurrentActive ? 'read' : 'delivered',
          isOutgoing: false,
          mediaType: parsedData?.mediaType || data.mediaType || undefined,
          mediaUrl: parsedData?.mediaUrl || data.mediaUrl || undefined,
          mediaName: parsedData?.mediaName || data.mediaName || undefined,
          mediaKey: parsedData?.mediaKey || data.mediaKey || undefined,
          mime: parsedData?.mime || data.mime || undefined,
          mediaItems: parsedData?.mediaItems || data.mediaItems || undefined,
          width: parsedData?.width || data.width || undefined,
          height: parsedData?.height || data.height || undefined,
          duration: parsedData?.duration || data.duration || undefined,
          waveform: parsedData?.waveform || data.waveform || undefined,
          audioMetadata: parsedData?.audioMetadata || data.audioMetadata || undefined,
          fileSize: parsedData?.fileSize || data.fileSize || parsedData?.size || data.size || undefined,
          linkPreview: parsedData?.linkPreview || data.linkPreview || undefined,
          blurPreview: parsedData?.blurPreview || data.blurPreview || parsedData?.thumbnail || data.thumbnail || undefined,
          systemType: parsedData?.systemType || data.systemType || undefined,
          actorNickname: parsedData?.actorNickname || data.actorNickname || undefined,
          targetNickname: parsedData?.targetNickname || data.targetNickname || undefined,
        };

        addMessage(chatId, msgPayload);

        if (parsedData?.mediaType === 'system' || data.mediaType === 'system') {
          const sysType = parsedData?.systemType || data.systemType;
          if (sysType === 'join' || sysType === 'invite') {
            groupService.getGroup(chatId).then((info) => {
              if (info?.members) {
                updateChat(chatId, {
                  members: info.members as any,
                  membersCount: info.membersCount || info.members.length,
                });
              }
            }).catch(() => {});
          }
          if (sysType === 'call_ended') {
            useChatStore.getState().updateChat(chatId, { activeCallRoom: null });
          } else if (sysType === 'call') {
            const fallbackRoom = parsedData?.roomName || (data as any)?.roomName || `group-call-${chatId}`;
            useChatStore.getState().updateChat(chatId, { activeCallRoom: fallbackRoom });
            groupService.getActiveCall(chatId).then((call) => {
              if (call && call.status === 'active') {
                useChatStore.getState().updateChat(chatId, { activeCallRoom: call.roomName });
              }
            }).catch(() => {});
          }
        }

        try {
          (window as any).orbita?.storageAddMessage?.(chatId, msgId, msgPayload);
        } catch {}

        if (!isCurrentActive || !isAppInFocusAndVisible()) {
          let notifBody = msgText;
          if (typeof notifBody === 'string' && (notifBody.startsWith('orb_e2e:') || notifBody === '[ENCRYPTED MESSAGE]')) {
            notifBody = '';
          }
          if (
            msgPayload.mediaType === 'sticker' ||
            (typeof notifBody === 'string' && (/^\[Sticker\]/i.test(notifBody.trim()) || /(\.stickers|\/stickers|stickers\/|bisquit)/i.test(notifBody)))
          ) {
            notifBody = t('chatWindow.sticker') || 'Стикер';
          } else if (
            msgPayload.mediaType === 'voice' ||
            (typeof notifBody === 'string' && (/^\[Audio\]\s+voice_/i.test(notifBody.trim()) || /^voice_\d+/i.test(notifBody.trim()) || notifBody.includes('voice_')))
          ) {
            notifBody = t('chatWindow.voice_message') || 'Голосовое сообщение';
          } else if (
            msgPayload.mediaType === 'photo' || msgPayload.mediaType === 'image' ||
            (typeof notifBody === 'string' && /^\[Photo\]/i.test(notifBody.trim()))
          ) {
            notifBody = t('chatWindow.photo') || 'Фотография';
          } else if (
            msgPayload.mediaType === 'video' ||
            (typeof notifBody === 'string' && /^\[Video\]/i.test(notifBody.trim()))
          ) {
            notifBody = t('chatWindow.video') || 'Видео';
          } else if (
            msgPayload.mediaType === 'audio' ||
            (typeof notifBody === 'string' && /^\[Audio\]/i.test(notifBody.trim()))
          ) {
            notifBody = msgPayload.mediaName || t('chatWindow.audio') || 'Аудиозапись';
          } else if (
            msgPayload.mediaType === 'file' ||
            (typeof notifBody === 'string' && /^\[File\]/i.test(notifBody.trim()))
          ) {
            notifBody = msgPayload.mediaName || t('chatWindow.file') || 'Файл';
          } else if (!notifBody) {
            notifBody = t('chatWindow.new_message') || 'Новое сообщение';
          }
          const notifTitle = chat.name || '';
          const notifSender = (data.sender && data.sender !== 'system') ? data.sender : '';
          const isSys = msgPayload.mediaType === 'system' || (msgPayload as any).systemType || (typeof notifBody === 'string' && notifSender && notifBody.startsWith(notifSender));
          const finalNotifBody = (notifSender && !isSys) ? `${notifSender}: ${notifBody}` : notifBody;
          sendGroupNotification(notifTitle, finalNotifBody, chatId, chat.avatarUrl || null);
        }

        if (isCurrentActive) {
          const myUid = useAuthStore.getState().userId;
          const myC = useChatStore.getState().myCode;
          const sendRead = () => channel.trigger('client-message', {
            type: 'read',
            time: data.time,
            messageId: msgId,
            sender: nickname,
            senderUserId: myUid,
            senderCode: myC,
            senderId: myUid || myC,
          });
          if (channel.subscribed) sendRead();
          else channel.bind('pusher:subscription_succeeded', sendRead);
        } else {
          const myUid = useAuthStore.getState().userId;
          const myC = useChatStore.getState().myCode;
          const sendDelivered = () => channel.trigger('client-message', {
            type: 'delivered',
            time: data.time,
            messageId: msgId,
            sender: nickname,
            senderUserId: myUid,
            senderCode: myC,
            senderId: myUid || myC,
          });
          if (channel.subscribed) sendDelivered();
          else channel.bind('pusher:subscription_succeeded', sendDelivered);
        }
      });
    };

    const handleReaction = (data: any) => {
      const myUserId = useAuthStore.getState().userId;
      const isSelf = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
        (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === nickname)
      );
      if (isSelf) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    channel.bind('message', handleMessage);
    channel.bind('edit', handleMessage);
    channel.bind('delete', handleMessage);
    channel.bind('pin', handleMessage);
    channel.bind('unpin', handleMessage);
    channel.bind('kick', handleMessage);
    channel.bind('promote', handleMessage);
    channel.bind('demote', handleMessage);
    channel.bind('system', handleMessage);
    channel.bind('client-message', handleMessage);
    channel.bind('reaction', handleReaction);
    channel.bind('pusher:subscription_succeeded', (members: any) => {
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
      useChatStore.getState().updateChat(chatId, {
        ...(count !== undefined ? { onlineCount: count } : {}),
        ...(ids.length > 0 ? { onlineMemberIds: Array.from(new Set(ids)) } : {}),
      });
    });
    channel.bind('pusher:member_added', (member: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === chatId);
      const newCount = (current?.onlineCount || 1) + 1;
      const curIds = current?.onlineMemberIds || [];
      const addIds = [member?.id, member?.info?.userId, member?.info?.nickname].filter(Boolean).map(String);
      useChatStore.getState().updateChat(chatId, {
        onlineCount: newCount,
        onlineMemberIds: Array.from(new Set([...curIds, ...addIds])),
      });
    });
    channel.bind('pusher:member_removed', (member: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === chatId);
      const newCount = Math.max(1, (current?.onlineCount || 2) - 1);
      const curIds = current?.onlineMemberIds || [];
      const remIds = new Set([member?.id, member?.info?.userId, member?.info?.nickname].filter(Boolean).map(String));
      useChatStore.getState().updateChat(chatId, {
        onlineCount: newCount,
        onlineMemberIds: curIds.filter((id) => !remIds.has(id)),
      });
    });
    const handleGroupCallStarted = (data: any) => {
      useChatStore.getState().updateChat(chatId, { activeCallRoom: data?.roomName || `group-call-${chatId}` });
    };
    const handleGroupCallEnded = () => {
      useChatStore.getState().updateChat(chatId, { activeCallRoom: null });
    };
    channel.bind('group-call-started', handleGroupCallStarted);
    channel.bind('client-group-call-started', handleGroupCallStarted);
    channel.bind('group-call-active', handleGroupCallStarted);
    channel.bind('client-group-call-active', handleGroupCallStarted);
    channel.bind('group-call-ended', handleGroupCallEnded);
    channel.bind('client-group-call-ended', handleGroupCallEnded);
    channel.bind('member-joined', (data: any) => {
      if (data?.members) {
        useChatStore.getState().updateChat(chatId, { members: data.members, membersCount: data.members.length });
      }
    });
    channel.bind('member-left', (data: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === chatId);
      const isTarget = (m: any) => {
        const mCodes = [m.userId, m.userCode, m.user_id, m.user_code].filter(Boolean);
        if (data?.userId && mCodes.includes(data.userId)) return true;
        if (data?.userCode && mCodes.includes(data.userCode)) return true;
        if (data?.user_id && mCodes.includes(data.user_id)) return true;
        if (data?.user_code && mCodes.includes(data.user_code)) return true;
        return false;
      };
      const updated = (current?.members || []).filter((m: any) => !isTarget(m));
      useChatStore.getState().updateChat(chatId, { members: updated, membersCount: updated.length });
    });
    channel.bind('group-updated', (data: any) => {
      const updates: any = {};
      if (data?.name) updates.name = data.name;
      if (data?.description !== undefined) updates.description = data.description;
      if (data?.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
      if (data?.inviteActive !== undefined) updates.inviteActive = data.inviteActive;
      if (data?.inviteExpiresAt !== undefined) updates.inviteExpiresAt = data.inviteExpiresAt;
      useChatStore.getState().updateChat(chatId, updates);
    });
    channel.bind('group-deleted', () => {
      useChatStore.getState().deleteChat(chatId);
      if (useChatStore.getState().activeChatId === chatId) {
        useChatStore.getState().setActiveChat(null);
      }
      if (activeSubscriptions.current.has(chatId)) {
        const sub = activeSubscriptions.current.get(chatId)!;
        sub.channel.unbind_all();
        getGroupPusher().unsubscribe(`presence-group-${chatId}`);
        activeSubscriptions.current.delete(chatId);
      }
      if (ablyMessageUnsubscribes.current.has(chatId)) {
        const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
        unsub();
        ablyMessageUnsubscribes.current.delete(chatId);
      }
    });
    channel.bind('member-role-updated', (data: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === chatId);
      const isTarget = (m: any) => {
        const mCodes = [m.userId, m.userCode, m.user_id, m.user_code].filter(Boolean);
        if (data?.targetUserId && mCodes.includes(data.targetUserId)) return true;
        if (data?.targetUserCode && mCodes.includes(data.targetUserCode)) return true;
        if (data?.target_user_id && mCodes.includes(data.target_user_id)) return true;
        if (data?.target_user_code && mCodes.includes(data.target_user_code)) return true;
        return false;
      };
      const updated = (current?.members || []).map((m: any) =>
        isTarget(m) ? { ...m, role: data.role } : m
      );
      useChatStore.getState().updateChat(chatId, { members: updated });
    });
    channel.bind('member-profile-updated', (data: any) => {
      handleMessage({ ...data, type: 'member-profile-updated' });
    });
    channel.bind('profile-update', (data: any) => {
      handleMessage({ ...data, type: 'member-profile-updated' });
    });
    activeSubscriptions.current.set(chatId, { channel, handler: handleMessage });
    if (!ablyMessageUnsubscribes.current.has(chatId)) {
      const unsub = ablyService.subscribeToChatMessages(chatId, handleMessage);
      ablyMessageUnsubscribes.current.set(chatId, unsub);
    }
    startPingForChat(chatId);
    return channel;
  }, [nickname, addMessage, updateChat, t]);

  const subscribeToPublicChannel = useCallback((channelId: string) => {
    const pusher = getPusher();
    if (activeSubscriptions.current.has(channelId)) {
      return activeSubscriptions.current.get(channelId)!.channel;
    }

    const channelName = `public-channel-${channelId}`;
    const channel = pusher.subscribe(channelName);

    const handleNewPost = async (post: any) => {
      console.log('[MainLayout] Received new channel post:', post);
      if (!post || !post.id) return;

      let postText = post.text || '';
      if (postText.startsWith('orb_e2e:')) {
        const channelKey = deriveChannelKey(channelId);
        const decrypted = await decryptMessage(postText.slice(8), channelKey);
        if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
          postText = decrypted;
        }
      }

      const currentChat = useChatStore.getState().chats.find((c) => c.id === channelId);
      const activeChatId = useChatStore.getState().activeChatId;
      const isViewingThisChannel = activeChatId === channelId;

      const currentMsgs = useChatStore.getState().messagesByChatId[channelId] || [];
      const existingMatch = currentMsgs.find(
        (m) =>
          m.id === post.id ||
          (m.isOutgoing &&
            m.sender === (post.sender || post.senderNickname) &&
            ((post.text && m.text === post.text) ||
              (post.mediaUrl && m.mediaUrl === post.mediaUrl) ||
              (post.mediaName && m.mediaName === post.mediaName)) &&
            Math.abs(m.time - (post.time || 0)) < 30000)
      );

      const sender = post.sender || post.senderNickname || 'Channel';
      const myUserId = useAuthStore.getState().userId;
      const isOwnerById = Boolean(
        currentChat?.type === 'channel' &&
        myUserId &&
        (currentChat.creatorId === myUserId || (currentChat.isOwner && (!currentChat.creatorId || currentChat.creatorId === myUserId)))
      );
      if (isOwnerById && !post.senderId) {
        post.senderId = myUserId;
      }
      const isMine = Boolean(
        existingMatch?.isOutgoing ||
        (myUserId && (post.senderUserId === myUserId || post.userId === myUserId || post.senderId === myUserId)) ||
        (myCode && (post.senderCode === myCode || post.senderId === myCode))
      );

      const newMsg: Message = {
        id: post.id,
        sender,
        text: postText,
        time: (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now(),
        read: isViewingThisChannel,
        status: isMine ? 'read' : undefined,
        isOutgoing: isMine,
        mediaType: post.mediaType || undefined,
        mediaUrl: post.mediaUrl || undefined,
        mediaName: post.mediaName || undefined,
        mime: post.mime || undefined,
        duration: post.duration || undefined,
        width: post.width || undefined,
        height: post.height || undefined,
        waveform: post.waveform || undefined,
        audioMetadata: post.audioMetadata || undefined,
        linkPreview: post.linkPreview || undefined,
        reactions: post.reactions || undefined,
        blurPreview: post.blurPreview || post.thumbnail || undefined,
      };

      const validPostTime = (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now();
      if (existingMatch) {
        if (existingMatch.id !== post.id) {
          try {
            (window as any).orbita?.storageDeleteMessage?.(existingMatch.id).catch(() => {});
          } catch {}
        }
        useChatStore.setState((state) => {
          const list = state.messagesByChatId[channelId] || [];
          const updated = list.map((m) =>
            m.id === existingMatch.id
              ? {
                  ...m,
                  id: post.id,
                  text: postText || m.text,
                  time: validPostTime,
                  status: 'read' as const,
                }
              : m
          );
          const saved = updated.find((m) => m.id === post.id);
          if (saved) {
            try {
              (window as any).orbita?.storageAddMessage?.(channelId, post.id, saved).catch(() => {});
            } catch {}
          }
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [channelId]: updated,
            },
          };
        });
      } else {
        addMessage(channelId, newMsg);
      }
      useChatStore.getState().updateChat(channelId, { lastMsg: postText || 'Новый пост' });

      if (!isMine && (!isViewingThisChannel || !isAppInFocusAndVisible())) {
        let notifBody = postText;
        if (typeof notifBody === 'string' && (notifBody.startsWith('orb_e2e:') || notifBody === '[ENCRYPTED MESSAGE]')) {
          notifBody = '';
        }
        if (!notifBody) {
          if (post.mediaType === 'photo' || post.mediaType === 'image') notifBody = t('chatWindow.photo') || '📷 Фотография';
          else if (post.mediaType === 'video') notifBody = t('chatWindow.video') || '📹 Видео';
          else if (post.mediaType === 'voice') notifBody = t('chatWindow.voice_message') || '🎤 Голосовое сообщение';
          else if (post.mediaType === 'audio') notifBody = post.mediaName || t('chatWindow.audio') || '🎵 Музыка';
          else if (post.mediaType === 'file') notifBody = post.mediaName || t('chatWindow.file') || '📁 Файл';
          else notifBody = t('chatWindow.new_message') || 'Новое сообщение';
        }
        showNotification(currentChat?.name || post.sender || 'Канал', notifBody, channelId, currentChat?.avatarUrl || null);
      }
    };

    const handleReaction = (data: any) => {
      console.log('[MainLayout] Received channel reaction update:', data);
      if (data?.postId && data?.reactions) {
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
          const currentMsgs = state.messagesByChatId[channelId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [channelId]: currentMsgs.map((m) => {
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
      }
    };

    const handleSubscribers = (data: any) => {
      console.log('[MainLayout] Received channel subscribers update:', data);
      if (typeof data?.subscribersCount === 'number') {
        useChatStore.getState().updateChat(channelId, {
          subscribersCount: data.subscribersCount,
        });
      }
    };

    const handleChannelUpdated = (data: any) => {
      const updates: Partial<Chat> = {};
      if (data?.name !== undefined && data.name) updates.name = data.name;
      if (data?.description !== undefined) updates.description = data.description;
      if (data?.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
      updates.updatedAt = data?.updatedAt || Date.now();
      useChatStore.getState().updateChat(channelId, updates);
    };

    const handleDeletePost = (data: any) => {
      const postId = data?.postId || data?.targetMessageId || data?.id;
      if (postId) {
        useChatStore.getState().deleteMessage(channelId, postId);
      }
    };

    channel.bind('new-post', handleNewPost);
    channel.bind('delete-post', handleDeletePost);
    channel.bind('post-deleted', handleDeletePost);
    channel.bind('reaction-updated', handleReaction);
    channel.bind('subscribers-updated', handleSubscribers);
    channel.bind('channel-updated', handleChannelUpdated);

    if (!ablyMessageUnsubscribes.current.has(channelId)) {
      const unsub = ablyService.subscribeToChatMessages(`public-channel-${channelId}`, (data: any) => {
        if (data?.type === 'channel-post' && data?.post) {
          handleNewPost(data.post);
        } else if (data?.type === 'delete-post' || data?.type === 'post-deleted' || data?.type === 'delete-message') {
          handleDeletePost(data);
        } else if (data?.type === 'reaction-updated') {
          handleReaction(data);
        } else if (data?.type === 'channel-updated') {
          handleChannelUpdated(data);
        } else if (data?.type === 'subscribers-updated' && typeof data?.subscribersCount === 'number') {
          useChatStore.getState().updateChat(channelId, { subscribersCount: data.subscribersCount });
        } else if (data?.id) {
          handleNewPost(data);
        }
      });
      ablyMessageUnsubscribes.current.set(channelId, unsub);
    }

    activeSubscriptions.current.set(channelId, {
      channel,
      handler: handleNewPost,
    });

    channelService.getChannel(channelId).then((info) => {
      if (info) {
        const current = useChatStore.getState().chats.find((c) => c.id === channelId);
        if (current?.updatedAt && info.updatedAt && current.updatedAt > info.updatedAt) {
          return;
        }
        const currentUserId = useAuthStore.getState().userId;
        const isCreator = Boolean(
          current?.isOwner ||
          current?.role === 'owner' ||
          (currentUserId && (
            (info.creatorId && info.creatorId === currentUserId) ||
            (current?.creatorId && current.creatorId === currentUserId) ||
            (current?.members?.some(m => m.userId === currentUserId && (m.role === 'owner' || m.role === 'admin')))
          ))
        );
        const updates: Partial<Chat> = {
          subscribersCount: info.subscribersCount,
          creatorId: info.creatorId || current?.creatorId,
          creatorNickname: info.creatorNickname || current?.creatorNickname,
        };
        if (isCreator) {
          updates.isOwner = true;
        }
        if (info.name) updates.name = info.name;
        if (info.description !== undefined) updates.description = info.description;
        updates.avatarUrl = info.avatarUrl || undefined;
        if (info.updatedAt) updates.updatedAt = info.updatedAt;
        useChatStore.getState().updateChat(channelId, updates);
      }
    }).catch(() => {});

    channelService.getChannelPosts(channelId).then((posts) => {
      if (posts) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[channelId] || [];
          const fetchedIds = new Set(posts.map((p) => p.id));
          const existingIds = new Set<string>();

          const validExisting = currentMsgs.filter((m) =>
            !m.id || fetchedIds.has(m.id) || m.isOutgoing || (Date.now() - (m.time || 0) < 60000)
          );

          const updatedExisting = validExisting.map((m) => {
            const fetched = posts.find(
              (p) =>
                p.id === m.id ||
                (m.isOutgoing &&
                  m.sender === p.sender &&
                  ((p.text && m.text === p.text) || (p.mediaUrl && m.mediaUrl === p.mediaUrl) || (p.mediaName && m.mediaName === p.mediaName)) &&
                  Math.abs(m.time - (p.time || 0)) < 60000)
            );
            if (fetched) {
              existingIds.add(fetched.id);
              return {
                ...m,
                id: fetched.id,
                text: fetched.text || m.text,
                time: fetched.time || m.time,
                reactions: fetched.reactions || m.reactions,
                status: 'read' as const,
              };
            }
            if (m.id) existingIds.add(m.id);
            return m;
          });
          const newItems: Message[] = [];
          const myUserId = useAuthStore.getState().userId;
          const targetChannel = state.chats.find((c) => c.id === channelId);
          const isOwnerById = Boolean(
            targetChannel?.type === 'channel' &&
            myUserId &&
            (targetChannel.creatorId === myUserId || (targetChannel.isOwner && (!targetChannel.creatorId || targetChannel.creatorId === myUserId)))
          );
          posts.forEach((post) => {
            if (!existingIds.has(post.id)) {
              if (isOwnerById && !post.senderId) {
                post.senderId = myUserId;
              }
              const isMine = Boolean(myUserId && post.senderId && post.senderId === myUserId);
              newItems.push({
                id: post.id,
                sender: post.sender,
                text: post.text,
                time: post.time,
                read: state.activeChatId === channelId,
                status: isMine ? 'read' : undefined,
                isOutgoing: isMine,
                mediaType: post.mediaType || undefined,
                mediaUrl: post.mediaUrl || undefined,
                mediaName: post.mediaName || undefined,
                mime: post.mime || undefined,
                duration: post.duration || undefined,
                width: post.width || undefined,
                height: post.height || undefined,
                waveform: post.waveform || undefined,
                audioMetadata: post.audioMetadata || undefined,
                linkPreview: post.linkPreview || undefined,
                reactions: post.reactions || undefined,
              });
            }
          });
          if (newItems.length === 0 && updatedExisting.length === currentMsgs.length && updatedExisting === currentMsgs) return state;
          const merged = [...updatedExisting, ...newItems].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
          const latest = merged[merged.length - 1];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [channelId]: merged,
            },
            chats: state.chats.map((c) =>
              c.id === channelId
                ? {
                    ...c,
                    lastMsg: latest ? (latest.text || (latest.mediaType ? `[${latest.mediaType}]` : c.lastMsg)) : 'История очищена',
                  }
                : c
            ),
          };
        });
      }
    }).catch(() => {});

    return channel;
  }, [addMessage, t]);


  return {
    subscribeToGroupChat,
    subscribeToPublicChannel,
  };
};
