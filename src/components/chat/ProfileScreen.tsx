import { useState, useRef, useCallback, memo, useMemo, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { channelService } from '../../services/channelService';
import { groupService } from '../../services/groupService';
import { lobbyService } from '../../services/lobbyService';
import { supabaseService } from '../../services/supabaseService';
import { deriveGroupKey } from '../../lib/groupCrypto';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { DeveloperBadge, DeveloperToast } from '../ui/DeveloperBadge';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { SUPPORT_AVATAR_URL } from '../../services/supportService';
import { AddGroupMemberModal } from './AddGroupMemberModal';
import { DeleteGroupModal } from './DeleteGroupModal';
import { formatLastSeen } from '../../utils/messageUtils';
import { isStaticImageFile, MAX_AVATAR_BANNER_SIZE, getMediaInfoFromDataUrl } from '../../utils/staticImageValidation';
import {
  Picture as GravityPictureIcon,
  Video as GravityVideoIcon,
  File as GravityFileIcon,
  Headphones as GravityHeadphonesIcon,
  Link as GravityLinkIcon,
  Microphone as GravityMicIcon,
} from '@gravity-ui/icons';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { useCallStore } from '../../store/useCallStore';
import { useAuthStore } from '../../store/useAuthStore';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { Avatar } from '../common/Avatar';
import { OnlineIndicator } from '../common/OnlineIndicator';
import { NotesAvatar } from '../common/NotesAvatar';
import { getOrbitaMediaUrl } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { useShallow } from 'zustand/react/shallow';
import { TelegramMediaViewer, type MediaViewerItem } from './TelegramMediaViewer';
import {
  type MediaGridItem,
  type MediaType,
  type ProfileScreenProps,
  GravityGifBadgeIcon,
} from './profile/types';
import { computeMediaGroups } from './profile/mediaGrouping';
import { ProfileGroupMembers } from './profile/ProfileGroupMembers';
import { ProfileEditChannel } from './profile/ProfileEditChannel';
import { ProfileSubTab } from './profile/ProfileSubTab';
import { ProfileActionButtons } from './profile/ProfileActionButtons';
import { ProfileInfoCard } from './profile/ProfileInfoCard';
import { resolveProfileId } from './profile/resolveProfileId';

export const ProfileScreen = memo(({ chatId, onClose, isMobileView = false, onLinkClick }: ProfileScreenProps) => {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<MediaType | null>(null);
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    items: MediaViewerItem[];
    initialIndex: number;
  }>({
    isOpen: false,
    items: [],
    initialIndex: 0,
  });

  const [copiedKey, setCopiedKey] = useState(false);
  const [isResettingLink, setIsResettingLink] = useState(false);
  const [devToastOpen, setDevToastOpen] = useState(false);

  const triggerDevToast = useCallback(() => {
    setDevToastOpen(true);
    setTimeout(() => setDevToastOpen(false), 3000);
  }, []);
  const [soundAnimTrigger, setSoundAnimTrigger] = useState(0);
  const updateChat = useChatStore((state) => state.updateChat);
  const toggleChatMuted = useChatStore((state) => state.toggleChatMuted);

  const chat = useChatStore((state) => state.chats.find(c => c.id === chatId));

  const profileScrollRef = useRef<HTMLDivElement>(null);
  const [profileThumb, setProfileThumb] = useState<{ top: number; height: number } | null>(null);
  const [isProfileActive, setIsProfileActive] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const profileActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateProfileThumb = useCallback(() => {
    const el = profileScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setScrollOffset(scrollTop);
    if (scrollHeight <= clientHeight + 8) {
      setProfileThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setProfileThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerProfileActive = useCallback(() => {
    updateProfileThumb();
    const el = profileScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 8) {
      setIsProfileActive(true);
      if (profileActiveTimerRef.current) clearTimeout(profileActiveTimerRef.current);
      profileActiveTimerRef.current = setTimeout(() => {
        setIsProfileActive(false);
      }, 1000);
    } else {
      setIsProfileActive(false);
    }
  }, [updateProfileThumb]);

  const handleProfileMouseLeave = useCallback(() => {
    if (profileActiveTimerRef.current) clearTimeout(profileActiveTimerRef.current);
    setIsProfileActive(false);
  }, []);

  useEffect(() => {
    updateProfileThumb();
  }, [updateProfileThumb]);

  useEffect(() => {
    const el = profileScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateProfileThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateProfileThumb]);

  const titleBlockRef = useRef<HTMLDivElement>(null);
  const titleRowRef = useRef<HTMLDivElement>(null);
  const statusSpanRef = useRef<HTMLSpanElement>(null);
  const [rowShiftX, setRowShiftX] = useState(80);
  const [statusShiftX, setStatusShiftX] = useState(110);


  const messages = useChatStore(useShallow((s) => s.messagesByChatId[chatId] || []));
  const setActiveChat = useChatStore((state) => state.setActiveChat);
  const startCall = useCallStore((state) => state.startCall);
  const myNickname = useAuthStore((state) => state.nickname) || 'YOU';
  const myUserId = useAuthStore((state) => state.userId);
  const myBannerUrl = useAuthStore((state) => state.bannerUrl);
  const [loadedBannerUrl, setLoadedBannerUrl] = useState<string | null>(null);
  const effectiveBannerUrl = chatId === 'notes' ? myBannerUrl : (chat?.bannerUrl || loadedBannerUrl);
  const voiceCallsEnabled = useChatStore((state) => state.voiceCallsEnabled);

  useEffect(() => {
    setLoadedBannerUrl(null);
    if (!chatId || chatId === 'notes' || !chat) return;
    let cancelled = false;
    const myCode = useChatStore.getState().myCode;
    const resolved = resolveProfileId(chat, chatId);
    const peer = resolved && resolved !== myCode ? resolved : null;
    const updateFriendBanner = (url?: string | null) => {
      if (cancelled || !url) return;
      setLoadedBannerUrl(url);
      if (url !== chat.bannerUrl) {
        useChatStore.getState().updateChat(chatId, { bannerUrl: url });
      }
    };
    if (peer) {
      supabaseService.lookupPublicProfile(peer).then((p) => {
        if (!cancelled && p?.banner_url) updateFriendBanner(p.banner_url);
      }).catch(() => {});
    }
    if (chat.username) {
      supabaseService.lookupProfileByUsername(chat.username).then((p) => {
        if (!cancelled && p?.banner_url) updateFriendBanner(p.banner_url);
      }).catch(() => {});
    }
    supabaseService.getLatestProfileUpdate(chatId, myCode || undefined).then((u) => {
      if (cancelled || !u) return;
      const isMyOwnUpdate = Boolean(
        (myCode && u.sender_code === myCode) ||
          (myUserId && (u.user_id === myUserId || u.sender_id === myUserId))
      );
      if (!isMyOwnUpdate && u.banner_url) updateFriendBanner(u.banner_url);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chatId, chat?.peerCode, chat?.originalPeerCode, chat?.username, myUserId]);

  const isChannel = chat?.type === 'channel';
  const isGroup = chat?.type === 'group';
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isDeleteGroupModalOpen, setIsDeleteGroupModalOpen] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'delete' | 'leave'>('delete');

  const isChannelOwner = useMemo(() => {
    if (!isChannel || !chat) return false;
    if (chat.isOwner) return true;
    if (chat.role === 'owner') return true;
    if (myUserId && chat.creatorId && chat.creatorId === myUserId) return true;
    if (myUserId && chat.members?.some((m) => m.userId === myUserId && m.role === 'owner')) return true;
    return false;
  }, [isChannel, chat, myUserId]);

  const isGroupOwner = useMemo(() => {
    if (!isGroup || !chat) return false;
    if (chat.isOwner) return true;
    if (chat.role === 'owner') return true;
    const currentCode = useChatStore.getState().myCode;
    if (currentCode && chat.creatorCode && chat.creatorCode === currentCode) return true;
    if (myUserId && chat.creatorId && chat.creatorId === myUserId) return true;
    if (chat.members?.some((m: any) => {
      const id = m.userId || m.userCode;
      return id && ((myUserId && id === myUserId) || (currentCode && id === currentCode)) && m.role === 'owner';
    })) return true;
    return false;
  }, [isGroup, chat, myUserId]);

  const isGroupAdmin = useMemo(() => {
    if (!isGroup || !chat) return false;
    if (isGroupOwner) return true;
    if (chat.role === 'admin') return true;
    const currentCode = useChatStore.getState().myCode;
    if (chat.members?.some((m: any) => {
      const id = m.userId || m.userCode;
      return id && ((myUserId && id === myUserId) || (currentCode && id === currentCode)) && (m.role === 'admin' || m.role === 'owner');
    })) return true;
    return false;
  }, [isGroup, chat, isGroupOwner, myUserId]);
  const profileId = useMemo(() => resolveProfileId(chat, chatId), [chat, chatId]);

  const formattedProfileId = useMemo(() => {
    if (!profileId) return '';
    return profileId;
  }, [profileId]);

  useEffect(() => {
    if (!chat) {
      onClose();
    }
  }, [chat, onClose]);

  useEffect(() => {
    if (!chat || chat.type !== 'group') return;
    groupService.getGroup(chat.id).then((info) => {
      if (info) {
        const current = useChatStore.getState().chats.find((c) => c.id === chat.id);
        const currentUserId = useAuthStore.getState().userId;
        const currentCode = useChatStore.getState().myCode;

        if (info.members && info.members.length > 0) {
          const isStillMember = info.members.some((m: any) => {
            const mCodes = [m.userId, m.userCode, m.user_id, m.user_code].filter(Boolean);
            if (currentUserId && mCodes.includes(currentUserId)) return true;
            if (currentCode && mCodes.includes(currentCode)) return true;
            if (myNickname && m.nickname === myNickname) return true;
            return false;
          });
          if (!isStillMember) {
            useChatStore.getState().deleteChat(chat.id);
            onClose();
            return;
          }
        }

        const isCreator = Boolean(
          current?.isOwner ||
          current?.role === 'owner' ||
          (currentUserId && info.creatorCode && info.creatorCode === currentUserId) ||
          (currentUserId && chat.creatorId && chat.creatorId === currentUserId) ||
          (myNickname && info.creatorNickname === myNickname)
        );
        const validName = (info.name && info.name !== 'Group Chat') ? info.name : (current?.name || info.name);
        const validMembers = (info.members && info.members.length > 0)
          ? info.members.map((m) => ({
              userId: m.userId || m.userCode,
              userCode: m.userCode || m.userId,
              nickname: m.nickname,
              role: m.role,
              lastSeen: m.lastSeen || Date.now(),
              avatarUrl: m.avatarUrl || null,
            }))
          : current?.members;

        const updates: Partial<Chat> = {
          name: validName,
          description: info.description || current?.description,
          avatarUrl: info.avatarUrl || current?.avatarUrl || undefined,
          membersCount: (validMembers && validMembers.length > 0) ? validMembers.length : (info.membersCount || 1),
          inviteCode: info.code || current?.inviteCode,
          members: validMembers,
        };
        if (isCreator) {
          updates.isOwner = true;
          updates.role = 'owner';
        }
        updateChat(chat.id, updates);
      }
    });
  }, [chat?.id, chat?.type, updateChat, myNickname, onClose]);

  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!chat || chat.type !== 'group' || !chat.members) return;
    let isMounted = true;
    chat.members.forEach((m) => {
      const code = m.userId || (m as any).userCode;
      if (!code || m.avatarUrl || memberAvatars[code]) return;
      supabaseService.lookupPublicProfile(code).then((profile) => {
        if (isMounted && profile?.avatar_url) {
          setMemberAvatars((prev) => ({ ...prev, [code]: profile.avatar_url! }));
        }
      }).catch(() => {});
    });
    return () => {
      isMounted = false;
    };
  }, [chat?.id, chat?.members]);

  const handleCopyChannelKey = useCallback((customId?: string | React.MouseEvent) => {
    const idToCopy = (typeof customId === 'string' && customId) ? customId : chat?.id;
    if (!idToCopy) return;
    navigator.clipboard.writeText(idToCopy);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }, [chat?.id]);

  useEffect(() => {
    if (!chat || chat.type !== 'channel') return;
    channelService.getChannel(chat.id).then((info) => {
      if (info) {
        const current = useChatStore.getState().chats.find((c) => c.id === chat.id);
        if (current?.updatedAt && info.updatedAt && current.updatedAt > info.updatedAt) {
          return;
        }
        const currentUserId = useAuthStore.getState().userId;
        const isCreator = Boolean(
          current?.isOwner ||
          current?.role === 'owner' ||
          (currentUserId && info.creatorId && info.creatorId === currentUserId) ||
          (currentUserId && chat.creatorId && chat.creatorId === currentUserId) ||
          (currentUserId && current?.creatorId && current.creatorId === currentUserId)
        );
        const updates: Partial<Chat> = {
          subscribersCount: info.subscribersCount,
          creatorId: info.creatorId || chat.creatorId,
          creatorNickname: info.creatorNickname || chat.creatorNickname,
        };
        if (isCreator) {
          updates.isOwner = true;
          updates.role = 'owner';
        }
        if (info.name) updates.name = info.name;
        if (info.username !== undefined) updates.username = info.username;
        if (info.description !== undefined) updates.description = info.description;
        updates.avatarUrl = info.avatarUrl || undefined;
        if (info.updatedAt) updates.updatedAt = info.updatedAt;
        updateChat(chat.id, updates);
      }
    });
  }, [chat?.id, chat?.type, updateChat]);

  useEffect(() => {
    if (!chat || chat.type !== 'private' || chatId === 'notes') return;
    const myCode = useChatStore.getState().myCode;
    const resolved = resolveProfileId(chat, chatId);
    const targetCode = resolved && resolved !== myCode ? resolved : undefined;

    let isMounted = true;
    (async () => {
      try {
        let updateNick: string | undefined = undefined;
        let updateAvatar: string | undefined = undefined;
        let updateBanner: string | undefined = undefined;
        let updateUsername: string | undefined = undefined;
        let updateBirthday: string | undefined = undefined;
        let updateBio: string | undefined = undefined;
        let pubNumericId: string | null | undefined = undefined;
        let pubByUnameUserCode: string | undefined = undefined;

        const update = await supabaseService.getLatestProfileUpdate(chat.id, myCode || undefined);
        const myUserId = useAuthStore.getState().userId;
        const isMyOwnUpdate = Boolean(
          update &&
            ((myCode && update.sender_code === myCode) ||
              (myUserId && (update.user_id === myUserId || update.sender_id === myUserId)))
        );
        let validUpdate = update && !isMyOwnUpdate ? update : null;
        if (isMyOwnUpdate && update?.sender_code) {
          try {
            const peerUpdate = await supabaseService.getLatestProfileUpdate(chat.id, update.sender_code);
            if (!isMounted) return;
            const peerUpdateIsOwn = Boolean(
              peerUpdate &&
                ((myCode && peerUpdate.sender_code === myCode) ||
                  (myUserId && (peerUpdate.user_id === myUserId || peerUpdate.sender_id === myUserId)))
            );
            if (peerUpdate && !peerUpdateIsOwn) {
              validUpdate = peerUpdate;
            }
          } catch {}
        }

        if (validUpdate) {
          if (validUpdate.nickname) updateNick = validUpdate.nickname;
          if (validUpdate.avatar_url) updateAvatar = validUpdate.avatar_url;
          if (validUpdate.banner_url) updateBanner = validUpdate.banner_url;
          if (validUpdate.username) updateUsername = validUpdate.username;
          if (validUpdate.birthday) updateBirthday = validUpdate.birthday;
          if (validUpdate.bio) updateBio = validUpdate.bio;
        }

        if (targetCode) {
          const pub = await supabaseService.lookupPublicProfile(targetCode);
          if (pub?.nickname && !updateNick) updateNick = pub.nickname;
          if (pub?.avatar_url && !updateAvatar) updateAvatar = pub.avatar_url;
          if (pub?.banner_url && !updateBanner) updateBanner = pub.banner_url;
          if (pub?.username && !updateUsername) updateUsername = pub.username;
          if (pub?.birthday && !updateBirthday) updateBirthday = pub.birthday;
          if (pub?.bio && !updateBio) updateBio = pub.bio;
          if (pub?.numeric_id) pubNumericId = pub.numeric_id;
        }

        if (chat.username) {
          const pubByUname = await supabaseService.lookupProfileByUsername(chat.username);
          if (pubByUname?.nickname && !updateNick) updateNick = pubByUname.nickname;
          if (pubByUname?.avatar_url && !updateAvatar) updateAvatar = pubByUname.avatar_url;
          if (pubByUname?.banner_url && !updateBanner) updateBanner = pubByUname.banner_url;
          if (pubByUname?.username && !updateUsername) updateUsername = pubByUname.username;
          if (pubByUname?.birthday && !updateBirthday) updateBirthday = pubByUname.birthday;
          if (pubByUname?.bio && !updateBio) updateBio = pubByUname.bio;
          if (pubByUname?.numeric_id && !pubNumericId) pubNumericId = pubByUname.numeric_id;
          if (pubByUname?.user_code && pubByUname.user_code !== myCode) pubByUnameUserCode = pubByUname.user_code;
        }

        if (!isMounted) return;

        const chatUpdates: Partial<Chat> = {};
        if (!chat.peerCode && chat.originalPeerCode) {
          chatUpdates.peerCode = chat.originalPeerCode;
        } else if (!chat.peerCode && validUpdate?.sender_code && validUpdate.sender_code !== myCode) {
          chatUpdates.peerCode = validUpdate.sender_code;
          chatUpdates.originalPeerCode = validUpdate.sender_code;
        } else if (!chat.peerCode && pubByUnameUserCode) {
          chatUpdates.peerCode = pubByUnameUserCode;
          chatUpdates.originalPeerCode = pubByUnameUserCode;
        }
        if (validUpdate?.numeric_id && validUpdate.numeric_id !== chat.numericId) {
          chatUpdates.numericId = validUpdate.numeric_id;
        }
        if (pubNumericId && pubNumericId !== chat.numericId) {
          chatUpdates.numericId = pubNumericId;
        }
        if (updateNick && updateNick !== chat.name) {
          chatUpdates.name = updateNick;
        }
        if (updateAvatar && updateAvatar !== chat.avatarUrl) {
          chatUpdates.avatarUrl = updateAvatar;
        }
        if (updateUsername && updateUsername !== chat.username) {
          chatUpdates.username = updateUsername;
        }
        if (updateBirthday && updateBirthday !== chat.birthday) {
          chatUpdates.birthday = updateBirthday;
        }
        if (updateBio && updateBio !== chat.description) {
          chatUpdates.description = updateBio;
        }
        if (updateBanner) {
          setLoadedBannerUrl(updateBanner);
          if (updateBanner !== chat.bannerUrl) {
            chatUpdates.bannerUrl = updateBanner;
          }
        }
        if (Object.keys(chatUpdates).length > 0) {
          updateChat(chat.id, chatUpdates);
        }
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [chat?.id, chat?.type, chat?.peerCode, chat?.originalPeerCode, chat?.username, updateChat]);

  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [editName, setEditName] = useState(chat?.name || '');
  const [editDescription, setEditDescription] = useState(chat?.description || '');
  const [editUsername, setEditUsername] = useState(chat?.username ? chat.username.replace(/^@+/, '') : '');
  const [editUsernameError, setEditUsernameError] = useState<string | null>(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(chat?.avatarUrl || null);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [cropperModalOpen, setCropperModalOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chat && !isEditingChannel) {
      setEditName(chat.name || '');
      setEditDescription(chat.description || '');
      setEditUsername(chat.username ? chat.username.replace(/^@+/, '') : '');
      setEditUsernameError(null);
      setEditAvatarUrl(chat.avatarUrl || null);
    }
  }, [chat?.name, chat?.description, chat?.username, chat?.avatarUrl, isEditingChannel]);

  const handleAvatarFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_AVATAR_BANNER_SIZE) {
        alert(t('settings.file_too_large_3mb'));
        if (e.target) e.target.value = '';
        return;
      }
      const check = await isStaticImageFile(file);
      const isAnim = file.type.startsWith('video/') || file.type === 'image/gif' || file.name.match(/\.(gif|mp4|webm|mov)$/i);
      if (!check.ok && !isAnim) {
        alert(t('settings.static_images_only'));
        if (e.target) e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setCropperImageSrc(event.target?.result as string);
        setCropperModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  }, [t]);

  const handleSaveChannel = useCallback(async () => {
    if (!chat || isSavingChannel) return;
    const newName = editName.trim();
    if (!newName) return;
    const newDesc = editDescription.trim();
    const cleanUsername = editUsername.trim().replace(/^@+/, '').toLowerCase();
    const initialAvatar = editAvatarUrl;

    if (chat.type === 'channel' && cleanUsername) {
      if (!/^[a-z0-9_]{3,32}$/.test(cleanUsername)) {
        setEditUsernameError(t('channelSettings.username_invalid', 'От 3 до 32 символов: латиница, цифры и _'));
        return;
      }
      const originalUsername = (chat.username || '').replace(/^@+/, '').toLowerCase();
      if (cleanUsername !== originalUsername) {
        try {
          const isAvailable = await channelService.checkChannelUsername(cleanUsername, chat.id);
          if (!isAvailable) {
            setEditUsernameError(t('channelSettings.username_taken', 'Этот юзернейм уже занят'));
            return;
          }
        } catch {
          setEditUsernameError(t('common.error', 'Ошибка проверки юзернейма'));
          return;
        }
      }
    }

    const originalName = (chat.name || '').trim();
    const originalDesc = (chat.description || '').trim();
    const originalAvatar = chat.avatarUrl || null;
    const nameChanged = originalName !== newName;
    const descChanged = originalDesc !== newDesc;

    setIsSavingChannel(true);

    try {
      let finalAvatarUrl = initialAvatar;
      if (initialAvatar && initialAvatar.startsWith('data:')) {
        const base64 = initialAvatar.includes(',') ? initialAvatar.split(',')[1] : initialAvatar;
        const { ext, mime } = getMediaInfoFromDataUrl(initialAvatar);
        try {
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const avatarBlob = new Blob([bytes], { type: mime });
          mediaManager.setDirectDecryptedMedia(initialAvatar, '', avatarBlob, mime);
        } catch {}

        if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
          try {
            const tempPath = await window.orbita.writeTempFile(base64, ext);
            if (tempPath) {
              const publicId = `channel_avatar_${chat.id}_${Date.now()}`;
              const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
              if (result.success && result.secure_url) {
                finalAvatarUrl = result.secure_url;
                try {
                  const binaryStr = atob(base64);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                  const avatarBlob = new Blob([bytes], { type: mime });
                  mediaManager.setDirectDecryptedMedia(finalAvatarUrl, '', avatarBlob, mime);
                } catch {}
              }
              await window.orbita.deleteTempFile(tempPath);
            }
          } catch (uploadErr) {
            console.error('[ProfileScreen] Failed to upload channel avatar:', uploadErr);
          }
        }
      }

      const avatarChanged = (originalAvatar || null) !== (finalAvatarUrl || null);
      const now = Date.now();

      updateChat(chat.id, {
        name: newName,
        description: newDesc,
        username: chat.type === 'channel' ? (cleanUsername || null) : chat.username,
        avatarUrl: finalAvatarUrl || undefined,
        updatedAt: now,
      });

      if (chat.type === 'group') {
        const groupUpdate: { name?: string; description?: string; avatarUrl?: string | null } = {};
        if (nameChanged) groupUpdate.name = newName;
        if (descChanged) groupUpdate.description = newDesc;
        if (avatarChanged) groupUpdate.avatarUrl = finalAvatarUrl;
        if (Object.keys(groupUpdate).length > 0) {
          const secret = chat.sharedSecret || (chat.inviteCode ? deriveGroupKey(chat.inviteCode) : deriveGroupKey(chat.id));
          await groupService.updateGroup(chat.id, secret, groupUpdate, myNickname);
          try {
            await lobbyService.updateLobby(chat.id, {
              name: newName,
              description: newDesc,
              avatarUrl: finalAvatarUrl,
            });
          } catch (lobErr) {
            console.error('Failed to update lobby in supabase:', lobErr);
          }
        }
      } else {
        const currentUserId = useAuthStore.getState().userId || useChatStore.getState().myCode;
        await channelService.updateChannel(chat.id, {
          name: newName,
          description: newDesc,
          username: cleanUsername || null,
          avatarUrl: finalAvatarUrl,
        }, currentUserId);
      }

      setEditAvatarUrl(finalAvatarUrl || null);
      setIsEditingChannel(false);
    } catch (err) {
      console.error('Failed to save channel:', err);
    } finally {
      setIsSavingChannel(false);
    }
  }, [chat, isSavingChannel, editName, editDescription, editUsername, editAvatarUrl, updateChat, myNickname, t]);

  const handleConfirmGroupAction = useCallback(async () => {
    if (!chat) return;
    const targetChatId = chat.id;
    const currentMode = groupModalMode;
    setIsDeleteGroupModalOpen(false);
    onClose();
    const myCode = useChatStore.getState().myCode;
    if (currentMode === 'delete') {
      await groupService.deleteGroup(targetChatId);
      try {
        await lobbyService.deleteLobby(targetChatId);
      } catch (delErr) {
        console.error('Failed to delete lobby in supabase:', delErr);
      }
    } else {
      if (chat.sharedSecret) {
        await groupService.leaveGroup(targetChatId, chat.sharedSecret, myNickname, myCode, myUserId);
      }
      try {
        await lobbyService.leaveLobby(targetChatId, myCode);
      } catch (leaveErr) {
        console.error('Failed to leave lobby in supabase:', leaveErr);
      }
    }
    useChatStore.getState().deleteChat(targetChatId);
  }, [chat, groupModalMode, onClose, myNickname, myUserId]);

  const innerContentRef = useRef<HTMLDivElement>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);

  useEffect(() => {
    if (isMobileView || isEditingChannel || subTab !== null) {
      setTargetHeight(null);
      return;
    }

    const measure = () => {
      if (innerContentRef.current) {
        const measured = innerContentRef.current.offsetHeight || innerContentRef.current.scrollHeight;
        if (measured > 0) {
          setTargetHeight(measured);
        }
      }
    };

    const rafId = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 30);

    let ro: ResizeObserver | null = null;
    if (innerContentRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(innerContentRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      ro?.disconnect();
    };
  }, [subTab, isMobileView, isEditingChannel, chat?.id]);

  const mediaGroups = useMemo(() => {
    return computeMediaGroups(chat, messages, i18n.language);
  }, [chat, messages, i18n.language]);

  const availableSections = useMemo(() => {
    const sections: { id: MediaType; labelKey: string; icon: React.ElementType; count: number }[] = [];
    const mapping: Record<MediaType, { labelKey: string; icon: React.ElementType }> = {
      photos: { labelKey: 'photos_count', icon: GravityPictureIcon },
      videos: { labelKey: 'videos_count', icon: GravityVideoIcon },
      files: { labelKey: 'files_count', icon: GravityFileIcon },
      audio: { labelKey: 'audio_files_count', icon: GravityHeadphonesIcon },
      links: { labelKey: 'links_count', icon: GravityLinkIcon },
      voice: { labelKey: 'voice_messages_count', icon: GravityMicIcon },
      gif: { labelKey: 'gif_count', icon: GravityGifBadgeIcon },
    };

    for (const [key, { labelKey, icon }] of Object.entries(mapping)) {
      const type = key as MediaType;
      const count = mediaGroups[type]?.count ?? 0;
      if (count > 0) {
        sections.push({
          id: type,
          labelKey,
          icon,
          count,
        });
      }
    }
    return sections;
  }, [mediaGroups]);

  const handleChatClick = useCallback(() => {
    setActiveChat(chatId);
    onClose();
    window.dispatchEvent(new CustomEvent('orbita:scroll-to-bottom', { detail: { chatId } }));
  }, [chatId, setActiveChat, onClose]);

  const handleCallClick = useCallback(() => {
    if (chatId === 'notes') {
      alert(t('profile.calls_not_available') || 'Звонки недоступны для заметок');
      return;
    }
    if (!voiceCallsEnabled) {
      alert(t('settings.voice_calls_disabled') || 'Голосовые звонки отключены в настройках');
      return;
    }
    startCall(chatId, 'audio', myNickname);
  }, [voiceCallsEnabled, chatId, myNickname, startCall, t]);

  const handleSoundClick = useCallback(() => {
    setSoundAnimTrigger((prev) => prev + 1);
    toggleChatMuted(chatId);
  }, [chatId, toggleChatMuted]);

  const handleMediaClick = useCallback((clickedItem: MediaGridItem) => {
    if (!subTab) return;
    const allItems = mediaGroups[subTab]?.gridItems || [];
    const itemsList = filteredGridItems(allItems);
    const usersById = useChatStore.getState().usersById || {};
    const viewerItems: MediaViewerItem[] = itemsList.map((it, idx) => {
      const effectiveSecret = it.key || chat?.sharedSecret;
      const directUrl = getOrbitaMediaUrl(it.url, effectiveSecret, chat?.id, it.messageId, it.name) || undefined;
      const targetMsg = messages?.find((m) => m.id === it.messageId);
      const isOut = targetMsg ? Boolean(targetMsg.isOutgoing || (targetMsg as any).isOwn || (targetMsg as any).outgoing) : false;
      const senderId = it.senderId || targetMsg?.senderId || (isOut ? myUserId : undefined);
      const actualSender = (senderId ? (senderId === myUserId ? myNickname : usersById[senderId]?.nickname) : undefined) || it.sender;
      return {
        id: it.id || String(idx),
        url: it.url,
        directUrl,
        chatId: chat?.id,
        type: it.type,
        name: it.name,
        sender: actualSender,
        senderId,
        isOwn: isOut,
        time: it.time,
        messageId: it.messageId,
        duration: it.duration,
        caption: it.text,
        key: it.key,
        sharedSecret: effectiveSecret,
      };
    });
    const index = viewerItems.findIndex((it) => it.id === clickedItem.id || it.url === clickedItem.url);
    const initialIndex = index !== -1 ? index : 0;
    const orbita = (window as any).orbita;
    if (orbita?.openMediaWindow) {
      orbita.openMediaWindow({
        items: viewerItems,
        initialIndex,
        sharedSecret: chat?.sharedSecret,
        chatId: chat?.id,
        usersById: useChatStore.getState().usersById,
        myUserId: useAuthStore.getState().userId,
        myNickname: useAuthStore.getState().nickname,
      });
      return;
    }
    setViewerState({
      isOpen: true,
      items: viewerItems,
      initialIndex,
    });
  }, [subTab, mediaGroups, searchQuery, chat, messages, myUserId, myNickname]);

  if (!chat) {
    return null;
  }

  const formatSubscribers = (count: number) => {
    const c = Math.max(1, count);
    const mod10 = c % 10;
    const mod100 = c % 100;
    if (mod10 === 1 && mod100 !== 11) return `${c} подписчик`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${c} подписчика`;
    return `${c} подписчиков`;
  };

  const statusText = (chatId === 'notes' || chat.type === 'bot')
    ? ''
    : chat.type === 'channel'
      ? formatSubscribers(chat.subscribersCount || 0)
      : chat.type === 'group'
        ? (() => {
            const total = chat.members?.length || chat.membersCount || 1;
            const online = Math.min(total, Math.max(1, chat.onlineCount || 1));
            return t('groupSettings.members_and_online', { count: total, online });
          })()
        : chat.online
          ? t('userStatus.online')
          : formatLastSeen(chat.lastSeen, t);

  useLayoutEffect(() => {
    const updateAlign = () => {
      const parentW = profileScrollRef.current?.clientWidth || 420;
      const modalCenterX = Math.max(0, parentW / 2 - 20);
      const rowEl = titleRowRef.current;
      const statusEl = statusSpanRef.current;
      const rowW = rowEl ? Math.ceil(rowEl.offsetWidth) : 0;
      const statusW = statusEl ? Math.ceil(statusEl.offsetWidth || statusEl.scrollWidth) : 0;
      if (rowW > 0) {
        setRowShiftX(Math.max(0, Math.round(modalCenterX - rowW / 2)));
      }
      if (statusW > 0) {
        setStatusShiftX(Math.max(0, Math.round(modalCenterX - statusW / 2)));
      }
    };
    updateAlign();
    const timer = setTimeout(updateAlign, 50);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(updateAlign).catch(() => {});
    }
    window.addEventListener('resize', updateAlign);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateAlign);
    };
  }, [chat?.name, chat?.members?.length, chat?.onlineCount, chat?.online, statusText]);

  const filteredGridItems = (items: MediaGridItem[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item =>
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.text && item.text.toLowerCase().includes(q)) ||
      (item.sender && item.sender.toLowerCase().includes(q))
    );
  };

  const renderMainContent = () => (
    <div
      style={{
        padding: effectiveBannerUrl ? '0 0 24px' : '16px 0 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        flexShrink: 0,
      }}
    >
            <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          opacity: Math.max(0, 1 - (scrollOffset / 85)),
          transform: `translateY(-${scrollOffset * 0.4}px) scale(${Math.max(0.35, 1 - (scrollOffset / 105))})`,
          transformOrigin: 'top center',
          pointerEvents: scrollOffset > 60 ? 'none' : 'auto',
          transition: 'none',
          marginTop: 0,
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            marginBottom: 10,
            marginTop: 0,
            borderRadius: '50%',
            backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
            boxShadow: effectiveBannerUrl ? '0 0 0 6px var(--settings-bg, var(--bg-secondary))' : 'none',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              cursor: chat.avatarUrl ? 'pointer' : 'default',
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
            }}
            onClick={() => {
              if (chat.avatarUrl) {
                const isNotes = chatId === 'notes';
                const avatarSenderId = isNotes ? myUserId : (chat.peerCode || (chat.id && chat.id.length === 36 ? chat.id : undefined));
                const usersById = useChatStore.getState().usersById || {};
                const actualSender = (avatarSenderId ? (avatarSenderId === myUserId ? myNickname : usersById[avatarSenderId]?.nickname) : undefined) || chat.name;
                const avatarItems = [{
                  id: 'avatar',
                  url: chat.avatarUrl,
                  directUrl: chat.avatarUrl,
                  type: 'photo' as const,
                  name: `${chat.name || 'Avatar'}.jpg`,
                  sender: actualSender,
                  senderId: avatarSenderId,
                  time: Date.now(),
                }];
                const orbita = (window as any).orbita;
                if (orbita?.openMediaWindow) {
                  orbita.openMediaWindow({
                    items: avatarItems,
                    initialIndex: 0,
                    sharedSecret: chat.sharedSecret,
                    chatId: chat.id,
                    usersById: useChatStore.getState().usersById,
                    myUserId: useAuthStore.getState().userId,
                    myNickname: useAuthStore.getState().nickname,
                  });
                  return;
                }
                setViewerState({
                  isOpen: true,
                  items: avatarItems,
                  initialIndex: 0,
                });
              }
            }}
          >
            {chatId === 'notes' ? (
              <NotesAvatar className="w-24 h-24" />
            ) : (
              <Avatar
                src={chat.id === 'system_support' ? (chat.avatarUrl || SUPPORT_AVATAR_URL) : chat.avatarUrl}
                alt={chat.name}
                className="w-24 h-24 rounded-full"
                style={{ backgroundColor: 'var(--settings-bg, var(--bg-secondary))' }}
              />
            )}
          </div>
          {chat.type === 'private' && chatId !== 'notes' && chat.id !== 'system_support' && (
            <OnlineIndicator
              online={chat.online}
              showOffline={false}
              size="lg"
              ringColor="var(--settings-bg, var(--bg-secondary))"
              ariaLabel={t('userStatus.online', 'В сети')}
            />
          )}
        </div>
      </div>

      <div style={{ height: statusText ? 52 : 32, marginBottom: 16, width: '100%', flexShrink: 0 }} />

      <ProfileActionButtons
        chat={chat}
        chatId={chatId}
        isGroup={isGroup}
        isGroupAdmin={isGroupAdmin}
        isGroupOwner={isGroupOwner}
        isChannel={isChannel}
        soundAnimTrigger={soundAnimTrigger}
        voiceCallsEnabled={voiceCallsEnabled}
        copiedKey={copiedKey}
        onChatClick={handleChatClick}
        onSoundClick={handleSoundClick}
        onCallClick={handleCallClick}
        onCopyKey={() => handleCopyChannelKey()}
        onOpenDeleteGroup={(mode) => {
          setGroupModalMode(mode);
          setIsDeleteGroupModalOpen(true);
        }}
      />

      <ProfileInfoCard
        chat={chat}
        isGroup={isGroup}
        isGroupAdmin={isGroupAdmin}
        isChannel={isChannel}
        isChannelOwner={isChannelOwner}
        profileId={profileId}
        formattedProfileId={formattedProfileId}
        isResettingLink={isResettingLink}
        setIsResettingLink={setIsResettingLink}
        onCopyKey={(text) => handleCopyChannelKey(text)}
        onEditClick={() => setIsEditingChannel(true)}
        i18nLang={i18n.language}
      />

      {isGroup && (
        <ProfileGroupMembers
          chat={chat}
          myUserId={myUserId}
          myNickname={myNickname}
          memberAvatars={memberAvatars}
          isGroupOwner={isGroupOwner}
          isGroupAdmin={isGroupAdmin}
          onOpenAddMember={() => setIsAddMemberModalOpen(true)}
          onOpenDeleteGroup={() => {
            setGroupModalMode('delete');
            setIsDeleteGroupModalOpen(true);
          }}
          onClose={onClose}
          setActiveChat={setActiveChat}
        />
      )}

      {availableSections.length > 0 && (
        <div style={{
          backgroundColor: 'var(--md-surface, #211c2e)',
          width: 'calc(100% - 20px)',
          margin: '0 10px 16px 10px',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          padding: '4px 0',
          boxSizing: 'border-box',
        }}>
          {availableSections.map((section) => {
            const Icon = section.icon;
            const countLabel = t(`profile.${section.labelKey}`, { count: section.count });
            return (
              <button
                key={section.id}
                onClick={() => {
                  setSearchQuery('');
                  setSubTab(section.id);
                }}
                aria-label={countLabel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  width: 'calc(100% - 20px)',
                  margin: '2px 10px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  justifyContent: 'flex-start',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon width={22} height={22} style={{ color: 'var(--text-dim, #9CA3AF)', flexShrink: 0 }} />
                <span style={{ fontSize: '14.5px', fontWeight: 400, textAlign: 'left' }}>{countLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );



  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          display: 'flex',
          alignItems: isMobileView ? 'stretch' : 'flex-start',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
          padding: isMobileView ? '0' : 'min(7.5vh, 64px) 16px 16px',
        }}
        onClick={onClose}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{
            opacity: 1,
            scale: 1,
            height: isMobileView ? 'calc(100vh - 30px)' : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750),
          }}
          animate={{
            opacity: 1,
            scale: 1,
            height: isMobileView
              ? 'calc(100vh - 30px)'
              : (isEditingChannel || subTab !== null)
              ? (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750)
              : targetHeight !== null
              ? Math.min(targetHeight, typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750)
              : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750),
          }}
          transition={{
            height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 0 },
            scale: { duration: 0 },
          }}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: isMobileView ? '100vw' : '420px',
            maxHeight: isMobileView ? 'calc(100vh - 30px)' : 'min(85vh, 750px)',
            display: 'flex',
            flexDirection: 'column',
            margin: isMobileView ? '0' : '0 16px',
            marginTop: isMobileView ? '30px' : '0',
            backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
            borderRadius: isMobileView ? 0 : 16,
            boxShadow: isMobileView ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
            color: 'var(--text-main, #fff)',
            overflow: 'hidden',
            userSelect: 'none',
            border: 'none',
            outline: 'none',
          }}
        >
          {isEditingChannel ? (
            <div
              style={{
                width: '100%',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                boxSizing: 'border-box',
                borderBottom: 'none',
                flexShrink: 0,
                zIndex: 30,
              }}
            >
              <button
                type="button"
                onClick={() => setIsEditingChannel(false)}
                aria-label={t('common.back', 'Назад')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  transition: 'color 150ms, background 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-dim)';
                }}
              >
                <ArrowLeft size={20} />
              </button>

              <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                {isGroup ? t('groupSettings.edit_group', 'Редактировать лобби') : t('channel.edit_channel', 'Редактировать канал')}
              </span>

              <button
                type="button"
                onClick={handleSaveChannel}
                disabled={isSavingChannel || !editName.trim()}
                aria-label={t('channel.save', 'Сохранить')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color, #7C3AED)',
                  cursor: (isSavingChannel || !editName.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (isSavingChannel || !editName.trim()) ? 0.5 : 1,
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  transition: 'background 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!isSavingChannel && editName.trim()) {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {isSavingChannel ? <MD3CircularSpinner size="small" /> : <Check size={20} />}
              </button>
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px 0 20px',
                zIndex: 30,
                backgroundColor: subTab !== null
                  ? 'transparent'
                  : `color-mix(in srgb, var(--settings-bg, var(--bg-secondary)) ${Math.min(100, Math.round((Math.max(0, scrollOffset - (effectiveBannerUrl ? 160 : 90)) / 22) * 100))}%, transparent)`,
                borderBottom: 'none',
                pointerEvents: 'none',
                boxSizing: 'border-box',
                transition: 'none',
              }}
            >
              {subTab === null ? (
                <div
                  ref={titleBlockRef}
                  style={{
                    position: 'absolute',
                    left: 20,
                    top: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    minWidth: 0,
                    width: 'calc(100% - 40px)',
                    maxWidth: scrollOffset >= (effectiveBannerUrl ? 180 : 110) ? 'calc(100% - 90px)' : 'calc(100% - 40px)',
                    transform: `translateY(${Math.max(0, (effectiveBannerUrl ? 190 : 112) - scrollOffset)}px) scale(${1 - Math.min(1, Math.max(0, scrollOffset / (effectiveBannerUrl ? 190 : 112))) * 0.18})`,
                    transformOrigin: 'left top',
                    pointerEvents: scrollOffset >= (effectiveBannerUrl ? 180 : 110) ? 'auto' : 'none',
                    transition: 'none',
                  }}
                >
                  <div
                    ref={titleRowRef}
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: 'fit-content',
                      maxWidth: '100%',
                      minWidth: 0,
                      pointerEvents: 'auto',
                      transform: `translateX(${Math.round((1 - Math.min(1, Math.max(0, scrollOffset / (effectiveBannerUrl ? 190 : 112)))) * rowShiftX)}px)`,
                      transition: 'none',
                    }}
                  >
                    <span
                      className="truncate"
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: 'var(--text-main)',
                        lineHeight: 1.2,
                      }}
                    >
                      {chatId === 'notes' ? t('connectModal.notes') : chat.name}
                    </span>
                    {(chat.isOfficial || chat.id === 'system_support') && (
                      <VerifiedBadge size={18} className="flex-shrink-0" />
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        left: 'calc(100% + 5px)',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <DeveloperBadge
                        userId={chat.peerCode || (chat.name && chat.name.length === 36 ? chat.name : undefined) || (chatId !== 'notes' ? chatId : undefined)}
                        nickname={chat.name}
                        size={34}
                        onClick={triggerDevToast}
                      />
                    </div>
                  </div>
                  {statusText && (
                    <span
                      ref={statusSpanRef}
                      className="truncate"
                      style={{
                        display: 'inline-block',
                        width: 'fit-content',
                        maxWidth: '100%',
                        fontSize: '13px',
                        color: (!isChannel && chatId !== 'notes' && chat.online) ? 'var(--accent-color)' : 'var(--text-dim)',
                        fontWeight: (!isChannel && chatId !== 'notes' && chat.online) ? 600 : 400,
                        lineHeight: 1.2,
                        marginTop: '3px',
                        transform: `translateX(${Math.round((1 - Math.min(1, Math.max(0, scrollOffset / (effectiveBannerUrl ? 190 : 112)))) * statusShiftX)}px)`,
                        transition: 'none',
                      }}
                    >
                      {statusText}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1 }} />
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  marginLeft: 'auto',
                  pointerEvents: 'auto',
                }}
              >
                {(isChannelOwner || isGroupAdmin) && subTab === null && (
                  <button
                    type="button"
                    onClick={() => setIsEditingChannel(true)}
                    aria-label={isGroup ? t('groupSettings.edit_group', 'Редактировать лобби') : t('channel.edit_channel', 'Редактировать канал')}
                    style={{
                      background: (effectiveBannerUrl && scrollOffset < 160) ? 'rgba(0, 0, 0, 0.45)' : 'none',
                      backdropFilter: (effectiveBannerUrl && scrollOffset < 160) ? 'blur(8px)' : 'none',
                      WebkitBackdropFilter: (effectiveBannerUrl && scrollOffset < 160) ? 'blur(8px)' : 'none',
                      border: 'none',
                      color: (effectiveBannerUrl && scrollOffset < 160) ? '#ffffff' : 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                      transition: 'color 150ms, background 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = (effectiveBannerUrl && scrollOffset < 160) ? 'rgba(0, 0, 0, 0.65)' : 'var(--surface-hover)';
                      e.currentTarget.style.color = 'var(--text-main)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = (effectiveBannerUrl && scrollOffset < 160) ? 'rgba(0, 0, 0, 0.45)' : 'transparent';
                      e.currentTarget.style.color = (effectiveBannerUrl && scrollOffset < 160) ? '#ffffff' : 'var(--text-dim)';
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                )}

                {!isMobileView && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close', 'Закрыть')}
                    style={{
                      background: (effectiveBannerUrl && scrollOffset < 160) ? 'rgba(0, 0, 0, 0.45)' : 'none',
                      backdropFilter: (effectiveBannerUrl && scrollOffset < 160) ? 'blur(8px)' : 'none',
                      WebkitBackdropFilter: (effectiveBannerUrl && scrollOffset < 160) ? 'blur(8px)' : 'none',
                      border: 'none',
                      color: (effectiveBannerUrl && scrollOffset < 160) ? '#ffffff' : 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 150ms, background 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = (effectiveBannerUrl && scrollOffset < 160) ? 'rgba(0, 0, 0, 0.65)' : 'var(--surface-hover)';
                      e.currentTarget.style.color = 'var(--text-main)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = (effectiveBannerUrl && scrollOffset < 160) ? 'rgba(0, 0, 0, 0.45)' : 'transparent';
                      e.currentTarget.style.color = (effectiveBannerUrl && scrollOffset < 160) ? '#ffffff' : 'var(--text-dim)';
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
                      <path fill="currentColor" d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12L4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              flex: 1,
              overflow: 'hidden',
            }}
            onMouseMove={triggerProfileActive}
            onMouseEnter={triggerProfileActive}
            onMouseLeave={handleProfileMouseLeave}
          >
            <div
              ref={profileScrollRef}
              onScroll={triggerProfileActive}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                flex: 1,
                overflowY: subTab !== null ? 'hidden' : 'auto',
                overflowX: 'hidden',
              }}
              className="chat-list-scrollbar"
            >
              <div
                ref={innerContentRef}
                style={{
                  width: '100%',
                  height: subTab !== null ? '100%' : 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  flex: subTab !== null ? 1 : 'none',
                }}
              >
                {isEditingChannel ? (
                  <ProfileEditChannel
                    isGroup={isGroup}
                    editName={editName}
                    setEditName={setEditName}
                    editDescription={editDescription}
                    setEditDescription={setEditDescription}
                    editUsername={editUsername}
                    setEditUsername={setEditUsername}
                    editUsernameError={editUsernameError}
                    setEditUsernameError={setEditUsernameError}
                    editAvatarUrl={editAvatarUrl}
                    setEditAvatarUrl={setEditAvatarUrl}
                    fileInputRef={fileInputRef}
                    handleAvatarFileChange={handleAvatarFileChange}
                    emojiBtnRef={emojiBtnRef}
                    showEmojiPicker={showEmojiPicker}
                    setShowEmojiPicker={setShowEmojiPicker}
                    cropperModalOpen={cropperModalOpen}
                    setCropperModalOpen={setCropperModalOpen}
                    cropperImageSrc={cropperImageSrc}
                    setCropperImageSrc={setCropperImageSrc}
                  />
                ) : subTab !== null ? (
                  <ProfileSubTab
                    subTab={subTab}
                    onBack={() => setSubTab(null)}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    mediaGroups={mediaGroups}
                    chatSharedSecret={chat.sharedSecret!}
                    viewerOpen={viewerState.isOpen}
                    onMediaClick={handleMediaClick}
                    onLinkClick={onLinkClick}
                    i18nLang={i18n.language}
                  />
                ) : (
                  renderMainContent()
                )}
              </div>
            </div>

            {subTab === null && !isEditingChannel && profileThumb && (
              <>
                <div
                  className="overlay-scroll-track"
                  onMouseDown={(e) => handleScrollbarTrackMouseDown(e, profileScrollRef.current)}
                  style={{
                    top: '6px',
                    bottom: '6px',
                    opacity: isProfileActive ? 1 : 0,
                  }}
                />
                <div
                  className="overlay-scroll-thumb"
                  onMouseDown={(e) => handleScrollbarThumbMouseDown(e, profileScrollRef.current)}
                  style={{
                    top: profileThumb.top + 6,
                    height: profileThumb.height,
                    opacity: isProfileActive ? 1 : 0,
                  }}
                />
              </>
            )}
          </div>

          <DeveloperToast isOpen={devToastOpen} nickname={chat?.name} />
        </motion.div>
      </div>


      {viewerState.isOpen && (
        <TelegramMediaViewer
          isOpen={viewerState.isOpen}
          items={viewerState.items}
          initialIndex={viewerState.initialIndex}
          sharedSecret={chat.sharedSecret}
          showCarouselAlways={true}
          onClose={() => setViewerState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {isGroup && chat && (
        <AddGroupMemberModal
          isOpen={isAddMemberModalOpen}
          onClose={() => setIsAddMemberModalOpen(false)}
          group={chat}
        />
      )}

      {isGroup && (
        <DeleteGroupModal
          isOpen={isDeleteGroupModalOpen}
          onClose={() => setIsDeleteGroupModalOpen(false)}
          onConfirm={handleConfirmGroupAction}
          mode={groupModalMode}
        />
      )}
    </>
  );
});