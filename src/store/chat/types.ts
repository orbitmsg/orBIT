import { ThemeId } from '../../theme';
import { RatchetState } from '../../lib/double-ratchet';
import type { NoiseSuppressionMode } from '../../services/neuralAudioProcessor';

export type RotationSpeed = 600 | 3600 | 10800 | 18000 | 36000 | 0;

export type FontFamily =
  | 'system'
  | 'Segoe UI'
  | 'Segoe UI Black'
  | 'Inter'
  | 'Roboto'
  | 'Open Sans'
  | 'Lato'
  | 'Montserrat'
  | 'Poppins'
  | 'Nunito'
  | 'Rubik'
  | 'Fira Sans'
  | 'Ubuntu'
  | 'Manrope'
  | 'Arial'
  | 'Arial Black'
  | 'Trebuchet MS'
  | 'Verdana'
  | 'Tahoma'
  | 'Georgia'
  | 'Times New Roman'
  | 'Merriweather'
  | 'Playfair Display'
  | 'Fira Code'
  | 'JetBrains Mono'
  | 'Consolas'
  | 'Courier New'
  | 'Comic Sans MS'
  | 'Caveat'
  | 'Pacifico';

export const FONT_MAP: Record<FontFamily, string> = {
  'system': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, sans-serif",
  'Segoe UI': "'Segoe UI', 'Segoe', system-ui, sans-serif",
  'Segoe UI Black': "'Segoe UI Black', 'Segoe UI', system-ui, sans-serif",
  'Inter': "'Inter', system-ui, sans-serif",
  'Roboto': "'Roboto', sans-serif",
  'Open Sans': "'Open Sans', sans-serif",
  'Lato': "'Lato', sans-serif",
  'Montserrat': "'Montserrat', sans-serif",
  'Poppins': "'Poppins', sans-serif",
  'Nunito': "'Nunito', sans-serif",
  'Rubik': "'Rubik', sans-serif",
  'Fira Sans': "'Fira Sans', sans-serif",
  'Ubuntu': "'Ubuntu', sans-serif",
  'Manrope': "'Manrope', sans-serif",
  'Arial': "Arial, Helvetica, sans-serif",
  'Arial Black': "'Arial Black', 'Arial Bold', sans-serif",
  'Trebuchet MS': "'Trebuchet MS', sans-serif",
  'Verdana': "Verdana, Geneva, sans-serif",
  'Tahoma': "Tahoma, Geneva, sans-serif",
  'Georgia': "Georgia, serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Merriweather': "'Merriweather', Georgia, serif",
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'Fira Code': "'Fira Code', monospace",
  'JetBrains Mono': "'JetBrains Mono', monospace",
  'Consolas': "Consolas, 'Courier New', monospace",
  'Courier New': "'Courier New', Courier, monospace",
  'Comic Sans MS': "'Comic Sans MS', 'Comic Sans', cursive",
  'Caveat': "'Caveat', cursive",
  'Pacifico': "'Pacifico', cursive",
};

export type Language =
  | 'ru' | 'en' | 'zh' | 'zh-Hant'
  | 'de' | 'fr' | 'es' | 'it'
  | 'ja' | 'ko' | 'pt' | 'tr'
  | 'uk' | 'be' | 'kk' | 'hi'
  | 'nl' | 'pl'
  | null;

export type HeaderTitleOption = 'orbita' | 'nickname' | 'all_chats';
export type NotificationPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right';
export type NotificationPreviewTheme = 'dark' | 'light';
export type IconOption = 'orbita1' | 'orbita4';
export type ChatAction = 'typing' | 'sticker' | 'voice';

export interface ChatTypingUser {
  nickname: string;
  action: ChatAction;
}

export interface MediaItem {
  type: 'photo' | 'video' | 'audio' | 'file' | 'gif';
  url: string;
  key?: string;
  name?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  audioMetadata?: AudioMetadata;
  thumbnail?: string | null;
  blurPreview?: string;
  preview?: string | null;
  localFilePath?: string;
  uploading?: boolean;
  uploadedMb?: number;
  senderId?: string;
}

export interface AudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover?: string | null;
}

export interface LinkPreviewData {
  url: string;
  siteName?: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface ForwardedFrom {
  sender?: string;
  senderId?: string;
  senderAvatarUrl?: string | null;
  isIdHidden?: boolean;
  chatId?: string;
  chatTitle?: string;
  time?: number;
  isAnonymous?: boolean;
}

export interface ChatFolder {
  id: string;
  name: string;
  chatIds: string[];
}

export interface Message {
  id?: string;
  chatId?: string;
  senderId?: string;
  sender: string;
  isOutgoing?: boolean;
  text: string;
  encryptedText?: string;
  index?: number;
  time: number;
  ttlSeconds?: number;
  expiresAt?: number;
  read?: boolean;
  status?: 'sent' | 'delivered' | 'read' | 'pending' | 'sending' | 'failed' | 'error';
  uploading?: boolean;
  uploadedMb?: number;
  mediaType?: 'photo' | 'video' | 'audio' | 'voice' | 'file' | 'call' | 'emoji' | 'gif' | 'sticker' | 'system' | null;
  systemType?: 'join' | 'join_link' | 'pin' | 'leave' | 'title' | 'avatar' | 'admin' | 'unadmin' | 'call' | 'call_ended' | 'kick' | 'create' | 'invite';
  actorNickname?: string;
  targetNickname?: string;
  roomName?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaKey?: string;
  mime?: string;
  fileSize?: number;
  mediaItems?: MediaItem[];
  audioMetadata?: AudioMetadata;
  thumbnail?: string;
  blurPreview?: string;
  preview?: string | null;
  localFilePath?: string;
  width?: number;
  height?: number;
  duration?: number;
  waveform?: number[];
  reactions?: Record<string, string[]>;
  linkPreview?: LinkPreviewData;
  buttons?: Array<{ text: string; action: string; channelId?: string; url?: string; data?: string; icon?: 'channel' | 'backup' | 'help' | 'link' }>;
  forwarded_from?: ForwardedFrom;
  forwardedFrom?: ForwardedFrom;
  isEdited?: boolean;
  editedAt?: number;
  isListened?: boolean;
}

export interface ChatMember {
  userId?: string;
  userCode?: string;
  user_code?: string;
  user_id?: string;
  nickname: string;
  role: 'owner' | 'admin' | 'member';
  lastSeen: number;
  avatarUrl?: string | null;
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  username?: string | null;
  bio?: string | null;
  birthday?: string | null;
  role?: string;
  updatedAt?: number;
}

export function isMessageOutgoing(
  msg: Message | null | undefined,
  myCode?: string | null,
  _myNickname?: string | null,
  chat?: Chat | null,
  myUserId?: string | null
): boolean {
  if (!msg) return false;
  if (chat && chat.id === 'notes') {
    return true;
  }
  if (myUserId) {
    if (msg.senderId && msg.senderId === myUserId) {
      return true;
    }
    if ((msg as any).author_id && (msg as any).author_id === myUserId) {
      return true;
    }
    if ((msg as any).senderUserId && (msg as any).senderUserId === myUserId) {
      return true;
    }
    if (chat && chat.type === 'channel') {
      const isOwnerById = (chat.creatorId && chat.creatorId === myUserId) ||
                          (chat.isOwner && (!chat.creatorId || chat.creatorId === myUserId));
      if (isOwnerById) {
        if (msg.senderId && msg.senderId !== myUserId) {
          return false;
        }
        return true;
      }
    }
  }
  if (myCode && (msg.senderId === myCode || (msg as any).senderCode === myCode)) {
    return true;
  }
  if (typeof msg.isOutgoing === 'boolean') {
    return msg.isOutgoing;
  }
  if (chat && chat.type === 'private') {
    if (chat.peerCode && (msg.senderId === chat.peerCode || (msg as any).senderCode === chat.peerCode || (msg as any).author_id === chat.peerCode)) {
      return false;
    }
    if (chat.originalPeerCode && (msg.senderId === chat.originalPeerCode || (msg as any).senderCode === chat.originalPeerCode || (msg as any).author_id === chat.originalPeerCode)) {
      return false;
    }
    if (chat.id && chat.id.length === 36 && (msg.senderId === chat.id || (msg as any).senderCode === chat.id || (msg as any).author_id === chat.id)) {
      return false;
    }
  }
  return false;
}

export interface Chat {
  id: string;
  type: 'private' | 'group' | 'channel' | 'bot';
  name: string;
  lastMsg: string;
  online: boolean;
  sharedSecret?: string;
  ratchetState?: RatchetState;
  pinnedMessage?: { id?: string; messageId?: string; sender: string; text: string; time: number } | null;
  role?: 'owner' | 'admin' | 'member';
  lastSeen?: number;
  members?: ChatMember[];
  inviteCode?: string;
  code?: string;
  inviteCodeTTL?: number;
  inviteActive?: boolean;
  inviteExpiresAt?: number | null;
  createdAt?: number;
  unreadCount?: number;
  lastReadTimestamp?: number;
  lastReadMessageId?: string;
  isChatInitiator?: boolean;
  avatarUrl?: string;
  bannerUrl?: string | null;
  isArchived?: boolean;
  muted?: boolean;
  notificationsEnabled?: boolean;
  description?: string;
  username?: string | null;
  numericId?: string | null;
  birthday?: string | null;
  creatorId?: string;
  creatorCode?: string;
  creatorNickname?: string;
  subscribersCount?: number;
  isOwner?: boolean;
  isOfficial?: boolean;
  isSubscribed?: boolean;
  channelKey?: string;
  peerCode?: string;
  originalPeerCode?: string;
  isBlocked?: boolean;
  isDraft?: boolean;
  peerPublicKey?: string | null;
  updatedAt?: number;
  activeCallRoom?: string | null;
  membersCount?: number;
  onlineCount?: number;
  onlineMemberIds?: string[];
}

export interface IncomingFriendRequest {
  id: string;
  chatId: string;
  senderNickname: string;
  senderCode: string;
  senderPublicKey: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  username?: string | null;
  numericId?: string | null;
  bio?: string | null;
  birthday?: string | null;
  createdAt: number;
}

export interface ActiveProxyInfo {
  protocol: string;
  address: string;
  port: number;
}

export interface InChatSearchState {
  isOpen: boolean;
  scope: 'this_chat' | 'all_chats';
  query: string;
  jumpTarget: {
    chatId: string;
    messageIndex: number;
    messageId?: string;
    timestamp: number;
  } | null;
}

export const TEXT_SCALE_MIN = 75;
export const TEXT_SCALE_MAX = 200;
export const MAX_MESSAGES_PER_CHAT = 1000;

export function clampTextScale(value: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : 100;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, n));
}

export interface ChatState {
  usersById: Record<string, UserProfile>;
  setUserProfile: (userId: string, profile: Partial<UserProfile> & { nickname?: string }) => void;
  getUserProfile: (userId: string) => UserProfile | undefined;
  chats: Chat[];
  pinnedChatIds: string[];
  activeChatId: string | null;
  activeProfileChatId: string | null;
  messagesByChatId: Record<string, Message[]>;
  deletingMessageIds?: Record<string, boolean>;
  passcode: string | null;
  currentTheme: ThemeId;
  chatColor: string;
  currentView: 'chats' | 'settings';
  dotOverlay: boolean;
  blurProtection: boolean;
  hideOnBackground: boolean;
  hideFromScreenCapture: boolean;
  proxyActive: boolean;
  activeProxyInfo: ActiveProxyInfo | null;
  myCode: string;
  codeRotationSpeed: RotationSpeed;
  nextCodeRotationTime: number;
  messageTTLSeconds: number;
  incomingFriendRequests: IncomingFriendRequest[];
  eyeCareEnabled: boolean;
  eyeCareOpacity: number;
  eyeCareDensity: number;
  screenCaptureProtection: boolean;
  minimizeToTray: boolean;
  isHandshaking: boolean;
  fontFamily: FontFamily;
  textScale: number;
  dotColor: string;
  language: Language;
  headerEnabled: boolean;
  headerTitle: HeaderTitleOption;
  ringEnabled: boolean;
  notificationCount: number;
  notificationPosition: NotificationPosition;
  notificationHideContent: boolean;
  notificationPreviewTheme: NotificationPreviewTheme;
  bubbleRadius: number;
  notificationSoundEnabled: boolean;
  notificationsEnabled: boolean;
  notificationFlashTaskbar: boolean;
  notificationVolume: number;
  notificationShowName: boolean;
  notificationShowText: boolean;
  notificationNativeWindows: boolean;
  notificationRespectFocus: boolean;
  appIcon: IconOption;
  notificationIcon: IconOption;

  voiceCallsEnabled: boolean;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  typingByChatId: Record<string, ChatTypingUser[]>;
  linkPreviewsEnabled: boolean;
  anonymousForwardingEnabled: boolean;
  pendingForwardMessages: Message[] | null;
  _hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;

  recentEmojis: string[];

  isEmojiPanelOpen: boolean;
  toggleEmojiPanel: () => void;
  setEmojiPanelOpen: (open: boolean) => void;

  isMediaViewerOpen: boolean;
  setMediaViewerOpen: (open: boolean) => void;

  isRecordingVoice: boolean;
  setIsRecordingVoice: (recording: boolean) => void;

  isUploadingMedia: boolean;
  setIsUploadingMedia: (uploading: boolean) => void;

  autoUpdate: boolean;
  downloadedUpdateVersion: string | null;
  isUpdateBannerDismissed: boolean;
  setDownloadedUpdateVersion: (version: string | null) => void;
  dismissUpdateBanner: () => void;
  showInSystemTray: boolean;
  autoLaunch: boolean;
  sendOnEnter: boolean;
  useImprovedPlayer: boolean;
  noiseSuppression: boolean;
  setNoiseSuppression: (enabled: boolean) => void;
  noiseSuppressionMode: NoiseSuppressionMode;
  setNoiseSuppressionMode: (mode: NoiseSuppressionMode) => void;
  noiseSuppressionVoice: boolean;
  noiseSuppressionCalls: boolean;
  setNoiseSuppressionVoice: (enabled: boolean) => void;
  setNoiseSuppressionCalls: (enabled: boolean) => void;

  callSoundsEnabled: boolean;
  setCallSoundsEnabled: (enabled: boolean) => void;
  alwaysRelayCalls: boolean;
  setAlwaysRelayCalls: (enabled: boolean) => void;
  selectedCameraId: string;
  setSelectedCameraId: (id: string) => void;
  selectedMicrophoneId: string;
  setSelectedMicrophoneId: (id: string) => void;
  selectedSpeakerId: string;
  setSelectedSpeakerId: (id: string) => void;
  screenProtectionEnabled: boolean;
  setScreenProtectionEnabled: (enabled: boolean) => void;
  hideMenuBar: boolean;
  setHideMenuBar: (hide: boolean) => void;

  cacheSizeLimit: number;
  mediaCacheLimit: number;
  cacheCleanupAge: number;

  autoLoadMedia: boolean;
  autoLoadPhotos: boolean;
  autoLoadVideos: boolean;
  autoLoadAudio: boolean;
  autoLoadFiles: boolean;
  autoLoadMaxPhotoSizeMb: number;
  autoLoadMaxVideoSizeMb: number;
  autoLoadMaxAudioSizeMb: number;
  autoLoadMaxFileSizeMb: number;

  stickersAutoplayPanel: boolean;
  stickersAutoplayChat: boolean;
  chatAutoPlayVideos: boolean;
  chatElementAnimations: boolean;
  messageDeleteAnimation: boolean;
  callAnimationsEnabled: boolean;

  setStickersAutoplayPanel: (enabled: boolean) => void;
  setStickersAutoplayChat: (enabled: boolean) => void;
  setChatAutoPlayVideos: (enabled: boolean) => void;
  setChatElementAnimations: (enabled: boolean) => void;
  setMessageDeleteAnimation: (enabled: boolean) => void;
  setCallAnimationsEnabled: (enabled: boolean) => void;

  setAutoLoadMedia: (enabled: boolean) => void;
  setAutoLoadPhotos: (enabled: boolean) => void;
  setAutoLoadVideos: (enabled: boolean) => void;
  setAutoLoadAudio: (enabled: boolean) => void;
  setAutoLoadFiles: (enabled: boolean) => void;
  setAutoLoadMaxPhotoSizeMb: (mb: number) => void;
  setAutoLoadMaxVideoSizeMb: (mb: number) => void;
  setAutoLoadMaxAudioSizeMb: (mb: number) => void;
  setAutoLoadMaxFileSizeMb: (mb: number) => void;

  shouldAutoLoadMedia: (type: 'photo' | 'video' | 'audio' | 'voice' | 'file' | string, sizeBytes?: number | null, isOwn?: boolean) => boolean;

  draftsByChatId: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;

  inChatSearch: InChatSearchState;
  openInChatSearch: (scope?: 'this_chat' | 'all_chats') => void;
  closeInChatSearch: () => void;
  setInChatSearchScope: (scope: 'this_chat' | 'all_chats') => void;
  setInChatSearchQuery: (query: string) => void;
  jumpToChatMessage: (chatId: string, messageIndex: number, messageId?: string) => void;

  setMyCode: (code: string) => void;
  setCodeRotationSpeed: (speed: RotationSpeed) => void;
  setNextCodeRotationTime: (time: number) => void;
  setActiveChat: (id: string | null) => void;
  setActiveProfileChatId: (id: string | null) => void;
  addChat: (chat: Partial<Chat> & { ratchetState?: RatchetState; id?: string }) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  togglePinChat: (chatId: string) => void;
  toggleArchiveChat: (chatId: string) => void;
  updateLastMsg: (chatId: string, msg: string) => void;
  addMessage: (chatId: string, message: Message, encryptedText?: string, index?: number) => void;
  addMessagesBatch: (
    items: Array<{
      chatId: string;
      message: Message;
      encryptedText?: string;
      index?: number;
    }>
  ) => void;
  deleteMessage: (chatId: string, messageId: string, immediate?: boolean) => void;
  deleteMessages: (chatId: string, messageIds: string[]) => void;
  markVoiceListened: (chatId: string, messageId: string) => void;
  updateMessageStatus: (chatId: string, messageId: string, status: Message['status']) => void;
  updateMessageMediaDimensions: (chatId: string, messageId: string, width: number, height: number, itemIdx?: number) => void;
  editMessage: (chatId: string, messageId: string, newText: string, encryptedText?: string, index?: number) => void;
  toggleReaction: (chatId: string, messageIndexOrId: number | string, emoji: string, user: string) => void;
  setReaction: (chatId: string, messageIndexOrId: number | string, emoji: string, user: string, action?: 'add' | 'remove' | 'toggle', userAliases?: string[]) => 'add' | 'remove' | 'limit_reached';
  syncReactionsFromSupabase: (chatId: string) => Promise<void>;
  getMessages: (chatId: string) => Message[];
  preloadRecentMessagesFromStorage: () => Promise<void>;
  setPasscode: (code: string | null) => void;
  setTheme: (theme: ThemeId) => void;
  setChatColor: (color: string) => void;
  resetChatColor: () => void;
  toggleDots: () => void;
  setCurrentView: (view: 'chats' | 'settings') => void;
  initialSettingsTab?: string;
  openSettings: (tab?: string) => void;
  setBlurProtection: (type: 'hideOnBackground' | 'hideFromScreenCapture' | 'main', val: boolean) => void;
  setProxyActive: (active: boolean, info?: ActiveProxyInfo | null) => void;
  setMessageTTL: (seconds: number) => void;
  setEyeCareEnabled: (enabled: boolean) => void;
  setEyeCareOpacity: (opacity: number) => void;
  setEyeCareDensity: (density: number) => void;
  setScreenCaptureProtection: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  resetChats: () => void;
  exportChatState: () => any;
  importChatState: (data: any) => void;
  createGroupChat: (name: string, ttl: number) => void;
  joinGroupByCode: (inviteCode: string, callback: (success: boolean, error?: string) => void) => void;
  setIsHandshaking: (val: boolean) => void;
  markChatAsRead: (chatId: string) => void;
  getUnreadChatsCount: () => number;
  closeChat: () => void;
  setFontFamily: (font: FontFamily) => void;
  setTextScale: (scale: number) => void;
  setDotColor: (color: string) => void;
  setLanguage: (lang: Language) => void;
  setHeaderEnabled: (enabled: boolean) => void;
  setHeaderTitle: (title: HeaderTitleOption) => void;
  setRingEnabled: (enabled: boolean) => void;
  setNotificationCount: (count: number) => void;
  setNotificationPosition: (position: NotificationPosition) => void;
  setNotificationHideContent: (hide: boolean) => void;
  setNotificationPreviewTheme: (theme: NotificationPreviewTheme) => void;
  setBubbleRadius: (radius: number) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationFlashTaskbar: (enabled: boolean) => void;
  setNotificationVolume: (volume: number) => void;
  setNotificationShowName: (show: boolean) => void;
  setNotificationShowText: (show: boolean) => void;
  setNotificationNativeWindows: (enabled: boolean) => void;
  setNotificationRespectFocus: (enabled: boolean) => void;
  setAppIcon: (icon: IconOption) => void;
  setNotificationIcon: (icon: IconOption) => void;
  toggleChatMuted: (chatId: string) => void;
  toggleChatNotifications: (chatId: string) => void;
  toggleChatBlocked: (chatId: string) => void;

  setVoiceCallsEnabled: (enabled: boolean) => void;
  setReadReceiptsEnabled: (enabled: boolean) => void;
  setTypingIndicatorsEnabled: (enabled: boolean) => void;
  setChatTyping: (chatId: string, users: ChatTypingUser[]) => void;
  setLinkPreviewsEnabled: (enabled: boolean) => void;
  setAnonymousForwardingEnabled: (enabled: boolean) => void;
  setPendingForwardMessages: (messages: Message[] | null) => void;

  addRecentEmoji: (emoji: string) => void;
  getRecentEmojis: () => string[];

  setAutoUpdate: (enabled: boolean) => void;
  setShowInSystemTray: (enabled: boolean) => void;
  setAutoLaunch: (enabled: boolean) => void;
  setSendOnEnter: (enabled: boolean) => void;
  setUseImprovedPlayer: (enabled: boolean) => void;

  setCacheSizeLimit: (limit: number) => void;
  setMediaCacheLimit: (limit: number) => void;
  setCacheCleanupAge: (age: number) => void;

  deleteChat: (chatId: string) => void;
  deletedChatIds: string[];
  deletedChatSessions: Record<string, Chat>;
  restoreDeletedChat: (chatId: string) => Chat | null;
  addIncomingFriendRequest: (req: IncomingFriendRequest) => void;
  removeIncomingFriendRequest: (id: string) => void;
  clearIncomingFriendRequests: () => void;
  addChannelChat: (channel: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string | null;
    creatorNickname?: string;
    creatorId?: string | null;
    isOwner?: boolean;
    isOfficial?: boolean;
    subscribersCount?: number;
    isSubscribed?: boolean;
  }) => void;
  folders: ChatFolder[];
  activeFolderId: string | null;
  createFolder: (name: string, chatIds: string[]) => string;
  updateFolder: (id: string, name: string, chatIds: string[]) => void;
  deleteFolder: (id: string) => void;
  setActiveFolderId: (id: string | null) => void;
}
