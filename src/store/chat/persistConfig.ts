import { createJSONStorage, PersistOptions } from 'zustand/middleware';
import { ipcStorage } from './storage';
import { ChatState, Message, MAX_MESSAGES_PER_CHAT } from './types';

export const chatStorePersistConfig: PersistOptions<ChatState, any> = {
  name: 'orbita-chat-storage',
  skipHydration: true,
  storage: createJSONStorage(() => ipcStorage),
  partialize: (state) => ({
    usersById: state.usersById,
    chats: state.chats,
    pinnedChatIds: state.pinnedChatIds,
    deletedChatIds: state.deletedChatIds,
    deletedChatSessions: Object.fromEntries(
      Object.entries(state.deletedChatSessions || {}).map(([id, session]) => {
        const { messages: _, ...rest } = (session as any) || {};
        return [id, rest];
      })
    ),
    passcode: state.passcode,
    currentTheme: state.currentTheme,
    dotOverlay: state.dotOverlay,
    blurProtection: state.blurProtection,
    hideOnBackground: state.hideOnBackground,
    hideFromScreenCapture: state.hideFromScreenCapture,
    proxyActive: state.proxyActive,
    activeProxyInfo: state.activeProxyInfo,
    myCode: state.myCode,
    codeRotationSpeed: state.codeRotationSpeed,
    nextCodeRotationTime: state.nextCodeRotationTime,
    messageTTLSeconds: state.messageTTLSeconds,
    incomingFriendRequests: state.incomingFriendRequests,
    eyeCareEnabled: state.eyeCareEnabled,
    eyeCareOpacity: state.eyeCareOpacity,
    eyeCareDensity: state.eyeCareDensity,
    screenCaptureProtection: state.screenCaptureProtection,
    minimizeToTray: state.minimizeToTray,
    fontFamily: state.fontFamily,
    textScale: state.textScale,
    dotColor: state.dotColor,
    language: state.language,
    headerEnabled: state.headerEnabled,
    headerTitle: state.headerTitle,
    ringEnabled: state.ringEnabled,
    notificationCount: state.notificationCount,
    notificationPosition: state.notificationPosition,
    notificationHideContent: state.notificationHideContent,
    notificationPreviewTheme: state.notificationPreviewTheme,
    bubbleRadius: state.bubbleRadius,
    notificationSoundEnabled: state.notificationSoundEnabled,
    notificationsEnabled: state.notificationsEnabled,
    notificationFlashTaskbar: state.notificationFlashTaskbar,
    notificationVolume: state.notificationVolume,
    notificationShowName: state.notificationShowName,
    notificationShowText: state.notificationShowText,
    notificationNativeWindows: state.notificationNativeWindows,
    notificationRespectFocus: state.notificationRespectFocus,
    appIcon: state.appIcon,
    notificationIcon: state.notificationIcon,
    voiceCallsEnabled: state.voiceCallsEnabled,
    readReceiptsEnabled: state.readReceiptsEnabled,
    typingIndicatorsEnabled: state.typingIndicatorsEnabled,
    linkPreviewsEnabled: state.linkPreviewsEnabled,
    recentEmojis: state.recentEmojis,
    autoUpdate: state.autoUpdate,
    showInSystemTray: state.showInSystemTray,
    autoLaunch: state.autoLaunch,
    sendOnEnter: state.sendOnEnter,
    useImprovedPlayer: state.useImprovedPlayer,
    noiseSuppression: state.noiseSuppression,
    noiseSuppressionMode: state.noiseSuppressionMode,
    noiseSuppressionVoice: state.noiseSuppression,
    noiseSuppressionCalls: state.noiseSuppression,
    cacheSizeLimit: state.cacheSizeLimit,
    mediaCacheLimit: state.mediaCacheLimit,
    cacheCleanupAge: state.cacheCleanupAge,
    autoLoadMedia: state.autoLoadMedia,
    autoLoadPhotos: state.autoLoadPhotos,
    autoLoadVideos: state.autoLoadVideos,
    autoLoadAudio: state.autoLoadAudio,
    autoLoadFiles: state.autoLoadFiles,
    autoLoadMaxPhotoSizeMb: state.autoLoadMaxPhotoSizeMb,
    autoLoadMaxVideoSizeMb: state.autoLoadMaxVideoSizeMb,
    autoLoadMaxAudioSizeMb: state.autoLoadMaxAudioSizeMb,
    autoLoadMaxFileSizeMb: state.autoLoadMaxFileSizeMb,
    stickersAutoplayPanel: state.stickersAutoplayPanel,
    stickersAutoplayChat: state.stickersAutoplayChat,
    chatAutoPlayVideos: state.chatAutoPlayVideos,
    callAnimationsEnabled: state.callAnimationsEnabled,
    draftsByChatId: state.draftsByChatId,
    callSoundsEnabled: state.callSoundsEnabled,
    alwaysRelayCalls: state.alwaysRelayCalls,
    selectedCameraId: state.selectedCameraId,
    selectedMicrophoneId: state.selectedMicrophoneId,
    selectedSpeakerId: state.selectedSpeakerId,
    screenProtectionEnabled: state.screenProtectionEnabled,
    hideMenuBar: state.hideMenuBar,
    folders: state.folders || [],
    activeFolderId: state.activeFolderId,
  }),
  version: 37,
  migrate: (persistedState: any, version: number) => {
    if (version < 33) {
      const state = persistedState;
      if (state.chats) {
        const messagesByChatId: Record<string, Message[]> = {};
        for (const chat of state.chats) {
          if (chat.messages && Array.isArray(chat.messages)) {
            messagesByChatId[chat.id] = chat.messages.slice(-MAX_MESSAGES_PER_CHAT);
            delete chat.messages;
          }
        }
        state.messagesByChatId = messagesByChatId;
      }
      return state;
    }
    if (version < 34) {
      persistedState.autoLoadMedia = false;
      return persistedState;
    }
    if (version < 35) {
      persistedState.noiseSuppression = persistedState.noiseSuppression ?? persistedState.noiseSuppressionCalls ?? persistedState.noiseSuppressionVoice ?? true;
      return persistedState;
    }
    if (version < 36) {
      persistedState.noiseSuppressionMode = persistedState.noiseSuppressionMode ?? (persistedState.noiseSuppression === false ? 'none' : 'standard');
      return persistedState;
    }
    if (version < 37) {
      if (!persistedState.noiseSuppressionMode || persistedState.noiseSuppressionMode === 'krisp') {
        persistedState.noiseSuppressionMode = 'standard';
      }
      return persistedState;
    }
    return persistedState;
  },
  onRehydrateStorage: () => (state) => {
    if (state) {
      state.setHasHydrated(true);
      state.preloadRecentMessagesFromStorage();
    }
    if (state && !Array.isArray(state.pinnedChatIds)) {
      state.pinnedChatIds = [];
    }
    if (state && Array.isArray(state.chats)) {
      const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const privateChats = state.chats.filter((c) => c.type === 'private' && c.id !== 'notes');
      const otherChats = state.chats
        .filter((c) => c.type !== 'private' || c.id === 'notes')
        .filter((c) => !(c.type === 'channel' && !c.isOwner && c.isSubscribed === false))
        .map((c) => ({
          ...c,
          online: false,
        }));

      const groups: typeof privateChats[] = [];
      for (const chat of privateChats) {
        let foundGroup = groups.find((group) =>
          group.some((c) => {
            if (c.id === chat.id) return true;
            if (chat.peerCode && (c.peerCode === chat.peerCode || c.originalPeerCode === chat.peerCode)) return true;
            if (chat.originalPeerCode && (c.peerCode === chat.originalPeerCode || c.originalPeerCode === chat.originalPeerCode)) return true;
            if (c.peerCode && (chat.peerCode === c.peerCode || chat.originalPeerCode === c.peerCode)) return true;
            if (chat.peerPublicKey && c.peerPublicKey && c.peerPublicKey === chat.peerPublicKey) return true;
            if (chat.numericId && c.numericId && c.numericId === chat.numericId) return true;
            if (chat.username && c.username && chat.username.toLowerCase() === c.username.toLowerCase()) return true;
            return false;
          })
        );
        if (foundGroup) {
          foundGroup.push(chat);
        } else {
          groups.push([chat]);
        }
      }

      const deduplicatedPrivate: typeof privateChats = [];
      const messagesMap = state.messagesByChatId || {};

      for (const group of groups) {
        if (group.length === 1) {
          deduplicatedPrivate.push({ ...group[0], online: false });
          continue;
        }

        let canonical = group.find((c) => isUuid(c.id)) || group[0];
        let mergedMessages: Message[] = messagesMap[canonical.id] ? [...messagesMap[canonical.id]] : [];
        const seenMsgKeys = new Set(mergedMessages.map((m) => m.id || `${m.time}_${m.text}`));

        for (const dup of group) {
          if (dup.id === canonical.id) continue;
          const dupMsgs = messagesMap[dup.id] || [];
          for (const m of dupMsgs) {
            const key = m.id || `${m.time}_${m.text}`;
            if (!seenMsgKeys.has(key)) {
              seenMsgKeys.add(key);
              mergedMessages.push(m);
            }
          }
          delete messagesMap[dup.id];

          if (typeof window !== 'undefined' && (window as any).orbita?.storageMigrateChat) {
            (window as any).orbita.storageMigrateChat(dup.id, canonical.id).catch(() => {});
          }

          if (state.activeChatId === dup.id) {
            state.activeChatId = canonical.id;
          }
          if (state.activeProfileChatId === dup.id) {
            state.activeProfileChatId = canonical.id;
          }

          canonical = {
            ...dup,
            ...canonical,
            id: canonical.id,
            online: false,
            ratchetState: canonical.ratchetState || dup.ratchetState,
            sharedSecret: canonical.sharedSecret || dup.sharedSecret,
            peerPublicKey: canonical.peerPublicKey || dup.peerPublicKey,
            avatarUrl: canonical.avatarUrl || dup.avatarUrl,
            bannerUrl: canonical.bannerUrl || dup.bannerUrl,
            username: canonical.username || dup.username,
            description: canonical.description || dup.description,
            numericId: canonical.numericId || dup.numericId,
            peerCode: canonical.peerCode || dup.peerCode,
            originalPeerCode: canonical.originalPeerCode || dup.originalPeerCode,
            name: (canonical.name && canonical.name !== 'Unknown') ? canonical.name : dup.name,
          };
        }

        mergedMessages.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
        messagesMap[canonical.id] = mergedMessages;
        deduplicatedPrivate.push(canonical);
      }

      state.chats = [...otherChats, ...deduplicatedPrivate];
      state.messagesByChatId = messagesMap;
      if (state.activeChatId && !state.chats.some((c) => c.id === state.activeChatId)) {
        state.activeChatId = null;
      }
    }
    if (state && state.messagesByChatId) {
      const cleaned: Record<string, Message[]> = {};
      for (const [cId, msgs] of Object.entries(state.messagesByChatId)) {
        if (Array.isArray(msgs)) {
          cleaned[cId] = msgs.map((m) => {
            if (m.uploading || m.status === 'sending' || m.status === 'pending') {
              const hasRemoteUrl = Boolean(m.mediaUrl && !m.mediaUrl.startsWith('blob:') && (m.mediaUrl.startsWith('http') || m.mediaUrl.startsWith('orbita-media:')));
              const hasRemoteItems = Boolean(m.mediaItems && m.mediaItems.length > 0 && m.mediaItems.every((it) => it.url && !it.url.startsWith('blob:') && it.url.startsWith('http')));
              if (hasRemoteUrl || hasRemoteItems || !m.isOutgoing) {
                return { ...m, uploading: false, status: 'sent' as const };
              }
              return { ...m, uploading: false };
            }
            return m;
          });
        }
      }
      state.messagesByChatId = cleaned;
    }
    if (state && typeof window !== 'undefined' && (window as any).orbita) {
      if (typeof state.screenProtectionEnabled === 'boolean' && (window as any).orbita.setScreenProtection) {
        (window as any).orbita.setScreenProtection(state.screenProtectionEnabled).catch(() => {});
      }
      if (typeof state.hideMenuBar === 'boolean' && (window as any).orbita.setHideMenuBar) {
        (window as any).orbita.setHideMenuBar(state.hideMenuBar).catch(() => {});
      }
      if (typeof state.showInSystemTray === 'boolean' && (window as any).orbita.setShowInSystemTray) {
        (window as any).orbita.setShowInSystemTray(state.showInSystemTray).catch(() => {});
      }
    }
  },
};
