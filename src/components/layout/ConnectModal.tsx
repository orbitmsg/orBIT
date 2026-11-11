import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { channelService } from '../../services/channelService';
import { groupService } from '../../services/groupService';
import { extractCodeFromInput } from '../../utils/inviteLink';
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
  const [inputValue, setInputValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropperModalOpen, setCropperModalOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempWarning, setTempWarning] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<UserDirectoryRecord[]>([]);
  const tempWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (type !== 'friend') {
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
  }, [inputValue, type]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myUserId = useAuthStore((s) => s.userId);
  const myCode = useChatStore((s) => s.myCode);
  const addChannelChat = useChatStore((s) => s.addChannelChat);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

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
      if (type === 'friend') {
        showTempWarning(t('createModal.specify_friend_id', 'Укажите ID вашего друга'));
      } else if (type === 'channel') {
        showTempWarning(t('createModal.specify_channel_name', 'Укажите название канала'));
      } else {
        showTempWarning(t('createModal.specify_group_name', 'Укажите название группы'));
      }
      return;
    }

    if (type === 'friend') {
      const isExplicitGroup = trimmed.includes('group') || trimmed.includes('join') || trimmed.includes('#') || trimmed.startsWith('join_');
      const groupCode = isExplicitGroup ? extractGroupCode(trimmed) : '';
      if (groupCode && isValidGroupCode(groupCode)) {
        onClose();
        window.dispatchEvent(new CustomEvent('orbita:open-group-invite', { detail: { url: trimmed } }));
        return;
      }

      const channelMatch = trimmed.match(/\/(?:c|channel)\/([A-Z0-9_-]{10,})/i);
      if (channelMatch && channelMatch[1]) {
        setIsLoading(true);
        channelService.getChannel(channelMatch[1]).then((info) => {
          setIsLoading(false);
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
            setActiveChat(info.id);
            onClose();
          } else {
            showTempWarning(t('createModal.invalid_content', 'Неверное содержимое'));
          }
        }).catch(() => {
          setIsLoading(false);
          showTempWarning(t('createModal.invalid_content', 'Неверное содержимое'));
        });
        return;
      }

      const cleanInput = extractCodeFromInput(trimmed).trim();
      const rawClean = cleanInput.replace(/^@+/, '').trim();
      if (!rawClean) {
        showTempWarning(t('createModal.invalid_content', 'Неверное содержимое'));
        return;
      }

      setIsLoading(true);
      setError(null);

      if (/^[0-9a-fA-F-]{36}$/.test(rawClean)) {
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

    if (type === 'group') {
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

    if (type === 'channel') {
      setIsLoading(true);
      setError(null);
      const channelId = generateChannelId();
      channelService.createChannel(
        trimmed,
        descriptionValue.trim(),
        avatarUrl,
        myNickname,
        myUserId,
        channelId
      ).then((channel) => {
        setIsLoading(false);
        if (channel) {
          addChannelChat({
            id: channel.id || channelId,
            name: channel.name || trimmed,
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
      }).catch((err) => {
        setIsLoading(false);
        useToastStore.getState().showToast(t('common.error', 'Ошибка создания сообщества') + (err?.message ? `: ${err.message}` : ''));
      });
      return;
    }
  }, [inputValue, descriptionValue, isLoading, type, onConnectRequest, myNickname, myCode, avatarUrl, addChannelChat, setActiveChat, onClose, t]);

  const label =
    type === 'friend'
      ? t('createModal.friend_id', 'ID аккаунта друга')
      : type === 'channel'
      ? t('createModal.channel_name', 'Название канала')
      : t('createModal.group_name', 'Название группы');

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
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
          outline: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-[360px] rounded-2xl p-5 shadow-2xl overflow-hidden relative"
          style={{
            backgroundColor: 'var(--settings-bg, var(--bg-secondary, #1e1b2e))',
            color: 'var(--text-main)',
            borderRadius: '16px',
            border: 'none',
            outline: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3.5 mt-1">
            {type !== 'friend' && (
              <div className="flex-shrink-0 self-end pb-0.5">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  aria-label={t('createModal.choose_photo', 'Выбрать фото')}
                  className="w-14 h-14 rounded-full bg-[var(--accent-color,#3B82F6)] flex items-center justify-center cursor-pointer overflow-hidden relative border-none outline-none hover:opacity-90 transition-opacity"
                  style={{ border: 'none', outline: 'none' }}
                >
                  {avatarUrl ? (
                    <Avatar src={avatarUrl} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Camera size={24} className="text-white" />
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
            )}

            <div className="relative flex-1 flex flex-col min-w-0">
              <label
                htmlFor="connect-modal-main-input"
                className="text-[12px] font-medium mb-1.5 px-0.5 truncate transition-colors"
                style={{
                  color: tempWarning
                    ? '#ef4444'
                    : isFocused
                    ? 'var(--accent-color, #7C3AED)'
                    : 'var(--text-dim, #9ca3af)',
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
                    ? '0 0 0 2px rgba(239, 68, 68, 0.45)'
                    : isFocused
                    ? '0 0 0 2px color-mix(in srgb, var(--accent-color, #7C3AED) 45%, transparent)'
                    : 'none',
                }}
                autoFocus
              />
            </div>
          </div>

          {type === 'friend' && liveResults.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 max-h-[160px] overflow-y-auto custom-scrollbar">
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
                  className="w-full text-left flex items-center gap-2.5 p-2 rounded-xl bg-transparent hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.08))] cursor-pointer transition-colors"
                  style={{ border: 'none', outline: 'none' }}
                >
                  <Avatar src={u.avatar_url} alt={u.nickname} className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-[var(--text-main)] truncate leading-tight">
                      {u.nickname}
                    </span>
                    {u.username && (
                      <span className="text-[11px] text-[var(--accent-color,#7C3AED)] truncate leading-normal">
                        @{u.username}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {(type === 'channel' || type === 'group') && (
            <div className="relative w-full flex flex-col pt-3">
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
                placeholder={type === 'group' ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
                aria-label={type === 'group' ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
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
          )}

          {error && (
            <div className="text-[12px] text-red-400 mt-2 px-1">
              {error}
            </div>
          )}

          <div className="flex justify-end items-center gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel', 'Отмена')}
              className="px-4 py-2 rounded-xl text-[14px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--accent-color, #7C3AED)',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {t('common.cancel', 'Отмена')}
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSubmit}
              disabled={isLoading}
              aria-label={t('common.next', 'Далее')}
              className="px-4 py-2 rounded-xl text-[14px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--accent-color, #7C3AED)',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor =
                    'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
                }
              }}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {t('common.next', 'Далее')}
            </button>
          </div>
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