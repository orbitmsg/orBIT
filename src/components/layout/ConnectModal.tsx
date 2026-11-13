import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Loader2,
  X,
  Megaphone,
  Search,
  Copy,
  Check,
  Shield,
  Link2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { channelService } from '../../services/channelService';
import { groupService } from '../../services/groupService';
import { extractCodeFromInput, parseOrbitaLink } from '../../utils/inviteLink';
import { extractGroupCode, isValidGroupCode } from '../../lib/groupCrypto';
import { generateChannelId } from '../../lib/codes';
import { useToastStore } from '../../store/useToastStore';
import { AvatarCropperModal } from '../settings/AvatarCropperModal';
import { isStaticImageFile, MAX_AVATAR_BANNER_SIZE, getMediaInfoFromDataUrl } from '../../utils/staticImageValidation';
import { supabaseService, type UserDirectoryRecord } from '../../services/supabaseService';
import { Avatar } from '../common/Avatar';

export type CreateModalType = 'group' | 'channel' | 'friend';

interface ConnectModalProps {
  type: CreateModalType;
  onClose: () => void;
  onConnectRequest: (friendCode: string, callback: (success: boolean, error?: string) => void) => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  type,
  onClose,
  onConnectRequest,
}) => {
  const { t } = useTranslation();
  const activeType = type;
  const [inputValue, setInputValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  const [channelUsername, setChannelUsername] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropperModalOpen, setCropperModalOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempWarning, setTempWarning] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<UserDirectoryRecord[]>([]);
  const [copiedContactField, setCopiedContactField] = useState<'username' | 'id' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const tempWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyContactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue('');
    setDescriptionValue('');
    setChannelUsername('');
    setError(null);
    setTempWarning(null);
    setUsernameError(null);
    setLiveResults([]);
  }, [type]);

  useEffect(() => {
    if (activeType !== 'friend') {
      setLiveResults([]);
      return;
    }
    const clean = inputValue.replace(/^@+/, '').trim().toLowerCase();
    if (clean.length < 2) {
      setLiveResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      supabaseService.searchPublicProfiles(clean, 5).then((results) => {
        if (!cancelled) {
          const myUid = useAuthStore.getState().userId;
          const myC = useChatStore.getState().myCode;
          setLiveResults((results || []).filter((u) => u.user_code !== myC && u.user_code !== myUid));
        }
      }).catch(() => {
        if (!cancelled) setLiveResults([]);
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputValue, activeType]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myUsername = useAuthStore((s) => s.username) || '';
  const myUserId = useAuthStore((s) => s.userId);
  const myCode = useChatStore((s) => s.myCode);
  const addChannelChat = useChatStore((s) => s.addChannelChat);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  useEffect(() => {
    if (activeType !== 'friend' || !myCode) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(myCode, {
      width: 192,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#111318', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [activeType, myCode]);

  const cleanMyUsername = myUsername.replace(/^@+/, '').trim();

  const handleCopyContact = useCallback(
    async (value: string, field: 'username' | 'id') => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch {}
      setCopiedContactField(field);
      const toastText =
        field === 'id'
          ? t('profile.id_copied_share', 'ID скопирован в буфер обмена. Поделитесь им!')
          : t('profile.username_copied_share', {
              username: value,
              defaultValue: `${value} скопирован в буфер обмена. Поделитесь им!`,
            });
      useToastStore.getState().showToast(toastText, 'image');
      if (copyContactTimerRef.current) {
        clearTimeout(copyContactTimerRef.current);
      }
      copyContactTimerRef.current = setTimeout(() => {
        setCopiedContactField(null);
        copyContactTimerRef.current = null;
      }, 2000);
    },
    [t]
  );

  const showTempWarning = useCallback((msg: string) => {
    if (tempWarningTimerRef.current) {
      clearTimeout(tempWarningTimerRef.current);
    }
    setTempWarning(msg);
    inputRef.current?.focus();
    tempWarningTimerRef.current = setTimeout(() => {
      setTempWarning(null);
      tempWarningTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (tempWarningTimerRef.current) {
        clearTimeout(tempWarningTimerRef.current);
      }
      if (copyContactTimerRef.current) {
        clearTimeout(copyContactTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_AVATAR_BANNER_SIZE) {
        useToastStore.getState().showToast(t('settings.file_too_large_3mb'));
        if (e.target) e.target.value = '';
        return;
      }
      const check = await isStaticImageFile(file);
      const isAnim = file.type.startsWith('video/') || file.type === 'image/gif' || file.name.match(/\.(gif|mp4|webm|mov)$/i);
      if (!check.ok && !isAnim) {
        useToastStore.getState().showToast(t('settings.static_images_only'));
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

  const handleSubmit = useCallback(async () => {
    if (isLoading) return;
    const trimmed = inputValue.trim();

    if (!trimmed) {
      if (activeType === 'friend') {
        showTempWarning(t('createModal.specify_friend_id', 'Укажите ID вашего друга'));
      } else if (activeType === 'channel') {
        showTempWarning(t('createModal.specify_channel_name', 'Укажите название канала'));
      } else {
        showTempWarning(t('createModal.specify_group_name', 'Укажите название группы'));
      }
      return;
    }

    if (activeType === 'friend') {
      const parsed = parseOrbitaLink(trimmed);
      if (parsed) {
        if (parsed.kind === 'group') {
          onClose();
          window.dispatchEvent(new CustomEvent('orbita:open-group-invite', { detail: { url: trimmed } }));
          return;
        }
        if (parsed.kind === 'channel') {
          onClose();
          window.dispatchEvent(new CustomEvent('orbita:open-channel-invite', { detail: { url: trimmed } }));
          return;
        }
        if (parsed.kind === 'slug') {
          setIsLoading(true);
          try {
            const channel = await channelService.getChannel(parsed.identifier);
            if (channel) {
              setIsLoading(false);
              onClose();
              window.dispatchEvent(new CustomEvent('orbita:open-channel-invite', { detail: { url: trimmed, channel } }));
              return;
            }
          } catch {}
          setIsLoading(false);
        }
      }

      const isExplicitGroup = trimmed.includes('group') || trimmed.includes('join') || trimmed.includes('#') || trimmed.startsWith('join_');
      const groupCode = isExplicitGroup ? extractGroupCode(trimmed) : '';
      if (groupCode && isValidGroupCode(groupCode)) {
        onClose();
        window.dispatchEvent(new CustomEvent('orbita:open-group-invite', { detail: { url: trimmed } }));
        return;
      }

      const channelMatch = trimmed.match(/\/(?:c|channel)\/([A-Z0-9_-]{10,})/i);
      if (channelMatch && channelMatch[1]) {
        onClose();
        window.dispatchEvent(new CustomEvent('orbita:open-channel-invite', { detail: { url: trimmed } }));
        return;
      }

      const cleanInput = (parsed && (parsed.kind === 'user' || parsed.kind === 'slug'))
        ? parsed.identifier
        : extractCodeFromInput(trimmed).trim();
      const rawClean = cleanInput.replace(/^@+/, '').trim();
      if (!rawClean) {
        showTempWarning(t('createModal.invalid_content', 'Неверное содержимое'));
        return;
      }

      if (
        (myCode && rawClean.toUpperCase() === myCode.toUpperCase()) ||
        (myUserId && rawClean.toUpperCase() === myUserId.toUpperCase())
      ) {
        showTempWarning(t('discord.cannotAddSelf', 'Нельзя добавить самого себя'));
        return;
      }

      setIsLoading(true);
      setError(null);

      if (/^[0-9a-zA-Z-]{36}$/.test(rawClean)) {
        onConnectRequest(rawClean.toUpperCase(), (ok, msg) => {
          setIsLoading(false);
          if (ok) {
            onClose();
          } else {
            showTempWarning(msg || t('createModal.invalid_content', 'Неверное содержимое'));
          }
        });
        return;
      }

      try {
        const found = await supabaseService.lookupProfileByUsername(rawClean);
        if (found && found.user_code) {
          onConnectRequest(found.user_code, (ok, msg) => {
            setIsLoading(false);
            if (ok) {
              onClose();
            } else {
              showTempWarning(msg || t('createModal.invalid_content', 'Неверное содержимое'));
            }
          });
          return;
        }

        const searchMatches = await supabaseService.searchPublicProfiles(rawClean, 1);
        if (searchMatches && searchMatches.length > 0 && searchMatches[0].user_code) {
          onConnectRequest(searchMatches[0].user_code, (ok, msg) => {
            setIsLoading(false);
            if (ok) {
              onClose();
            } else {
              showTempWarning(msg || t('createModal.invalid_content', 'Неверное содержимое'));
            }
          });
          return;
        }

        onConnectRequest(rawClean, (ok, msg) => {
          setIsLoading(false);
          if (ok) {
            onClose();
          } else {
            showTempWarning(msg || t('createModal.user_not_found', 'Пользователь не найден'));
          }
        });
      } catch {
        setIsLoading(false);
        showTempWarning(t('createModal.user_not_found', 'Пользователь не найден'));
      }
      return;
    }

    if (activeType === 'group') {
      setIsLoading(true);
      setError(null);
      const myUserId = useAuthStore.getState().userId;
      const myUserAvatar = useAuthStore.getState().avatarUrl;

      let finalGroupAvatar = avatarUrl;
      if (avatarUrl && avatarUrl.startsWith('data:')) {
        const base64 = avatarUrl.includes(',') ? avatarUrl.split(',')[1] : avatarUrl;
        const { ext } = getMediaInfoFromDataUrl(avatarUrl);
        if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
          try {
            const tempPath = await window.orbita.writeTempFile(base64, ext);
            if (tempPath) {
              const publicId = `group_avatar_${Date.now()}`;
              const uploadRes = await window.orbita.uploadToCloudinary(tempPath, publicId);
              if (uploadRes.success && uploadRes.secure_url) {
                finalGroupAvatar = uploadRes.secure_url;
              }
              await window.orbita.deleteTempFile(tempPath);
            }
          } catch {}
        }
      }

      groupService.createGroup(trimmed, descriptionValue, myNickname, myCode, finalGroupAvatar, myUserId, myUserAvatar).then((res) => {
        setIsLoading(false);
        if (res && res.group) {
          const initialMember = {
            userCode: myCode,
            userId: myUserId || myCode,
            nickname: myNickname,
            role: 'owner' as const,
            lastSeen: Date.now(),
            avatarUrl: myUserAvatar || null,
          };
          const newChat: Chat = {
            id: res.group.id,
            type: 'group',
            name: res.group.name || trimmed,
            description: res.group.description || descriptionValue || '',
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: res.sharedSecret,
            role: 'owner',
            isOwner: true,
            creatorNickname: myNickname,
            creatorId: myCode,
            inviteCode: res.group.code,
            avatarUrl: res.group.avatarUrl || finalGroupAvatar || undefined,
            members: [initialMember],
            membersCount: 1,
            createdAt: Date.now(),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
            muted: false,
            notificationsEnabled: true,
          };
          useChatStore.setState((s) => ({ chats: [newChat, ...s.chats] }));
          setActiveChat(res.group.id);
          onClose();
        }
      }).catch((err) => {
        setIsLoading(false);
        useToastStore.getState().showToast(t('common.error', 'Ошибка создания группы') + (err?.message ? `: ${err.message}` : ''));
      });
      return;
    }

    if (activeType === 'channel') {
      const cleanUname = channelUsername.trim().replace(/^@+/, '').toLowerCase();
      if (cleanUname) {
        if (!/^[a-z0-9_]{3,32}$/.test(cleanUname)) {
          setUsernameError(t('channelSettings.username_invalid', 'От 3 до 32 символов: латиница, цифры и _'));
          return;
        }
        setIsLoading(true);
        try {
          const isAvailable = await channelService.checkChannelUsername(cleanUname);
          if (!isAvailable) {
            setIsLoading(false);
            setUsernameError(t('channelSettings.username_taken', 'Этот юзернейм уже занят'));
            return;
          }
        } catch {
          setIsLoading(false);
          setUsernameError(t('common.error', 'Ошибка проверки юзернейма'));
          return;
        }
      }

      setIsLoading(true);
      setError(null);
      const channelId = generateChannelId();
      try {
        const channel = await channelService.createChannel(
          trimmed,
          descriptionValue.trim(),
          avatarUrl,
          myNickname,
          myUserId,
          channelId,
          cleanUname || undefined
        );
        setIsLoading(false);
        if (channel) {
          addChannelChat({
            id: channel.id || channelId,
            name: channel.name || trimmed,
            username: channel.username || cleanUname || null,
            description: channel.description || descriptionValue.trim(),
            avatarUrl: channel.avatarUrl || avatarUrl || null,
            creatorNickname: myNickname,
            creatorId: myUserId,
            subscribersCount: 1,
            isOfficial: false,
            isOwner: true,
          });
          setActiveChat(channel.id || channelId);
          onClose();
        }
      } catch (err: any) {
        setIsLoading(false);
        useToastStore.getState().showToast(t('common.error', 'Ошибка создания сообщества') + (err?.message ? `: ${err.message}` : ''));
      }
      return;
    }
  }, [inputValue, descriptionValue, channelUsername, isLoading, activeType, onConnectRequest, myNickname, myCode, avatarUrl, addChannelChat, setActiveChat, onClose, t]);

  const label =
    activeType === 'friend'
      ? t('createModal.friend_id', 'Имя пользователя или ID друга')
      : activeType === 'channel'
      ? t('createModal.channel_name', 'Название канала')
      : t('createModal.group_name', 'Название группы');

  const modalTitle =
    activeType === 'friend'
      ? t('createModal.add_friend_title', 'Добавить в друзья')
      : activeType === 'channel'
      ? t('createModal.create_channel_title', 'Создать канал')
      : t('createModal.create_group_title', 'Создать группу');

  const modalSubtitle =
    activeType === 'friend'
      ? t('createModal.add_friend_subtitle', 'Найдите человека по @username, ID аккаунта или вставьте ссылку-приглашение')
      : activeType === 'channel'
      ? t('createModal.create_channel_subtitle', 'Публикации, новости и объявления для неограниченной аудитории')
      : t('createModal.create_group_subtitle', 'Приватное пространство со сквозным шифрованием для друзей и команды');

  const submitLabel =
    activeType === 'friend'
      ? t('createModal.send_request', 'Добавить')
      : activeType === 'channel'
      ? t('createModal.create_channel_btn', 'Создать канал')
      : t('createModal.create_group_btn', 'Создать группу');

  return (
    <AnimatePresence>
      <motion.div
        key="connect-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.58)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
          outline: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="w-full overflow-hidden relative"
          style={{
            maxWidth: activeType === 'friend' ? '480px' : '440px',
            backgroundColor: 'var(--settings-bg, var(--bg-secondary, #1e1b2e))',
            color: 'var(--text-main)',
            borderRadius: '24px',
            padding: '22px',
            border: 'none',
            outline: 'none',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.42)',
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2
                className="m-0 text-[20px] font-bold leading-tight tracking-[-0.01em]"
                style={{ color: 'var(--text-heading, var(--text-main))' }}
              >
                {modalTitle}
              </h2>
              <p
                className="m-0 mt-1.5 text-[13px] leading-[1.45]"
                style={{ color: 'var(--text-dim)' }}
              >
                {modalSubtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Закрыть')}
              className="w-8 h-8 flex items-center justify-center rounded-xl cursor-pointer transition-colors border-none outline-none shrink-0"
              style={{
                backgroundColor: 'var(--surface-container-soft)',
                color: 'var(--text-dim)',
                borderRadius: '12px',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                e.currentTarget.style.color = 'var(--text-main)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-container-soft)';
                e.currentTarget.style.color = 'var(--text-dim)';
              }}
            >
              <X size={16} />
            </button>
          </div>

          {activeType === 'friend' ? (
            <>
              <div
                className="flex items-center gap-2 transition-all"
                style={{
                  backgroundColor: 'var(--surface-container)',
                  borderRadius: '16px',
                  padding: '6px 6px 6px 14px',
                  border: 'none',
                  boxShadow: tempWarning
                    ? '0 0 0 2px rgba(239, 68, 68, 0.5)'
                    : isFocused
                    ? '0 0 0 2px color-mix(in srgb, var(--accent-color, #5865F2) 48%, transparent)'
                    : 'none',
                  boxSizing: 'border-box',
                }}
              >
                <Search size={16} style={{ color: isFocused ? 'var(--accent-text, var(--accent-color))' : 'var(--text-dim)', flexShrink: 0 }} />
                <input
                  id="connect-modal-main-input"
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  placeholder={label}
                  aria-label={label}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (tempWarning) setTempWarning(null);
                    if (error) setError(null);
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit();
                    } else if (e.key === 'Escape') {
                      onClose();
                    }
                  }}
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px]"
                  style={{
                    color: 'var(--text-main)',
                    border: 'none',
                    outline: 'none',
                    padding: '6px 4px',
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSubmit}
                  disabled={isLoading}
                  aria-label={submitLabel}
                  className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-semibold cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed border-none outline-none"
                  style={{
                    background: 'var(--accent-gradient, var(--accent-color, #5865F2))',
                    color: 'var(--accent-on-color, #ffffff)',
                    borderRadius: '12px',
                    border: 'none',
                    outline: 'none',
                  }}
                >
                  {isLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>{submitLabel}</span>
                </button>
              </div>

              {tempWarning && (
                <div className="mt-2 px-1 text-[12px] font-medium" style={{ color: '#ef4444' }}>
                  {tempWarning}
                </div>
              )}

              {liveResults.length > 0 && (
                <div
                  className="mt-3 p-1.5 flex flex-col gap-1 max-h-[168px] overflow-y-auto custom-scrollbar"
                  style={{
                    backgroundColor: 'var(--surface-container-soft)',
                    borderRadius: '16px',
                    border: 'none',
                  }}
                >
                  {liveResults.map((u) => (
                    <button
                      type="button"
                      key={u.user_code}
                      onClick={() => {
                        if (isLoading) return;
                        setIsLoading(true);
                        onConnectRequest(u.user_code, (ok, msg) => {
                          setIsLoading(false);
                          if (ok) {
                            onClose();
                          } else {
                            showTempWarning(msg || t('createModal.invalid_content', 'Неверное содержимое'));
                          }
                        });
                      }}
                      className="w-full text-left flex items-center gap-2.5 p-2 rounded-[12px] bg-transparent hover:bg-[var(--surface-hover)] cursor-pointer transition-colors border-none outline-none"
                      style={{ border: 'none', outline: 'none' }}
                    >
                      <Avatar src={u.avatar_url} alt={u.nickname} className="w-9 h-9 rounded-full flex-shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13.5px] font-semibold text-[var(--text-main)] truncate leading-tight">
                          {u.nickname}
                        </span>
                        {u.username && (
                          <span className="text-[11.5px] text-[var(--accent-text,var(--accent-color,#7C3AED))] truncate leading-normal">
                            @{u.username}
                          </span>
                        )}
                      </div>
                      <span
                        className="shrink-0 px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{
                          borderRadius: '10px',
                          backgroundColor: 'color-mix(in srgb, var(--accent-color, #5865F2) 16%, transparent)',
                          color: 'var(--accent-text, var(--accent-color, #5865F2))',
                        }}
                      >
                        {submitLabel}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {(myCode || cleanMyUsername) && (
                <div
                  className="mt-4"
                  style={{
                    backgroundColor: 'var(--surface-container-soft)',
                    borderRadius: '20px',
                    padding: '16px',
                    border: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    className="text-[13.5px] font-bold leading-snug"
                    style={{ color: 'var(--text-heading, var(--text-main))' }}
                  >
                    {t('createModal.share_contacts_title', 'Поделиться своими контактами')}
                  </div>
                  <div
                    className="mt-0.5 text-[12px] leading-[1.4]"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {t('createModal.share_contacts_desc', 'Отправьте свой код или покажите QR-код другу, чтобы он сразу нашёл вас')}
                  </div>

                  <div className="mt-3.5 flex flex-col sm:flex-row items-center sm:items-stretch gap-3.5">
                    {myCode && qrDataUrl && (
                      <button
                        type="button"
                        onClick={() => handleCopyContact(myCode, 'id')}
                        aria-label={t('profile.copy_id', 'Скопировать ID')}
                        className="shrink-0 flex items-center justify-center p-2.5 cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98] border-none outline-none"
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '16px',
                          border: 'none',
                          outline: 'none',
                        }}
                      >
                        <img
                          src={qrDataUrl}
                          alt={myCode}
                          style={{ width: '96px', height: '96px', display: 'block', borderRadius: '6px' }}
                        />
                      </button>
                    )}

                    <div className="flex-1 w-full min-w-0 flex flex-col justify-center gap-2">
                      <button
                        type="button"
                        disabled={!cleanMyUsername}
                        onClick={() => cleanMyUsername && handleCopyContact(`@${cleanMyUsername}`, 'username')}
                        aria-label={t('createModal.your_username', 'Ваш @username')}
                        className="w-full text-left flex items-center justify-between gap-2.5 px-3 py-2.5 transition-colors border-none outline-none disabled:opacity-60 disabled:cursor-default cursor-pointer"
                        style={{
                          backgroundColor: 'var(--surface-container)',
                          borderRadius: '14px',
                          border: 'none',
                          outline: 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (cleanMyUsername) e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--surface-container)';
                        }}
                      >
                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)' }}>
                            {t('createModal.your_username', 'Ваш @username')}
                          </span>
                          <span
                            className="text-[13px] font-semibold truncate"
                            style={{
                              color: cleanMyUsername
                                ? 'var(--accent-text, var(--accent-color, #5865F2))'
                                : 'var(--text-dim)',
                              fontFamily: cleanMyUsername ? '"JetBrains Mono", Consolas, Menlo, monospace' : 'inherit',
                            }}
                          >
                            {cleanMyUsername ? `@${cleanMyUsername}` : t('createModal.not_set', 'Не указан')}
                          </span>
                        </div>
                        {cleanMyUsername && (
                          <span
                            className="shrink-0 flex items-center"
                            style={{
                              color:
                                copiedContactField === 'username'
                                  ? 'var(--accent-text, var(--accent-color))'
                                  : 'var(--text-dim)',
                            }}
                          >
                            {copiedContactField === 'username' ? <Check size={15} /> : <Copy size={15} />}
                          </span>
                        )}
                      </button>

                      {myCode && (
                        <button
                          type="button"
                          onClick={() => handleCopyContact(myCode, 'id')}
                          aria-label={t('createModal.your_id', 'Ваш ID')}
                          className="w-full text-left flex items-center justify-between gap-2.5 px-3 py-2.5 transition-colors border-none outline-none cursor-pointer"
                          style={{
                            backgroundColor: 'var(--surface-container)',
                            borderRadius: '14px',
                            border: 'none',
                            outline: 'none',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface-container)';
                          }}
                        >
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)' }}>
                              {t('createModal.your_id', 'Ваш ID')}
                            </span>
                            <span
                              className="text-[12.5px] font-medium truncate"
                              style={{
                                color: 'var(--text-main)',
                                fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                              }}
                            >
                              {myCode}
                            </span>
                          </div>
                          <span
                            className="shrink-0 flex items-center"
                            style={{
                              color:
                                copiedContactField === 'id'
                                  ? 'var(--accent-text, var(--accent-color))'
                                  : 'var(--text-dim)',
                            }}
                          >
                            {copiedContactField === 'id' ? <Check size={15} /> : <Copy size={15} />}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  backgroundColor: 'var(--surface-container-soft)',
                  borderRadius: '20px',
                  padding: '16px',
                  border: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="shrink-0 relative">
                    <button
                      type="button"
                      onClick={handleAvatarClick}
                      aria-label={t('createModal.choose_photo', 'Выбрать фото')}
                      className="w-16 h-16 rounded-full flex items-center justify-center cursor-pointer overflow-hidden relative border-none outline-none transition-transform hover:scale-[1.04] active:scale-[0.97]"
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'var(--accent-gradient, var(--accent-color, #5865F2))',
                      }}
                    >
                      {avatarUrl ? (
                        <Avatar src={avatarUrl} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Camera size={24} style={{ color: 'var(--accent-on-color, #ffffff)' }} />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col">
                    <label
                      htmlFor="connect-modal-main-input"
                      className="text-[11.5px] font-semibold mb-1.5 px-0.5 truncate transition-colors"
                      style={{
                        color: tempWarning
                          ? '#ef4444'
                          : isFocused
                          ? 'var(--accent-text, var(--accent-color, #7C3AED))'
                          : 'var(--text-dim)',
                      }}
                    >
                      {tempWarning || label}
                    </label>
                    <input
                      id="connect-modal-main-input"
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      placeholder={label}
                      aria-label={label}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        if (tempWarning) setTempWarning(null);
                        if (error) setError(null);
                      }}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSubmit();
                        } else if (e.key === 'Escape') {
                          onClose();
                        }
                      }}
                      className="w-full outline-none text-[14.5px] transition-all"
                      style={{
                        color: 'var(--text-main)',
                        backgroundColor: 'var(--surface-container)',
                        border: 'none',
                        outline: 'none',
                        borderRadius: '14px',
                        padding: '10px 14px',
                        boxSizing: 'border-box',
                        boxShadow: tempWarning
                          ? '0 0 0 2px rgba(239, 68, 68, 0.5)'
                          : isFocused
                          ? '0 0 0 2px color-mix(in srgb, var(--accent-color, #7C3AED) 45%, transparent)'
                          : 'none',
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    type="text"
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    onFocus={() => setIsDescFocused(true)}
                    onBlur={() => setIsDescFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSubmit();
                      } else if (e.key === 'Escape') {
                        onClose();
                      }
                    }}
                    placeholder={
                      activeType === 'group'
                        ? t('groupSettings.group_desc', 'Описание группы')
                        : t('channel.description_optional', 'Описание (необязательно)')
                    }
                    aria-label={
                      activeType === 'group'
                        ? t('groupSettings.group_desc', 'Описание группы')
                        : t('channel.description_optional', 'Описание (необязательно)')
                    }
                    className="w-full outline-none text-[13.5px] transition-all"
                    style={{
                      color: 'var(--text-main)',
                      backgroundColor: 'var(--surface-container)',
                      border: 'none',
                      outline: 'none',
                      borderRadius: '14px',
                      padding: '10px 14px',
                      boxSizing: 'border-box',
                      boxShadow: isDescFocused
                        ? '0 0 0 2px color-mix(in srgb, var(--accent-color, #7C3AED) 45%, transparent)'
                        : 'none',
                    }}
                  />
                </div>

                {activeType === 'channel' && (
                  <div className="mt-3">
                    <div
                      className="flex items-center gap-2 transition-all"
                      style={{
                        backgroundColor: 'var(--surface-container)',
                        borderRadius: '14px',
                        padding: '0 14px',
                        boxShadow: usernameError
                          ? '0 0 0 2px rgba(239, 68, 68, 0.5)'
                          : isUsernameFocused
                          ? '0 0 0 2px color-mix(in srgb, var(--accent-color, #7C3AED) 45%, transparent)'
                          : 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--accent-text, var(--accent-color, #7C3AED))',
                          fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                        }}
                      >
                        @
                      </span>
                      <input
                        type="text"
                        value={channelUsername}
                        onChange={(e) => {
                          const val = e.target.value.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
                          setChannelUsername(val);
                          if (usernameError) setUsernameError(null);
                        }}
                        onFocus={() => setIsUsernameFocused(true)}
                        onBlur={() => setIsUsernameFocused(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSubmit();
                          } else if (e.key === 'Escape') {
                            onClose();
                          }
                        }}
                        placeholder={t('channelSettings.username_optional', 'Юзернейм (необязательно)')}
                        aria-label={t('channelSettings.username_optional', 'Юзернейм (необязательно)')}
                        className="w-full outline-none text-[13.5px] py-2.5 bg-transparent border-none"
                        style={{
                          color: 'var(--text-main)',
                          border: 'none',
                          outline: 'none',
                        }}
                      />
                    </div>
                    {usernameError && (
                      <div className="mt-1.5 px-1 text-[11.5px] font-medium" style={{ color: '#ef4444' }}>
                        {usernameError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3.5">
                {activeType === 'group' ? (
                  <>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium"
                      style={{
                        borderRadius: '999px',
                        backgroundColor: 'var(--surface-container-soft)',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <Shield size={13} style={{ color: 'var(--accent-text, var(--accent-color))' }} />
                      {t('createModal.feature_e2ee', 'E2EE шифрование')}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium"
                      style={{
                        borderRadius: '999px',
                        backgroundColor: 'var(--surface-container-soft)',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <Link2 size={13} style={{ color: 'var(--accent-text, var(--accent-color))' }} />
                      {t('createModal.feature_instant_invite', 'Приглашения по ссылке')}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium"
                      style={{
                        borderRadius: '999px',
                        backgroundColor: 'var(--surface-container-soft)',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <Megaphone size={13} style={{ color: 'var(--accent-text, var(--accent-color))' }} />
                      {t('createModal.feature_broadcast', 'Лента публикаций')}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium"
                      style={{
                        borderRadius: '999px',
                        backgroundColor: 'var(--surface-container-soft)',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <Link2 size={13} style={{ color: 'var(--accent-text, var(--accent-color))' }} />
                      {t('createModal.feature_channel_link', 'Быстрый доступ по ID')}
                    </span>
                  </>
                )}
              </div>

              {error && (
                <div className="text-[12px] mt-2 px-1" style={{ color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <div className="flex justify-end items-center gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.cancel', 'Отмена')}
                  className="px-4 py-2.5 text-[13.5px] font-semibold transition-colors cursor-pointer border-none outline-none"
                  style={{
                    borderRadius: '14px',
                    backgroundColor: 'var(--surface-container-soft)',
                    color: 'var(--text-main)',
                    border: 'none',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-container-soft)';
                  }}
                >
                  {t('common.cancel', 'Отмена')}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSubmit}
                  disabled={isLoading}
                  aria-label={submitLabel}
                  className="px-5 py-2.5 text-[13.5px] font-semibold transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border-none outline-none"
                  style={{
                    borderRadius: '14px',
                    background: 'var(--accent-gradient, var(--accent-color, #5865F2))',
                    color: 'var(--accent-on-color, #ffffff)',
                    border: 'none',
                    outline: 'none',
                  }}
                >
                  {isLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>{submitLabel}</span>
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>

      <AvatarCropperModal
        isOpen={cropperModalOpen}
        imageSrc={cropperImageSrc}
        onClose={() => {
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
        onSave={(dataUrl) => {
          setAvatarUrl(dataUrl);
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
      />
    </AnimatePresence>
  );
};