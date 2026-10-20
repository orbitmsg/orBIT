import React, { useCallback, useMemo } from 'react';
import { Archive } from 'lucide-react';
import { SUPPORT_AVATAR_URL } from '../../../services/supportService';
import { DeveloperBadge } from '../../ui/DeveloperBadge';
import { ActionIcon } from '../../chat/ChatHeader';
import { CustomPinIcon } from '../../chat/ChatWindow';
import { ChannelMegaphoneIcon } from '../../common/ChannelMegaphoneIcon';
import { GroupUsersIcon } from '../../common/GroupUsersIcon';
import { Avatar } from '../../common/Avatar';
import { NotesAvatar } from '../../common/NotesAvatar';
import { BotAvatar } from '../../common/BotAvatar';
import { VerifiedBadge } from '../../common/VerifiedBadge';
import { MessageStatus } from '../../MessageStatus';
import { useChatStore, isMessageOutgoing, type Chat } from '../../../store/useChatStore';
import { getLastMsgDisplay } from './getLastMsgDisplay';

export const formatUnreadCount = (count: number): string => {
  if (count === 0) return '';
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const RailFolderIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 20,
  className,
  style,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    className={className}
    style={style}
  >
    <path
      fill="currentColor"
      d="M64 480h384c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H288c-10.1 0-19.6-4.7-25.6-12.8l-19.2-25.6C231.1 41.5 212.1 32 192 32H64C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64"
    />
  </svg>
);

export const ChatListItem = React.memo(({
  chat,
  isActive,
  isPinned,
  onSelect,
  onContextMenu,
  nickname,
  myCode,
  t,
  isLightTheme,
}: {
  chat: Chat;
  isActive: boolean;
  isPinned: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  nickname: string;
  myCode?: string;
  t: any;
  isLightTheme: boolean;
}) => {
  const lastMsg = useChatStore(
    useCallback((s) => {
      const msgs = s.messagesByChatId[chat.id];
      return msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null;
    }, [chat.id])
  );
  const lastMsgTime = lastMsg ? new Date(lastMsg.time) : null;
  const timeStr = lastMsgTime
    ? `${lastMsgTime.getHours().toString().padStart(2, '0')}:${lastMsgTime.getMinutes().toString().padStart(2, '0')}`
    : '';
  const isOwn = isMessageOutgoing(lastMsg, myCode, nickname, chat);
  const status = isOwn && (lastMsg?.status || lastMsg?.read) ? ((lastMsg?.status === 'read' || lastMsg?.read) ? 'read' : lastMsg?.status) : undefined;

  const rawDraft = useChatStore(
    useCallback((s) => s.draftsByChatId[chat.id], [chat.id])
  );
  const draftText = rawDraft ? rawDraft.trim() : '';
  const showDraft = !!(draftText && !isActive);

  const chatTypingUsers = useChatStore(
    useCallback((s) => s.typingByChatId[chat.id], [chat.id])
  );
  const isChatTyping = Array.isArray(chatTypingUsers) && chatTypingUsers.length > 0;

  const ringColor = isActive
    ? (isLightTheme ? '#e5e5e7' : '#2c2c2c')
    : (isLightTheme ? '#f5f5f5' : '#1e1e1e');

  return (
    <div
      onClick={() => onSelect(chat.id)}
      onContextMenu={(e) => onContextMenu(e, chat.id)}
      className="group relative cursor-pointer"
      style={{
        borderRadius: '12px',
        margin: '2px 8px',
        width: 'calc(100% - 16px)',
        backgroundColor: isActive
          ? (isLightTheme ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)')
          : 'transparent',
        border: 'none',
        padding: '8px 10px',
        minHeight: 48,
        boxSizing: 'border-box',
        contentVisibility: 'auto',
        containIntrinsicSize: '64px',
        willChange: 'transform',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = isLightTheme
            ? 'rgba(0, 0, 0, 0.04)'
            : 'rgba(255, 255, 255, 0.04)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <div className="flex justify-between items-center min-w-0">
        <div style={{ width: 48, height: 48, marginRight: 10, flexShrink: 0, position: 'relative' }}>
          {chat.id === 'notes' ? (
            <NotesAvatar className="w-12 h-12" />
          ) : (chat.avatarUrl || chat.id === 'system_support') ? (
            <Avatar src={chat.avatarUrl || SUPPORT_AVATAR_URL} alt={chat.name} className="w-12 h-12" style={{ borderRadius: '50%' }} />
          ) : chat.type === 'bot' ? (
            <BotAvatar className="w-12 h-12" />
          ) : (
            <Avatar src={chat.avatarUrl} alt={chat.name} className="w-12 h-12" style={{ borderRadius: '50%' }} />
          )}
          {chat.type === 'private' && chat.id !== 'notes' && chat.online && (
            <span
              aria-label={t('common.online', 'В сети')}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-color, #7C3AED)',
                boxShadow: `0 0 0 2px ${ringColor}`,
                zIndex: 2,
                pointerEvents: 'none',
                flexShrink: 0,
                transition: 'box-shadow 0.12s ease',
              }}
            />
          )}
          {chat.type === 'group' && chat.activeCallRoom && (
            <span
              aria-label={t('call.group_call_in_progress', 'Идёт групповой звонок')}
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                boxShadow: `0 0 0 2px ${ringColor}`,
                zIndex: 3,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'box-shadow 0.12s ease',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" style={{ color: '#ffffff' }}>
                <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {chat.type === 'channel' && (
                <ChannelMegaphoneIcon
                  size={15}
                  className="flex-shrink-0"
                  style={{
                    color: isLightTheme ? '#555555' : 'rgba(255, 255, 255, 0.85)',
                    marginRight: 2,
                  }}
                />
              )}
              {chat.type === 'group' && (
                <GroupUsersIcon
                  size={15}
                  className="flex-shrink-0"
                  style={{
                    color: isLightTheme ? '#555555' : 'rgba(255, 255, 255, 0.85)',
                    marginRight: 2,
                  }}
                />
              )}
              <span
                className="text-[14px] font-bold truncate whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
                style={{
                  color: isLightTheme ? '#111111' : 'rgba(255,255,255,0.85)',
                  fontFamily: 'inherit'
                }}
              >
                {chat.id === 'notes' ? t('connectModal.notes') : chat.name}
              </span>
              {(chat.isOfficial || chat.id === 'system_support') && (
                <VerifiedBadge size={16} className="flex-shrink-0" />
              )}
              <DeveloperBadge
                userId={chat.peerCode || chat.originalPeerCode || (chat.name && chat.name.length === 36 ? chat.name : undefined) || (chat.type === 'private' ? chat.id : undefined)}
                nickname={chat.name}
                username={chat.username}
                numericId={chat.numericId}
                size={24}
                style={{ pointerEvents: 'none' }}
              />
              {chat.type === 'channel' && chat.isOfficial && (
                <span className="px-1 py-0.2 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[9px] font-extrabold uppercase flex-shrink-0">
                  {t('channel.official', 'ОФИЦ')}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center flex-shrink-0" style={{ gap: 3 }}>
              {status && (
                <div style={{ display: 'flex', alignItems: 'center', transform: 'translateY(-2.5px)' }}>
                  <MessageStatus
                    status={status}
                    isOwn={true}
                    color={status === 'read' ? 'var(--accent-color, #7C3AED)' : (isLightTheme ? '#757575' : '#ffffff')}
                  />
                </div>
              )}
              {timeStr && (
                <span
                  className="text-[12px] font-medium tabular-nums whitespace-nowrap"
                  style={{
                    color: isLightTheme ? '#757575' : 'var(--text-dim, #808080)',
                  }}
                >
                  {timeStr}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center min-w-0 w-full overflow-hidden">
            <div
              className="text-[13px] font-normal whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0"
              style={{
                color: isChatTyping
                  ? 'var(--accent-color, #7C3AED)'
                  : showDraft
                  ? (isLightTheme ? '#111111' : 'rgba(255,255,255,0.85)')
                  : (isLightTheme ? '#757575' : 'var(--text-dim, #8e8e93)'),
                textTransform: 'none',
                fontFamily: 'inherit',
                pointerEvents: 'none',
              }}
            >
              {isChatTyping ? (
                <span className="inline-flex items-center gap-1.5 min-w-0 truncate font-medium text-[var(--accent-color)]">
                  <span className="truncate">
                    {(() => {
                      const count = chatTypingUsers.length;
                      const first = chatTypingUsers[0];
                      const act = first?.action || 'typing';
                      const getSingleText = () => {
                        if (act === 'sticker') return t('chatWindow.is_choosing_sticker_single');
                        if (act === 'voice') return t('chatWindow.is_recording_voice_single');
                        return t('chatWindow.is_typing_single');
                      };
                      const getPluralText = () => {
                        if (act === 'sticker') return t('chatWindow.are_choosing_sticker_plural');
                        if (act === 'voice') return t('chatWindow.are_recording_voice_plural');
                        return t('chatWindow.are_typing_plural');
                      };
                      if (chat.type !== 'group') {
                        if (act === 'sticker') return t('chatWindow.choosing_sticker');
                        if (act === 'voice') return t('chatWindow.recording_voice');
                        return t('chatWindow.typing');
                      }
                      if (count === 1) return `${first.nickname} ${getSingleText()}`;
                      if (count === 2) return `${chatTypingUsers[0].nickname}, ${chatTypingUsers[1].nickname} ${getPluralText()}`;
                      return `${chatTypingUsers[0].nickname}, ${chatTypingUsers[1].nickname} ${t('chatWindow.and_more_typing', { count: count - 2, defaultValue: `и еще ${count - 2} активны` })}`;
                    })()}
                  </span>
                  <ActionIcon action={chatTypingUsers[0]?.action} />
                </span>
              ) : showDraft ? (
                <span className="truncate block min-w-0">
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{t('chatWindow.draft', 'Черновик')}: </span>
                  <span>{draftText}</span>
                </span>
              ) : (
                getLastMsgDisplay(chat, lastMsg, t, isOwn)
              )}
            </div>

            {(isPinned || (chat.unreadCount ?? 0) > 0) && (
              <div className="ml-1.5 flex items-center gap-1.5 flex-shrink-0">
                {isPinned && (
                  <CustomPinIcon size={13} style={{ color: 'var(--accent-color, #7C3AED)' }} className="flex-shrink-0" />
                )}
                {(chat.unreadCount ?? 0) > 0 && (
                  <span
                    className="text-[12px] font-bold px-2 rounded-full text-gray flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-color, #7C3AED)',
                      paddingTop: '0.1rem',
                      paddingBottom: '0.1rem',
                      minWidth: '24px',
                      textAlign: 'center',
                    }}
                  >
                    {formatUnreadCount(chat.unreadCount!)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.chat.id === next.chat.id &&
    prev.chat.name === next.chat.name &&
    prev.chat.avatarUrl === next.chat.avatarUrl &&
    prev.chat.unreadCount === next.chat.unreadCount &&
    prev.chat.updatedAt === next.chat.updatedAt &&
    prev.chat.lastMsg === next.chat.lastMsg &&
    prev.chat.online === next.chat.online &&
    prev.chat.muted === next.chat.muted &&
    prev.isActive === next.isActive &&
    prev.isPinned === next.isPinned &&
    prev.nickname === next.nickname &&
    prev.myCode === next.myCode &&
    prev.isLightTheme === next.isLightTheme &&
    prev.onSelect === next.onSelect &&
    prev.onContextMenu === next.onContextMenu
  );
});

export const ArchiveListItem = React.memo(({
  archivedChats,
  onOpenArchive,
  t,
  isLightTheme,
}: {
  archivedChats: Chat[];
  onOpenArchive: () => void;
  t: any;
  isLightTheme: boolean;
}) => {
  const totalUnread = useMemo(() => {
    return archivedChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }, [archivedChats]);

  return (
    <div
      onClick={onOpenArchive}
      className="group relative cursor-pointer"
      style={{
        borderRadius: '12px',
        margin: '2px 8px',
        width: 'calc(100% - 16px)',
        backgroundColor: 'transparent',
        border: 'none',
        padding: '8px 10px',
        minHeight: 48,
        boxSizing: 'border-box',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isLightTheme
          ? 'rgba(0, 0, 0, 0.04)'
          : 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div className="flex justify-between items-center min-w-0">
        <div style={{ width: 48, height: 48, marginRight: 10, flexShrink: 0, position: 'relative' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: isLightTheme ? '#6c7a89' : 'rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Archive size={22} color="#ffffff" strokeWidth={2.2} />
          </div>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <span
              className="text-[14px] font-bold truncate whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
              style={{
                color: isLightTheme ? '#111111' : 'rgba(255,255,255,0.85)',
                fontFamily: 'inherit',
              }}
            >
              {t('common.archive', 'Архив')}
            </span>
            {totalUnread > 0 && (
              <div className="ml-auto flex items-center flex-shrink-0">
                <span
                  className="text-[12px] font-bold px-2 rounded-full text-white flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    paddingTop: '0.1rem',
                    paddingBottom: '0.1rem',
                    minWidth: '24px',
                    textAlign: 'center',
                  }}
                >
                  {formatUnreadCount(totalUnread)}
                </span>
              </div>
            )}
          </div>
          <div className="text-[13px] font-normal whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
            {archivedChats.map((c, i) => {
              const hasUnread = (c.unreadCount ?? 0) > 0;
              return (
                <React.Fragment key={c.id}>
                  {i > 0 && <span style={{ color: 'var(--text-dim, #8e8e93)' }}>, </span>}
                  <span
                    style={{
                      color: hasUnread ? (isLightTheme ? '#000000' : '#ffffff') : 'var(--text-dim, #8e8e93)',
                      fontWeight: hasUnread ? 600 : 400,
                    }}
                  >
                    {c.id === 'notes' ? t('connectModal.notes') : c.name}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.isLightTheme !== next.isLightTheme) return false;
  if (prev.onOpenArchive !== next.onOpenArchive) return false;
  if (prev.archivedChats.length !== next.archivedChats.length) return false;
  for (let i = 0; i < prev.archivedChats.length; i++) {
    const a = prev.archivedChats[i];
    const b = next.archivedChats[i];
    if (a.id !== b.id || a.unreadCount !== b.unreadCount || a.name !== b.name) {
      return false;
    }
  }
  return true;
});
