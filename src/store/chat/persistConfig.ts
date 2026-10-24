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
      state.chats = state.chats
        .filter((c) => !(c.type === 'channel' && !c.isOwner && c.isSubscribed === false))
        .map((c) => ({
          ...c,
          online: false,
        }));
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
