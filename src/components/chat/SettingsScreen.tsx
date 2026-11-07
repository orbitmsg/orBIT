import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  ShieldCheck,
  Palette,
  FolderTree,
  Bell,
  Database,
  Wifi,
  Phone,
  Zap,
  Languages,
  Sliders,
  Archive,
  ArrowLeft,
  X,
  Trash2,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { securityService } from '../../services/securityService';

import { OrbitaKeySettings } from '../settings/OrbitaKeySettings';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  useChatStore,

  type FontFamily,

} from '../../store/useChatStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../store/useAuthStore';
import { useDeviceStore } from '../../store/useDeviceStore';
import { useTranslation } from 'react-i18next';









import { DeleteAccountModal } from '../common/DeleteAccountModal';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { DeveloperToast } from '../ui/DeveloperBadge';
import { useAccountStore } from '../../services/accountManager';
import { AccountBackupScreen } from '../settings/AccountBackupScreen';
import { ConnectionSettingsScreen } from '../settings/ConnectionSettingsScreen';
import { DataMemorySettings } from '../settings/DataMemorySettings';
import { EnergySettingsScreen } from '../settings/EnergySettingsScreen';
import { useConnectionStore } from '../../store/useConnectionStore';
import { useCallStore } from '../../store/useCallStore';
import { useDevicePermissionStore } from '../../store/useDevicePermissionStore';

import { LinkCopiedToast } from '../common/LinkCopiedToast';
import { QrCodeView } from './QrCodeView';

import { EmojiAvatarModal } from '../settings/EmojiAvatarModal';
import { AvatarCropperModal } from '../settings/AvatarCropperModal';
import { isStaticImageFile, isStaticImageDataUrl, MAX_AVATAR_BANNER_SIZE, isAnimatedMedia, getMediaInfoFromDataUrl, SUPPORTED_MEDIA_EXTENSIONS } from '../../utils/staticImageValidation';

import { ChatFoldersSettings } from '../settings/ChatFoldersSettings';
import { mediaManager } from '../../services/mediaManager';


import {
  MD3,
  GLOBAL_CSS,
  Block,
  M3Switch,
  type TabId,
} from '../settings/SettingsShared';
import {
  NameEditModal,
  NicknameEditModal,
  UsernameEditModal,
  BirthdayEditModal,
} from '../settings/ProfileEditModals';
import { broadcastProfileUpdate } from '../settings/broadcastProfileUpdate';
import { PrivacySettingsScreen } from '../settings/PrivacySettingsScreen';
import { PasswordSettingsScreen } from '../settings/PasswordSettingsScreen';
import {  BubbleSlider,
} from '../settings/AppearanceSettings';
import { CallsTab } from '../settings/tabs/CallsTab';
import { LanguageTab, FontTab } from '../settings/tabs/LanguageFontTabs';
import { MyAccountTab } from '../settings/tabs/MyAccountTab';
import { MainTab } from '../settings/tabs/MainTab';
import { NotificationsTab } from '../settings/tabs/NotificationsTab';
import { PreferencesTab } from '../settings/tabs/PreferencesTab';

export {
  MD3,
  Block,
  M3Switch,
  NameEditModal,
  NicknameEditModal,
  UsernameEditModal,
  BirthdayEditModal,
  BubbleSlider,
};

export const SettingsScreen = () => {
  const { t } = useTranslation();
  const {    fontFamily, setFontFamily,
    language, setLanguage,
    notificationCount, setNotificationCount,
    notificationPosition, setNotificationPosition,
    notificationSoundEnabled, setNotificationSoundEnabled,
    notificationsEnabled, setNotificationsEnabled,
    notificationFlashTaskbar, setNotificationFlashTaskbar,
    notificationVolume, setNotificationVolume,
    notificationShowName, setNotificationShowName,
    notificationShowText, setNotificationShowText,
    notificationNativeWindows, setNotificationNativeWindows,
    notificationRespectFocus, setNotificationRespectFocus,
    myCode,
    autoUpdate, setAutoUpdate,
    showInSystemTray, setShowInSystemTray,
    autoLaunch, setAutoLaunch,
    sendOnEnter, setSendOnEnter,
    cacheSizeLimit, setCacheSizeLimit,
    mediaCacheLimit, setMediaCacheLimit,
    cacheCleanupAge, setCacheCleanupAge,
    autoLoadMedia, setAutoLoadMedia,
    callSoundsEnabled, setCallSoundsEnabled,
    alwaysRelayCalls, setAlwaysRelayCalls,
    selectedCameraId, setSelectedCameraId,
    selectedMicrophoneId, setSelectedMicrophoneId,
    selectedSpeakerId, setSelectedSpeakerId,
    hideMenuBar, setHideMenuBar,
    voiceCallsEnabled, setVoiceCallsEnabled,
  } = useChatStore(useShallow((s) => ({
    setTheme: s.setTheme, currentTheme: s.currentTheme,
    fontFamily: s.fontFamily, setFontFamily: s.setFontFamily,
    language: s.language, setLanguage: s.setLanguage,
    notificationCount: s.notificationCount, setNotificationCount: s.setNotificationCount,
    notificationPosition: s.notificationPosition, setNotificationPosition: s.setNotificationPosition,
    notificationSoundEnabled: s.notificationSoundEnabled, setNotificationSoundEnabled: s.setNotificationSoundEnabled,
    notificationsEnabled: s.notificationsEnabled, setNotificationsEnabled: s.setNotificationsEnabled,
    notificationFlashTaskbar: s.notificationFlashTaskbar, setNotificationFlashTaskbar: s.setNotificationFlashTaskbar,
    notificationVolume: s.notificationVolume, setNotificationVolume: s.setNotificationVolume,
    notificationShowName: s.notificationShowName, setNotificationShowName: s.setNotificationShowName,
    notificationShowText: s.notificationShowText, setNotificationShowText: s.setNotificationShowText,
    notificationNativeWindows: s.notificationNativeWindows, setNotificationNativeWindows: s.setNotificationNativeWindows,
    notificationRespectFocus: s.notificationRespectFocus, setNotificationRespectFocus: s.setNotificationRespectFocus,
    myCode: s.myCode,
    autoUpdate: s.autoUpdate, setAutoUpdate: s.setAutoUpdate,
    showInSystemTray: s.showInSystemTray, setShowInSystemTray: s.setShowInSystemTray,
    autoLaunch: s.autoLaunch, setAutoLaunch: s.setAutoLaunch,
    sendOnEnter: s.sendOnEnter, setSendOnEnter: s.setSendOnEnter,
    cacheSizeLimit: s.cacheSizeLimit, setCacheSizeLimit: s.setCacheSizeLimit,
    mediaCacheLimit: s.mediaCacheLimit, setMediaCacheLimit: s.setMediaCacheLimit,
    cacheCleanupAge: s.cacheCleanupAge, setCacheCleanupAge: s.setCacheCleanupAge,
    autoLoadMedia: s.autoLoadMedia, setAutoLoadMedia: s.setAutoLoadMedia,
    callSoundsEnabled: s.callSoundsEnabled, setCallSoundsEnabled: s.setCallSoundsEnabled,
    alwaysRelayCalls: s.alwaysRelayCalls, setAlwaysRelayCalls: s.setAlwaysRelayCalls,
    selectedCameraId: s.selectedCameraId, setSelectedCameraId: s.setSelectedCameraId,
    selectedMicrophoneId: s.selectedMicrophoneId, setSelectedMicrophoneId: s.setSelectedMicrophoneId,
    selectedSpeakerId: s.selectedSpeakerId, setSelectedSpeakerId: s.setSelectedSpeakerId,
    hideMenuBar: s.hideMenuBar, setHideMenuBar: s.setHideMenuBar,
    voiceCallsEnabled: s.voiceCallsEnabled, setVoiceCallsEnabled: s.setVoiceCallsEnabled,
  })));
  const { hasCameraPermission, hasMicrophonePermission, setCameraPermission, setMicrophonePermission } = useDevicePermissionStore();
  const peerVolume = useCallStore((state) => state.peerVolume);
  const micVolume = useCallStore((state) => state.micVolume);
  const setPeerVolume = useCallStore((state) => state.setPeerVolume);
  const setMicVolume = useCallStore((state) => state.setMicVolume);
  const { nickname, avatarUrl, username, bio, birthday, userId, setNickname, setAvatarUrl, setUsername, setBio, setBirthday } = useAuthStore(useShallow((s) => ({
    nickname: s.nickname,
    avatarUrl: s.avatarUrl,
    username: s.username,
    bio: s.bio,
    birthday: s.birthday,
    userId: s.userId,
    setNickname: s.setNickname,
    setAvatarUrl: s.setAvatarUrl,
    setUsername: s.setUsername,
    setBio: s.setBio,
    setBirthday: s.setBirthday,
  })));
  const setCurrentView = useChatStore((state) => state.setCurrentView);
  const { appVersion } = useDeviceStore();
  const { proxyEnabled, activeProxyId, proxies } = useConnectionStore();
  const activeProxy = proxies.find((p) => p.id === activeProxyId);
  const folders = useChatStore((s) => s.folders || []);
  const initialSettingsTab = useChatStore((s) => s.initialSettingsTab) as TabId | undefined;
  const [tabStack, setTabStack] = useState<TabId[]>(() => [initialSettingsTab || 'main']);
  const activeTab = tabStack[tabStack.length - 1];

  useEffect(() => {
    return () => {
      useChatStore.setState({ initialSettingsTab: 'main' });
    };
  }, []);

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);

  const loadMediaDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setAudioInputDevices(devs.filter((d) => d.kind === 'audioinput'));
      setVideoInputDevices(devs.filter((d) => d.kind === 'videoinput'));
      setAudioOutputDevices(devs.filter((d) => d.kind === 'audiooutput'));
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === 'calls') {
      loadMediaDevices();
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadMediaDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', loadMediaDevices);
    }
  }, [activeTab, loadMediaDevices]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.getAutoLaunchState) {
      window.orbita.getAutoLaunchState().then((enabled) => setAutoLaunch(enabled)).catch(() => {});
    }
  }, [setAutoLaunch]);

  const [updateStatus, setUpdateStatus] = useState<{
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode';
    version?: string;
    percent?: number;
    error?: string;
  }>({ status: 'idle' });
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.onUpdateStatus) {
      const unsub = window.orbita.onUpdateStatus((data) => {
        setUpdateStatus(data);
        if (data.status !== 'checking') {
          setIsCheckingUpdate(false);
        }
      });
      return unsub;
    }
  }, []);

  const handleToggleAutoUpdate = () => {
    const nextVal = !autoUpdate;
    setAutoUpdate(nextVal);
    if (typeof window !== 'undefined' && window.orbita?.setAutoDownloadUpdates) {
      window.orbita.setAutoDownloadUpdates(nextVal);
    }
  };

  const handleCheckForUpdates = async () => {
    if (typeof window !== 'undefined' && window.orbita?.checkForUpdates) {
      setIsCheckingUpdate(true);
      setUpdateStatus({ status: 'checking' });
      try {
        await window.orbita.checkForUpdates();
      } catch (e: any) {
        setUpdateStatus({ status: 'error', error: e?.message || String(e) });
        setIsCheckingUpdate(false);
      }
    }
  };

  const handleDownloadUpdate = async () => {
    if (typeof window !== 'undefined' && window.orbita?.downloadUpdate) {
      setUpdateStatus((prev) => ({ ...prev, status: 'downloading', percent: 0 }));
      await window.orbita.downloadUpdate();
    }
  };

  const handleRestartAndInstall = () => {
    if (typeof window !== 'undefined' && window.orbita?.quitAndInstallUpdate) {
      window.orbita.quitAndInstallUpdate();
    }
  };

  const [isMobileWidth, setIsMobileWidth] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth < 650 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileWidth(window.innerWidth < 650);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (initialSettingsTab) {
      setTabStack([initialSettingsTab]);
    }
  }, [initialSettingsTab]);

  const pushTab = (tab: TabId) => setTabStack(prev => [...prev, tab]);
  const popTab = () => setTabStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);

  const innerContentRef = useRef<HTMLDivElement>(null);

  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const [settingsThumb, setSettingsThumb] = useState<{ top: number; height: number } | null>(null);
  const [isSettingsActive, setIsSettingsActive] = useState(false);
  const settingsActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSettingsThumb = useCallback(() => {
    const el = settingsScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 8) {
      setSettingsThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setSettingsThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerSettingsActive = useCallback(() => {
    updateSettingsThumb();
    const el = settingsScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 8) {
      setIsSettingsActive(true);
      if (settingsActiveTimerRef.current) clearTimeout(settingsActiveTimerRef.current);
      settingsActiveTimerRef.current = setTimeout(() => {
        setIsSettingsActive(false);
      }, 1000);
    } else {
      setIsSettingsActive(false);
    }
  }, [updateSettingsThumb]);

  const handleSettingsMouseLeave = useCallback(() => {
    if (settingsActiveTimerRef.current) clearTimeout(settingsActiveTimerRef.current);
    setIsSettingsActive(false);
  }, []);

  useEffect(() => {
    updateSettingsThumb();
  }, [activeTab, updateSettingsThumb]);

  useEffect(() => {
    const el = settingsScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateSettingsThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateSettingsThumb]);


  const [nicknameEditOpen, setNicknameEditOpen] = useState(false);
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [usernameEditOpen, setUsernameEditOpen] = useState(false);
  const [birthdayEditOpen, setBirthdayEditOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [cropperModalOpen, setCropperModalOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const [emojiModalOpen, setEmojiModalOpen] = useState(false);
  const [localBio, setLocalBio] = useState(bio || '');
  const cameraBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    setLocalBio(bio || '');
  }, [bio]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleClickOutside = () => setAvatarMenuOpen(false);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [avatarMenuOpen]);

  const handleNameSave = (newName: string) => {
    setNickname(newName);
    broadcastProfileUpdate({ nickname: newName });
  };
  const handleNicknameSave = handleNameSave;

  const handleUsernameSave = (newUsername: string | null) => {
    setUsername(newUsername);
    broadcastProfileUpdate({ username: newUsername });
  };

  const handleBirthdaySave = (newBirthday: string | null) => {
    setBirthday(newBirthday);
    broadcastProfileUpdate({ birthday: newBirthday });
  };

  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, 70);
    setLocalBio(val);
  };

  const handleBioBlur = () => {
    const trimmed = localBio.trim();
    const finalBio = trimmed.length > 0 ? trimmed : null;
    if (finalBio !== bio) {
      setBio(finalBio);
      broadcastProfileUpdate({ bio: finalBio });
    }
  };

  const handleToggleAvatarMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cameraBtnRef.current) {
      const rect = cameraBtnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.top - 8,
        left: rect.right - 6,
      });
    }
    setAvatarMenuOpen((prev) => !prev);
  };

  const handleAvatarSave = async (dataUrl: string) => {
    try {
      setAvatarUrl(dataUrl);
      let finalUrl = dataUrl;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const { ext, mime } = getMediaInfoFromDataUrl(dataUrl);
      try {
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const avatarBlob = new Blob([bytes], { type: mime });
        mediaManager.setDirectDecryptedMedia(dataUrl, '', avatarBlob, mime);
      } catch {}

      if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
        const tempPath = await window.orbita.writeTempFile(base64, ext);
        if (tempPath) {
          const publicId = `avatar_${Date.now()}`;
          const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
          if (result.success && result.secure_url) {
            finalUrl = result.secure_url;
            try {
              const binaryStr = atob(base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const avatarBlob = new Blob([bytes], { type: mime });
              mediaManager.setDirectDecryptedMedia(finalUrl, '', avatarBlob, mime);
            } catch {}
            setAvatarUrl(finalUrl);
          }
          await window.orbita.deleteTempFile(tempPath);
        }
      }

      broadcastProfileUpdate({ avatarUrl: finalUrl });
    } catch (err) {
      console.error('Avatar save error:', err);
      setAvatarUrl(dataUrl);
      broadcastProfileUpdate({ avatarUrl: dataUrl });
    }
  };

  const handlePickFile = async () => {
    setAvatarMenuOpen(false);
    try {
      if (window.orbita?.pickFile) {
        const raw = await window.orbita.pickFile(SUPPORTED_MEDIA_EXTENSIONS);
        if (!raw) return;
        const filePath = Array.isArray(raw) ? raw[0] : raw;
        if (!filePath) return;

        const sizeBytes = await window.orbita.getFileSize(filePath);
        if (sizeBytes > MAX_AVATAR_BANNER_SIZE) {
          alert(t('settings.file_too_large_3mb'));
          return;
        }

        const dataUrl = await window.orbita.readFileAsDataURL(filePath);
        if (dataUrl) {
          if (!isStaticImageDataUrl(dataUrl) && !isAnimatedMedia(dataUrl)) {
            alert(t('settings.static_images_only'));
            return;
          }
          setCropperImageSrc(dataUrl);
          setCropperModalOpen(true);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > MAX_AVATAR_BANNER_SIZE) {
              alert(t('settings.file_too_large_3mb'));
              return;
            }
            const check = await isStaticImageFile(file);
            const isAnim = file.type.startsWith('video/') || file.type === 'image/gif' || file.name.match(/\.(gif|mp4|webm|mov)$/i);
            if (!check.ok && !isAnim) {
              alert(t('settings.static_images_only'));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              if (!isStaticImageDataUrl(res) && !isAnimatedMedia(res)) {
                alert(t('settings.static_images_only'));
                return;
              }
              setCropperImageSrc(res);
              setCropperModalOpen(true);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }
    } catch (err) {
      console.error('Error picking avatar file:', err);
    }
  };

  const handlePasteClipboard = async () => {
    setAvatarMenuOpen(false);
    try {
      let dataUrl: string | null = null;
      if (window.orbita?.readClipboardImage) {
        dataUrl = await window.orbita.readClipboardImage();
      }
      if (!dataUrl && navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              break;
            }
          }
          if (dataUrl) break;
        }
      }

      if (dataUrl) {
        if (!isStaticImageDataUrl(dataUrl) && !isAnimatedMedia(dataUrl)) {
          alert(t('settings.static_images_only'));
          return;
        }
        setCropperImageSrc(dataUrl);
        setCropperModalOpen(true);
      } else {
        alert('В буфере обмена нет изображения.');
      }
    } catch (err) {
      console.error('Error pasting clipboard image:', err);
      alert('Не удалось прочитать изображение из буфера обмена.');
    }
  };

  const handleOpenEmojiAvatar = () => {
    setAvatarMenuOpen(false);
    setEmojiModalOpen(true);
  };

  const handleDeleteAvatar = () => {
    setAvatarMenuOpen(false);
    setAvatarUrl(null);
    broadcastProfileUpdate({ avatarUrl: null });
  };

  const [devToastOpen, setDevToastOpen] = useState(false);

  const triggerDevToast = useCallback(() => {
    setDevToastOpen(true);
    setTimeout(() => setDevToastOpen(false), 3000);
  }, []);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copyToastOpen, setCopyToastOpen] = useState(false);

  const handleCopyCode = async () => {
    const textToCopy = myCode || userId;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyToastOpen(true);
      setTimeout(() => setCopyToastOpen(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleCopyUsername = useCallback(async () => {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(`@${username}`);
      setCopyToastOpen(true);
      setTimeout(() => setCopyToastOpen(false), 2000);
    } catch (err) {
      console.error('Failed to copy username:', err);
    }
  }, [username]);

  const handleCacheSizeLimitChange = async (value: number) => {
    setCacheSizeLimit(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaSetLimit) {
      await window.orbita.mediaSetLimit('total', value);
    }
  };

  const handleMediaCacheLimitChange = async (value: number) => {
    setMediaCacheLimit(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaSetLimit) {
      await window.orbita.mediaSetLimit('media', value);
    }
  };

  const handleCacheCleanupAgeChange = async (value: number) => {
    setCacheCleanupAge(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaEvictByAge) {
      await window.orbita.mediaEvictByAge(value);
    }
  };

  const tabTitles: Record<string, string> = {
    myAccount:     t('settings.my_account', 'Мой аккаунт'),
    security:      t('settings.privacy', 'Приватность'),
    password:      securityService.isPasswordSet() ? t('security.modal_title_change') : t('security.modal_title_set'),
    connection:    t('settings.connection', 'Подключение'),
    chats:         t('settings.appearance', 'Внешний вид'),
    calls:         t('settings.calls', 'Звонки'),
    font:          t('settings.appearance', 'Внешний вид'),
    dataMemory:    t('settings.data_and_storage', 'Данные и память'),
    energy:        t('settings.power_and_animations', 'Заряд батареи и анимации'),
    notifications: t('settings.notifications', 'Уведомления'),
    language:      t('settings.language', 'Язык'),
    preferences:   t('settings.preferences', 'Предпочтения'),
    qrCode:        t('qrModal.title', 'Получить QR-код'),
    backup:        t('settings.backups', 'Резервные копии'),
    cloudBackup:   t('settings.backups', 'Резервные копии'),
    pcBackup:      t('settings.backups', 'Резервные копии'),
    orbitaKey:     t('security.orbita_key_screen_title', 'Настройка Orbita Key'),
    folders:       t('settings.chat_folders', 'Папки с чатами'),
  };

  const tabDescriptions: Record<string, string> = {
    myAccount:     t('settings.desc_my_account', 'Управление профилем, именем и аккаунтом'),
    security:      t('settings.desc_privacy', 'Пароль, ключи шифрования и безопасность'),
    password:      t('settings.desc_password', 'Установка и изменение пароля блокировки'),
    connection:    t('settings.desc_connection', 'Параметры P2P, WebRTC и сетевого подключения'),
    chats:         t('settings.desc_appearance', 'Темы оформления, шрифты и размер сообщений'),
    calls:         t('settings.desc_calls', 'Параметры микрофона, динамиков и аудиосвязи'),
    font:          t('settings.desc_appearance', 'Темы оформления, шрифты и размер сообщений'),
    dataMemory:    t('settings.desc_data_and_storage', 'Управление кэшем, медиа и хранилищем'),
    energy:        t('settings.desc_power_and_animations', 'Энергосбережение и плавность интерфейса'),
    notifications: t('settings.desc_notifications', 'Звуковые сигналы и всплывающие уведомления'),
    language:      t('settings.desc_language', 'Выбор языка интерфейса приложения'),
    preferences:   t('settings.desc_preferences', 'Автозапуск, системный трей и обновления'),
    qrCode:        t('settings.desc_qr_code', 'Ваш персональный QR-код для связи'),
    backup:        t('settings.desc_backups', 'Экспорт и восстановление резервных копий'),
    cloudBackup:   t('settings.desc_cloud_backup', 'Резервная копия в защищенное хранилище'),
    pcBackup:      t('settings.desc_pc_backup', 'Локальная резервная копия на устройство'),
    orbitaKey:     t('settings.desc_orbita_key', 'Управление сквозным ключом Orbita Key'),
    folders:       t('settings.desc_chat_folders', 'Группировка и организация чатов по папкам'),
  };

  const SIDEBAR_ITEMS: { id: TabId; labelKey: string; defaultLabel: string; icon: React.ReactNode }[] = [
    { id: 'myAccount', labelKey: 'settings.my_account', defaultLabel: 'Мой аккаунт', icon: <User size={16} /> },
    { id: 'chats', labelKey: 'settings.appearance', defaultLabel: 'Внешний вид', icon: <Palette size={16} /> },
    { id: 'folders', labelKey: 'settings.chat_folders', defaultLabel: 'Папки с чатами', icon: <FolderTree size={16} /> },
    { id: 'security', labelKey: 'settings.privacy', defaultLabel: 'Приватность', icon: <ShieldCheck size={16} /> },
    { id: 'calls', labelKey: 'settings.calls', defaultLabel: 'Звонки', icon: <Phone size={16} /> },
    { id: 'notifications', labelKey: 'settings.notifications', defaultLabel: 'Уведомления', icon: <Bell size={16} /> },
    { id: 'dataMemory', labelKey: 'settings.data_and_storage', defaultLabel: 'Данные и память', icon: <Database size={16} /> },
    { id: 'energy', labelKey: 'settings.power_and_animations', defaultLabel: 'Заряд батареи и анимации', icon: <Zap size={16} /> },
    { id: 'language', labelKey: 'settings.language', defaultLabel: 'Язык', icon: <Languages size={16} /> },
    { id: 'preferences', labelKey: 'settings.preferences', defaultLabel: 'Предпочтения', icon: <Sliders size={16} /> },
    { id: 'connection', labelKey: 'settings.connection', defaultLabel: 'Подключение', icon: <Wifi size={16} /> },
    { id: 'backup', labelKey: 'settings.backups', defaultLabel: 'Резервные копии', icon: <Archive size={16} /> },
  ];

  const languageDisplayOptions = [
    { value: 'ru', label: 'Русский', native: 'Russian' },
    { value: 'uk', label: 'Українська', native: 'Ukrainian' },
    { value: 'be', label: 'Беларуская', native: 'Belarusian' },
    { value: 'en', label: 'English', native: 'English' },
    { value: 'de', label: 'Deutsch', native: 'German' },
    { value: 'fr', label: 'Français', native: 'French' },
    { value: 'es', label: 'Español', native: 'Spanish' },
    { value: 'it', label: 'Italiano', native: 'Italian' },
    { value: 'pt', label: 'Português', native: 'Portuguese' },
    { value: 'nl', label: 'Nederlands', native: 'Dutch' },
    { value: 'pl', label: 'Polski', native: 'Polish' },
    { value: 'tr', label: 'Türkçe', native: 'Turkish' },
    { value: 'ja', label: '日本語', native: 'Japanese' },
    { value: 'ko', label: '한국어', native: 'Korean' },
    { value: 'zh', label: '简体中文', native: 'Chinese (Simplified)' },
    { value: 'zh-Hant', label: '繁體中文', native: 'Chinese (Traditional)' },
    { value: 'hi', label: 'हिन्दी', native: 'Hindi' },
    { value: 'kk', label: 'Қазақша', native: 'Kazakh' },
  ];

  const FONT_OPTIONS: { value: FontFamily; label: string; native?: string }[] = [
    { value: 'system', label: t('settings.default'), native: 'Default System' },
    { value: 'Segoe UI', label: 'Segoe UI', native: 'Segoe UI' },
    { value: 'Segoe UI Black', label: 'Segoe UI Black', native: 'Segoe UI Black' },
    { value: 'Inter', label: 'Inter', native: 'Inter' },
    { value: 'Roboto', label: 'Roboto', native: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans', native: 'Open Sans' },
    { value: 'Lato', label: 'Lato', native: 'Lato' },
    { value: 'Montserrat', label: 'Montserrat', native: 'Montserrat' },
    { value: 'Poppins', label: 'Poppins', native: 'Poppins' },
    { value: 'Nunito', label: 'Nunito', native: 'Nunito' },
    { value: 'Rubik', label: 'Rubik', native: 'Rubik' },
    { value: 'Fira Sans', label: 'Fira Sans', native: 'Fira Sans' },
    { value: 'Ubuntu', label: 'Ubuntu', native: 'Ubuntu' },
    { value: 'Manrope', label: 'Manrope', native: 'Manrope' },
    { value: 'Arial', label: 'Arial', native: 'Arial' },
    { value: 'Arial Black', label: 'Arial Black', native: 'Arial Black' },
    { value: 'Trebuchet MS', label: 'Trebuchet MS', native: 'Trebuchet MS' },
    { value: 'Verdana', label: 'Verdana', native: 'Verdana' },
    { value: 'Tahoma', label: 'Tahoma', native: 'Tahoma' },
    { value: 'Georgia', label: 'Georgia', native: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman', native: 'Times New Roman' },
    { value: 'Merriweather', label: 'Merriweather', native: 'Merriweather' },
    { value: 'Playfair Display', label: 'Playfair Display', native: 'Playfair Display' },
    { value: 'Fira Code', label: 'Fira Code', native: 'Monospace' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono', native: 'Monospace' },
    { value: 'Consolas', label: 'Consolas', native: 'Monospace' },
    { value: 'Courier New', label: 'Courier New', native: 'Monospace' },
    { value: 'Comic Sans MS', label: 'Comic Sans MS', native: 'Cursive' },
    { value: 'Caveat', label: 'Caveat', native: 'Handwriting' },
    { value: 'Pacifico', label: 'Pacifico', native: 'Handwriting' },
  ];

  const renderDataMemory = () => {
    return (
      <DataMemorySettings
        cacheSizeLimit={cacheSizeLimit}
        mediaCacheLimit={mediaCacheLimit}
        cacheCleanupAge={cacheCleanupAge}
        autoLoadMedia={autoLoadMedia}
        onCacheSizeLimitChange={handleCacheSizeLimitChange}
        onMediaCacheLimitChange={handleMediaCacheLimitChange}
        onCacheCleanupAgeChange={handleCacheCleanupAgeChange}
        onAutoLoadMediaChange={() => setAutoLoadMedia(!autoLoadMedia)}
      />
    );
  };

  const renderCalls = () => (
    <CallsTab
      voiceCallsEnabled={voiceCallsEnabled}
      setVoiceCallsEnabled={setVoiceCallsEnabled}
      callSoundsEnabled={callSoundsEnabled}
      setCallSoundsEnabled={setCallSoundsEnabled}
      peerVolume={peerVolume}
      setPeerVolume={setPeerVolume}
      micVolume={micVolume}
      setMicVolume={setMicVolume}
      selectedCameraId={selectedCameraId}
      setSelectedCameraId={setSelectedCameraId}
      selectedMicrophoneId={selectedMicrophoneId}
      setSelectedMicrophoneId={setSelectedMicrophoneId}
      selectedSpeakerId={selectedSpeakerId}
      setSelectedSpeakerId={setSelectedSpeakerId}
      videoInputDevices={videoInputDevices}
      audioInputDevices={audioInputDevices}
      audioOutputDevices={audioOutputDevices}
      alwaysRelayCalls={alwaysRelayCalls}
      setAlwaysRelayCalls={setAlwaysRelayCalls}
    />
  );

  const renderLanguage = () => (
    <LanguageTab
      language={language}
      setLanguage={setLanguage}
      languageDisplayOptions={languageDisplayOptions}
    />
  );

  const renderFont = () => (
    <FontTab
      fontFamily={fontFamily}
      setFontFamily={setFontFamily}
      fontOptions={FONT_OPTIONS}
    />
  );

  const renderMyAccount = () => (
    <MyAccountTab
      avatarUrl={avatarUrl}
      nickname={nickname}
      username={username}
      birthday={birthday}
      userId={userId}
      myCode={myCode}
      localBio={localBio}
      avatarMenuOpen={avatarMenuOpen}
      cameraBtnRef={cameraBtnRef}
      menuPos={menuPos}
      setNameEditOpen={setNameEditOpen}
      setUsernameEditOpen={setUsernameEditOpen}
      setBirthdayEditOpen={setBirthdayEditOpen}
      handleBioChange={handleBioChange}
      handleBioBlur={handleBioBlur}
      handleToggleAvatarMenu={handleToggleAvatarMenu}
      handlePickFile={handlePickFile}
      handlePasteClipboard={handlePasteClipboard}
      handleOpenEmojiAvatar={handleOpenEmojiAvatar}
      handleDeleteAvatar={handleDeleteAvatar}
      triggerDevToast={triggerDevToast}
      handleCopyCode={handleCopyCode}
      handleCopyUsername={handleCopyUsername}
    />
  );

  const renderMain = () => (
    <MainTab
      avatarUrl={avatarUrl}
      nickname={nickname}
      userId={userId}
      myCode={myCode}
      username={username}
      appVersion={appVersion}
      proxyEnabled={proxyEnabled}
      activeProxy={activeProxy}
      folders={folders}
      language={language}
      languageDisplayOptions={languageDisplayOptions}
      pushTab={pushTab}
      triggerDevToast={triggerDevToast}
      handleCopyCode={handleCopyCode}
      handleCopyUsername={handleCopyUsername}
      setDeleteModalOpen={setDeleteModalOpen}
    />
  );
  const renderContent = () => {
    switch (activeTab) {
      case 'main':
        return renderMain();
      case 'myAccount':
        return renderMyAccount();
      case 'security':
        return (
          <PrivacySettingsScreen
            onOpenPassword={() => pushTab('password')}
            onOpenBackup={() => pushTab('backup')}
            onOpenOrbitaKey={() => pushTab('orbitaKey')}
          />
        );
      case 'orbitaKey':
        return <OrbitaKeySettings onBack={handleBack} />;
      case 'backup':
        return (
          <AccountBackupScreen
            mode="main"
            onOpenCloud={() => pushTab('cloudBackup')}
            onOpenPc={() => pushTab('pcBackup')}
          />
        );
      case 'cloudBackup':
        return <AccountBackupScreen mode="cloud" />;
      case 'pcBackup':
        return <AccountBackupScreen mode="pc" />;
      case 'password':
        return <PasswordSettingsScreen onSaved={() => pushTab('security')} />;
      case 'connection':
        return <ConnectionSettingsScreen onBack={handleBack} />;
      case 'chats':
      case 'font':
        return renderFont();
      case 'folders':
        return <ChatFoldersSettings onBack={handleBack} />;
      case 'dataMemory':
        return renderDataMemory();
      case 'energy':
        return <EnergySettingsScreen />;
      case 'notifications':
        return (
          <NotificationsTab
            notificationsEnabled={notificationsEnabled}
            setNotificationsEnabled={setNotificationsEnabled}
            notificationFlashTaskbar={notificationFlashTaskbar}
            setNotificationFlashTaskbar={setNotificationFlashTaskbar}
            notificationSoundEnabled={notificationSoundEnabled}
            setNotificationSoundEnabled={setNotificationSoundEnabled}
            notificationVolume={notificationVolume}
            setNotificationVolume={setNotificationVolume}
            notificationShowName={notificationShowName}
            setNotificationShowName={setNotificationShowName}
            notificationShowText={notificationShowText}
            setNotificationShowText={setNotificationShowText}
            notificationNativeWindows={notificationNativeWindows}
            setNotificationNativeWindows={setNotificationNativeWindows}
            notificationRespectFocus={notificationRespectFocus}
            setNotificationRespectFocus={setNotificationRespectFocus}
            notificationCount={notificationCount}
            setNotificationCount={setNotificationCount}
            notificationPosition={notificationPosition}
            setNotificationPosition={setNotificationPosition}
          />
        );
      case 'calls':
        return renderCalls();
      case 'language':
        return renderLanguage();
      case 'preferences':
        return (
          <PreferencesTab
            autoLaunch={autoLaunch}
            setAutoLaunch={setAutoLaunch}
            hideMenuBar={hideMenuBar}
            setHideMenuBar={setHideMenuBar}
            showInSystemTray={showInSystemTray}
            setShowInSystemTray={setShowInSystemTray}
            hasMicrophonePermission={hasMicrophonePermission}
            setMicrophonePermission={setMicrophonePermission}
            hasCameraPermission={hasCameraPermission}
            setCameraPermission={setCameraPermission}
            autoUpdate={autoUpdate}
            handleToggleAutoUpdate={handleToggleAutoUpdate}
            updateStatus={updateStatus}
            handleRestartAndInstall={handleRestartAndInstall}
            handleDownloadUpdate={handleDownloadUpdate}
            handleCheckForUpdates={handleCheckForUpdates}
            isCheckingUpdate={isCheckingUpdate}
            sendOnEnter={sendOnEnter}
            setSendOnEnter={setSendOnEnter}
            appVersion={appVersion}
          />
        );
      case 'qrCode':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <QrCodeView userId={myCode} avatarUrl={avatarUrl} nickname={nickname} />
          </motion.div>
        );
      default:
        return null;
    }
  };

  const effectiveTab: TabId = (!isMobileWidth && activeTab === 'main') ? 'myAccount' : activeTab;

  const getActiveCategory = (tab: TabId): TabId => {
    if (tab === 'main') return 'myAccount';
    if (tab === 'password' || tab === 'orbitaKey') return 'security';
    if (tab === 'cloudBackup' || tab === 'pcBackup') return 'backup';
    if (tab === 'qrCode') return 'myAccount';
    if (tab === 'font') return 'chats';
    return tab;
  };

  const activeCategory = getActiveCategory(effectiveTab);

  const isOnMain = activeTab === 'main';
  const getHeaderTitle = () => {
    if (isMobileWidth && isOnMain) return t('settings.title', 'Настройки');
    return tabTitles[effectiveTab] ?? '';
  };
  const handleBack = () => popTab();

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <AnimatePresence>
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          display: isMobileWidth ? 'block' : 'flex',
          alignItems: isMobileWidth ? 'stretch' : 'center',
          justifyContent: isMobileWidth ? 'stretch' : 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
          padding: isMobileWidth ? '0' : '16px',
          userSelect: 'none',
        }}
        onClick={() => setCurrentView('chats')}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: isMobileWidth ? '100%' : '880px',
            maxWidth: isMobileWidth ? '100vw' : '92vw',
            height: isMobileWidth ? 'calc(100vh - 30px)' : '620px',
            maxHeight: isMobileWidth ? 'calc(100vh - 30px)' : 'min(86vh, 680px)',
            display: 'flex',
            flexDirection: isMobileWidth ? 'column' : 'row',
            margin: isMobileWidth ? '0' : '0 16px',
            marginTop: isMobileWidth ? '30px' : '0',
            backgroundColor: 'var(--settings-bg, #13141a)',
            borderRadius: isMobileWidth ? 0 : 12,
            color: MD3.onSurface,
            boxShadow: isMobileWidth ? 'none' : '0 24px 64px -12px rgba(0,0,0,0.75), 0 0 0 1px var(--border-color, rgba(255,255,255,0.08))',
            overflow: 'hidden',
          }}
        >
          {!isMobileWidth && (
            <div
              style={{
                width: '230px',
                flexShrink: 0,
                borderRight: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                backgroundColor: 'rgba(0, 0, 0, 0.22)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                userSelect: 'none',
              }}
            >
              <div style={{ padding: '16px 16px 8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim, #8b90a0)', textTransform: 'uppercase' }}>
                  {t('settings.title', 'Настройки')}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }} className="no-scrollbar">
                {SIDEBAR_ITEMS.map((item) => {
                  const isActive = activeCategory === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTabStack([item.id])}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        fontSize: '13px',
                        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-dim, #8b90a0)',
                        fontWeight: isActive ? 600 : 400,
                        transition: 'background-color 0.12s ease, color 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                          e.currentTarget.style.color = '#ffffff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-dim, #8b90a0)';
                        }
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--accent-color, #6366f1)' : 'inherit' }}>
                        {item.icon}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {t(item.labelKey, item.defaultLabel)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', backgroundColor: 'rgba(0, 0, 0, 0.15)' }}>
                <div
                  onClick={() => setTabStack(['myAccount'])}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                >
                  <Avatar src={avatarUrl} alt={nickname || '?'} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main, #ffffff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nickname || 'User'}
                    </span>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-dim, #8b90a0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {username ? (username.startsWith('@') ? username : `@${username}`) : (myCode ? myCode.slice(0, 10) + '...' : '')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  aria-label={t('settings.delete_account', 'Удалить аккаунт')}
                  style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                backgroundColor: 'var(--settings-bg, #13141a)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                {(isMobileWidth ? !isOnMain : tabStack.length > 1) && (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label={t('common.back', 'Назад')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim, #8b90a0)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, #8b90a0)')}
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main, #ffffff)', margin: 0, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getHeaderTitle()}
                  </h2>
                  {!isMobileWidth && tabDescriptions[effectiveTab] && (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-dim, #8b90a0)', marginTop: '2px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tabDescriptions[effectiveTab]}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isMobileWidth && isOnMain && (
                  <button
                    type="button"
                    onClick={() => setNicknameEditOpen(true)}
                    aria-label={t('settings.edit_nickname_title', 'Изменить имя')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: MD3.onSurfaceVar,
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = MD3.primary)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = MD3.onSurfaceVar)}
                  >
                    <svg width="15" height="15" viewBox="0 0 64 64" fill="currentColor">
                      <path d="M61.2 13c-3.2-3.4-6.6-6.8-10-10.1c-.7-.7-1.5-1.1-2.4-1.1s-1.8.3-2.4 1L8.7 40.2c-.6.6-1 1.3-1.3 2L1.9 59c-.3.8-.1 1.6.3 2.2c.5.6 1.2 1 2.1 1h.4l17.1-5.7c.8-.3 1.5-.7 2-1.3l37.5-37.4c.6-.6 1-1.5 1-2.4s-.4-1.7-1.1-2.4M20.6 52.1c-.1.1-.2.1-.3.2L7.4 56.6l4.3-12.9c0-.1.1-.2.2-.3L39.4 16l8.7 8.7zm30.6-30.6l-8.7-8.7l6.1-6.1c2.9 2.8 5.8 5.8 8.6 8.7z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentView('chats')}
                  aria-label={t('common.close', 'Закрыть')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim, #8b90a0)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'color 150ms ease, background-color 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-dim, #8b90a0)';
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onMouseMove={triggerSettingsActive}
              onMouseEnter={triggerSettingsActive}
              onMouseLeave={handleSettingsMouseLeave}
            >
              <div
                ref={settingsScrollRef}
                onScroll={triggerSettingsActive}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  padding: isMobileWidth ? '0 0 8px' : '16px 24px 24px',
                }}
                className="chat-list-scrollbar"
              >
                <div ref={innerContentRef} style={{ width: '100%', maxWidth: isMobileWidth ? '100%' : '680px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
                <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
                  {renderContent()}
                </motion.div>
              </div>
            </div>

            {settingsThumb && (
              <>
                <div
                  className="overlay-scroll-track"
                  onMouseDown={(e) => handleScrollbarTrackMouseDown(e, settingsScrollRef.current)}
                  style={{
                    top: '6px',
                    bottom: '6px',
                    opacity: isSettingsActive ? 1 : 0,
                  }}
                />
                <div
                  className="overlay-scroll-thumb"
                  onMouseDown={(e) => handleScrollbarThumbMouseDown(e, settingsScrollRef.current)}
                  style={{
                    top: settingsThumb.top + 6,
                    height: settingsThumb.height,
                    opacity: isSettingsActive ? 1 : 0,
                  }}
                />
              </>
            )}
          </div>
        </div>

          <DeveloperToast isOpen={devToastOpen} nickname={nickname || 'User'} />
          <LinkCopiedToast isOpen={copyToastOpen} />
        </motion.div>
      </motion.div>
      </AnimatePresence>

      <NameEditModal open={nameEditOpen} onClose={() => setNameEditOpen(false)} currentNickname={nickname || ''} onSave={handleNameSave} />
      <UsernameEditModal open={usernameEditOpen} onClose={() => setUsernameEditOpen(false)} currentUsername={username || null} onSave={handleUsernameSave} />
      <BirthdayEditModal open={birthdayEditOpen} onClose={() => setBirthdayEditOpen(false)} currentBirthday={birthday || null} onSave={handleBirthdaySave} />
      <EmojiAvatarModal
        isOpen={emojiModalOpen}
        onClose={() => setEmojiModalOpen(false)}
        onSave={(emojiUrl: string) => {
          setAvatarUrl(emojiUrl);
          broadcastProfileUpdate({ avatarUrl: emojiUrl });
        }}
      />
      <AvatarCropperModal
        isOpen={cropperModalOpen}
        onClose={() => {
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
        imageSrc={cropperImageSrc}
        onSave={handleAvatarSave}
      />

      <NicknameEditModal open={nicknameEditOpen} onClose={() => setNicknameEditOpen(false)} currentNickname={nickname || ''} onSave={handleNicknameSave} />
      <DeleteAccountModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={async () => {
          setDeleteModalOpen(false);
          await useAccountStore.getState().deleteCurrentAccount();
          setCurrentView('chats');
        }}
      />
  </>
);
};