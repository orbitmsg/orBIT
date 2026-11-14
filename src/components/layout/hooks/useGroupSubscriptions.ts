import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, isMessageOutgoing, type Chat, type Message } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { getGroupPusher, CLIENT_SESSION_ID } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { groupService } from '../../../services/groupService';
import { supabaseService } from '../../../services/supabaseService';
import { decryptMessage } from '../../../lib/crypto';
import { deriveGroupKey, isValidGroupCode } from '../../../lib/groupCrypto';

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
    if (!chatId || chatId.startsWith('lobby_')) return null;
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
            text: `${actor || 'Участник'} закрепил(а) сообщение`,
            time: data.pinData?.pinnedAt || Date.now(),
            status: 'sent',
            mediaType: 'system',
            systemType: 'pin',
            actorNickname: actor,
          };
          addMessage(chatId, sysMsg);
          try {
            (window as any).orbita?.storageAddMessage?.(chatId, sysMsg.id, sysMsg);
          } catch {}
        }
        return;
      }
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
      if (data.type === 'kick' || data.systemType === 'kick') {
        const targetNick = data.targetNickname || data.target || (data.systemType === 'kick' ? data.targetNickname : null);
        const targetUId = data.targetUserId || data.targetId;
        const targetUCode = data.targetUserCode || data.targetId;

        const isTarget = (member: any) => {
          const mCodes = [member.userId, member.userCode, member.user_id, member.user_code].filter(Boolean);
          if (targetUId && mCodes.includes(targetUId)) return true;
          if (targetUCode && mCodes.includes(targetUCode)) return true;
          return Boolean(targetNick && member.nickname === targetNick);
        };

        const updatedMembers = (chat.members || []).filter((member: any) => !isTarget(member)) as any;
        updateChat(chatId, { members: updatedMembers, membersCount: Math.max(1, updatedMembers.length) });

        const myUid = useAuthStore.getState().userId;
        const myC = useChatStore.getState().myCode;
        const myNick = useAuthStore.getState().nickname || nickname;

        const isMeKicked = Boolean(
          (targetUId && (targetUId === myUid || targetUId === myC)) ||
          (targetUCode && (targetUCode === myUid || targetUCode === myC)) ||
          (targetNick && targetNick === myNick)
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
          return;
        }
        if (data.type === 'kick' || data.type === 'client-kick') {
          return;
        }
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

        const sysType = parsedData?.systemType || data.systemType;
        if (sysType === 'call' || sysType === 'call_ended') {
          if (sysType === 'call_ended') {
            useChatStore.getState().updateChat(chatId, { activeCallRoom: null });
          }
          return;
        }

        addMessage(chatId, msgPayload);

        if (parsedData?.mediaType === 'system' || data.mediaType === 'system') {
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
    channel.bind('kick', (d: any) => handleMessage({ ...d, type: 'kick' }));
    channel.bind('client-kick', (d: any) => handleMessage({ ...d, type: 'kick' }));
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
    const handleMemberLeft = (data: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === chatId);
      const isTarget = (m: any) => {
        const mCodes = [m.userId, m.userCode, m.user_id, m.user_code].filter(Boolean);
        if (data?.userId && mCodes.includes(data.userId)) return true;
        if (data?.userCode && mCodes.includes(data.userCode)) return true;
        if (data?.user_id && mCodes.includes(data.user_id)) return true;
        if (data?.user_code && mCodes.includes(data.user_code)) return true;
        if (data?.nickname && m.nickname === data.nickname) return true;
        return false;
      };
      const updated = (current?.members || []).filter((m: any) => !isTarget(m));
      useChatStore.getState().updateChat(chatId, { members: updated, membersCount: Math.max(1, updated.length) });
    };
    channel.bind('member-left', handleMemberLeft);
    channel.bind('client-member-left', handleMemberLeft);
    channel.bind('group-updated', (data: any) => {
      const updates: any = {};
      if (data?.name) updates.name = data.name;
      if (data?.description !== undefined) updates.description = data.description;
      if (data?.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
      if (data?.inviteActive !== undefined) updates.inviteActive = data.inviteActive;
      if (data?.inviteExpiresAt !== undefined) updates.inviteExpiresAt = data.inviteExpiresAt;
      useChatStore.getState().updateChat(chatId, updates);
    });
    const handleGroupDeleted = () => {
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
    };
    channel.bind('group-deleted', handleGroupDeleted);
    channel.bind('client-group-deleted', handleGroupDeleted);
    const handleRoleUpdated = (data: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === chatId);
      const isTarget = (m: any) => {
        const mCodes = [m.userId, m.userCode, m.user_id, m.user_code].filter(Boolean);
        if (data?.targetUserId && mCodes.includes(data.targetUserId)) return true;
        if (data?.targetUserCode && mCodes.includes(data.targetUserCode)) return true;
        if (data?.target_user_id && mCodes.includes(data.target_user_id)) return true;
        if (data?.target_user_code && mCodes.includes(data.target_user_code)) return true;
        if (data?.targetNickname && m.nickname === data.targetNickname) return true;
        return false;
      };
      const updated = (current?.members || []).map((m: any) =>
        isTarget(m) ? { ...m, role: data.role } : m
      );
      useChatStore.getState().updateChat(chatId, { members: updated });
    };
    channel.bind('member-role-updated', handleRoleUpdated);
    channel.bind('client-member-role-updated', handleRoleUpdated);
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
    void channelId;
    return null;
  }, []);

  return {
    subscribeToGroupChat,
    subscribeToPublicChannel,
  };
};
