import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cake, Check, Copy, Maximize2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { useToastStore } from '../../store/useToastStore';
import { supabaseService } from '../../services/supabaseService';
import { formatLastSeen } from '../../utils/messageUtils';
import { formatBirthday } from '../../utils/birthday';
import { Avatar, optimizeBannerUrl } from '../common/Avatar';
import { OnlineIndicator } from '../common/OnlineIndicator';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { resolveProfileId } from './profile/resolveProfileId';

export interface PeerProfilePanelProps {
  chat: Chat;
  onOpenFullProfile?: () => void;
}

export const PeerProfilePanel: React.FC<PeerProfilePanelProps> = ({ chat, onOpenFullProfile }) => {
  const { t, i18n } = useTranslation();
  const [copiedField, setCopiedField] = useState<'username' | 'id' | null>(null);
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);
  const [fetchedState, setFetchedState] = useState<{ chatId: string; data: Partial<Chat> } | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedFetchKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCopiedField(null);
    setBannerLoadFailed(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [chat?.id]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const effectiveChat = useMemo<Chat>(() => {
    if (!chat) return chat;
    const patch = fetchedState && fetchedState.chatId === chat.id ? fetchedState.data : null;
    if (!patch) return chat;
    return {
      ...chat,
      name: patch.name || chat.name,
      avatarUrl: patch.avatarUrl || chat.avatarUrl,
      bannerUrl: chat.bannerUrl ?? patch.bannerUrl,
      username: chat.username ?? patch.username,
      description: chat.description ?? patch.description,
      birthday: chat.birthday ?? patch.birthday,
      numericId: chat.numericId ?? patch.numericId,
      peerCode: chat.peerCode || patch.peerCode,
      originalPeerCode: chat.originalPeerCode || patch.originalPeerCode,
    };
  }, [chat, fetchedState]);

  useEffect(() => {
    setBannerLoadFailed(false);
  }, [effectiveChat?.bannerUrl]);

  useEffect(() => {
    if (!chat || chat.type !== 'private' || chat.id === 'notes') return;

    const myCode = useChatStore.getState().myCode;
    const myUserId = useAuthStore.getState().userId;
    const targetCode =
      chat.peerCode && chat.peerCode !== myCode
        ? chat.peerCode
        : chat.originalPeerCode && chat.originalPeerCode !== myCode
          ? chat.originalPeerCode
          : chat.name && chat.name.length === 36 && chat.name !== myCode
            ? chat.name
            : undefined;

    const needsFetch = !chat.description || !chat.birthday || !chat.username || !chat.bannerUrl;
    const fetchKey = `${chat.id}|${targetCode || ''}|${chat.username || ''}`;
    if (!needsFetch || completedFetchKeysRef.current.has(fetchKey)) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [updateRes, pubRes, unameRes] = await Promise.allSettled([
          supabaseService.getLatestProfileUpdate(chat.id, myCode || undefined),
          targetCode ? supabaseService.lookupPublicProfile(targetCode) : Promise.resolve(null),
          chat.username ? supabaseService.lookupProfileByUsername(chat.username) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const rawUpdate = updateRes.status === 'fulfilled' ? updateRes.value : null;
        const isMyOwnUpdate = Boolean(
          rawUpdate &&
            ((myCode && rawUpdate.sender_code === myCode) ||
              (myUserId && (rawUpdate.user_id === myUserId || rawUpdate.sender_id === myUserId)))
        );
        const validUpdate = rawUpdate && !isMyOwnUpdate ? rawUpdate : null;
        let pub = pubRes.status === 'fulfilled' ? pubRes.value : null;
        const pubByUname = unameRes.status === 'fulfilled' ? unameRes.value : null;

        if (!pub && validUpdate?.sender_code && validUpdate.sender_code !== myCode) {
          try {
            pub = await supabaseService.lookupPublicProfile(validUpdate.sender_code);
          } catch {}
          if (cancelled) return;
        }

        const nextNick = validUpdate?.nickname || pub?.nickname || pubByUname?.nickname || undefined;
        const nextAvatar = validUpdate?.avatar_url || pub?.avatar_url || pubByUname?.avatar_url || undefined;
        const nextBanner = validUpdate?.banner_url || pub?.banner_url || pubByUname?.banner_url || undefined;
        const nextUsername = validUpdate?.username || pub?.username || pubByUname?.username || undefined;
        const nextBirthday = validUpdate?.birthday || pub?.birthday || pubByUname?.birthday || undefined;
        const nextBio = validUpdate?.bio || pub?.bio || pubByUname?.bio || undefined;
        const nextNumericId = validUpdate?.numeric_id || pub?.numeric_id || pubByUname?.numeric_id || undefined;

        const latestChat = useChatStore.getState().chats.find((c) => c.id === chat.id) || chat;
        const chatUpdates: Partial<Chat> = {};

        if (!latestChat.peerCode && latestChat.originalPeerCode) {
          chatUpdates.peerCode = latestChat.originalPeerCode;
        } else if (!latestChat.peerCode && validUpdate?.sender_code && validUpdate.sender_code !== myCode) {
          chatUpdates.peerCode = validUpdate.sender_code;
          chatUpdates.originalPeerCode = validUpdate.sender_code;
        } else if (!latestChat.peerCode && pubByUname?.user_code && pubByUname.user_code !== myCode) {
          chatUpdates.peerCode = pubByUname.user_code;
          chatUpdates.originalPeerCode = pubByUname.user_code;
        }

        if (nextNumericId && nextNumericId !== latestChat.numericId) {
          chatUpdates.numericId = nextNumericId;
        }
        if (nextNick && nextNick !== latestChat.name) {
          chatUpdates.name = nextNick;
        }
        if (nextAvatar && nextAvatar !== latestChat.avatarUrl) {
          chatUpdates.avatarUrl = nextAvatar;
        }
        if (nextUsername && nextUsername !== latestChat.username) {
          chatUpdates.username = nextUsername;
        }
        if (nextBirthday && nextBirthday !== latestChat.birthday) {
          chatUpdates.birthday = nextBirthday;
        }
        if (nextBio && nextBio !== latestChat.description) {
          chatUpdates.description = nextBio;
        }
        if (nextBanner && nextBanner !== latestChat.bannerUrl) {
          chatUpdates.bannerUrl = nextBanner;
        }

        completedFetchKeysRef.current.add(fetchKey);

        if (Object.keys(chatUpdates).length > 0) {
          useChatStore.getState().updateChat(chat.id, chatUpdates);
          setFetchedState({ chatId: chat.id, data: chatUpdates });
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [chat?.id, chat?.type, chat?.peerCode, chat?.originalPeerCode, chat?.username, chat?.description, chat?.birthday, chat?.bannerUrl]);

  const handleCopyValue = useCallback(
    async (value: string, field: 'username' | 'id') => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch {}
      setCopiedField(field);
      useToastStore.getState().showToast(t('common.copied', 'Скопировано'), 'image');
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopiedField(null);
        copyTimerRef.current = null;
      }, 2000);
    },
    [t]
  );

  const resolvedId = useMemo(() => {
    if (!effectiveChat) return '';
    const primary = resolveProfileId(effectiveChat, effectiveChat.id);
    if (primary) return primary;
    return effectiveChat.numericId || effectiveChat.peerCode || effectiveChat.originalPeerCode || '';
  }, [effectiveChat]);

  const formattedBirthday = useMemo(
    () => formatBirthday(effectiveChat?.birthday, i18n.language),
    [effectiveChat?.birthday, i18n.language]
  );

  if (!effectiveChat || effectiveChat.type !== 'private' || effectiveChat.id === 'notes') {
    return null;
  }

  const cleanUsername = effectiveChat.username ? effectiveChat.username.replace(/^@+/, '').trim() : '';
  const bioText = effectiveChat.description ? effectiveChat.description.trim() : '';
  const bannerSrc = !bannerLoadFailed ? optimizeBannerUrl(effectiveChat.bannerUrl, 600) : null;
  const statusText = effectiveChat.online
    ? t('userStatus.online', 'в сети')
    : formatLastSeen(effectiveChat.lastSeen, t);
  const badgeUserId =
    effectiveChat.peerCode ||
    effectiveChat.originalPeerCode ||
    (effectiveChat.name && effectiveChat.name.length === 36 ? effectiveChat.name : undefined) ||
    effectiveChat.id;

  return (
    <aside
      aria-label={t('common.profile', 'Профиль')}
      style={{
        width: '340px',
        flexShrink: 0,
        height: '100%',
        minHeight: 0,
        borderRadius: '18px',
        backgroundColor: 'var(--chat-list-bg, #2b2d31)',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden chat-list-scrollbar">
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '112px',
            flexShrink: 0,
            overflow: 'hidden',
            background:
              'linear-gradient(135deg, var(--accent-light, #7289da) 0%, var(--accent-color, #5865F2) 55%, var(--accent-dark, #4752c4) 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.18), transparent 60%)',
              pointerEvents: 'none',
            }}
          />
          {bannerSrc && (
            <img
              src={bannerSrc}
              alt=""
              draggable={false}
              onError={() => setBannerLoadFailed(true)}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, transparent 45%, rgba(0, 0, 0, 0.24) 100%)',
              pointerEvents: 'none',
            }}
          />
          {onOpenFullProfile && (
            <button
              type="button"
              onClick={onOpenFullProfile}
              aria-label={t('common.profile', 'Профиль')}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 0, 0, 0.42)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                zIndex: 2,
                transition: 'background-color 0.15s ease, transform 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
                e.currentTarget.style.transform = 'scale(1.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.42)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>

        <div
          style={{
            padding: '0 18px',
            marginTop: '-40px',
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: 'var(--chat-list-bg, #2b2d31)',
              boxShadow: '0 0 0 5px var(--chat-list-bg, #2b2d31)',
            }}
          >
            {onOpenFullProfile ? (
              <button
                type="button"
                onClick={onOpenFullProfile}
                aria-label={t('common.profile', 'Профиль')}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  padding: 0,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'block',
                  transition: 'filter 0.15s ease, transform 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.06)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'none';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <Avatar
                  src={effectiveChat.avatarUrl}
                  alt={effectiveChat.name}
                  className="w-20 h-20 rounded-full"
                  style={{ width: '80px', height: '80px', fontSize: '32px' }}
                />
              </button>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                }}
              >
                <Avatar
                  src={effectiveChat.avatarUrl}
                  alt={effectiveChat.name}
                  className="w-20 h-20 rounded-full"
                  style={{ width: '80px', height: '80px', fontSize: '32px' }}
                />
              </div>
            )}
            <OnlineIndicator
              online={Boolean(effectiveChat.online)}
              showOffline={true}
              size="lg"
              ringColor="var(--chat-list-bg, #2b2d31)"
              ariaLabel={
                effectiveChat.online
                  ? t('userStatus.online', 'в сети')
                  : t('userStatus.offline', 'был(а) недавно')
              }
            />
          </div>
        </div>

        <div
          style={{
            padding: '14px 18px 18px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxSizing: 'border-box',
          }}
        >
            <div
              style={{
                padding: '0 2px',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    lineHeight: 1.25,
                    color: 'var(--text-heading, var(--text-main, #ffffff))',
                    wordBreak: 'break-word',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                >
                  {effectiveChat.name}
                </span>
                {(effectiveChat.isOfficial || effectiveChat.id === 'system_support') && (
                  <VerifiedBadge
                    size={17}
                    ariaLabel={t('channel.official', 'Официальный')}
                    className="flex-shrink-0"
                  />
                )}
                <DeveloperBadge
                  userId={badgeUserId}
                  nickname={effectiveChat.name}
                  username={effectiveChat.username}
                  numericId={effectiveChat.numericId}
                  size={26}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: effectiveChat.online
                      ? 'var(--online-color, #23a55a)'
                      : 'var(--text-offline, #80848e)',
                  }}
                />
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: effectiveChat.online ? 600 : 400,
                    color: effectiveChat.online
                      ? 'var(--accent-color, #5865F2)'
                      : 'var(--text-dim, #949ba4)',
                    lineHeight: 1.3,
                  }}
                >
                  {statusText}
                </span>
              </div>
            </div>

            {cleanUsername && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: 'var(--surface-container-soft, rgba(255, 255, 255, 0.05))',
                  border: 'none',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleCopyValue(`@${cleanUsername}`, 'username')}
                  aria-label={t('common.copy', 'Копировать')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim, #949ba4)' }}>
                      {t('profile.username', 'Короткое имя')}
                    </span>
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 500,
                        color: 'var(--accent-color, #5865F2)',
                        fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                        wordBreak: 'break-all',
                        lineHeight: 1.35,
                      }}
                    >
                      @{cleanUsername}
                    </span>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      color: copiedField === 'username' ? 'var(--accent-color, #5865F2)' : 'var(--text-dim, #949ba4)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {copiedField === 'username' ? <Check size={15} /> : <Copy size={15} />}
                  </span>
                </button>
              </div>
            )}

            {resolvedId && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: 'var(--surface-container-soft, rgba(255, 255, 255, 0.05))',
                  border: 'none',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleCopyValue(resolvedId, 'id')}
                  aria-label={t('profile.copy_id', 'Скопировать ID')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim, #949ba4)' }}>
                      {t('profile.account_id', 'ID аккаунта')}
                    </span>
                    <span
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 500,
                        color: 'var(--accent-color, #5865F2)',
                        fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                        wordBreak: 'break-all',
                        lineHeight: 1.35,
                      }}
                    >
                      {resolvedId}
                    </span>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      color: copiedField === 'id' ? 'var(--accent-color, #5865F2)' : 'var(--text-dim, #949ba4)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {copiedField === 'id' ? <Check size={15} /> : <Copy size={15} />}
                  </span>
                </button>
              </div>
            )}

            {bioText && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: 'var(--surface-container-soft, rgba(255, 255, 255, 0.05))',
                  border: 'none',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim, #949ba4)' }}>
                  {t('profile.bio', 'О себе')}
                </span>
                <div
                  style={{
                    fontSize: '13px',
                    lineHeight: 1.45,
                    color: 'var(--text-main, #dbdee1)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    cursor: 'text',
                  }}
                >
                  {bioText}
                </div>
              </div>
            )}

            {formattedBirthday && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: 'var(--surface-container-soft, rgba(255, 255, 255, 0.05))',
                  border: 'none',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim, #949ba4)' }}>
                  {t('profile.birthday', 'День рождения')}
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Cake size={14} style={{ color: 'var(--accent-color, #5865F2)', flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: '13px',
                      lineHeight: 1.35,
                      color: 'var(--text-main, #dbdee1)',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      cursor: 'text',
                    }}
                  >
                    {formattedBirthday}
                  </span>
                </div>
              </div>
            )}
        </div>
      </div>
    </aside>
  );
};
