import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { channelService, type ChannelInfo } from '../../services/channelService';
import { useToastStore } from '../../store/useToastStore';
import { Avatar } from '../common/Avatar';

interface ChannelInviteModalProps {
  inviteUrl: string | null;
  initialChannel?: ChannelInfo | null;
  onClose: () => void;
}

export const ChannelInviteModal: React.FC<ChannelInviteModalProps> = ({
  inviteUrl,
  initialChannel,
  onClose,
}) => {
  const { t } = useTranslation();
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(initialChannel || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isResolved, setIsResolved] = useState(Boolean(initialChannel));

  const myNickname = useAuthStore((s) => s.nickname);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (initialChannel) {
      setChannelInfo(initialChannel);
      setIsResolved(true);
      return;
    }

    if (!inviteUrl) {
      setChannelInfo(null);
      setIsResolved(false);
      return;
    }

    let targetIdentifier = inviteUrl.trim();
    const cMatch = targetIdentifier.match(/(?:\/(?:c|channel)\/|orbita:\/\/(?:c|channel)\/)([a-zA-Z0-9_-]{3,64})/i);
    if (cMatch && cMatch[1]) {
      targetIdentifier = cMatch[1];
    } else {
      const slugMatch = targetIdentifier.match(
        /^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)*(?:orbitachat\.vercel\.app|orbitad\.vercel\.app|orbita\.app|orbita\.chat)\/@?([a-zA-Z0-9_]{3,32})\/?(?:\?.*)?$/i
      );
      if (slugMatch && slugMatch[1]) {
        targetIdentifier = slugMatch[1];
      } else if (targetIdentifier.startsWith('orbita://')) {
        targetIdentifier = targetIdentifier.replace(/^orbita:\/\/@?/, '').replace(/\/.*$/, '');
      } else if (targetIdentifier.startsWith('@')) {
        targetIdentifier = targetIdentifier.replace(/^@+/, '');
      }
    }

    const allChats = useChatStore.getState().chats;
    const existing = allChats.find(
      (c) =>
        c.type === 'channel' &&
        (c.id === targetIdentifier ||
          (c.username && c.username.toLowerCase() === targetIdentifier.toLowerCase()))
    );

    if (existing) {
      setChannelInfo({
        id: existing.id,
        name: existing.name,
        username: existing.username || null,
        description: existing.description || '',
        avatarUrl: existing.avatarUrl || null,
        creatorNickname: existing.creatorNickname || '',
        creatorId: existing.creatorId || undefined,
        subscribersCount: existing.subscribersCount || 1,
        isOfficial: existing.isOfficial || false,
        createdAt: existing.createdAt || Date.now(),
      });
      setIsResolved(true);
      return;
    }

    setIsLoading(true);
    setIsResolved(false);

    channelService
      .getChannel(targetIdentifier)
      .then((info) => {
        setChannelInfo(info);
        setIsResolved(true);
      })
      .catch(() => {
        setChannelInfo(null);
        setIsResolved(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [inviteUrl, initialChannel]);

  const existingChat = useChatStore((s) =>
    s.chats.find(
      (c) =>
        c.type === 'channel' &&
        (c.id === channelInfo?.id ||
          (channelInfo?.username && c.username?.toLowerCase() === channelInfo.username.toLowerCase()))
    )
  );

  const isAlreadySubscribed = Boolean(existingChat);

  const handleOpenExisting = useCallback(() => {
    const targetId = existingChat?.id || channelInfo?.id;
    if (targetId) {
      useChatStore.getState().setActiveChat(targetId);
      onClose();
    }
  }, [existingChat, channelInfo, onClose]);

  const handleJoin = useCallback(async () => {
    if (!channelInfo || isJoining) return;
    if (isAlreadySubscribed) {
      handleOpenExisting();
      return;
    }
    setIsJoining(true);

    try {
      const newCount = await channelService.joinChannel(channelInfo.id, myNickname || 'User');
      const updatedCount = typeof newCount === 'number' ? newCount : (channelInfo.subscribersCount || 1) + 1;

      useChatStore.getState().addChat({
        id: channelInfo.id,
        type: 'channel',
        name: channelInfo.name,
        username: channelInfo.username || undefined,
        description: channelInfo.description || '',
        lastMsg: '',
        online: false,
        creatorNickname: channelInfo.creatorNickname,
        creatorId: channelInfo.creatorId || undefined,
        avatarUrl: channelInfo.avatarUrl || undefined,
        subscribersCount: updatedCount,
        isOfficial: channelInfo.isOfficial,
        createdAt: channelInfo.createdAt || Date.now(),
        unreadCount: 0,
        lastReadTimestamp: Date.now(),
        muted: false,
        notificationsEnabled: true,
      });

      useChatStore.getState().setActiveChat(channelInfo.id);
      useToastStore.getState().showToast(t('channelInvite.joined_success', 'Вы подписались на канал'), 'text');
      onClose();
    } catch {
      useToastStore.getState().showToast(t('common.error', 'Ошибка'), 'text');
    } finally {
      setIsJoining(false);
    }
  }, [channelInfo, isJoining, isAlreadySubscribed, handleOpenExisting, myNickname, onClose, t]);

  if (!inviteUrl && !initialChannel) return null;

  const displayName = channelInfo?.name || (isLoading ? '...' : t('channelInvite.channel', 'Канал'));
  const channelAvatarUrl = channelInfo?.avatarUrl || null;

  return (
    <AnimatePresence>
      <motion.div
        key="channel-invite-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full relative overflow-hidden flex flex-col items-center text-center"
          style={{
            maxWidth: '400px',
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
            borderRadius: '10px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            border: 'none',
            outline: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full relative flex flex-col items-center justify-center"
            style={{
              padding: '36px 24px 20px 24px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderBottom: 'none',
            }}
          >
            <div className="relative mb-4">
              <Avatar
                src={channelAvatarUrl}
                alt={displayName}
                className="w-[84px] h-[84px] rounded-[14px] shadow-xl"
                style={{ width: '84px', height: '84px', borderRadius: '14px' }}
              />
              <div
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                style={{
                  backgroundColor: 'var(--accent-color, #9b7dd4)',
                  border: '2px solid var(--settings-bg, var(--bg-primary, #0f0f13))',
                }}
              >
                <Radio size={14} className="text-white" />
              </div>
            </div>

            <h2
              className="text-xl font-bold truncate max-w-full px-2 leading-tight"
              style={{ color: 'var(--text-main, #ffffff)' }}
            >
              {displayName}
            </h2>

            {channelInfo?.username && (
              <p
                className="text-xs font-mono font-medium mt-1 truncate max-w-full"
                style={{ color: 'var(--accent-color, #9b7dd4)' }}
              >
                @{channelInfo.username}
              </p>
            )}

            <p
              className="text-xs mt-1.5 flex items-center gap-1.5 font-medium"
              style={{ color: 'var(--text-dim, #8e8e93)' }}
            >
              {isResolved && channelInfo ? (
                <span>
                  {t('channelInvite.subscribers_count', '{{count}} подписчик(ов)', {
                    count: channelInfo.subscribersCount || 1,
                  })}
                </span>
              ) : isResolved && !channelInfo ? (
                <span style={{ color: '#ff4d4f' }}>
                  {t('channelInvite.not_found', 'Канал не найден')}
                </span>
              ) : (
                <span>{t('channelInvite.loading', 'Загрузка...')}</span>
              )}
            </p>
          </div>

          <div className="w-full p-6 flex flex-col items-center">
            {channelInfo?.description && (
              <p
                className="text-sm mb-6 max-h-24 overflow-y-auto px-2 leading-relaxed whitespace-pre-wrap break-words"
                style={{ color: 'var(--text-secondary, #b0b0b8)' }}
              >
                {channelInfo.description}
              </p>
            )}

            <div className="w-full flex flex-col gap-2.5">
              {isAlreadySubscribed ? (
                <button
                  type="button"
                  aria-label={t('channelInvite.open_channel', 'Перейти к каналу')}
                  onClick={handleOpenExisting}
                  className="w-full h-11 rounded-[10px] text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    borderRadius: '10px',
                    backgroundColor: 'var(--accent-color, #9b7dd4)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Radio size={16} />
                  <span>{t('channelInvite.open_channel', 'Перейти к каналу')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={t('channelInvite.join_channel', 'Подписаться на канал')}
                  disabled={isLoading || isJoining || !channelInfo}
                  onClick={handleJoin}
                  className="w-full h-11 rounded-[10px] text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    borderRadius: '10px',
                    backgroundColor: 'var(--accent-color, #9b7dd4)',
                    color: '#ffffff',
                    border: 'none',
                    opacity: isLoading || isJoining || !channelInfo ? 0.6 : 1,
                    cursor: isLoading || isJoining || !channelInfo ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>
                    {isJoining
                      ? t('channelInvite.joining', 'Подключение...')
                      : t('channelInvite.join_channel', 'Подписаться на канал')}
                  </span>
                </button>
              )}

              <button
                type="button"
                aria-label={t('common.cancel', 'Отмена')}
                onClick={onClose}
                className="w-full h-11 rounded-[10px] text-sm font-semibold transition-all duration-200 flex items-center justify-center"
                style={{
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-dim, #8e8e93)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span>{t('common.cancel', 'Отмена')}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
