import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore, type Message } from '../../../store/useChatStore';
import { useAuthStore, getInitialNumericId } from '../../../store/useAuthStore';
import { useToastStore } from '../../../store/useToastStore';
import { ablyService } from '../../../services/ablyService';
import { supabaseService } from '../../../services/supabaseService';
import { channelService, type ChannelPost } from '../../../services/channelService';
import { supportService } from '../../../services/supportService';
import { sqliteStorage } from '../../../services/sqliteStorage';
import { getPusher, getGroupPusher } from '../../../utils/pusher';
import { deriveChannelKey, decryptMessage, generateChatId, getDirectChatId, generateKeyPair } from '../../../lib/crypto';
import { isValidGroupCode, extractGroupCode } from '../../../lib/groupCrypto';
import { useDevicePermissionStore } from '../../../store/useDevicePermissionStore';
import { mergeReactions } from './chatWindowHelpers';

export interface UseChatChannelsAndCallsProps {
  activeChatId: string | null;
  activeChat: any;
  isChannelOwner: boolean;
  messages: Message[];
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  atBottomRef: React.MutableRefObject<boolean>;
  lastChatSwitchTimeRef: React.MutableRefObject<number>;
  setShowScrollDown: (v: boolean) => void;
  setHighlightedIndex: (idx: number | null) => void;
  setReplyingTo: React.Dispatch<React.SetStateAction<any>>;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<any>;
  setUnsafeLinkData: React.Dispatch<React.SetStateAction<{ isOpen: boolean; url: string }>>;
  myCode: string;
  myNickname: string;
  myUserId?: string;
  memberAvatars: Record<string, string>;
  voiceCallsEnabled: boolean;
  startCall: (chatId: string, type: 'audio' | 'video', nickname: string) => Promise<any>;
  showToast: (msg: string) => void;
  t: (key: string, defaultVal?: any) => string;
}

export interface UseChatChannelsAndCallsReturn {
  handleLinkClick: (url: string) => void;
  handleOpenDirectChat: (senderId?: string, senderName?: string, memberObj?: any) => void;
  handleAudioCallPress: () => Promise<void>;
  handleCallPress: () => Promise<void>;
  handleMediaGoToMessage: (msgId: string) => void;
  handleMediaForwardMessage: (msgId: string) => void;
  handleMediaDeleteMessage: (msgId: string) => void;
  isSubscribed: boolean;
  isSubscribing: boolean;
  handleSubscribeToChannel: () => Promise<void>;
  handleMessageButtonClick: (btn: { text: string; action: string; channelId?: string; url?: string; data?: string }) => void;
}

export const useChatChannelsAndCalls = ({
  activeChatId,
  activeChat,
  isChannelOwner,
  messages,
  messagesContainerRef,
  atBottomRef,
  lastChatSwitchTimeRef,
  setShowScrollDown,
  setHighlightedIndex,
  setReplyingTo,
  setInputText,
  inputRef,
  setUnsafeLinkData,
  myCode,
  myNickname,
  myUserId,
  memberAvatars,
  voiceCallsEnabled,
  startCall,
  showToast,
  t,
}: UseChatChannelsAndCallsProps): UseChatChannelsAndCallsReturn => {
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleLinkClick = useCallback((url: string) => {
    const cleanUrl = url.trim();
    if (cleanUrl.startsWith('@')) {
      const targetUsername = cleanUrl.replace(/^@+/, '').trim().toLowerCase();
      if (!targetUsername) return;

      const myUid = useAuthStore.getState().userId;
      const myUserCode = useChatStore.getState().myCode;
      const myUsername = useAuthStore.getState().username?.toLowerCase();

      if (targetUsername === myUsername || targetUsername === myUserCode?.toLowerCase() || targetUsername === myUid?.toLowerCase()) {
        useChatStore.getState().setActiveChat('notes');
        useChatStore.getState().setActiveProfileChatId('notes');
        return;
      }

      const currentChats = useChatStore.getState().chats;
      const existingChat = currentChats.find(
        (c) =>
          c.type === 'private' &&
          ((c.username && c.username.toLowerCase() === targetUsername) ||
            c.peerCode?.toLowerCase() === targetUsername ||
            c.originalPeerCode?.toLowerCase() === targetUsername)
      );

      if (existingChat) {
        useChatStore.getState().setActiveChat(existingChat.id);
        useChatStore.getState().setActiveProfileChatId(existingChat.id);
        return;
      }

      supabaseService.lookupProfileByUsername(targetUsername).then((user) => {
        if (!user) {
          useToastStore.getState().showToast(t('chatWindow.userNotFound'), 'text');
          return;
        }

        const currentList = useChatStore.getState().chats;
        const matched = currentList.find(
          (c) =>
            c.type === 'private' &&
            (c.peerCode === user.user_code ||
              c.originalPeerCode === user.user_code ||
              (user.numeric_id && c.numericId === user.numeric_id) ||
              (user.username && c.username && c.username.toLowerCase() === user.username.toLowerCase()))
        );

        if (matched) {
          useChatStore.getState().setActiveChat(matched.id);
          useChatStore.getState().setActiveProfileChatId(matched.id);
          return;
        }

        const brokenChat = currentList.find((c) => c.id === user.user_code);
        if (brokenChat) {
          useChatStore.getState().deleteChat(user.user_code);
        }

        const currentUid = useAuthStore.getState().userId;
        const newChatId = (currentUid && user.user_code && user.user_code.length === 36)
          ? getDirectChatId(currentUid, user.user_code)
          : generateChatId();
        const draftChat = {
          id: newChatId,
          type: 'private' as const,
          name: user.nickname || 'User',
          avatarUrl: user.avatar_url || undefined,
          bannerUrl: user.banner_url || undefined,
          username: user.username || undefined,
          numericId: user.numeric_id || getInitialNumericId(user.user_code),
          description: user.bio || undefined,
          birthday: user.birthday || undefined,
          peerCode: user.user_code,
          originalPeerCode: user.user_code,
          lastMsg: '',
          online: false,
          unreadCount: 0,
          createdAt: Date.now(),
          notificationsEnabled: true,
          isDraft: false,
          isChatInitiator: true,
          peerPublicKey: user.public_key || null,
        };

        useChatStore.getState().addChat(draftChat as any);
        useChatStore.getState().setActiveChat(newChatId);
        useChatStore.getState().setActiveProfileChatId(newChatId);
      }).catch(() => {
        useToastStore.getState().showToast(t('chatWindow.userNotFound'), 'text');
      });
      return;
    }
    const groupCode = extractGroupCode(cleanUrl);
    if (groupCode && isValidGroupCode(groupCode)) {
      window.dispatchEvent(new CustomEvent('orbita:deep-link', { detail: { url: cleanUrl } }));
      return;
    }
    const channelMatch = cleanUrl.match(/\/(?:c|channel)\/([A-Z0-9_-]{10,})/i);
    if (channelMatch && channelMatch[1]) {
      const chId = channelMatch[1];
      const existing = useChatStore.getState().chats.find((c) => c.id === chId);
      if (existing) {
        useChatStore.getState().setActiveChat(chId);
      } else {
        channelService.getChannel(chId).then((info) => {
          if (info) {
            useChatStore.getState().addChat({
              id: info.id,
              type: 'channel',
              name: info.name,
              description: info.description || '',
              lastMsg: '',
              online: false,
              creatorNickname: info.creatorNickname,
              creatorId: info.creatorId || undefined,
              avatarUrl: info.avatarUrl || undefined,
              subscribersCount: info.subscribersCount || 1,
              isOfficial: info.isOfficial,
              createdAt: info.createdAt || Date.now(),
              unreadCount: 0,
              lastReadTimestamp: Date.now(),
              muted: false,
              notificationsEnabled: true,
            });
            useChatStore.getState().setActiveChat(info.id);
          }
        });
      }
      return;
    }
    setUnsafeLinkData({ isOpen: true, url: cleanUrl });
  }, [t, setUnsafeLinkData]);

  const handleOpenDirectChat = useCallback((senderId?: string, senderName?: string, memberObj?: any) => {
    const chatStore = useChatStore.getState();
    const storeMyCode = chatStore.myCode;
    const myUid = useAuthStore.getState().userId;
    const myIds = [storeMyCode, myUid, useAuthStore.getState().userId].filter((x): x is string => typeof x === 'string' && x.length > 0);

    const resolvedMember = memberObj || (senderId ? activeChat?.members?.find((m: any) =>
      m.userId === senderId ||
      m.userCode === senderId ||
      (m as any).user_id === senderId ||
      (m as any).user_code === senderId
    ) : null);

    const candidateCodes = new Set<string>();
    if (resolvedMember?.userCode) candidateCodes.add(resolvedMember.userCode);
    if ((resolvedMember as any)?.user_code) candidateCodes.add((resolvedMember as any).user_code);
    if (resolvedMember?.userId) candidateCodes.add(resolvedMember.userId);
    if ((resolvedMember as any)?.user_id) candidateCodes.add((resolvedMember as any).user_id);
    const targetAvatar = resolvedMember?.avatarUrl || (resolvedMember as any)?.avatar_url || (senderId ? memberAvatars[senderId] : null) || null;

    myIds.forEach((myId) => candidateCodes.delete(myId));
    if (candidateCodes.size === 0) return;

    for (const code of Array.from(candidateCodes)) {
      for (const c of chatStore.chats) {
        if (c.members) {
          const mb = c.members.find((m: any) => m.userId === code || m.userCode === code || (m as any).user_code === code || (m as any).user_id === code);
          if (mb?.userCode) candidateCodes.add(mb.userCode);
          if ((mb as any)?.user_code) candidateCodes.add((mb as any).user_code);
          if (mb?.userId) candidateCodes.add(mb.userId);
        }
        if (c.type === 'private' && c.id !== 'notes') {
          if (
            (c.peerCode && candidateCodes.has(c.peerCode)) ||
            (c.originalPeerCode && candidateCodes.has(c.originalPeerCode)) ||
            ((c as any).userId && candidateCodes.has((c as any).userId)) ||
            (targetAvatar && c.avatarUrl && c.avatarUrl === targetAvatar)
          ) {
            if (c.peerCode) candidateCodes.add(c.peerCode);
            if (c.originalPeerCode) candidateCodes.add(c.originalPeerCode);
            if ((c as any).userId) candidateCodes.add((c as any).userId);
          }
        }
      }
      for (const u of Object.values(chatStore.usersById || {})) {
        if (u.id === code || (u as any).userId === code || (u as any).userCode === code || (u as any).user_code === code) {
          if (u.id) candidateCodes.add(u.id);
          if ((u as any).userCode) candidateCodes.add((u as any).userCode);
          if ((u as any).userId) candidateCodes.add((u as any).userId);
        }
      }
    }
    myIds.forEach((myId) => candidateCodes.delete(myId));

    const candidateArray = Array.from(candidateCodes);
    const target36 = candidateArray.find((c) => c.length === 36);
    const targetCode = target36 || candidateArray.find((c) => c.length !== 64) || candidateArray[0];
    if (!targetCode) return;

    const directChatIds = new Set<string>();
    for (const mId of myIds) {
      for (const cCode of candidateArray) {
        directChatIds.add(getDirectChatId(mId, cCode));
      }
    }

    const matchingChats = chatStore.chats.filter(
      (c) =>
        c.type === 'private' &&
        c.id !== 'notes' &&
        (directChatIds.has(c.id) ||
          (c.peerCode && candidateCodes.has(c.peerCode)) ||
          (c.originalPeerCode && candidateCodes.has(c.originalPeerCode)) ||
          ((c as any).userId && candidateCodes.has((c as any).userId)) ||
          (targetAvatar && c.avatarUrl && c.avatarUrl === targetAvatar))
    );
    const existing = matchingChats.find((c) => c.peerCode && c.peerCode.length === 36) || matchingChats[0];

    if (existing) {
      matchingChats.forEach((c) => {
        if (c.id !== existing.id && c.peerCode && c.peerCode.length === 64) {
          chatStore.deleteChat(c.id);
        }
      });
      chatStore.setActiveChat(existing.id);
    } else {
      const myKeys = generateKeyPair();
      const preferredMyId = myIds.find((id) => id.length === 36) || myIds[0];
      const newChatId = (preferredMyId && targetCode) ? getDirectChatId(preferredMyId, targetCode) : generateChatId();
      const targetName = resolvedMember?.nickname || senderName || 'User';
      const targetAv = resolvedMember?.avatarUrl || (resolvedMember as any)?.avatar_url || memberAvatars[targetCode] || null;
      chatStore.addChat({
        id: newChatId,
        type: 'private',
        name: targetName,
        lastMsg: '',
        online: false,
        isChatInitiator: true,
        sharedSecret: myKeys.privateKey,
        avatarUrl: targetAv || undefined,
        peerCode: targetCode,
        originalPeerCode: targetCode,
      });
      chatStore.setActiveChat(newChatId);
    }
  }, [activeChat?.members, memberAvatars]);

  const handleAudioCallPress = useCallback(async () => {
    if (!activeChatId) return;
    if (activeChatId === 'notes') {
      showToast(t('chatWindow.calls_not_available'));
      return;
    }
    if (!voiceCallsEnabled) {
      showToast(t('settings.voice_calls_disabled'));
      return;
    }
    const micGranted = await useDevicePermissionStore.getState().requestPermission('microphone');
    if (!micGranted) return;
    startCall(activeChatId, 'audio', myNickname).catch((err) => {
      console.error('[Call] Error starting call:', err);
      showToast(t('call.connection_error'));
    });
  }, [activeChatId, myNickname, startCall, t, showToast, voiceCallsEnabled]);

  const handleCallPress = handleAudioCallPress;

  const handleMediaGoToMessage = useCallback((msgId: string) => {
    const el = document.querySelector(`[data-message-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx !== -1) {
        setHighlightedIndex(idx);
        setTimeout(() => setHighlightedIndex(null), 2000);
      }
    }
  }, [messages, setHighlightedIndex]);

  const handleMediaForwardMessage = useCallback((msgId: string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const msg = messages.find((m) => m.id === msgId);
    if (msg) {
      setReplyingTo({
        id: msg.id,
        index: messages.indexOf(msg),
        sender: msg.sender,
        text: msg.text,
        time: msg.time,
      });
    }
  }, [activeChat?.type, isChannelOwner, messages, setReplyingTo]);

  const handleMediaDeleteMessage = useCallback((msgId: string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    if (activeChatId) {
      useChatStore.getState().deleteMessage(activeChatId, msgId);
      const payload = {
        sender: myNickname,
        text: '',
        type: 'delete-message',
        targetMessageId: msgId,
      };
      ablyService.sendMessage(activeChatId, payload).catch(() => {});
      const isGroup = activeChat?.type === 'group';
      const pusher = isGroup ? getGroupPusher() : getPusher();
      const channel = pusher.subscribe(
        activeChat?.type === 'channel'
          ? `public-channel-${activeChatId}`
          : isGroup
          ? `presence-group-${activeChatId}`
          : `private-chat-${activeChatId}`
      );
      const send = () => {
        try {
          channel.trigger('client-message', payload);
        } catch {}
      };
      if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
      if (activeChat?.type === 'channel') {
        channelService.deletePost(activeChatId, msgId, myUserId);
      } else {
        const recipientTargets = Array.from(new Set([
          activeChat?.peerCode,
          activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
        ].filter((x): x is string => Boolean(x && x !== myCode && x !== myUserId))));
        for (const rId of recipientTargets) {
          supabaseService.deleteMessage(activeChatId, msgId, rId, myCode).catch(() => {});
        }
      }
    }
  }, [activeChat?.type, activeChat?.peerCode, activeChat?.name, activeChatId, isChannelOwner, myCode, myNickname, myUserId]);

  useEffect(() => {
    const handleAction = (action: any) => {
      if (!action) return;
      if (action.chatId && action.chatId !== activeChatId) return;
      if (action.type === 'GOTO_MESSAGE' && action.messageId) {
        handleMediaGoToMessage(action.messageId);
      } else if (action.type === 'FORWARD_MESSAGE' && action.messageId) {
        handleMediaForwardMessage(action.messageId);
      } else if (action.type === 'DELETE_MESSAGE' && action.messageId) {
        handleMediaDeleteMessage(action.messageId);
      } else if (action.type === 'OPEN_ALL_MEDIA') {
        const targetChat = action.chatId || activeChatId;
        if (targetChat) {
          useChatStore.getState().setActiveProfileChatId(targetChat);
        }
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('orbita-media-action-channel');
      bc.onmessage = (e) => handleAction(e.data);
    } catch {}

    const orbita = (window as any).orbita;
    const unsub = orbita?.onMediaAction?.((action: any) => handleAction(action));

    return () => {
      bc?.close();
      unsub?.();
    };
  }, [activeChatId, handleMediaGoToMessage, handleMediaForwardMessage, handleMediaDeleteMessage]);

  const isSubscribed = useMemo(() => {
    if (activeChat?.type !== 'channel') return true;
    if (isChannelOwner) return true;
    return activeChat?.isSubscribed !== false;
  }, [activeChat?.type, activeChat?.isSubscribed, isChannelOwner]);

  const handleSubscribeToChannel = useCallback(async () => {
    if (!activeChatId || isSubscribing) return;
    setIsSubscribing(true);
    try {
      const newCount = await channelService.joinChannel(activeChatId, myNickname || 'User');
      const currentCount = activeChat?.subscribersCount || 1;
      const finalCount = typeof newCount === 'number' ? newCount : currentCount + 1;
      useChatStore.getState().updateChat(activeChatId, {
        isSubscribed: true,
        subscribersCount: finalCount,
      });
      try {
        ablyService.sendMessage(`public-channel-${activeChatId}`, {
          type: 'subscribers-updated',
          channelId: activeChatId,
          subscribersCount: finalCount,
          action: 'join',
          nickname: myNickname,
        }).catch(() => {});
      } catch {}
    } catch {} finally {
      setIsSubscribing(false);
    }
  }, [activeChatId, isSubscribing, myNickname, activeChat?.subscribersCount]);

  useEffect(() => {
    if (!activeChatId) return;
    const currentChat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
    if (currentChat?.type !== 'channel') return;

    (async () => {
      try {
        const cachedStr = await sqliteStorage.get(`orbita_channel_posts_${activeChatId}`);
        if (cachedStr) {
          const cachedPosts: ChannelPost[] = JSON.parse(cachedStr);
          if (Array.isArray(cachedPosts) && cachedPosts.length > 0) {
            const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId];
            if (!currentMsgs || currentMsgs.length === 0) {
              const myNick = myNickname;
              useChatStore.setState((state) => ({
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: cachedPosts.map((post) => {
                    const isMine = (myUserId && post.senderId) ? post.senderId === myUserId : (myNick ? post.sender === myNick : false);
                    return {
                      id: post.id,
                      sender: post.sender,
                      senderId: post.senderId,
                      text: post.text,
                      time: post.time,
                      read: true,
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
                      reactions: (post.reactions && Object.keys(post.reactions).length > 0) ? post.reactions : undefined,
                    };
                  }),
                },
              }));
            }
          }
        }
      } catch {}
    })();

    const targetChannelId = activeChatId;
    channelService.getChannelPosts(targetChannelId).then((posts) => {
      if (posts) {
        useChatStore.setState((state) => {
          if (useChatStore.getState().activeChatId !== targetChannelId) return state;
          const currentMsgs = state.messagesByChatId[targetChannelId] || [];
          const fetchedIds = new Set(posts.map((p) => p.id));
          const existingIds = new Set<string>();
          const isOwnerOfActiveChannel = activeChat?.type === 'channel' && Boolean(
            (myUserId && activeChat.creatorId === myUserId) ||
            (activeChat.isOwner && (!activeChat.creatorId || (myUserId && activeChat.creatorId === myUserId)))
          );

          const validExisting = currentMsgs.filter((m) =>
            !m.id || fetchedIds.has(m.id) || m.isOutgoing || (Date.now() - (m.time || 0) < 60000)
          );

          const updatedExisting = validExisting.map((m) => {
            const fetched = posts.find(
              (p) =>
                p.id === m.id ||
                (m.isOutgoing &&
                  ((m.senderId && p.senderId && m.senderId === p.senderId) ||
                    (myUserId && m.senderId === myUserId && !p.senderId)) &&
                  ((p.text && m.text === p.text) || (p.mediaUrl && m.mediaUrl === p.mediaUrl) || (p.mediaName && m.mediaName === p.mediaName)) &&
                  Math.abs(m.time - (p.time || 0)) < 60000)
            );
            if (fetched) {
              existingIds.add(fetched.id);
              const effectiveSenderId = fetched.senderId || (isOwnerOfActiveChannel && myUserId ? myUserId : m.senderId);
              const isMine = Boolean(
                myUserId && effectiveSenderId && effectiveSenderId === myUserId
              );
              return {
                ...m,
                id: fetched.id,
                senderId: effectiveSenderId,
                text: fetched.text || m.text,
                time: fetched.time || m.time,
                reactions: mergeReactions(m.reactions, fetched.reactions),
                isOutgoing: isMine,
                status: isMine ? ('read' as const) : m.status,
              };
            }
            if (m.id) existingIds.add(m.id);
            return m;
          });

          const newItems: Message[] = [];
          posts.forEach((post) => {
            if (!existingIds.has(post.id)) {
              const effectiveSenderId = post.senderId || (isOwnerOfActiveChannel && myUserId ? myUserId : undefined);
              const isMine = Boolean(
                myUserId && effectiveSenderId && effectiveSenderId === myUserId
              );
              const safeTime = (typeof post.time === 'number' && !isNaN(post.time) && post.time > 0) ? post.time : Date.now();
              newItems.push({
                id: post.id,
                sender: post.sender,
                senderId: effectiveSenderId,
                text: post.text,
                time: safeTime,
                read: true,
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
                reactions: (post.reactions && Object.keys(post.reactions).length > 0) ? post.reactions : undefined,
              });
            }
          });

          const merged = [...updatedExisting, ...newItems].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
          const staleOptimistics = (state.messagesByChatId[targetChannelId] || []).filter(
            (m) => m.status === 'sending' && m.id != null && !fetchedIds.has(m.id) && (Date.now() - (m.time || 0)) > 120000
          );
          staleOptimistics.forEach((m) => {
            try {
              (window as any).orbita?.storageDeleteMessage?.(m.id).catch(() => {});
            } catch {}
          });
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetChannelId]: merged,
            },
          };
        });
        requestAnimationFrame(() => {
          const el = messagesContainerRef.current;
          if (el && (atBottomRef.current || (performance.now() - lastChatSwitchTimeRef.current < 1500))) {
            el.scrollTop = el.scrollHeight;
            atBottomRef.current = true;
            setShowScrollDown(false);
          }
        });
      }
    });
  }, [activeChatId, activeChat?.type, activeChat?.creatorId, activeChat?.isOwner, myNickname, myUserId, messagesContainerRef, atBottomRef, lastChatSwitchTimeRef, setShowScrollDown]);

  useEffect(() => {
    if (activeChat?.type === 'channel' && myUserId) {
      if (!activeChat.creatorId && (activeChat.isOwner || activeChat.role === 'owner')) {
        useChatStore.getState().updateChat(activeChat.id, { creatorId: myUserId, isOwner: true });
        channelService.updateChannelCreatorId(activeChat.id, myUserId).catch(() => {});
      } else if (!activeChat.isOwner && isChannelOwner) {
        useChatStore.getState().updateChat(activeChat.id, { isOwner: true });
      }
    }
  }, [activeChat?.id, activeChat?.type, activeChat?.creatorId, activeChat?.isOwner, activeChat?.role, isChannelOwner, myUserId]);

  useEffect(() => {
    if (activeChat?.type !== 'channel' || !activeChatId) return;
    const encryptedMsgs = messages.filter((m) => m.text?.startsWith('orb_e2e:'));
    if (encryptedMsgs.length === 0) return;

    const channelKey = deriveChannelKey(activeChatId);
    Promise.all(
      encryptedMsgs.map(async (m) => {
        const plain = await decryptMessage(m.text.slice(8), channelKey);
        return {
          id: m.id,
          text: plain && plain !== '[ENCRYPTED MESSAGE]' ? plain : m.text,
        };
      })
    ).then((decryptedList) => {
      const decMap = new Map(decryptedList.map((d) => [d.id, d.text]));
      useChatStore.setState((state) => {
        const list = state.messagesByChatId[activeChatId] || [];
        let hasChanges = false;
        const updated = list.map((m) => {
          if (decMap.has(m.id)) {
            const newText = decMap.get(m.id)!;
            if (newText !== m.text) {
              hasChanges = true;
              return { ...m, text: newText };
            }
          }
          return m;
        });
        if (!hasChanges) return state;
        return {
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        };
      });
    });
  }, [activeChatId, activeChat?.type, messages]);

  const handleMessageButtonClick = useCallback((btn: { text: string; action: string; channelId?: string; url?: string; data?: string }) => {
    if (btn.action === 'open_channel' && btn.channelId) {
      const channelId = btn.channelId.trim();
      const existing = useChatStore.getState().chats.find((c) => c.id === channelId);
      if (existing) {
        useChatStore.getState().setActiveChat(channelId);
      } else {
        channelService.getChannel(channelId).then((info) => {
          if (info) {
            useChatStore.getState().addChannelChat({
              id: info.id,
              name: info.name,
              description: info.description,
              avatarUrl: info.avatarUrl,
              creatorNickname: info.creatorNickname,
              subscribersCount: info.subscribersCount,
              isOfficial: info.isOfficial,
              isOwner: false,
              isSubscribed: false,
            });
            useChatStore.getState().setActiveChat(channelId);
          } else {
            useChatStore.getState().setActiveChat(channelId);
          }
        }).catch(() => {
          useChatStore.getState().setActiveChat(channelId);
        });
      }
      return;
    }

    if (btn.action === 'open_backup') {
      useChatStore.getState().openSettings('backup');
      return;
    }

    if (btn.action === 'send_command') {
      return;
    }

    if (btn.action === 'reply_ticket' && btn.data) {
      setInputText(`/reply ${btn.data} `);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return;
    }

    if (btn.action === 'close_ticket' && btn.data) {
      supportService.closeTicket(btn.data);
      return;
    }

    if (btn.action === 'open_url' && btn.url) {
      window.open(btn.url, '_blank', 'noopener,noreferrer');
      return;
    }
  }, [setInputText, inputRef]);

  return {
    handleLinkClick,
    handleOpenDirectChat,
    handleAudioCallPress,
    handleCallPress,
    handleMediaGoToMessage,
    handleMediaForwardMessage,
    handleMediaDeleteMessage,
    isSubscribed,
    isSubscribing,
    handleSubscribeToChannel,
    handleMessageButtonClick,
  };
};
