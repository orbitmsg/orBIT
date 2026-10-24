import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeId, DEFAULT_CHAT_COLOR, applyThemeToRoot } from '../theme';
import { generateChatId as genChatId } from '../lib/crypto';
import { mediaManager } from '../services/mediaManager';
import { supabaseService } from '../services/supabaseService';
import { sqliteStorage } from '../services/sqliteStorage';

import {
  RotationSpeed,
  FontFamily,
  FONT_MAP,
  Language,
  HeaderTitleOption,
  NotificationPosition,
  NotificationPreviewTheme,
  IconOption,
  ChatAction,
  ChatTypingUser,
  MediaItem,
  AudioMetadata,
  LinkPreviewData,
  ForwardedFrom,
  ChatFolder,
  Message,
  ChatMember,
  UserProfile,
  isMessageOutgoing,
  Chat,
  IncomingFriendRequest,
  ActiveProxyInfo,
  InChatSearchState,
  TEXT_SCALE_MIN,
  TEXT_SCALE_MAX,
  MAX_MESSAGES_PER_CHAT,
  clampTextScale,
  ChatState,
} from './chat/types';
import { flushStorageSet, setHydratedChecker, pickBestRatchetState } from './chat/storage';
import { chatStorePersistConfig } from './chat/persistConfig';

export type {
  RotationSpeed,
  FontFamily,
  Language,
  HeaderTitleOption,
  NotificationPosition,
  NotificationPreviewTheme,
  IconOption,
  ChatAction,
  ChatTypingUser,
  MediaItem,
  AudioMetadata,
  LinkPreviewData,
  ForwardedFrom,
  ChatFolder,
  Message,
  ChatMember,
  UserProfile,
  Chat,
  IncomingFriendRequest,
  ActiveProxyInfo,
  InChatSearchState,
  ChatState,
};
export {
  FONT_MAP,
  isMessageOutgoing,
  TEXT_SCALE_MIN,
  TEXT_SCALE_MAX,
  MAX_MESSAGES_PER_CHAT,
  clampTextScale,
  flushStorageSet,
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      usersById: {},
      setUserProfile: (userId, profile) =>
        set((state) => {
          if (!userId) return state;
          const current = state.usersById[userId] || { id: userId, nickname: '' };
          return {
            usersById: {
              ...state.usersById,
              [userId]: {
                ...current,
                ...profile,
                nickname: profile.nickname ?? current.nickname,
                updatedAt: Date.now(),
              },
            },
          };
        }),
      getUserProfile: (userId) => get().usersById[userId],
      chats: [],
      pinnedChatIds: [],
      deletedChatIds: [],
      deletedChatSessions: {},
      folders: [],
      activeFolderId: null,
      createFolder: (name: string, chatIds: string[]) => {
        const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const newFolder: ChatFolder = { id, name: name.trim(), chatIds };
        set((state) => ({ folders: [...(state.folders || []), newFolder] }));
        return id;
      },
      updateFolder: (id: string, name: string, chatIds: string[]) =>
        set((state) => ({
          folders: (state.folders || []).map((f) => (f.id === id ? { ...f, name: name.trim(), chatIds } : f)),
        })),
      deleteFolder: (id: string) =>
        set((state) => ({
          folders: (state.folders || []).filter((f) => f.id !== id),
          activeFolderId: state.activeFolderId === id ? null : state.activeFolderId,
        })),
      setActiveFolderId: (id: string | null) => set({ activeFolderId: id }),
      activeChatId: null,
      activeProfileChatId: null,
      messagesByChatId: {},
      passcode: null,
      currentTheme: 'system',
      chatColor: DEFAULT_CHAT_COLOR,
      currentView: 'chats',
      dotOverlay: true,
      blurProtection: false,
      hideOnBackground: false,
      hideFromScreenCapture: false,
      proxyActive: false,
      activeProxyInfo: null,
      myCode: '',
      codeRotationSpeed: 0,
      nextCodeRotationTime: Infinity,
      messageTTLSeconds: 0,
      incomingFriendRequests: [],
      addIncomingFriendRequest: (req) =>
        set((state) => {
          if (state.incomingFriendRequests.some((r) => r.id === req.id || r.chatId === req.chatId)) {
            return state;
          }
          return { incomingFriendRequests: [req, ...state.incomingFriendRequests] };
        }),
      removeIncomingFriendRequest: (id) =>
        set((state) => ({
          incomingFriendRequests: state.incomingFriendRequests.filter((r) => r.id !== id && r.chatId !== id),
        })),
      clearIncomingFriendRequests: () => set({ incomingFriendRequests: [] }),
      eyeCareEnabled: false,
      eyeCareOpacity: 0.22,
      eyeCareDensity: 5,
      screenCaptureProtection: false,
      minimizeToTray: false,
      isHandshaking: false,
      fontFamily: 'system',
      textScale: 100,
      dotColor: '#22c55e',
      language: null,
      headerEnabled: true,
      headerTitle: 'orbita',
      ringEnabled: true,
      notificationCount: 3,
      notificationPosition: 'bottom-right',
      notificationHideContent: false,
      notificationPreviewTheme: 'dark',
      bubbleRadius: 16,
      notificationSoundEnabled: true,
      notificationsEnabled: true,
      notificationFlashTaskbar: true,
      notificationVolume: 100,
      notificationShowName: true,
      notificationShowText: true,
      notificationNativeWindows: false,
      notificationRespectFocus: false,
      appIcon: 'orbita1',
      notificationIcon: 'orbita1',

      voiceCallsEnabled: true,
      readReceiptsEnabled: true,
      typingIndicatorsEnabled: true,
      typingByChatId: {},
      linkPreviewsEnabled: true,
      _hasHydrated: false,

      recentEmojis: [],

      isEmojiPanelOpen: false,
      toggleEmojiPanel: () => set((state) => ({ isEmojiPanelOpen: !state.isEmojiPanelOpen })),
      setEmojiPanelOpen: (open) => set({ isEmojiPanelOpen: open }),

      isMediaViewerOpen: false,
      setMediaViewerOpen: (open) => set({ isMediaViewerOpen: open }),

      isRecordingVoice: false,
      setIsRecordingVoice: (recording) => set({ isRecordingVoice: recording }),

      isUploadingMedia: false,
      setIsUploadingMedia: (uploading) => set({ isUploadingMedia: uploading }),

      autoUpdate: true,
      downloadedUpdateVersion: null,
      isUpdateBannerDismissed: false,
      showInSystemTray: true,
      autoLaunch: false,
      sendOnEnter: true,
      useImprovedPlayer: false,
      noiseSuppression: true,
      noiseSuppressionMode: 'standard',
      noiseSuppressionVoice: true,
      noiseSuppressionCalls: true,

      callSoundsEnabled: true,
      alwaysRelayCalls: true,
      selectedCameraId: '',
      selectedMicrophoneId: '',
      selectedSpeakerId: '',
      screenProtectionEnabled: false,
      hideMenuBar: false,

      cacheSizeLimit: 5 * 1024 * 1024 * 1024,
      mediaCacheLimit: 2.5 * 1024 * 1024 * 1024,
      cacheCleanupAge: 7 * 24 * 60 * 60 * 1000,

      autoLoadMedia: true,
      autoLoadPhotos: true,
      autoLoadVideos: true,
      autoLoadAudio: true,
      autoLoadFiles: false,
      autoLoadMaxPhotoSizeMb: 5,
      autoLoadMaxVideoSizeMb: 15,
      autoLoadMaxAudioSizeMb: 10,
      autoLoadMaxFileSizeMb: 10,

      stickersAutoplayPanel: true,
      stickersAutoplayChat: true,
      chatAutoPlayVideos: true,
      callAnimationsEnabled: true,

      draftsByChatId: {},
      setDraft: (chatId, text) =>
        set((state) => ({
          draftsByChatId: {
            ...state.draftsByChatId,
            [chatId]: text,
          },
        })),
      clearDraft: (chatId) =>
        set((state) => {
          const next = { ...state.draftsByChatId };
          delete next[chatId];
          return { draftsByChatId: next };
        }),

      inChatSearch: { isOpen: false, scope: 'this_chat', query: '', jumpTarget: null },
      openInChatSearch: (scope = 'this_chat') => set((state) => ({ inChatSearch: { ...state.inChatSearch, isOpen: true, scope } })),
      closeInChatSearch: () => set((state) => ({ inChatSearch: { ...state.inChatSearch, isOpen: false, query: '' } })),
      setInChatSearchScope: (scope) => set((state) => ({ inChatSearch: { ...state.inChatSearch, scope } })),
      setInChatSearchQuery: (query) => set((state) => ({ inChatSearch: { ...state.inChatSearch, query } })),
      jumpToChatMessage: (chatId, messageIndex, messageId) => {
        const currentActive = get().activeChatId;
        if (currentActive !== chatId) get().setActiveChat(chatId);
        set((state) => ({ inChatSearch: { ...state.inChatSearch, jumpTarget: { chatId, messageIndex, messageId, timestamp: Date.now() } } }));
      },

      setMyCode: (code) => {
        set({ myCode: code });
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => m.useAccountStore.getState().syncCurrentAccountMeta()).catch(() => {});
        }
      },
      setCodeRotationSpeed: (speed) => set({ codeRotationSpeed: speed }),
      setNextCodeRotationTime: (time) => set({ nextCodeRotationTime: time }),
      setActiveChat: (id) => {
        const state = get();
        const previousActiveId = state.activeChatId;
        if (previousActiveId === id) return;

        let nextChats = state.chats;
        let chatsChanged = false;

        if (previousActiveId) {
          const prevChat = nextChats.find(c => c.id === previousActiveId);
          if (prevChat && prevChat.type === 'channel' && !prevChat.isOwner && prevChat.isSubscribed === false) {
            nextChats = nextChats.filter(c => c.id !== previousActiveId);
            chatsChanged = true;
          }
          if (prevChat && prevChat.isDraft) {
            const msgs = state.messagesByChatId[previousActiveId] || [];
            if (msgs.length === 0 && !prevChat.peerCode) {
              nextChats = nextChats.filter(c => c.id !== previousActiveId);
              chatsChanged = true;
            }
          }
        }

        if (id) {
          const chat = nextChats.find(c => c.id === id);
          if (chat) {
            const msgs = state.messagesByChatId[id] || [];
            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            nextChats = nextChats.map(c =>
              c.id === id ? {
                ...c,
                unreadCount: 0,
                lastReadTimestamp: Date.now(),
                lastReadMessageId: lastMsg?.id || c.lastReadMessageId,
              } : c
            );
            chatsChanged = true;
          }
        }

        if (chatsChanged) {
          set({ activeChatId: id, chats: nextChats });
        } else {
          set({ activeChatId: id });
        }
      },
      setActiveProfileChatId: (id) => set({ activeProfileChatId: id }),
      addChat: (newChat) => {
        console.log('[ChatStore] addChat called with:', newChat.id, newChat.name);
        const chatEntry: Chat = {
          id: newChat.id || genChatId(),
          type: newChat.type || 'private',
          name: newChat.name || 'Unknown',
          lastMsg: newChat.lastMsg || 'E2EE_SECURE_CHANNEL_READY',
          online: newChat.online ?? false,
          sharedSecret: newChat.sharedSecret,
          ratchetState: newChat.ratchetState,
          pinnedMessage: newChat.pinnedMessage || null,
          role: newChat.role || 'member',
          lastSeen: newChat.lastSeen,
          members: newChat.members || [],
          inviteCode: newChat.inviteCode,
          inviteCodeTTL: newChat.inviteCodeTTL,
          createdAt: newChat.createdAt || Date.now(),
          unreadCount: newChat.unreadCount || 0,
          lastReadTimestamp: newChat.lastReadTimestamp || Date.now(),
          isChatInitiator: newChat.isChatInitiator ?? false,
          avatarUrl: newChat.avatarUrl,
          muted: newChat.muted ?? false,
          notificationsEnabled: newChat.notificationsEnabled ?? true,
          peerCode: (newChat.peerCode && newChat.peerCode !== get().myCode) ? newChat.peerCode : undefined,
          description: newChat.description,
          username: newChat.username,
          numericId: newChat.numericId,
          birthday: newChat.birthday,
          isDraft: newChat.isDraft ?? false,
          peerPublicKey: newChat.peerPublicKey || null,
        };
        set((state) => {
          if (chatEntry.type === 'group' && state.deletedChatIds?.includes(chatEntry.id) && !(newChat as any).isExplicitJoin) {
            return state;
          }
          if (chatEntry.type === 'private' && chatEntry.peerCode && chatEntry.peerCode.length === 64) {
            const hasRealChat = state.chats.some(
              (c) => c.type === 'private' && c.id !== 'notes' && c.peerCode && c.peerCode.length === 36 &&
              ((chatEntry.avatarUrl && c.avatarUrl === chatEntry.avatarUrl) || c.name === chatEntry.name)
            );
            if (hasRealChat) {
              return state;
            }
          }
          const currentDeleted = (state.deletedChatIds || []).filter(
            id => id !== chatEntry.id && (!chatEntry.peerCode || id !== chatEntry.peerCode)
          );

          let existsIndex = -1;
          if (chatEntry.type === 'private' && chatEntry.id !== 'notes') {
            existsIndex = state.chats.findIndex((c) => {
              if (c.type !== 'private' || c.id === 'notes') return false;
              if (c.id === chatEntry.id) return true;
              if (chatEntry.peerCode && c.peerCode && (c.peerCode === chatEntry.peerCode || c.originalPeerCode === chatEntry.peerCode)) return true;
              if (chatEntry.originalPeerCode && c.originalPeerCode && (c.peerCode === chatEntry.originalPeerCode || c.originalPeerCode === chatEntry.originalPeerCode)) return true;
              if (chatEntry.peerPublicKey && c.peerPublicKey && c.peerPublicKey === chatEntry.peerPublicKey) return true;
              return false;
            });
          } else {
            existsIndex = state.chats.findIndex(c => c.id === chatEntry.id);
          }

          if (existsIndex !== -1) {
            const exists = state.chats[existsIndex];
            const msgsMap = state.messagesByChatId || {};
            const msgsExists = msgsMap[exists.id] || [];
            const msgsEntry = chatEntry.id ? (msgsMap[chatEntry.id] || []) : [];
            const canonicalId = (msgsExists.length === 0 && msgsEntry.length > 0 && chatEntry.id) ? chatEntry.id : exists.id;
            const alternateId = (chatEntry.id && chatEntry.id !== canonicalId)
              ? chatEntry.id
              : (exists.id !== canonicalId ? exists.id : null);

            let updatedMessagesMap = state.messagesByChatId;
            if (alternateId && alternateId !== canonicalId) {
              const msgsCanonical = updatedMessagesMap[canonicalId] ? [...updatedMessagesMap[canonicalId]] : [];
              const msgsAlt = updatedMessagesMap[alternateId] || [];
              if (msgsAlt.length > 0) {
                const seen = new Set(msgsCanonical.map(m => m.id || `${m.time}_${m.text}`));
                for (const m of msgsAlt) {
                  const key = m.id || `${m.time}_${m.text}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    msgsCanonical.push(m);
                  }
                }
                msgsCanonical.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
                const { [alternateId]: _, ...rest } = updatedMessagesMap;
                updatedMessagesMap = {
                  ...rest,
                  [canonicalId]: msgsCanonical,
                };
              }
              if (typeof window !== 'undefined' && (window as any).orbita?.storageMigrateChat) {
                (window as any).orbita.storageMigrateChat(alternateId, canonicalId).catch(() => {});
              }
            }

            const merged: Chat = {
              ...exists,
              ...chatEntry,
              id: canonicalId,
              ratchetState: pickBestRatchetState(exists.ratchetState, chatEntry.ratchetState),
              sharedSecret: exists.sharedSecret || chatEntry.sharedSecret,
              peerPublicKey: exists.peerPublicKey || chatEntry.peerPublicKey,
              avatarUrl: chatEntry.avatarUrl || exists.avatarUrl,
              bannerUrl: chatEntry.bannerUrl || exists.bannerUrl,
              username: chatEntry.username || exists.username,
              description: chatEntry.description || exists.description,
              numericId: chatEntry.numericId || exists.numericId,
              peerCode: chatEntry.peerCode || exists.peerCode,
              originalPeerCode: chatEntry.originalPeerCode || exists.originalPeerCode,
              name: (chatEntry.name && chatEntry.name !== 'Unknown') ? chatEntry.name : exists.name,
              lastMsg: (chatEntry.lastMsg && chatEntry.lastMsg !== 'E2EE_SECURE_CHANNEL_READY') ? chatEntry.lastMsg : exists.lastMsg,
              online: chatEntry.online ?? exists.online,
              unreadCount: (exists.unreadCount ?? 0) + (chatEntry.unreadCount ?? 0),
            };

            const nextChats = state.chats
              .map((c, idx) => idx === existsIndex ? merged : c)
              .filter(c => !alternateId || c.id !== alternateId);

            return {
              chats: nextChats,
              messagesByChatId: updatedMessagesMap,
              activeChatId: (alternateId && state.activeChatId === alternateId) ? canonicalId : state.activeChatId,
              activeProfileChatId: (alternateId && state.activeProfileChatId === alternateId) ? canonicalId : state.activeProfileChatId,
              deletedChatIds: currentDeleted,
            };
          }

          return {
            chats: [...state.chats, chatEntry],
            deletedChatIds: currentDeleted,
          };
        });
        flushStorageSet();
      },
      addChannelChat: (channel) => {
        const chatEntry: Chat = {
          id: channel.id,
          type: 'channel',
          name: channel.name,
          lastMsg: channel.description || 'Канал создан',
          online: false,
          description: channel.description,
          creatorNickname: channel.creatorNickname,
          creatorId: channel.creatorId || undefined,
          avatarUrl: channel.avatarUrl || undefined,
          isOwner: channel.isOwner ?? false,
          isOfficial: channel.isOfficial ?? false,
          subscribersCount: channel.subscribersCount || 1,
          isSubscribed: channel.isSubscribed ?? (channel.isOwner ?? true),
          createdAt: Date.now(),
          unreadCount: 0,
          lastReadTimestamp: Date.now(),
          muted: false,
          notificationsEnabled: true,
        };
        set((state) => {
          const exists = state.chats.find((c) => c.id === chatEntry.id);
          if (exists) {
            return {
              chats: state.chats.map((c) => (c.id === chatEntry.id ? { ...c, ...chatEntry } : c)),
            };
          }
          return { chats: [...state.chats, chatEntry] };
        });
      },
      updateChat: (chatId, updates) =>
        set((state) => {
          const targetIndex = state.chats.findIndex(c => c.id === chatId);
          if (targetIndex === -1) return state;

          const myCode = state.myCode;
          let myNick = '';
          let myAvatar = '';
          let myUserId = '';
          try {
            const authStore = (window as any).__ORBITA_AUTH_STORE__?.getState?.();
            if (authStore) {
              myNick = authStore.nickname || '';
              myAvatar = authStore.avatarUrl || '';
              myUserId = authStore.userId || '';
            }
          } catch {}

          const cleanUpdates = { ...updates };
          for (const key of Object.keys(cleanUpdates)) {
            if ((cleanUpdates as any)[key] === undefined) {
              delete (cleanUpdates as any)[key];
            }
          }
          const target = state.chats[targetIndex];

          if (target.type === 'private' && chatId !== 'notes') {
            if (cleanUpdates.name && myNick && cleanUpdates.name.trim().toLowerCase() === myNick.trim().toLowerCase()) {
              delete cleanUpdates.name;
            }
            if (cleanUpdates.peerCode && ((myCode && cleanUpdates.peerCode === myCode) || (myUserId && cleanUpdates.peerCode === myUserId))) {
              delete cleanUpdates.peerCode;
            }
            if (cleanUpdates.avatarUrl && myAvatar && cleanUpdates.avatarUrl === myAvatar) {
              delete cleanUpdates.avatarUrl;
            }
          }

          if (Object.keys(cleanUpdates).length === 0) return state;

          let hasChanges = false;
          for (const k of Object.keys(cleanUpdates)) {
            if ((target as any)[k] !== (cleanUpdates as any)[k]) {
              hasChanges = true;
              break;
            }
          }

          if (!hasChanges) return state;

          const nextChats = [...state.chats];
          nextChats[targetIndex] = { ...target, ...cleanUpdates };
          return { chats: nextChats };
        }),
      togglePinChat: (chatId) => {
        if (chatId === 'notes') return;
        set((state) => {
          const current = state.pinnedChatIds || [];
          const exists = current.includes(chatId);
          return {
            pinnedChatIds: exists
              ? current.filter((id) => id !== chatId)
              : [...current, chatId],
          };
        });
      },
      toggleArchiveChat: (chatId) => {
        if (chatId === 'notes') return;
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, isArchived: !c.isArchived } : c
          ),
        }));
      },
      updateLastMsg: (chatId, msg) =>
        set((state) => ({
          chats: state.chats.map(c => c.id === chatId ? { ...c, lastMsg: msg } : c)
        })),
      addMessage: (chatId, message, encryptedText?, index?) => {
        let state = get();
        if (state.deletedChatIds?.includes(chatId)) return;
        let chat = state.chats.find(c => c.id === chatId);
        if (!chat && message.senderId) {
          chat = state.chats.find(c => c.type === 'private' && (c.peerCode === message.senderId || c.originalPeerCode === message.senderId));
          if (chat) chatId = chat.id;
        }
        if (!chat) return;

        if (message.id && state.messagesByChatId[chatId]?.some(m => m.id === message.id)) {
          console.warn('[ChatStore] Duplicate message id ignored:', message.id);
          return;
        }

        const ttl = state.messageTTLSeconds || undefined;
        const enrichedMessage: Message = {
          ...message,
          ttlSeconds: ttl,
          expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
          status: message.status || 'sent',
          id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          encryptedText: encryptedText || message.text,
          index: index ?? message.index,
          mediaType: message.mediaType,
          mediaUrl: message.mediaUrl,
          mediaName: message.mediaName,
          mime: message.mime,
          mediaItems: message.mediaItems,
          audioMetadata: message.audioMetadata,
          width: message.width,
          height: message.height,
          duration: message.duration,
          reactions: message.reactions,
        };

        const currentMessages = state.messagesByChatId[chatId] || [];
        const updatedMessages = [...currentMessages, enrichedMessage].sort(
          (a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)
        );

        let trimmedMessages = updatedMessages;
        if (updatedMessages.length > MAX_MESSAGES_PER_CHAT) {
          trimmedMessages = updatedMessages.slice(-MAX_MESSAGES_PER_CHAT);
        }

        const isActive = state.activeChatId === chatId;
        const isOut = Boolean(message.isOutgoing);
        const newUnreadCount = (isActive || isOut) ? (isActive ? 0 : (chat.unreadCount ?? 0)) : (chat.unreadCount ?? 0) + 1;
        const nextLastReadTimestamp = isActive ? Date.now() : chat.lastReadTimestamp;
        const nextLastReadMessageId = isActive ? enrichedMessage.id : chat.lastReadMessageId;

        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: trimmedMessages,
          },
          chats: state.chats.map(c =>
            c.id === chatId
              ? {
                  ...c,
                  isArchived: c.muted ? c.isArchived : false,
                  lastMsg: message.text || (message.mediaItems && message.mediaItems.length > 0 ? '[MediaGroup]' : (message.mediaType ? `[${message.mediaType}]` : '')),
                  unreadCount: newUnreadCount,
                  lastReadTimestamp: nextLastReadTimestamp,
                  lastReadMessageId: nextLastReadMessageId,
                  updatedAt: message.time || Date.now(),
                }
              : c
          ),
        });
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          setTimeout(() => {
            (window as any).orbita?.storageAddMessage?.(chatId, enrichedMessage.id, enrichedMessage)?.catch?.(() => {});
          }, 0);
        }
      },
      addMessagesBatch: (items) => {
        if (!items || items.length === 0) return;
        const state = get();
        const deletedChatIds = state.deletedChatIds || [];
        const ttl = state.messageTTLSeconds || undefined;
        const newMessagesByChatId = { ...state.messagesByChatId };
        const chatUpdates = new Map<string, { lastMsg?: string; unreadDelta: number }>();

        for (const item of items) {
          const { chatId: rawChatId, message, encryptedText, index } = item;
          if (deletedChatIds.includes(rawChatId)) continue;
          let chat = state.chats.find(c => c.id === rawChatId);
          if (!chat && message.senderId) {
            chat = state.chats.find(c => c.type === 'private' && (c.peerCode === message.senderId || c.originalPeerCode === message.senderId));
          }
          if (!chat) continue;
          const chatId = chat.id;

          const currentList = newMessagesByChatId[chatId] || [];
          if (message.id && currentList.some(m => m.id === message.id)) {
            continue;
          }

          const enrichedMessage: Message = {
            ...message,
            ttlSeconds: ttl,
            expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
            status: message.status || 'sent',
            id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            encryptedText: encryptedText || message.text,
            index: index ?? message.index,
            mediaType: message.mediaType,
            mediaUrl: message.mediaUrl,
            mediaName: message.mediaName,
            mime: message.mime,
            mediaItems: message.mediaItems,
            audioMetadata: message.audioMetadata,
            width: message.width,
            height: message.height,
            duration: message.duration,
            reactions: message.reactions,
          };

          const updatedList = [...currentList, enrichedMessage].sort(
            (a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)
          );
          newMessagesByChatId[chatId] = updatedList.length > MAX_MESSAGES_PER_CHAT
            ? updatedList.slice(-MAX_MESSAGES_PER_CHAT)
            : updatedList;

          const currentChatUpdate = chatUpdates.get(chatId) || {
            unreadDelta: 0,
            lastMsg: undefined,
          };

          currentChatUpdate.unreadDelta += 1;
          currentChatUpdate.lastMsg = message.text || (message.mediaItems && message.mediaItems.length > 0 ? '[MediaGroup]' : (message.mediaType ? `[${message.mediaType}]` : ''));
          chatUpdates.set(chatId, currentChatUpdate);
        }

        if (chatUpdates.size === 0) return;

        set({
          messagesByChatId: newMessagesByChatId,
          chats: state.chats.map(c => {
            const update = chatUpdates.get(c.id);
            if (!update) return c;
            const isActive = state.activeChatId === c.id;
            const newUnreadCount = isActive ? 0 : (c.unreadCount ?? 0) + update.unreadDelta;
            return {
              ...c,
              lastMsg: update.lastMsg ?? c.lastMsg,
              unreadCount: newUnreadCount,
              updatedAt: Date.now(),
            };
          }),
        });
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const item of items) {
            if (item.message) {
              const mid = item.message.id || `msg_${Date.now()}`;
              (window as any).orbita.storageAddMessage(item.chatId, mid, item.message).catch(() => {});
            }
          }
        }
      },
      deleteMessage: (chatId, messageId) => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const baseId = messageId.replace(/_part_\d+$/, '');
        const updated = messages.filter(m => m.id !== messageId && m.id !== baseId);
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
          chats: state.chats.map(c =>
            c.id === chatId
              ? {
                  ...c,
                  lastMsg: updated.length > 0 ? updated[updated.length - 1].text : 'История очищена',
                }
              : c
          ),
        });
        if (typeof window !== 'undefined' && (window as any).orbita?.storageDeleteMessage) {
          (window as any).orbita.storageDeleteMessage(messageId).catch(() => {});
        }
      },
      updateMessageStatus: (chatId, messageId, status) => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const STATUS_RANK: Record<string, number> = {
          failed: 0,
          error: 0,
          sending: 1,
          pending: 1,
          sent: 2,
          delivered: 3,
          read: 4,
        };
        const updated = messages.map(m => {
          if (m.id !== messageId) return m;
          if (status === 'failed' || status === 'error') {
            if (m.status === 'read' || m.read || m.status === 'delivered') return m;
            return { ...m, status: 'failed' as const };
          }
          if (status === 'sending' && (m.status === 'failed' || m.status === 'error')) {
            return { ...m, status: 'sending' as const };
          }
          const currentStatus = (m.status === 'read' || m.read) ? 'read' : (m.status || 'sent');
          const currentRank = STATUS_RANK[currentStatus] || 1;
          const newRank = (status ? STATUS_RANK[status] : undefined) || 1;
          if (currentRank > newRank) return m;
          return { ...m, status, read: status === 'read' ? true : m.read };
        });
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
        });
        const updatedMsg = updated.find(m => m.id === messageId);
        if (updatedMsg && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          setTimeout(() => {
            (window as any).orbita?.storageAddMessage?.(chatId, messageId, updatedMsg)?.catch?.(() => {});
          }, 0);
        }
        if (status === 'read') {
          supabaseService.purgeServerMessages(chatId, [messageId]);
          if (updatedMsg) {
            const urls: string[] = [];
            if (updatedMsg.mediaUrl) urls.push(updatedMsg.mediaUrl);
            if (updatedMsg.mediaItems && Array.isArray(updatedMsg.mediaItems)) {
              for (const item of updatedMsg.mediaItems) {
                if (item?.url) urls.push(item.url);
              }
            }
            if (urls.length > 0) {
              mediaManager.purgeServerMedia(urls);
            }
          }
        }
      },
      updateMessageMediaDimensions: (chatId, messageId, width, height, itemIdx = 0) => {
        if (!width || !height || width <= 0 || height <= 0) return;
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        let updatedAny = false;
        const updated = messages.map((m) => {
          if (m.id !== messageId) return m;
          const currentItem = m.mediaItems?.[itemIdx];
          const hasSameTop = m.width === width && m.height === height;
          const hasSameItem = currentItem ? (currentItem.width === width && currentItem.height === height) : true;
          if (hasSameTop && hasSameItem) return m;
          updatedAny = true;
          const newItems = m.mediaItems ? m.mediaItems.map((it, idx) => {
            if (idx === itemIdx) {
              return { ...it, width, height };
            }
            return it;
          }) : undefined;
          return {
            ...m,
            width: itemIdx === 0 ? width : (m.width || width),
            height: itemIdx === 0 ? height : (m.height || height),
            mediaItems: newItems,
          };
        });
        if (!updatedAny) return;
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
        });
        const updatedMsg = updated.find((m) => m.id === messageId);
        if (updatedMsg && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          setTimeout(() => {
            (window as any).orbita?.storageAddMessage?.(chatId, messageId, updatedMsg)?.catch?.(() => {});
          }, 0);
        }
      },
      editMessage: (chatId, messageId, newText, encryptedText?, index?) => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const updated = messages.map(m =>
          m.id === messageId
            ? { ...m, text: newText, encryptedText: encryptedText || newText, index: index ?? m.index }
            : m
        );
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, lastMsg: newText } : c
          ),
        });
        const editedMsg = updated.find(m => m.id === messageId);
        if (editedMsg && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          (window as any).orbita.storageAddMessage(chatId, messageId, editedMsg).catch(() => {});
        }
      },
      toggleReaction: (chatId, messageIndexOrId, emoji, user) => {
        get().setReaction(chatId, messageIndexOrId, emoji, user, 'toggle');
      },
      setReaction: (chatId, messageIndexOrId, emoji, user, action = 'toggle', userAliases) => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const targetStr = String(messageIndexOrId);

        const aliases = new Set(userAliases || []);
        if (state.myCode) aliases.add(state.myCode);
        aliases.add('YOU');
        if (user) aliases.add(user);

        const isTargetUser = (u: string) => aliases.has(u);

        let targetIdx = -1;
        if (typeof messageIndexOrId === 'number' && messageIndexOrId >= 0 && messageIndexOrId < messages.length) {
          targetIdx = messageIndexOrId;
        } else {
          targetIdx = messages.findIndex(
            (m) => m.id && (m.id === targetStr || m.id === targetStr.replace(/_part_\d+$/, ''))
          );
        }

        if (targetIdx === -1) {
          return 'add';
        }

        const m = messages[targetIdx];
        const currentReactions: Record<string, string[]> = { ...(m.reactions || {}) };
        const usersForEmoji = currentReactions[emoji] ? [...currentReactions[emoji]] : [];
        const alreadyPresent = usersForEmoji.some(isTargetUser);

        let resultingAction: 'add' | 'remove' = 'add';
        let newUsers: string[];
        if (action === 'add') {
          newUsers = alreadyPresent ? usersForEmoji : [...usersForEmoji.filter((u) => !isTargetUser(u)), user];
          resultingAction = 'add';
        } else if (action === 'remove') {
          newUsers = usersForEmoji.filter((u) => !isTargetUser(u));
          resultingAction = 'remove';
        } else {
          if (alreadyPresent) {
            newUsers = usersForEmoji.filter((u) => !isTargetUser(u));
            resultingAction = 'remove';
          } else {
            newUsers = [...usersForEmoji.filter((u) => !isTargetUser(u)), user];
            resultingAction = 'add';
          }
        }

        if (resultingAction === 'add' && !alreadyPresent) {
          const userReactionsCount = Object.entries(currentReactions).filter(([_, uList]) =>
            Array.isArray(uList) && uList.some(isTargetUser)
          ).length;
          if (userReactionsCount >= 3) {
            return 'limit_reached';
          }
        }

        if (newUsers.length > 0) {
          currentReactions[emoji] = newUsers;
        } else {
          delete currentReactions[emoji];
        }

        const updated = [...messages];
        updated[targetIdx] = {
          ...m,
          reactions: Object.keys(currentReactions).length > 0 ? currentReactions : undefined,
        };

        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
        });

        const updatedMsg = updated[targetIdx];
        if (updatedMsg && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          (window as any).orbita.storageAddMessage(chatId, updatedMsg.id, updatedMsg).catch(() => {});
        }

        return resultingAction;
      },
      syncReactionsFromSupabase: async (chatId) => {
        try {
          const rawReactions = await supabaseService.getReactionsForChat(chatId);
          if (!rawReactions || rawReactions.length === 0) return;

          const idReactionsMap = new Map<string, Record<string, string[]>>();

          for (const r of rawReactions) {
            if (r.message_id) {
              if (!idReactionsMap.has(r.message_id)) idReactionsMap.set(r.message_id, {});
              const map = idReactionsMap.get(r.message_id)!;
              if (!map[r.emoji]) map[r.emoji] = [];
              if (!map[r.emoji].includes(r.user_id)) map[r.emoji].push(r.user_id);
            }
          }

          if (idReactionsMap.size === 0) return;

          const state = get();
          const messages = state.messagesByChatId[chatId] || [];

          let hasChanges = false;
          const updatedMessages = messages.map((m) => {
            if (!m.id || !idReactionsMap.has(m.id)) return m;

            const fetchedReactions = idReactionsMap.get(m.id)!;
            const currentReactions: Record<string, string[]> = { ...(m.reactions || {}) };

            let changed = false;
            for (const [emoji, users] of Object.entries(fetchedReactions)) {
              const existingUsers = currentReactions[emoji] || [];
              const mergedUsers = Array.from(new Set([...existingUsers, ...users]));
              if (mergedUsers.length !== existingUsers.length) {
                currentReactions[emoji] = mergedUsers;
                changed = true;
              }
            }

            if (changed) {
              hasChanges = true;
              return {
                ...m,
                reactions: currentReactions,
              };
            }
            return m;
          });

          if (hasChanges) {
            set({
              messagesByChatId: {
                ...state.messagesByChatId,
                [chatId]: updatedMessages,
              },
            });
            if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
              for (const m of updatedMessages) {
                if (m.id && idReactionsMap.has(m.id)) {
                  (window as any).orbita.storageAddMessage(chatId, m.id, m).catch(() => {});
                }
              }
            }
          }

          const chat = state.chats.find((c) => c.id === chatId);
          if (chat && chat.type !== 'channel' && chatId !== 'notes') {
            await supabaseService.deleteReactionsForChat(chatId);
          }
        } catch (err) {
          console.error('Failed to sync reactions from Supabase:', err);
        }
      },
      getMessages: (chatId) => {
        return get().messagesByChatId[chatId] || [];
      },
      preloadRecentMessagesFromStorage: async () => {
        try {
          const orb = (window as any).orbita;
          if (!orb?.storageGetAllRecentMessages) return;
          const recent = await orb.storageGetAllRecentMessages(30);
          if (recent && typeof recent === 'object' && Object.keys(recent).length > 0) {
            set((state) => {
              const updated = { ...state.messagesByChatId };
              const updatedChats = [...state.chats];
              let chatsChanged = false;
              for (const [rawChatId, msgs] of Object.entries(recent)) {
                if (Array.isArray(msgs) && msgs.length > 0) {
                  const targetChat = state.chats.find(c =>
                    c.id === rawChatId ||
                    (c.type === 'private' && (c.peerCode === rawChatId || c.originalPeerCode === rawChatId))
                  );
                  const chatId = targetChat ? targetChat.id : rawChatId;
                  if (chatId !== rawChatId && typeof window !== 'undefined' && (window as any).orbita?.storageMigrateChat) {
                    (window as any).orbita.storageMigrateChat(rawChatId, chatId).catch(() => {});
                  }
                  const current = updated[chatId] || [];
                  let mergedMsgs = msgs;
                  if (current.length === 0) {
                    updated[chatId] = msgs;
                  } else {
                    const existingIds = new Set(current.map((m: any) => m.id || `${m.time}_${m.text}`));
                    const toAdd = (msgs as any[]).filter((m: any) => !existingIds.has(m.id || `${m.time}_${m.text}`));
                    if (toAdd.length > 0) {
                      mergedMsgs = [...toAdd, ...current].sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
                      updated[chatId] = mergedMsgs;
                    } else {
                      mergedMsgs = current;
                    }
                  }
                  const lastMessage = mergedMsgs[mergedMsgs.length - 1];
                  if (lastMessage) {
                    const chatIdx = updatedChats.findIndex((c) => c.id === chatId);
                    if (chatIdx !== -1) {
                      const c = updatedChats[chatIdx];
                      const derivedLastMsg =
                        lastMessage.text ||
                        (lastMessage.mediaItems && lastMessage.mediaItems.length > 0
                          ? '[MediaGroup]'
                          : lastMessage.mediaType
                          ? `[${lastMessage.mediaType}]`
                          : '');
                      if (
                        derivedLastMsg &&
                        (!c.lastMsg || c.lastMsg === 'E2EE_SECURE_CHANNEL_READY' || c.lastMsg === '')
                      ) {
                        updatedChats[chatIdx] = { ...c, lastMsg: derivedLastMsg };
                        chatsChanged = true;
                      }
                    }
                  }
                }
              }
              return {
                messagesByChatId: updated,
                ...(chatsChanged ? { chats: updatedChats } : {}),
              };
            });
          }
        } catch {}
      },
      setPasscode: (code) => set({ passcode: code }),
      setTheme: (theme) => {
        set({ currentTheme: theme });
        applyThemeToRoot(theme, get().chatColor);
      },
      setChatColor: (color) => {
        set({ chatColor: color });
        applyThemeToRoot(get().currentTheme, color);
      },
      resetChatColor: () => {
        set({ chatColor: DEFAULT_CHAT_COLOR });
        applyThemeToRoot(get().currentTheme, DEFAULT_CHAT_COLOR);
      },
      toggleDots: () => set((state) => ({ dotOverlay: !state.dotOverlay })),
      setCurrentView: (view) => set({ currentView: view }),
      initialSettingsTab: 'main',
      openSettings: (tab) => set({ currentView: 'settings', initialSettingsTab: tab || 'main' }),
      setBlurProtection: (type, val) =>
        set((state) => {
          if (type === 'hideOnBackground') return { hideOnBackground: val };
          if (type === 'hideFromScreenCapture') return { hideFromScreenCapture: val };
          if (type === 'main') return { blurProtection: val };
          return state;
        }),
      setProxyActive: (active, info) =>
        set((state) => ({
          proxyActive: active,
          activeProxyInfo: active ? (info ?? state.activeProxyInfo) : null,
        })),
      setMessageTTL: (seconds) => set({ messageTTLSeconds: seconds }),
      setEyeCareEnabled: (enabled) => set({ eyeCareEnabled: enabled }),
      setEyeCareOpacity: (opacity) => set({ eyeCareOpacity: opacity }),
      setEyeCareDensity: (density) => set({ eyeCareDensity: density }),
      setScreenCaptureProtection: (enabled) => set({ screenCaptureProtection: enabled }),
      setMinimizeToTray: (enabled) => set({ minimizeToTray: enabled }),
      createGroupChat: (name, ttl) => {
        const chatId = `grp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const inviteCode = `orbit-${Math.random().toString(36).substr(2, 5)}-${Math.floor(Math.random() * 90 + 10)}`;
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const sharedSecret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
        const authStore = (window as any).__ORBITA_AUTH_STORE__?.getState?.() || {};
        const nickname = authStore.nickname || 'Unknown';
        const userId = authStore.userId || 'user';
        const newChat: Chat = {
          id: chatId,
          type: 'group',
          name,
          lastMsg: 'E2EE_SECURE_CHANNEL_READY',
          online: false,
          sharedSecret,
          role: 'owner',
          creatorId: userId,
          inviteCode,
          inviteCodeTTL: Date.now() + ttl * 1000,
          members: [{ userId, nickname, role: 'owner', lastSeen: Date.now() }],
          createdAt: Date.now(),
          unreadCount: 0,
          lastReadTimestamp: Date.now(),
          muted: false,
          notificationsEnabled: true,
        };
        set((state) => ({ chats: [...state.chats, newChat] }));
        sqliteStorage.getJson<Record<string, any>>('orbita-group-registry', {}).then((groupRegistry) => {
          groupRegistry[inviteCode] = {
            chatId,
            name,
            sharedSecret,
            inviteCodeTTL: Date.now() + ttl * 1000,
            ownerNickname: nickname,
            ownerUserId: userId,
          };
          sqliteStorage.setJson('orbita-group-registry', groupRegistry).catch(() => {});
        }).catch(() => {});
      },
      joinGroupByCode: async (inviteCode, callback) => {
        const normalized = inviteCode.trim().toLowerCase();
        if (!normalized) { callback(false, 'Введите код группы'); return; }
        const authStore = (window as any).__ORBITA_AUTH_STORE__?.getState?.() || {};
        const nickname = authStore.nickname || 'Unknown';
        const userId = authStore.userId || 'user';
        const existing = get().chats.find(c => c.type === 'group' && c.inviteCode === normalized);
        if (existing) { callback(false, 'Вы уже в этой группе'); return; }
        try {
          const groupRegistry = await sqliteStorage.getJson<Record<string, any>>('orbita-group-registry', {});
          const groupData = groupRegistry[normalized];
          if (groupData) {
            if (groupData.inviteCodeTTL && Date.now() > groupData.inviteCodeTTL) {
              callback(false, 'Срок действия кода истёк');
              return;
            }
            const newChat: Chat = {
              id: groupData.chatId,
              type: 'group',
              name: groupData.name,
              lastMsg: 'Вы присоединились к группе',
              online: false,
              sharedSecret: groupData.sharedSecret,
              role: 'member',
              creatorId: groupData.ownerUserId,
              inviteCode: normalized,
              inviteCodeTTL: groupData.inviteCodeTTL,
              members: [
                { userId: groupData.ownerUserId || 'owner', nickname: groupData.ownerNickname, role: 'owner', lastSeen: Date.now() },
                { userId, nickname, role: 'member', lastSeen: Date.now() },
              ],
              createdAt: Date.now(),
              unreadCount: 0,
              lastReadTimestamp: Date.now(),
              muted: false,
              notificationsEnabled: true,
            };
            set((state) => ({ chats: [...state.chats, newChat] }));
            callback(true);
            return;
          }
        } catch {}
        const pusher = (window as any).__orbitaPusher;
        if (!pusher) {
          callback(false, 'Нет соединения. Попробуйте позже');
          return;
        }
        const inviteChannel = pusher.subscribe(`private-group-invite-${normalized}`);
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          pusher.unsubscribe(`private-group-invite-${normalized}`);
        };
        const timeoutId = setTimeout(() => {
          if (!settled) {
            cleanup();
            callback(false, 'Группа не найдена или код недействителен');
          }
        }, 10000);
        const handleInviteResponse = (data: any) => {
          if (settled) return;
          clearTimeout(timeoutId);
          cleanup();
          if (data.error) { callback(false, data.error); return; }
          if (data.inviteCodeTTL && Date.now() > data.inviteCodeTTL) { callback(false, 'Срок действия кода истёк'); return; }
          const newChat: Chat = {
            id: data.chatId,
            type: 'group',
            name: data.name,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: data.sharedSecret,
            role: 'member',
            inviteCode: normalized,
            members: [...(data.members || []), { nickname, role: 'member', lastSeen: Date.now() }],
            createdAt: Date.now(),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
            muted: false,
            notificationsEnabled: true,
          };
          set((state) => {
            const exists = state.chats.find(c => c.id === data.chatId);
            if (exists) return {};
            return { chats: [...state.chats, newChat] };
          });
          callback(true);
        };
        const sendJoinRequest = () => {
          inviteChannel.trigger('client-join-request', { nickname, inviteCode: normalized });
        };
        inviteChannel.bind('client-invite-response', handleInviteResponse);
        if (inviteChannel.subscribed) sendJoinRequest();
        else inviteChannel.bind('pusher:subscription_succeeded', sendJoinRequest);
        inviteChannel.bind('pusher:subscription_error', () => {
          clearTimeout(timeoutId);
          cleanup();
          callback(false, 'Ошибка подключения');
        });
      },
      resetChats: () => {
        const defaultTheme: ThemeId = 'system';
        applyThemeToRoot(defaultTheme, DEFAULT_CHAT_COLOR);
        mediaManager.clearMemoryCache();
        set({
          chats: [],
          activeChatId: null,
          activeProfileChatId: null,
          messagesByChatId: {},
          passcode: null,
          currentTheme: defaultTheme,
          chatColor: DEFAULT_CHAT_COLOR,
          currentView: 'chats',
          dotOverlay: true,
          blurProtection: false,
          hideOnBackground: false,
          hideFromScreenCapture: false,
          proxyActive: false,
          activeProxyInfo: null,
          myCode: '',
          codeRotationSpeed: 600,
          messageTTLSeconds: 0,
          eyeCareEnabled: false,
          eyeCareOpacity: 0.22,
          eyeCareDensity: 5,
          screenCaptureProtection: false,
          minimizeToTray: false,
          isHandshaking: false,
          fontFamily: 'system',
          textScale: 100,
          dotColor: '#22c55e',
          language: null,
          headerEnabled: true,
          headerTitle: 'orbita',
          ringEnabled: true,
          notificationCount: 2,
          notificationPosition: 'bottom-right',
          notificationHideContent: false,
          notificationPreviewTheme: 'dark',
          bubbleRadius: 16,
          notificationSoundEnabled: true,
          notificationsEnabled: true,
          appIcon: 'orbita1',
          notificationIcon: 'orbita1',
          voiceCallsEnabled: true,
          readReceiptsEnabled: true,
          typingIndicatorsEnabled: true,
          recentEmojis: [],
          isEmojiPanelOpen: false,
          autoUpdate: true,
          showInSystemTray: true,
          autoLaunch: false,
          sendOnEnter: true,
          useImprovedPlayer: false,
          cacheSizeLimit: 5 * 1024 * 1024 * 1024,
          mediaCacheLimit: 2.5 * 1024 * 1024 * 1024,
          cacheCleanupAge: 7 * 24 * 60 * 60 * 1000,
          autoLoadMedia: false,
        });
      },
      exportChatState: () => ({
        usersById: get().usersById,
        chats: get().chats,
        pinnedChatIds: get().pinnedChatIds,
        deletedChatIds: get().deletedChatIds,
        deletedChatSessions: get().deletedChatSessions,
        messagesByChatId: get().messagesByChatId,
        myCode: get().myCode,
        codeRotationSpeed: get().codeRotationSpeed,
        nextCodeRotationTime: get().nextCodeRotationTime,
        incomingFriendRequests: get().incomingFriendRequests,
      }),
      importChatState: (data: any) => {
        set({
          usersById: data?.usersById || {},
          chats: data?.chats || [],
          pinnedChatIds: data?.pinnedChatIds || [],
          deletedChatIds: data?.deletedChatIds || [],
          deletedChatSessions: data?.deletedChatSessions || {},
          messagesByChatId: data?.messagesByChatId || {},
          myCode: data?.myCode || null,
          codeRotationSpeed: data?.codeRotationSpeed || 600,
          nextCodeRotationTime: data?.nextCodeRotationTime || null,
          incomingFriendRequests: data?.incomingFriendRequests || [],
          activeChatId: null,
          activeProfileChatId: null,
        });
      },
      setIsHandshaking: (val) => set({ isHandshaking: val }),
      markChatAsRead: (chatId) =>
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, unreadCount: 0, lastReadTimestamp: Date.now() } : c
          ),
        })),
      getUnreadChatsCount: () => {
        const state = get();
        return state.chats.filter(c => (c.unreadCount ?? 0) > 0).length;
      },
      closeChat: () => set({ activeChatId: null }),
      setFontFamily: (font) => set({ fontFamily: font }),
      setTextScale: (scale) => set({ textScale: clampTextScale(scale) }),
      setDotColor: (color) => set({ dotColor: color }),
      setLanguage: (lang) => set({ language: lang }),
      setHeaderEnabled: (enabled) => set({ headerEnabled: enabled }),
      setHeaderTitle: (title) => set({ headerTitle: title }),
      setRingEnabled: (enabled) => set({ ringEnabled: enabled }),
      setNotificationCount: (count) => set({ notificationCount: Math.max(1, Math.min(5, count)) }),
      setNotificationPosition: (position) => set({ notificationPosition: position }),
      setNotificationHideContent: (hide) => set({ notificationHideContent: hide }),
      setNotificationPreviewTheme: (theme) => set({ notificationPreviewTheme: theme }),
      setBubbleRadius: (radius) => set({ bubbleRadius: radius }),
      setNotificationSoundEnabled: (enabled) => set({ notificationSoundEnabled: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setNotificationFlashTaskbar: (enabled) => set({ notificationFlashTaskbar: enabled }),
      setNotificationVolume: (volume) => set({ notificationVolume: Math.max(0, Math.min(100, volume)) }),
      setNotificationShowName: (show) => set({ notificationShowName: show }),
      setNotificationShowText: (show) => set({ notificationShowText: show }),
      setNotificationNativeWindows: (enabled) => set({ notificationNativeWindows: enabled }),
      setNotificationRespectFocus: (enabled) => set({ notificationRespectFocus: enabled }),
      setAppIcon: (icon) => set({ appIcon: icon }),
      setNotificationIcon: (icon) => set({ notificationIcon: icon }),

      toggleChatMuted: (chatId) => {
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, muted: !c.muted } : c
          ),
        }));
      },
      toggleChatNotifications: (chatId) => {
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, notificationsEnabled: !c.notificationsEnabled } : c
          ),
        }));
      },
      toggleChatBlocked: (chatId) => {
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, isBlocked: !c.isBlocked } : c
          ),
        }));
      },

      setVoiceCallsEnabled: (enabled) => set({ voiceCallsEnabled: enabled }),
      setReadReceiptsEnabled: (enabled) => set({ readReceiptsEnabled: enabled }),
      setTypingIndicatorsEnabled: (enabled) => set({ typingIndicatorsEnabled: enabled }),
      setChatTyping: (chatId, users) =>
        set((state) => {
          const prev = state.typingByChatId[chatId] || [];
          if (
            prev.length === users.length &&
            prev.every((u, i) => u.nickname === users[i].nickname && u.action === users[i].action)
          ) {
            return state;
          }
          return {
            typingByChatId: {
              ...state.typingByChatId,
              [chatId]: users,
            },
          };
        }),
      setLinkPreviewsEnabled: (enabled) => set({ linkPreviewsEnabled: enabled }),
      setHasHydrated: (val) => set({ _hasHydrated: val }),

      addRecentEmoji: (emoji: string) => {
        set((state) => {
          const current = state.recentEmojis || [];
          const filtered = current.filter(e => e !== emoji);
          const updated = [emoji, ...filtered].slice(0, 30);
          return { recentEmojis: updated };
        });
      },
      getRecentEmojis: () => {
        return get().recentEmojis || [];
      },

      setAutoUpdate: (enabled) => set({ autoUpdate: enabled }),
      setDownloadedUpdateVersion: (version) => set({ downloadedUpdateVersion: version, isUpdateBannerDismissed: false }),
      dismissUpdateBanner: () => set({ isUpdateBannerDismissed: true }),
      setShowInSystemTray: (enabled) => set({ showInSystemTray: enabled }),
      setAutoLaunch: (enabled) => set({ autoLaunch: enabled }),
      setSendOnEnter: (enabled) => set({ sendOnEnter: enabled }),
      setUseImprovedPlayer: (enabled) => set({ useImprovedPlayer: enabled }),
      setNoiseSuppressionMode: (mode) => set({
        noiseSuppressionMode: mode,
        noiseSuppression: mode !== 'none',
        noiseSuppressionVoice: mode !== 'none',
        noiseSuppressionCalls: mode !== 'none',
      }),
      setNoiseSuppression: (enabled) => set({
        noiseSuppression: enabled,
        noiseSuppressionVoice: enabled,
        noiseSuppressionCalls: enabled,
        noiseSuppressionMode: enabled ? 'standard' : 'none',
      }),
      setNoiseSuppressionVoice: (enabled) => set({
        noiseSuppressionVoice: enabled,
        noiseSuppression: enabled,
        noiseSuppressionMode: enabled ? 'standard' : 'none',
      }),
      setNoiseSuppressionCalls: (enabled) => set({
        noiseSuppressionCalls: enabled,
        noiseSuppression: enabled,
        noiseSuppressionMode: enabled ? 'standard' : 'none',
      }),

      setCallSoundsEnabled: (enabled) => set({ callSoundsEnabled: enabled }),
      setAlwaysRelayCalls: (enabled) => set({ alwaysRelayCalls: enabled }),
      setSelectedCameraId: (id) => set({ selectedCameraId: id }),
      setSelectedMicrophoneId: (id) => set({ selectedMicrophoneId: id }),
      setSelectedSpeakerId: (id) => set({ selectedSpeakerId: id }),
      setScreenProtectionEnabled: (enabled) => set({ screenProtectionEnabled: enabled }),
      setHideMenuBar: (hide) => set({ hideMenuBar: hide }),

      setCacheSizeLimit: (limit) => set({ cacheSizeLimit: limit }),
      setMediaCacheLimit: (limit) => set({ mediaCacheLimit: limit }),
      setCacheCleanupAge: (age) => set({ cacheCleanupAge: age }),

      setAutoLoadMedia: (enabled) => set({ autoLoadMedia: enabled }),
      setAutoLoadPhotos: (enabled) => set({ autoLoadPhotos: enabled }),
      setAutoLoadVideos: (enabled) => set({ autoLoadVideos: enabled }),
      setAutoLoadAudio: (enabled) => set({ autoLoadAudio: enabled }),
      setAutoLoadFiles: (enabled) => set({ autoLoadFiles: enabled }),
      setAutoLoadMaxPhotoSizeMb: (mb) => set({ autoLoadMaxPhotoSizeMb: mb }),
      setAutoLoadMaxVideoSizeMb: (mb) => set({ autoLoadMaxVideoSizeMb: mb }),
      setAutoLoadMaxAudioSizeMb: (mb) => set({ autoLoadMaxAudioSizeMb: mb }),
      setAutoLoadMaxFileSizeMb: (mb) => set({ autoLoadMaxFileSizeMb: mb }),

      setStickersAutoplayPanel: (enabled) => set({ stickersAutoplayPanel: enabled }),
      setStickersAutoplayChat: (enabled) => set({ stickersAutoplayChat: enabled }),
      setChatAutoPlayVideos: (enabled) => set({ chatAutoPlayVideos: enabled }),
      setCallAnimationsEnabled: (enabled) => set({ callAnimationsEnabled: enabled }),

      shouldAutoLoadMedia: (type, sizeBytes, isOwn) => {
        if (isOwn) return true;
        const state = get();
        if (!state.autoLoadMedia) return false;

        const t = (type || '').toLowerCase();
        const sizeMb = (typeof sizeBytes === 'number' && sizeBytes > 0) ? sizeBytes / (1024 * 1024) : 0;

        if (t === 'photo' || t === 'image') {
          if (!state.autoLoadPhotos) return false;
          if (state.autoLoadMaxPhotoSizeMb > 0 && sizeMb > state.autoLoadMaxPhotoSizeMb) return false;
          return true;
        }
        if (t === 'video' || t === 'gif') {
          if (!state.autoLoadVideos) return false;
          if (state.autoLoadMaxVideoSizeMb > 0 && sizeMb > state.autoLoadMaxVideoSizeMb) return false;
          return true;
        }
        if (t === 'audio' || t === 'music' || t === 'voice') {
          if (!state.autoLoadAudio) return false;
          if (state.autoLoadMaxAudioSizeMb > 0 && sizeMb > state.autoLoadMaxAudioSizeMb) return false;
          return true;
        }
        if (t === 'file' || t === 'document') {
          if (!state.autoLoadFiles) return false;
          if (state.autoLoadMaxFileSizeMb > 0 && sizeMb > state.autoLoadMaxFileSizeMb) return false;
          return true;
        }
        return true;
      },

      deleteChat: (chatId) => {
        const state = get();
        const targetChat = state.chats.find(c => c.id === chatId);
        if (!targetChat) return;

        set((s) => {
          const { [chatId]: _, ...restMessages } = s.messagesByChatId;
          const { [chatId]: __, ...restSessions } = s.deletedChatSessions || {};
          return {
            chats: s.chats.filter(c => c.id !== chatId),
            activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
            activeProfileChatId: s.activeProfileChatId === chatId ? null : s.activeProfileChatId,
            messagesByChatId: restMessages,
            pinnedChatIds: (s.pinnedChatIds || []).filter((id) => id !== chatId),
            deletedChatIds: Array.from(new Set([...(s.deletedChatIds || []), chatId])),
            deletedChatSessions: restSessions,
          };
        });

        mediaManager.deleteByChatId(chatId).catch(err => {
          console.error('[ChatStore] Failed to delete media cache for chat:', chatId, err);
        });

        if (typeof window !== 'undefined' && (window as any).orbita?.storageDeleteMessages) {
          (window as any).orbita.storageDeleteMessages(chatId).catch(() => {});
        }
        flushStorageSet();
      },

      restoreDeletedChat: (chatId) => {
        const state = get();
        if (state.deletedChatIds?.includes(chatId)) return null;
        const saved = state.deletedChatSessions?.[chatId];
        if (!saved) return null;

        const { [chatId]: _, ...restSessions } = state.deletedChatSessions || {};
        const restored: Chat = {
          ...saved,
          updatedAt: Date.now(),
        };

        set((s) => ({
          chats: s.chats.some(c => c.id === chatId) ? s.chats : [restored, ...s.chats],
          deletedChatSessions: restSessions,
        }));

        return restored;
      },
    }),
    chatStorePersistConfig
  )
);
setHydratedChecker(() => useChatStore?.persist ? useChatStore.persist.hasHydrated() : true);
