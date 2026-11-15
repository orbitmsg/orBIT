import { create } from 'zustand';
import { runTelegramDisintegration } from '../utils/telegramDisintegration';
import { persist } from 'zustand/middleware';
import { ThemeId, applyThemeToRoot, resolveThemeMode } from '../theme';
import { DEFAULT_THEME_TINT_ID, getThemeTintById } from '../themes';
import { generateChatId as genChatId, ensureValidUuid } from '../lib/crypto';
import { mediaManager } from '../services/mediaManager';
import { supabaseService } from '../services/supabaseService';
import { sqliteStorage } from '../services/sqliteStorage';
import { getAuthStoreState } from './authStoreRef';

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

const isValidProfileString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0 && val.trim() !== 'undefined' && val.trim() !== 'null';

const pickNonEmptyProfileValue = (
  incoming: string | null | undefined,
  existing: string | null | undefined
): string | null | undefined => {
  if (isValidProfileString(incoming)) return incoming;
  if (isValidProfileString(existing)) return existing;
  return incoming !== undefined ? incoming : existing;
};

const isSamePrivateChatByName = (a: Chat, b: Chat): boolean => {
  if (!a.name || !b.name || a.name === 'Unknown' || b.name === 'Unknown') return false;
  if (a.name.trim().toLowerCase() !== b.name.trim().toLowerCase()) return false;
  if (a.peerCode && b.peerCode && a.peerCode !== b.peerCode) return false;
  if (a.originalPeerCode && b.originalPeerCode && a.originalPeerCode !== b.originalPeerCode) return false;
  if (a.peerPublicKey && b.peerPublicKey && a.peerPublicKey !== b.peerPublicKey) return false;
  if (a.numericId && b.numericId && a.numericId !== b.numericId) return false;
  const uA = a.username ? a.username.replace(/^@+/, '').trim().toLowerCase() : '';
  const uB = b.username ? b.username.replace(/^@+/, '').trim().toLowerCase() : '';
  if (uA && uB && uA !== uB) return false;
  return true;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      usersById: {},
      setUserProfile: (userId, profile) =>
        set((state) => {
          if (!userId) return state;
          const current = state.usersById[userId] || { id: userId, nickname: '' };
          const nextNickname = (isValidProfileString(profile.nickname) ? profile.nickname : current.nickname) ?? '';
          const nextAvatarUrl = pickNonEmptyProfileValue(profile.avatarUrl, current.avatarUrl);
          const nextBannerUrl = pickNonEmptyProfileValue(profile.bannerUrl, current.bannerUrl);
          const nextUsername = pickNonEmptyProfileValue(profile.username, current.username);
          const nextBio = pickNonEmptyProfileValue(profile.bio, current.bio);
          const nextBirthday = pickNonEmptyProfileValue(profile.birthday, current.birthday);

          if (
            current.nickname === nextNickname &&
            current.avatarUrl === nextAvatarUrl &&
            current.bannerUrl === nextBannerUrl &&
            current.username === nextUsername &&
            current.bio === nextBio &&
            current.birthday === nextBirthday
          ) {
            return state;
          }

          const updatedUser: UserProfile = {
            ...current,
            ...profile,
            id: userId,
            nickname: nextNickname,
            avatarUrl: nextAvatarUrl,
            bannerUrl: nextBannerUrl,
            username: nextUsername,
            bio: nextBio,
            birthday: nextBirthday,
            updatedAt: Date.now(),
          };
          try {
            const bc = new BroadcastChannel('orbita-media-channel');
            bc.postMessage({
              type: 'SYNC_USERS',
              usersById: { [userId]: updatedUser },
            });
            setTimeout(() => bc.close(), 100);
          } catch {}
          return {
            usersById: {
              ...state.usersById,
              [userId]: updatedUser,
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
      activeChannelId: null,
      activeChannelName: null,
      activeChannelType: null,
      setActiveChannel: (id: string | null, name: string | null = null, type: 'text' | 'voice' | null = null) =>
        set({ activeChannelId: id, activeChannelName: name, activeChannelType: type }),
      messagesByChatId: {},
      deletingMessageIds: {},
      passcode: null,
      currentTheme: 'system',
      themeTintId: DEFAULT_THEME_TINT_ID,
      chatColor: getThemeTintById(DEFAULT_THEME_TINT_ID)[resolveThemeMode('system')].bubbleOwnBg,
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
      ghostModeEnabled: false,
      readReceiptsEnabled: true,
      typingIndicatorsEnabled: true,
      typingByChatId: {},
      linkPreviewsEnabled: true,
      anonymousForwardingEnabled: true,
      pendingForwardMessages: null,
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

      stickersAutoplayPanel: false,
      stickersAutoplayChat: false,
      chatAutoPlayVideos: false,
      chatElementAnimations: true,
      messageDeleteAnimation: true,
      callAnimationsEnabled: false,

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

        const isDifferentChat = id !== previousActiveId;
        const channelReset = isDifferentChat ? { activeChannelId: null, activeChannelName: null, activeChannelType: null } : {};

        if (chatsChanged) {
          set({ activeChatId: id, chats: nextChats, ...channelReset });
        } else {
          set({ activeChatId: id, ...channelReset });
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
          if (chatEntry.type === 'group' && state.deletedChatIds?.includes(chatEntry.id) && !(newChat as any).isExplicitJoin && !chatEntry.id.startsWith('lobby_')) {
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
              if (chatEntry.numericId && c.numericId && c.numericId === chatEntry.numericId) return true;
              if (chatEntry.username && c.username && c.username.replace(/^@+/, '').trim().toLowerCase() === chatEntry.username.replace(/^@+/, '').trim().toLowerCase()) return true;
              if (isSamePrivateChatByName(c, chatEntry)) return true;
              return false;
            });
          } else if (chatEntry.type === 'group') {
            existsIndex = state.chats.findIndex((c) => {
              if (c.type !== 'group') return false;
              if (c.id === chatEntry.id) return true;
              if (chatEntry.inviteCode && c.inviteCode && c.inviteCode === chatEntry.inviteCode) return true;
              if (chatEntry.name && c.name && chatEntry.name.trim().toLowerCase() === c.name.trim().toLowerCase()) return true;
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
              avatarUrl: isValidProfileString(chatEntry.avatarUrl) ? chatEntry.avatarUrl : exists.avatarUrl,
              bannerUrl: isValidProfileString(chatEntry.bannerUrl) ? chatEntry.bannerUrl : exists.bannerUrl,
              username: isValidProfileString(chatEntry.username) ? chatEntry.username : exists.username,
              description: isValidProfileString(chatEntry.description) ? chatEntry.description : exists.description,
              numericId: isValidProfileString(chatEntry.numericId) ? chatEntry.numericId : exists.numericId,
              birthday: isValidProfileString(chatEntry.birthday) ? chatEntry.birthday : exists.birthday,
              peerCode: chatEntry.peerCode || exists.peerCode,
              originalPeerCode: chatEntry.originalPeerCode || exists.originalPeerCode,
              name: (chatEntry.name && chatEntry.name !== 'Unknown') ? chatEntry.name : exists.name,
              lastMsg: (chatEntry.lastMsg && chatEntry.lastMsg !== 'E2EE_SECURE_CHANNEL_READY') ? chatEntry.lastMsg : exists.lastMsg,
              online: chatEntry.online ?? exists.online,
              unreadCount: (exists.unreadCount ?? 0) + (chatEntry.unreadCount ?? 0),
            };

            const nextChats = state.chats
              .map((c, idx) => idx === existsIndex ? merged : c)
              .filter(c => {
                if (alternateId && c.id === alternateId) return false;
                if (c.id !== canonicalId) {
                  if (c.type === 'private' && merged.type === 'private') {
                    const cMsgs = state.messagesByChatId[c.id] || [];
                    if (cMsgs.length === 0) {
                      if (c.peerCode && merged.peerCode && (c.peerCode === merged.peerCode || c.originalPeerCode === merged.peerCode)) return false;
                      if (c.numericId && merged.numericId && c.numericId === merged.numericId) return false;
                      if (c.username && merged.username && c.username.replace(/^@+/, '').trim().toLowerCase() === merged.username.replace(/^@+/, '').trim().toLowerCase()) return false;
                      if (isSamePrivateChatByName(c, merged)) return false;
                    }
                  } else if (c.type === 'group' && merged.type === 'group') {
                    if (c.inviteCode && merged.inviteCode && c.inviteCode === merged.inviteCode) return false;
                    if (c.name && merged.name && c.name.trim().toLowerCase() === merged.name.trim().toLowerCase()) return false;
                  }
                }
                return true;
              });

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
          username: channel.username || null,
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
            const authStore = getAuthStoreState();
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
            if ('name' in cleanUpdates && (!isValidProfileString(cleanUpdates.name) || cleanUpdates.name === 'Unknown') && isValidProfileString(target.name) && target.name !== 'Unknown') {
              delete cleanUpdates.name;
            }
            if (cleanUpdates.peerCode && ((myCode && cleanUpdates.peerCode === myCode) || (myUserId && cleanUpdates.peerCode === myUserId))) {
              delete cleanUpdates.peerCode;
            }
            if (cleanUpdates.avatarUrl && myAvatar && cleanUpdates.avatarUrl === myAvatar) {
              delete cleanUpdates.avatarUrl;
            }
            for (const field of ['username', 'birthday', 'description', 'bannerUrl', 'avatarUrl'] as const) {
              if (field in cleanUpdates) {
                const incoming = cleanUpdates[field];
                const existing: unknown = target[field];
                if (!isValidProfileString(incoming)) {
                  if (isValidProfileString(existing)) {
                    delete cleanUpdates[field];
                  } else if (typeof existing === 'string' && (existing.trim() === 'undefined' || existing.trim() === 'null')) {
                    (cleanUpdates as any)[field] = undefined;
                  } else {
                    delete cleanUpdates[field];
                  }
                }
              }
            }
          }

          if (Object.keys(cleanUpdates).length === 0) return state;

          let hasChanges = false;
          for (const k of Object.keys(cleanUpdates)) {
            const incomingVal = (cleanUpdates as any)[k];
            const targetVal = (target as any)[k];
            if (k === 'members' && Array.isArray(incomingVal) && Array.isArray(targetVal)) {
              if (incomingVal.length !== targetVal.length) {
                hasChanges = true;
                break;
              }
              const isDiff = incomingVal.some((im: any, idx: number) => {
                const tm = targetVal[idx] as any;
                return !tm || tm.userId !== im.userId || tm.userCode !== im.userCode || tm.nickname !== im.nickname || tm.role !== im.role || tm.avatarUrl !== im.avatarUrl;
              });
              if (isDiff) {
                hasChanges = true;
                break;
              }
              continue;
            }
            if (targetVal !== incomingVal) {
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
        if (!chat && chatId.includes(':')) {
          const baseId = chatId.split(':')[0];
          chat = state.chats.find(c => c.id === baseId);
        }
        if (!chat && message.senderId) {
          chat = state.chats.find(c => c.type === 'private' && (c.peerCode === message.senderId || c.originalPeerCode === message.senderId));
          if (chat) chatId = chat.id;
        }
        if (!chat) return;

        if (message.id && state.messagesByChatId[chatId]?.some(m => m.id === message.id)) {
          console.warn('[ChatStore] Duplicate message id ignored:', message.id);
          return;
        }

        const isSys = message.mediaType === 'system' || Boolean(message.systemType) || message.sender === 'system';
        if (isSys) {
          const existingMsgs = state.messagesByChatId[chatId] || [];
          const now = message.time || Date.now();
          const isDuplicateSys = existingMsgs.some((m) => {
            if (m.id && message.id && m.id === message.id) return true;
            const mIsSys = m.mediaType === 'system' || Boolean(m.systemType) || m.sender === 'system';
            if (!mIsSys) return false;
            const sameType = m.systemType && message.systemType && m.systemType === message.systemType;
            const sameActor = m.actorNickname && message.actorNickname && m.actorNickname === message.actorNickname;
            const sameText = m.text && message.text && m.text.trim() === message.text.trim();
            const closeTime = Math.abs((m.time || 0) - now) < 10000;
            return closeTime && (sameText || (sameType && sameActor));
          });
          if (isDuplicateSys) {
            return;
          }
        }

        const ttl = state.messageTTLSeconds || undefined;
        const isOut = Boolean(message.isOutgoing);
        const authUserId = getAuthStoreState()?.userId;
        const ensuredSenderId = ensureValidUuid(
          message.senderId || (isOut ? (authUserId || state.myCode) : undefined),
          isOut ? (authUserId || state.myCode) : (chat.peerCode || message.sender)
        );
        const enrichedMediaItems = message.mediaItems ? message.mediaItems.map((item) => ({
          ...item,
          senderId: item.senderId ? ensureValidUuid(item.senderId, ensuredSenderId) : ensuredSenderId,
        })) : undefined;
        const enrichedMessage: Message = {
          ...message,
          senderId: ensuredSenderId,
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
          mediaItems: enrichedMediaItems,
          audioMetadata: message.audioMetadata,
          width: message.width,
          height: message.height,
          duration: message.duration,
          reactions: message.reactions,
          mediaKey: message.mediaKey || (message as any).key,
          blurPreview: message.blurPreview || message.thumbnail,
          thumbnail: message.thumbnail || message.blurPreview,
          fileSize: message.fileSize || (message as any).size,
          waveform: message.waveform,
          linkPreview: message.linkPreview,
        };

        const currentMessages = state.messagesByChatId[chatId] || [];
        const seenMsgKeys = new Set<string>();
        const updatedMessages: Message[] = [];
        for (const m of currentMessages) {
          const key = m.id || `${m.time}_${m.text}`;
          if (m.id && m.id === enrichedMessage.id) {
            seenMsgKeys.add(key);
            updatedMessages.push({
              ...m,
              ...enrichedMessage,
              senderId: enrichedMessage.senderId || m.senderId || ensuredSenderId,
            });
          } else if (!seenMsgKeys.has(key)) {
            seenMsgKeys.add(key);
            updatedMessages.push(m);
          }
        }
        const newKey = enrichedMessage.id || `${enrichedMessage.time}_${enrichedMessage.text}`;
        if (!seenMsgKeys.has(newKey)) {
          seenMsgKeys.add(newKey);
          updatedMessages.push(enrichedMessage);
        }
        updatedMessages.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

        let trimmedMessages = updatedMessages;
        if (updatedMessages.length > MAX_MESSAGES_PER_CHAT) {
          trimmedMessages = updatedMessages.slice(-MAX_MESSAGES_PER_CHAT);
        }

        const isActive = state.activeChatId === chatId;
        const newUnreadCount = (isActive || isOut) ? (isActive ? 0 : (chat.unreadCount ?? 0)) : (chat.unreadCount ?? 0) + 1;
        const nextLastReadTimestamp = isActive ? Date.now() : chat.lastReadTimestamp;
        const nextLastReadMessageId = isActive ? enrichedMessage.id : chat.lastReadMessageId;

        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: trimmedMessages,
          },
          chats: state.chats.map(c =>
            c.id === chatId || (chatId.includes(':') && c.id === chatId.split(':')[0])
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

          const isItemOut = Boolean(message.isOutgoing);
          const itemAuthUserId = getAuthStoreState()?.userId;
          const ensuredItemSenderId = ensureValidUuid(
            message.senderId || (isItemOut ? (itemAuthUserId || state.myCode) : undefined),
            isItemOut ? (itemAuthUserId || state.myCode) : (chat.peerCode || message.sender)
          );
          const enrichedItemMediaItems = message.mediaItems ? message.mediaItems.map((mItem) => ({
            ...mItem,
            senderId: mItem.senderId ? ensureValidUuid(mItem.senderId, ensuredItemSenderId) : ensuredItemSenderId,
          })) : undefined;
          const enrichedMessage: Message = {
            ...message,
            senderId: ensuredItemSenderId,
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
            mediaItems: enrichedItemMediaItems,
            audioMetadata: message.audioMetadata,
            width: message.width,
            height: message.height,
            duration: message.duration,
                    reactions: message.reactions,
                    mediaKey: message.mediaKey || (message as any).key,
                    blurPreview: message.blurPreview || message.thumbnail,
                    thumbnail: message.thumbnail || message.blurPreview,
                    fileSize: message.fileSize || (message as any).size,
                    waveform: message.waveform,
                    linkPreview: message.linkPreview,
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
        if (state.messageDeleteAnimation !== false && typeof document !== 'undefined' && state.activeChatId === chatId) {
          const domEl = document.querySelector(`[data-message-id="${messageId}"]`);
          if (domEl) {
            const bubbleEl = (domEl.querySelector<HTMLElement>('[data-bubble="true"]') ||
              domEl.querySelector<HTMLElement>('[data-message="true"]') ||
              domEl) as HTMLElement;
            runTelegramDisintegration(bubbleEl);
          }
        }
        const baseChatId = chatId.includes(':') ? chatId.split(':')[0] : null;
        const messages = state.messagesByChatId[chatId] || [];
        const baseMessages = baseChatId ? (state.messagesByChatId[baseChatId] || []) : null;
        const baseId = messageId.replace(/_part_\d+$/, '');
        const updated = messages.filter(m => m.id !== messageId && m.id !== baseId);
        const updatedBase = baseMessages ? baseMessages.filter(m => m.id !== messageId && m.id !== baseId) : null;
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
            ...(baseChatId && updatedBase ? { [baseChatId]: updatedBase } : {}),
          },
          chats: state.chats.map(c =>
            c.id === chatId || (chatId.includes(':') && c.id === chatId.split(':')[0])
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
      deleteMessages: (chatId, messageIds) => {
        if (!chatId || !messageIds || messageIds.length === 0) return;
        const state = get();
        if (state.messageDeleteAnimation !== false && typeof document !== 'undefined' && state.activeChatId === chatId) {
          const visibleIds = messageIds.filter((id) => {
            const el = document.querySelector(`[data-message-id="${id}"]`);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < window.innerHeight;
          });
          const count = visibleIds.length || 1;
          const particleBudget = Math.max(28, Math.min(220, Math.floor(1000 / count)));
          visibleIds.forEach((messageId) => {
            const domEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (domEl) {
              const bubbleEl = (domEl.querySelector<HTMLElement>('[data-bubble="true"]') ||
                domEl.querySelector<HTMLElement>('[data-message="true"]') ||
                domEl) as HTMLElement;
              runTelegramDisintegration(bubbleEl, undefined, particleBudget);
            }
          });
        }
        const baseChatId = chatId.includes(':') ? chatId.split(':')[0] : null;
        const messages = state.messagesByChatId[chatId] || [];
        const baseMessages = baseChatId ? (state.messagesByChatId[baseChatId] || []) : null;
        const idSet = new Set(messageIds);
        const updated = messages.filter(m => m.id ? (!idSet.has(m.id) && !idSet.has(m.id.replace(/_part_\d+$/, ''))) : true);
        const updatedBase = baseMessages ? baseMessages.filter(m => m.id ? (!idSet.has(m.id) && !idSet.has(m.id.replace(/_part_\d+$/, ''))) : true) : null;
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
            ...(baseChatId && updatedBase ? { [baseChatId]: updatedBase } : {}),
          },
          chats: state.chats.map(c =>
            c.id === chatId || (chatId.includes(':') && c.id === chatId.split(':')[0])
              ? {
                  ...c,
                  lastMsg: updated.length > 0 ? updated[updated.length - 1].text : 'История очищена',
                }
              : c
          ),
        });
        if (typeof window !== 'undefined' && (window as any).orbita?.storageDeleteMessage) {
          messageIds.forEach(id => {
            (window as any).orbita.storageDeleteMessage(id).catch(() => {});
          });
        }
      },
      markVoiceListened: (chatId, messageId) => {
        if (!chatId || !messageId) return;
        const state = get();
        const messages = state.messagesByChatId[chatId];
        if (!messages) return;
        let updatedAny = false;
        const updated = messages.map((m) => {
          if (m.id === messageId && !m.isListened) {
            updatedAny = true;
            return { ...m, isListened: true };
          }
          return m;
        });
        if (updatedAny) {
          set({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            },
          });
        }
      },
      updateMessageStatus: (chatId, messageId, status) => {
        const state = get();
        const baseChatId = chatId.includes(':') ? chatId.split(':')[0] : null;
        const messages = state.messagesByChatId[chatId] || [];
        const baseMessages = baseChatId ? (state.messagesByChatId[baseChatId] || []) : null;
        const STATUS_RANK: Record<string, number> = {
          failed: 0,
          error: 0,
          sending: 1,
          pending: 1,
          sent: 2,
          delivered: 3,
          read: 4,
        };
        const mapFn = (m: any) => {
          if (m.id !== messageId) return m;
          if (status === 'failed' || status === 'error') {
            if (m.status === 'read' || m.read || m.status === 'delivered') return m;
            return { ...m, status: 'failed' as const };
          }
          if (status === 'sending' && (m.status === 'failed' || m.status === 'error')) {
            return { ...m, status: 'sending' as const };
          }
          const currentStatus = m.status === 'read' ? 'read' : (m.status || 'sent');
          const currentRank = STATUS_RANK[currentStatus] || 1;
          const newRank = (status ? STATUS_RANK[status] : undefined) || 1;
          if (currentRank > newRank) return m;
          return {
            ...m,
            status,
            uploading: status === 'sent' || status === 'delivered' || status === 'read' ? false : m.uploading,
            read: status === 'read' ? true : m.read,
          };
        };
        const updated = messages.map(mapFn);
        const updatedBase = baseMessages ? baseMessages.map(mapFn) : null;
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
            ...(baseChatId && updatedBase ? { [baseChatId]: updatedBase } : {}),
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
              return { ...it, width, height, senderId: it.senderId || m.senderId };
            }
            return { ...it, senderId: it.senderId || m.senderId };
          }) : undefined;
          return {
            ...m,
            senderId: m.senderId,
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
            ? { ...m, text: newText, encryptedText: encryptedText || newText, index: index ?? m.index, isEdited: true, editedAt: Date.now() }
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
          if (typeof window !== 'undefined' && (window as any).orbita?.storageGetMessages) {
            (window as any).orbita.storageGetMessages(chatId).then((cached: any[]) => {
              if (!Array.isArray(cached) || cached.length === 0) return;
              const foundMsg = cached.find((cm) => cm && cm.id && (cm.id === targetStr || cm.id === targetStr.replace(/_part_\d+$/, '')));
              if (!foundMsg) return;
              const curReactions: Record<string, string[]> = { ...(foundMsg.reactions || {}) };
              const uList = curReactions[emoji] ? [...curReactions[emoji]] : [];
              const present = uList.some(isTargetUser);
              let nextUsers: string[];
              if (action === 'add') {
                nextUsers = present ? uList : [...uList.filter((u) => !isTargetUser(u)), user];
              } else if (action === 'remove') {
                nextUsers = uList.filter((u) => !isTargetUser(u));
              } else {
                nextUsers = present ? uList.filter((u) => !isTargetUser(u)) : [...uList.filter((u) => !isTargetUser(u)), user];
              }
              if (nextUsers.length > 0) {
                curReactions[emoji] = nextUsers;
              } else {
                delete curReactions[emoji];
              }
              const updatedFound = {
                ...foundMsg,
                reactions: Object.keys(curReactions).length > 0 ? curReactions : undefined,
              };
              (window as any).orbita?.storageAddMessage?.(chatId, updatedFound.id, updatedFound).catch(() => {});
            }).catch(() => {});
          }
          sqliteStorage.getJson<Record<string, Record<string, string[]>>>(`orbita_reactions_${chatId}`, {}).then((chatReactions) => {
            const nextReactions = { ...chatReactions };
            const curMsgReactions: Record<string, string[]> = { ...(nextReactions[targetStr] || {}) };
            const uList = curMsgReactions[emoji] ? [...curMsgReactions[emoji]] : [];
            const present = uList.some(isTargetUser);
            let nextUsers: string[];
            if (action === 'add') {
              nextUsers = present ? uList : [...uList.filter((u) => !isTargetUser(u)), user];
            } else if (action === 'remove') {
              nextUsers = uList.filter((u) => !isTargetUser(u));
            } else {
              nextUsers = present ? uList.filter((u) => !isTargetUser(u)) : [...uList.filter((u) => !isTargetUser(u)), user];
            }
            if (nextUsers.length > 0) {
              curMsgReactions[emoji] = nextUsers;
            } else {
              delete curMsgReactions[emoji];
            }
            if (Object.keys(curMsgReactions).length > 0) {
              nextReactions[targetStr] = curMsgReactions;
            } else {
              delete nextReactions[targetStr];
            }
            sqliteStorage.setJson(`orbita_reactions_${chatId}`, nextReactions).catch(() => {});
          }).catch(() => {});
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
        const updatedMsg = {
          ...m,
          reactions: Object.keys(currentReactions).length > 0 ? currentReactions : undefined,
        };
        updated[targetIdx] = updatedMsg;

        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
        });

        if (updatedMsg && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          (window as any).orbita.storageAddMessage(chatId, updatedMsg.id, updatedMsg).catch(() => {});
          const cleanChatId = chatId.split(':')[0];
          if (cleanChatId !== chatId) {
            (window as any).orbita.storageAddMessage(cleanChatId, updatedMsg.id, updatedMsg).catch(() => {});
          }
        }

        sqliteStorage.getJson<Record<string, Record<string, string[]>>>(`orbita_reactions_${chatId}`, {}).then((chatReactions) => {
          const nextReactions = { ...chatReactions };
          if (Object.keys(currentReactions).length > 0) {
            nextReactions[targetStr] = currentReactions;
          } else {
            delete nextReactions[targetStr];
          }
          sqliteStorage.setJson(`orbita_reactions_${chatId}`, nextReactions).catch(() => {});
        }).catch(() => {});

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

          sqliteStorage.getJson<Record<string, Record<string, string[]>>>(`orbita_reactions_${chatId}`, {}).then((chatReactions) => {
            const nextReactions = { ...chatReactions };
            for (const [mid, recMap] of idReactionsMap.entries()) {
              nextReactions[mid] = { ...(nextReactions[mid] || {}), ...recMap };
            }
            sqliteStorage.setJson(`orbita_reactions_${chatId}`, nextReactions).catch(() => {});
          }).catch(() => {});

          const chat = state.chats.find((c) => c.id === chatId);
          if (chat && chat.type === 'private' && chatId !== 'notes') {
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
                    const seen = new Set<string>();
                    const deduplicatedMsgs: any[] = [];
                    for (const m of (msgs as any[])) {
                      const key = m.id || `${m.time}_${m.text}`;
                      if (!seen.has(key)) {
                        seen.add(key);
                        deduplicatedMsgs.push(m);
                      }
                    }
                    mergedMsgs = deduplicatedMsgs;
                    updated[chatId] = deduplicatedMsgs;
                  } else {
                    const msgsById = new Map<string, any>((msgs as any[]).map((m: any) => [m.id || `${m.time}_${m.text}`, m]));
                    const updatedCurrent = current.map((m: any) => {
                      const id = m.id || `${m.time}_${m.text}`;
                      const cached = msgsById.get(id);
                      if (cached && cached.reactions && (!m.reactions || JSON.stringify(m.reactions) !== JSON.stringify(cached.reactions))) {
                        return { ...m, reactions: cached.reactions };
                      }
                      return m;
                    });
                    const existingIds = new Set(current.map((m: any) => m.id || `${m.time}_${m.text}`));
                    const toAdd = (msgs as any[]).filter((m: any) => !existingIds.has(m.id || `${m.time}_${m.text}`));
                    mergedMsgs = [...toAdd, ...updatedCurrent].sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
                    updated[chatId] = mergedMsgs;
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
        const state = get();
        const tint = getThemeTintById(state.themeTintId);
        const prevTintDefault = state.chatColor === tint.dark.bubbleOwnBg || state.chatColor === tint.light.bubbleOwnBg;
        const nextMode = resolveThemeMode(theme);
        const nextChatColor = prevTintDefault ? tint[nextMode].bubbleOwnBg : state.chatColor;
        set({ currentTheme: theme, chatColor: nextChatColor });
        applyThemeToRoot(theme, nextChatColor, tint.id);
      },
      setThemeTint: (tintId) => {
        const state = get();
        const tint = getThemeTintById(tintId);
        const resolvedMode = resolveThemeMode(state.currentTheme);
        const nextChatColor = tint[resolvedMode].bubbleOwnBg;
        set({ themeTintId: tint.id, chatColor: nextChatColor });
        applyThemeToRoot(state.currentTheme, nextChatColor, tint.id);
      },
      setChatColor: (color) => {
        set({ chatColor: color });
        applyThemeToRoot(get().currentTheme, color, get().themeTintId);
      },
      resetChatColor: () => {
        const state = get();
        const tint = getThemeTintById(state.themeTintId);
        const resolvedMode = resolveThemeMode(state.currentTheme);
        const nextChatColor = tint[resolvedMode].bubbleOwnBg;
        set({ chatColor: nextChatColor });
        applyThemeToRoot(state.currentTheme, nextChatColor, tint.id);
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
        const authStore = getAuthStoreState() || {};
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
        if (!normalized) { callback(false, 'Введите код лобби'); return; }
        const authStore = getAuthStoreState() || {};
        const nickname = authStore.nickname || 'Unknown';
        const userId = authStore.userId || 'user';
        const existing = get().chats.find(c => c.type === 'group' && c.inviteCode === normalized);
        if (existing) { callback(false, 'Вы уже в этом лобби'); return; }
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
              lastMsg: 'Вы присоединились к лобби',
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
        const defaultTint = getThemeTintById(DEFAULT_THEME_TINT_ID);
        const defaultBubbleBg = defaultTint[resolveThemeMode(defaultTheme)].bubbleOwnBg;
        applyThemeToRoot(defaultTheme, defaultBubbleBg, DEFAULT_THEME_TINT_ID);
        mediaManager.clearMemoryCache();
        set({
          chats: [],
          activeChatId: null,
          activeProfileChatId: null,
          messagesByChatId: {},
          passcode: null,
          currentTheme: defaultTheme,
          themeTintId: DEFAULT_THEME_TINT_ID,
          chatColor: defaultBubbleBg,
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
          autoLoadMedia: true,
        });
      },
      exportChatState: () => {
        const state = get();
        const sanitizeMsgs = (list?: Message[]) => {
          if (!list || !Array.isArray(list)) return [];
          return list.slice(-50).map((m) => {
            const copy = { ...m };
            if (copy.preview && copy.preview.startsWith('data:') && copy.preview.length > 2048) {
              copy.preview = copy.blurPreview || null;
            }
            if (copy.thumbnail && copy.thumbnail.startsWith('data:') && copy.thumbnail.length > 2048) {
              copy.thumbnail = copy.blurPreview || undefined;
            }
            if (copy.mediaUrl && copy.mediaUrl.startsWith('data:') && copy.mediaUrl.length > 2048) {
              copy.mediaUrl = '';
            }
            return copy;
          });
        };
        const sanitizedMessagesByChatId: Record<string, Message[]> = {};
        for (const [cId, msgs] of Object.entries(state.messagesByChatId || {})) {
          sanitizedMessagesByChatId[cId] = sanitizeMsgs(msgs);
        }
        return {
          usersById: state.usersById,
          chats: state.chats,
          pinnedChatIds: state.pinnedChatIds,
          deletedChatIds: state.deletedChatIds,
          deletedChatSessions: state.deletedChatSessions,
          messagesByChatId: sanitizedMessagesByChatId,
          myCode: state.myCode,
          codeRotationSpeed: state.codeRotationSpeed,
          nextCodeRotationTime: state.nextCodeRotationTime,
          incomingFriendRequests: state.incomingFriendRequests,
        };
      },
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
      setAppIcon: (icon) => {
        set({ appIcon: icon, notificationIcon: icon });
        if (typeof window !== 'undefined') {
          (window as any).orbita?.setAppIcon?.(icon);
          (window as any).orbita?.setNotificationIcon?.(icon);
        }
      },
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
      setGhostModeEnabled: (enabled) => {
        if (get().ghostModeEnabled === enabled) return;
        set({ ghostModeEnabled: enabled });
        if (typeof window !== 'undefined' && window.orbita?.setGhostMode) {
          window.orbita.setGhostMode(enabled).catch(() => {});
        }
        if (typeof window !== 'undefined' && (window as any).ablyService) {
          const authUserId = getAuthStoreState()?.userId;
          const myId = authUserId || get().myCode;
          if (myId) {
            if (enabled) {
              (window as any).ablyService.setOffline(myId);
            } else {
              (window as any).ablyService.setOnline(myId);
            }
          }
        }
      },
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
      setAnonymousForwardingEnabled: (enabled) => set({ anonymousForwardingEnabled: enabled }),
      setPendingForwardMessages: (messages) => set({ pendingForwardMessages: messages }),
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
      setChatElementAnimations: (enabled) => set({ chatElementAnimations: enabled }),
      setMessageDeleteAnimation: (enabled) => set({ messageDeleteAnimation: enabled }),
      setCallAnimationsEnabled: (enabled) => set({ callAnimationsEnabled: enabled }),

      shouldAutoLoadMedia: (type, sizeBytes, isOwn) => {
        if (isOwn) return true;
        const state = get();
        if (state.autoLoadMedia === false) return false;

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
        const targetChat = state.chats.find(c => c.id === chatId || (chatId.startsWith('lobby_') ? c.id === chatId.replace(/^lobby_/, '') : c.id === `lobby_${chatId}`));
        if (!targetChat) return;
        const actualChatId = targetChat.id;

        set((s) => {
          const restMessages = Object.fromEntries(
            Object.entries(s.messagesByChatId).filter(([k]) => k !== actualChatId && !k.startsWith(`${actualChatId}:`))
          );
          const { [actualChatId]: __, ...restSessions } = s.deletedChatSessions || {};
          return {
            chats: s.chats.filter(c => c.id !== actualChatId),
            activeChatId: (s.activeChatId === actualChatId || (s.activeChatId && s.activeChatId.startsWith(`${actualChatId}:`))) ? null : s.activeChatId,
            activeProfileChatId: s.activeProfileChatId === actualChatId ? null : s.activeProfileChatId,
            messagesByChatId: restMessages,
            pinnedChatIds: (s.pinnedChatIds || []).filter((id) => id !== actualChatId),
            deletedChatIds: Array.from(new Set([...(s.deletedChatIds || []), actualChatId])),
            deletedChatSessions: restSessions,
          };
        });

        mediaManager.deleteByChatId(actualChatId).catch(err => {
          console.error('[ChatStore] Failed to delete media cache for chat:', actualChatId, err);
        });

        if (typeof window !== 'undefined' && (window as any).orbita?.storageDeleteMessages) {
          (window as any).orbita.storageDeleteMessages(actualChatId).catch(() => {});
        }

        if (actualChatId.startsWith('lobby_')) {
          sqliteStorage.getJson<any[]>(`orbita_lobby_channels_${actualChatId}`, []).then((channels) => {
            if (Array.isArray(channels)) {
              for (const ch of channels) {
                if (ch && ch.id) {
                  sqliteStorage.remove(`orbita_reactions_${actualChatId}:${ch.id}`).catch(() => {});
                  if (typeof window !== 'undefined' && (window as any).orbita?.storageDeleteMessages) {
                    (window as any).orbita.storageDeleteMessages(`${actualChatId}:${ch.id}`).catch(() => {});
                  }
                }
              }
            }
            sqliteStorage.remove(`orbita_lobby_channels_${actualChatId}`).catch(() => {});
            sqliteStorage.remove(`orbita_lobby_members_${actualChatId}`).catch(() => {});
            sqliteStorage.remove(`orbita_reactions_${actualChatId}`).catch(() => {});
          }).catch(() => {});
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
