import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cake } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { useToastStore } from '../../store/useToastStore';
import { supabaseService } from '../../services/supabaseService';
import { SUPPORT_AVATAR_URL } from '../../services/supportService';
import { formatLastSeen } from '../../utils/messageUtils';
import { formatBirthday } from '../../utils/birthday';
import { Avatar, optimizeAvatarUrl } from '../common/Avatar';
import { OnlineIndicator } from '../common/OnlineIndicator';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { TelegramMediaViewer, type MediaViewerItem } from './TelegramMediaViewer';
import { resolveProfileId } from './profile/resolveProfileId';

export interface PeerProfilePanelProps {
  chat: Chat;
  onOpenFullProfile?: () => void;
}

export const PeerProfilePanel: React.FC<PeerProfilePanelProps> = ({ chat, onOpenFullProfile }) => {
  const { t, i18n } = useTranslation();
  const [fetchedState, setFetchedState] = useState<{ chatId: string; data: Partial<Chat> } | null>(null);
  const [avatarViewerState, setAvatarViewerState] = useState<{
    isOpen: boolean;
    items: MediaViewerItem[];
    initialIndex: number;
  }>({ isOpen: false, items: [], initialIndex: 0 });
  const completedFetchKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setAvatarViewerState({ isOpen: false, items: [], initialIndex: 0 });
  }, [chat?.id]);

  const effectiveChat = useMemo<Chat>(() => {
    if (!chat) return chat;
    const patch = fetchedState && fetchedState.chatId === chat.id ? fetchedState.data : null;
    if (!patch) return chat;
    return {
      ...chat,
      name: patch.name || chat.name,
      avatarUrl: patch.avatarUrl || chat.avatarUrl,
      bannerUrl: chat.bannerUrl || patch.bannerUrl,
      username: chat.username || patch.username,
      description: chat.description || patch.description,
      birthday: chat.birthday || patch.birthday,
      numericId: chat.numericId || patch.numericId,
      peerCode: chat.peerCode || patch.peerCode,
      originalPeerCode: chat.originalPeerCode || patch.originalPeerCode,
    };
  }, [chat, fetchedState]);

  useEffect(() => {
    if (!chat || chat.type !== 'private' || chat.id === 'notes') return;

    const myCode = useChatStore.getState().myCode;
    const myUserId = useAuthStore.getState().userId;
    const resolved = resolveProfileId(chat, chat.id);
    const targetCode = resolved && resolved !== myCode ? resolved : undefined;

    const needsFetch = !chat.description || !chat.birthday || !chat.username;
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
        let validUpdate = rawUpdate && !isMyOwnUpdate ? rawUpdate : null;
        if (isMyOwnUpdate && rawUpdate?.sender_code) {
          try {
            const peerUpdate = await supabaseService.getLatestProfileUpdate(chat.id, rawUpdate.sender_code);
            if (cancelled) return;
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

        let pub = pubRes.status === 'fulfilled' ? pubRes.value : null;
        const pubByUname = unameRes.status === 'fulfilled' ? unameRes.value : null;

        const fallbackCode =
          (validUpdate?.sender_code && validUpdate.sender_code !== myCode ? validUpdate.sender_code : undefined) ||
          (pubByUname?.user_code && pubByUname.user_code !== myCode ? pubByUname.user_code : undefined);
        if (!pub && fallbackCode && fallbackCode !== targetCode) {
          try {
            pub = await supabaseService.lookupPublicProfile(fallbackCode);
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

        const hasFetchError =
          updateRes.status === 'rejected' ||
          (Boolean(targetCode) && pubRes.status === 'rejected') ||
          (Boolean(chat.username) && unameRes.status === 'rejected');
        const hasServerProfile = Boolean(validUpdate || pub || pubByUname);
        if (!hasFetchError && hasServerProfile) {
          completedFetchKeysRef.current.add(fetchKey);
        }

        if (Object.keys(chatUpdates).length > 0) {
          useChatStore.getState().updateChat(chat.id, chatUpdates);
          setFetchedState({ chatId: chat.id, data: chatUpdates });
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [chat?.id, chat?.type, chat?.peerCode, chat?.originalPeerCode, chat?.username, chat?.description, chat?.birthday]);

  const handleCopyValue = useCallback(
    async (value: string, field: 'username' | 'id') => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch {}
      const toastText =
        field === 'id'
          ? t('profile.id_copied_share', 'ID скопирован в буфер обмена. Поделитесь им!')
          : t('profile.username_copied_share', {
              username: value,
              defaultValue: `${value} скопирован в буфер обмена. Поделитесь им!`,
            });
      useToastStore.getState().showToast(toastText, 'image');
    },
    [t]
  );

  const handleOpenAvatar = useCallback(() => {
    if (!effectiveChat) return;
    const avatarUrl =
      effectiveChat.id === 'system_support'
        ? effectiveChat.avatarUrl || SUPPORT_AVATAR_URL
        : effectiveChat.avatarUrl;
    if (!avatarUrl) return;

    const myUserId = useAuthStore.getState().userId;
    const myNickname = useAuthStore.getState().nickname;
    const avatarSenderId =
      effectiveChat.peerCode ||
      effectiveChat.originalPeerCode ||
      (effectiveChat.id && effectiveChat.id.length === 36 ? effectiveChat.id : undefined);
    const usersById = useChatStore.getState().usersById || {};
    const actualSender =
      (avatarSenderId
        ? avatarSenderId === myUserId
          ? myNickname
          : usersById[avatarSenderId]?.nickname
        : undefined) || effectiveChat.name;

    const avatarThumb = optimizeAvatarUrl(avatarUrl, 128) || avatarUrl;
    const avatarBlur = optimizeAvatarUrl(avatarUrl, 64) || avatarUrl;
    const avatarItems: MediaViewerItem[] = [
      {
        id: `avatar_${effectiveChat.id || ''}_${avatarUrl || ''}`,
        url: avatarUrl,
        directUrl: avatarUrl,
        type: 'photo',
        width: 600,
        height: 600,
        name: `${effectiveChat.name || 'Avatar'}.jpg`,
        sender: actualSender,
        senderId: avatarSenderId,
        time: Date.now(),
        preview: avatarThumb,
        thumbnail: avatarThumb,
        blurPreview: avatarBlur,
        isAvatar: true,
      },
    ];

    const orbita = (window as any).orbita;
    if (orbita?.openMediaWindow) {
      orbita.openMediaWindow({
        items: avatarItems,
        initialIndex: 0,
        sharedSecret: effectiveChat.sharedSecret,
        chatId: effectiveChat.id,
        usersById,
        myUserId,
        myNickname,
      });
      return;
    }

    setAvatarViewerState({
      isOpen: true,
      items: avatarItems,
      initialIndex: 0,
    });
  }, [effectiveChat]);

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

  if (!effectiveChat || effectiveChat.type !== 'private' || effectiveChat.id === 'notes' || effectiveChat.id === 'system_support') {
    return null;
  }

  const cleanUsername = effectiveChat.username ? effectiveChat.username.replace(/^@+/, '').trim() : '';
  const bioText = effectiveChat.description ? effectiveChat.description.trim() : '';
  const displayAvatarUrl = effectiveChat.avatarUrl;
  const hasAvatar = Boolean(displayAvatarUrl);
  const statusText = effectiveChat.online
    ? t('userStatus.online', 'В сети')
    : formatLastSeen(effectiveChat.lastSeen, t);
  const badgeUserId =
    effectiveChat.peerCode ||
    effectiveChat.originalPeerCode ||
    (effectiveChat.name && effectiveChat.name.length === 36 ? effectiveChat.name : undefined) ||
    effectiveChat.id;

  return (
    <>
      <aside
        aria-label={t('common.profile', 'Профиль')}
        style={{
          width: '320px',
          flexShrink: 0,
          height: 'fit-content',
          maxHeight: 'calc(100% - 24px)',
          alignSelf: 'flex-start',
          margin: '12px 12px 12px 0',
          borderRadius: '10px',
          backgroundColor: '#232428',
          border: 'none',
          outline: 'none',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          boxSizing: 'border-box',
          zIndex: 10,
        }}
      >
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden chat-list-scrollbar"
          style={{ maxHeight: '100%' }}
        >
          <div
            style={{
              padding: '16px 16px 0 16px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                flexShrink: 0,
                backgroundColor: 'transparent',
              }}
            >
              {hasAvatar ? (
                <button
                  type="button"
                  onClick={handleOpenAvatar}
                  aria-label={effectiveChat.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '20px',
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
                    src={displayAvatarUrl}
                    alt={effectiveChat.name}
                    className="w-20 h-20 rounded-[20px]"
                    style={{ width: '80px', height: '80px', fontSize: '32px', borderRadius: '20px' }}
                  />
                </button>
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '20px',
                    overflow: 'hidden',
                  }}
                >
                  <Avatar
                    src={displayAvatarUrl}
                    alt={effectiveChat.name}
                    className="w-20 h-20 rounded-[20px]"
                    style={{ width: '80px', height: '80px', fontSize: '32px', borderRadius: '20px' }}
                  />
                </div>
              )}
              <OnlineIndicator
                online={Boolean(effectiveChat.online)}
                showOffline={false}
                size="lg"
                ringColor="#232428"
                color="#917bbd"
                ariaLabel={effectiveChat.online ? t('userStatus.online', 'в сети') : undefined}
              />
            </div>
          </div>

        <div
          style={{
            padding: '12px 16px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
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
                    color: 'var(--text-heading, var(--text-main))',
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
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: effectiveChat.online ? 600 : 400,
                    color: effectiveChat.online
                      ? '#917bbd'
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
                  backgroundColor: 'var(--surface-container-soft, rgba(128, 128, 128, 0.08))',
                  border: 'none',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim, #949ba4)' }}>
                  {t('profile.username', 'Короткое имя')}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyValue(`@${cleanUsername}`, 'username')}
                  aria-label={t('common.copy', 'Копировать')}
                  style={{
                    width: 'fit-content',
                    maxWidth: '100%',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13.5px',
                    fontWeight: 500,
                    color: 'var(--accent-text, var(--accent-color, #5865F2))',
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    wordBreak: 'break-all',
                    lineHeight: 1.35,
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover, rgba(128, 128, 128, 0.14))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  @{cleanUsername}
                </button>
              </div>
            )}

            {resolvedId && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: 'var(--surface-container-soft, rgba(128, 128, 128, 0.08))',
                  border: 'none',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim, #949ba4)' }}>
                  {t('profile.account_id', 'ID аккаунта')}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyValue(resolvedId, 'id')}
                  aria-label={t('profile.copy_id', 'Скопировать ID')}
                  style={{
                    width: 'fit-content',
                    maxWidth: '100%',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    color: 'var(--accent-text, var(--accent-color, #5865F2))',
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    wordBreak: 'break-all',
                    lineHeight: 1.35,
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover, rgba(128, 128, 128, 0.14))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {resolvedId}
                </button>
              </div>
            )}

            {bioText && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: 'var(--surface-container-soft, rgba(128, 128, 128, 0.08))',
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
                    color: 'var(--text-main)',
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
                  backgroundColor: 'var(--surface-container-soft, rgba(128, 128, 128, 0.08))',
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
                  <Cake size={14} style={{ color: 'var(--accent-text, var(--accent-color, #5865F2))', flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: '13px',
                      lineHeight: 1.35,
                      color: 'var(--text-main)',
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

            {onOpenFullProfile && (
              <button
                type="button"
                onClick={onOpenFullProfile}
                aria-label={t('profile.show_full', 'Показать полностью')}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'var(--surface-container-soft, rgba(255, 255, 255, 0.05))',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 16%, var(--surface-container-strong)))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255, 255, 255, 0.05))';
                }}
              >
                {t('profile.show_full', 'Показать полностью')}
              </button>
            )}
        </div>
      </div>
    </aside>

    {avatarViewerState.isOpen && (
      <TelegramMediaViewer
        key={`${avatarViewerState.items[0]?.url || avatarViewerState.items[0]?.id || ''}_${effectiveChat.id || ''}`}
        isOpen={avatarViewerState.isOpen}
        items={avatarViewerState.items}
        initialIndex={avatarViewerState.initialIndex}
        sharedSecret={effectiveChat.sharedSecret}
        showCarouselAlways={true}
        onClose={() => setAvatarViewerState({ isOpen: false, items: [], initialIndex: 0 })}
      />
    )}
    </>
  );
};
