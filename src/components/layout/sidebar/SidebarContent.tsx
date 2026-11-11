import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  ArrowLeft,
  RotateCw,
  WifiOff,
  ChevronUp,
  Users,
  Megaphone,
  UserPlus,
  ChevronRight,
} from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { OnlineIndicator } from '../../common/OnlineIndicator';
import { VerifiedBadge } from '../../common/VerifiedBadge';
import { ArchiveListItem } from './ChatListItems';
import { InChatSidebarSearch } from '../InChatSidebarSearch';
import { CallMiniPlayer } from '../../call/CallMiniPlayer';
import { GlobalAudioPlayer } from '../../audio/GlobalAudioPlayer';
import { ActiveCallBar } from '../../call/ActiveCallBar';
import { ChatPlaceholder } from '../../chat/ChatPlaceholder';
import { useChatStore, type Chat, type IncomingFriendRequest } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useConnectionStore } from '../../../store/useConnectionStore';
import { useCallStore } from '../../../store/useCallStore';
import { callSoundService } from '../../../services/callSoundService';
import { supportService, SUPPORT_AVATAR_URL } from '../../../services/supportService';
import type { ChannelInfo } from '../../../services/channelService';
import type { UserDirectoryRecord } from '../../../services/supabaseService';

export interface SidebarContentProps {
  isMobileView: boolean;
  isViewingArchive: boolean;
  setIsViewingArchive: (val: boolean) => void;
  archivedChats: Chat[];
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  setShowFriendRequestsModal: (val: boolean) => void;
  incomingFriendRequests: IncomingFriendRequest[];
  isNetworkOnline: boolean;
  handleBannerReconnect: () => void;
  chatListScrollRef: React.RefObject<HTMLDivElement | null>;
  handleChatListScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  showChatScrollbar: () => void;
  handleChatListMouseLeave: () => void;
  chatTrackRef: React.RefObject<HTMLDivElement | null>;
  chatThumbRef: React.RefObject<HTMLDivElement | null>;
  handleScrollbarTrackMouseDown: (e: React.MouseEvent<HTMLDivElement>, el: HTMLElement | null) => void;
  handleScrollbarThumbMouseDown: (e: React.MouseEvent<HTMLDivElement>, el: HTMLElement | null) => void;
  visibleChats: Chat[];
  renderChat: (chat: Chat) => React.ReactNode;
  searchChannelResult: ChannelInfo | null;
  handleSelectFoundChannel: (ch: ChannelInfo) => void;
  globalFoundUsers: UserDirectoryRecord[];
  handleSelectFoundUser: (user: UserDirectoryRecord) => void;
  handleSelectFoundSupport: () => void;
  isLightTheme: boolean;
  setIsMainMenuOpen?: (val: boolean) => void;
  onOpenCreateGroup?: () => void;
  onOpenCreateChannel?: () => void;
  onOpenAddFriend?: () => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
}

const DiscordMicrophoneIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
  >
    <path fill="currentColor" d="M12 2a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z" />
    <path fill="currentColor" d="M6 10a1 1 0 0 0-2 0 8 8 0 0 0 7 7.94V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.06A8 8 0 0 0 20 10a1 1 0 1 0-2 0 6 6 0 0 1-12 0Z" />
  </svg>
);

const DiscordMicrophoneSlashIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="m2.7 22.7 20-20a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4ZM10.8 17.32c-.21.21-.1.58.2.62V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.06A8 8 0 0 0 20 10a1 1 0 0 0-2 0c0 1.45-.52 2.79-1.38 3.83l-.02.02A5.99 5.99 0 0 1 12.32 16a.52.52 0 0 0-.34.15l-1.18 1.18ZM15.36 4.52c.15-.15.19-.38.08-.56A4 4 0 0 0 8 6v4c0 .3.03.58.1.86.07.34.49.43.74.18l6.52-6.52ZM5.06 13.98c.16.28.53.31.75.09l.75-.75c.16-.16.19-.4.08-.61A5.97 5.97 0 0 1 6 10a1 1 0 0 0-2 0c0 1.45.39 2.81 1.06 3.98Z"
    />
  </svg>
);

const DiscordHeadphonesIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M12 3a9 9 0 0 0-8.95 10h1.87a5 5 0 0 1 4.1 2.13l1.37 1.97a3.1 3.1 0 0 1-.17 3.78 2.85 2.85 0 0 1-3.55.74 11 11 0 1 1 10.66 0c-1.27.71-2.73.23-3.55-.74a3.1 3.1 0 0 1-.17-3.78l1.38-1.97a5 5 0 0 1 4.1-2.13h1.86A9 9 0 0 0 12 3Z"
    />
  </svg>
);

const DiscordHeadphonesSlashIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M22.7 2.7a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4l20-20ZM17.06 2.94a.48.48 0 0 0-.11-.77A11 11 0 0 0 2.18 16.94c.14.3.53.35.76.12l3.2-3.2c.25-.25.15-.68-.2-.76a5 5 0 0 0-1.02-.1H3.05a9 9 0 0 1 12.66-9.2c.2.09.44.05.59-.1l.76-.76ZM20.2 8.28a.52.52 0 0 1 .1-.58l.76-.76a.48.48 0 0 1 .77.11 11 11 0 0 1-4.5 14.57c-1.27.71-2.73.23-3.55-.74a3.1 3.1 0 0 1-.17-3.78l1.38-1.97a5 5 0 0 1 4.1-2.13h1.86a9.1 9.1 0 0 0-.75-4.72ZM10.1 17.9c.25-.25.65-.18.74.14a3.1 3.1 0 0 1-.62 2.84 2.85 2.85 0 0 1-3.55.74.16.16 0 0 1-.04-.25l3.48-3.48Z"
    />
  </svg>
);

const DiscordSettingsIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.8-1.37 1.16-2.53.98-.45-.07-.93.18-.99.64a11.1 11.1 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.1 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.7-1.43 2.49-1.1.8.33 1.16 1.37.98 2.53-.07.45.18.93.64.99a11.1 11.1 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.1.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.8 1.37-1.16 2.53-.98.45.07.93-.18.99-.64a11.1 11.1 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33-.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a11.07 11.07 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.8-.33-1.16-1.37-.98-2.53.07-.45-.18-.93-.64-.99a11.1 11.1 0 0 0-2.88 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
    />
  </svg>
);

const GearIcon = () => (
  <div className="flex items-center justify-center w-5 h-5">
    <style>{`
      .discord-gear-body {
        transform-origin: 12px 12px;
        fill: #b5bac1;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s ease;
      }
      .dock-btn:hover .discord-gear-body {
        transform: rotate(90deg);
        fill: #ffffff;
      }
      .dock-btn:active .discord-gear-body {
        transform: rotate(180deg);
        fill: #ffffff;
      }
    `}</style>
    <DiscordSettingsIcon className="discord-gear-body" />
  </div>
);

const MicToggleIcon = ({ muted }: { muted: boolean }) => (
  <div className="flex items-center justify-center w-5 h-5">
    <style>{`
      .discord-mic-unmuted {
        fill: #b5bac1;
        transition: fill 0.15s ease;
      }
      .dock-btn:hover .discord-mic-unmuted {
        fill: #ffffff;
      }
      .discord-mic-muted {
        fill: #f23f43;
        transition: fill 0.15s ease;
      }
      .dock-btn:hover .discord-mic-muted {
        fill: #fa777c;
      }
    `}</style>
    {muted ? (
      <DiscordMicrophoneSlashIcon className="discord-mic-muted" />
    ) : (
      <DiscordMicrophoneIcon className="discord-mic-unmuted" />
    )}
  </div>
);

const HeadphonesToggleIcon = ({ muted }: { muted: boolean }) => (
  <div className="flex items-center justify-center w-5 h-5">
    <style>{`
      .discord-headphones-unmuted {
        fill: #b5bac1;
        transition: fill 0.15s ease;
      }
      .dock-btn:hover .discord-headphones-unmuted {
        fill: #ffffff;
      }
      .discord-headphones-muted {
        fill: #f23f43;
        transition: fill 0.15s ease;
      }
      .dock-btn:hover .discord-headphones-muted {
        fill: #fa777c;
      }
    `}</style>
    {muted ? (
      <DiscordHeadphonesSlashIcon className="discord-headphones-muted" />
    ) : (
      <DiscordHeadphonesIcon className="discord-headphones-unmuted" />
    )}
  </div>
);

export const SidebarContent: React.FC<SidebarContentProps> = ({
  isMobileView,
  isViewingArchive,
  setIsViewingArchive,
  archivedChats,
  searchQuery,
  setSearchQuery,
  setShowFriendRequestsModal,
  incomingFriendRequests,
  isNetworkOnline,
  handleBannerReconnect,
  chatListScrollRef,
  handleChatListScroll,
  showChatScrollbar,
  handleChatListMouseLeave,
  chatTrackRef,
  chatThumbRef,
  handleScrollbarTrackMouseDown,
  handleScrollbarThumbMouseDown,
  visibleChats,
  renderChat,
  searchChannelResult,
  handleSelectFoundChannel,
  globalFoundUsers,
  handleSelectFoundUser,
  handleSelectFoundSupport,
  isLightTheme,
  onOpenCreateGroup,
  onOpenCreateChannel,
  onOpenAddFriend,
  onOpenSettings,
  onOpenProfile,
}) => {
  const { t } = useTranslation();
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const inChatSearch = useChatStore((s) => s.inChatSearch);
  const closeInChatSearch = useChatStore((s) => s.closeInChatSearch);
  const chats = useChatStore((s) => s.chats);
  const downloadedUpdateVersion = useChatStore((s) => s.downloadedUpdateVersion);
  const isUpdateBannerDismissed = useChatStore((s) => s.isUpdateBannerDismissed);
  const dismissUpdateBanner = useChatStore((s) => s.dismissUpdateBanner);
  const activeFolderId = useChatStore((s) => s.activeFolderId);
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const isCallMinimized = useCallStore((s) => s.isMinimized);
  const isCallActive = useCallStore((s) => Boolean(s.activeCall));
  const nickname = useAuthStore((s) => s.nickname);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isDeafened, setIsDeafened] = React.useState(false);

  const surfaceTint = isLightTheme ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.045)';
  const surfaceHoverTint = isLightTheme ? 'rgba(0, 0, 0, 0.075)' : 'rgba(255, 255, 255, 0.085)';

  if (inChatSearch?.isOpen) {
    return (
      <InChatSidebarSearch
        onClose={closeInChatSearch}
        activeChatId={activeChatId}
        isMobileView={isMobileView}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {isMobileView && !activeChatId && (isCallMinimized ? <CallMiniPlayer /> : <GlobalAudioPlayer />)}

      <div
        className="px-4 py-1 select-none"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '12px',
        }}
      >
        <div className="flex items-center min-w-0" style={{ width: '100%' }}>
          {isViewingArchive ? (
            <div className="flex items-center w-full gap-2">
              <button
                type="button"
                onClick={() => setIsViewingArchive(false)}
                aria-label={t('common.back', 'Назад')}
                className="flex items-center justify-center cursor-pointer transition-all active:scale-95 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--surface-container)] rounded-full shrink-0"
                style={{
                  width: '36px',
                  height: '36px',
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  padding: 0,
                }}
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-bold text-[16px] text-[var(--text-main)]">
                  {t('common.archive', 'Архив')}
                </span>
                <span className="text-xs text-[var(--text-dim)]">
                  {archivedChats.length}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search', 'Поиск')}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '999px',
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
                  color: 'var(--text-main, #e0e0e0)',
                  fontSize: '13px',
                  paddingLeft: '14px',
                  paddingRight: searchQuery ? '32px' : '14px',
                  boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('common.close', 'Закрыть')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-dim, #9ca3af)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isMobileView && (
        <div className="flex items-center px-4 pt-2.5 pb-1 gap-5 overflow-x-auto no-scrollbar select-none">
          <div className="relative pb-1.5 cursor-pointer text-[13px] font-semibold text-[var(--accent-color)] flex-shrink-0">
            <span>{t('common.all', 'Все')}</span>
            <div
              className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
              style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
            />
          </div>
        </div>
      )}

      {incomingFriendRequests.length > 0 && (
        <div className="px-4 pt-2.5 pb-1">
          <button
            type="button"
            onClick={() => setShowFriendRequestsModal(true)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-full hover:opacity-90 transition-opacity text-xs font-medium cursor-pointer shadow-none select-none"
            style={{
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
              color: 'var(--text-main, #ffffff)',
            }}
          >
            <span className="font-semibold text-xs text-[var(--text-main)]">
              {t('friendRequests.pending_banner', 'Запросы на переписку')}
            </span>
            <span
              className="px-2 py-0.5 rounded-full font-bold text-[11px]"
              style={{
                borderRadius: '9999px',
                backgroundColor: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
              }}
            >
              {incomingFriendRequests.length}
            </span>
          </button>
        </div>
      )}

      {isMobileView && !activeChatId && (
        <ActiveCallBar />
      )}

      <div
        className="relative flex-1 min-h-0 overflow-hidden flex flex-col"
        onMouseEnter={showChatScrollbar}
        onMouseLeave={handleChatListMouseLeave}
      >
        <div
          ref={chatListScrollRef}
          onScroll={(e) => {
            handleChatListScroll(e);
            const el = e.currentTarget;
            setShowScrollTop(el.scrollTop > 180);
          }}
          className="flex-1 chat-list-scrollbar select-none"
          style={{
            marginTop: (isMobileView && isCallActive) ? '0px' : '9px',
            paddingTop: '0px',
            paddingBottom: '8px',
            overflowY: 'scroll',
            overflowX: 'hidden',
          }}
        >
          {isMobileView && chats.length === 0 && (isServerConnected && isNetworkOnline) ? (
            <div className="h-full flex items-center justify-center">
              <ChatPlaceholder />
            </div>
          ) : (
            <div className="flex flex-col w-full">
              {!isViewingArchive && !searchQuery.trim() && (
                <div className="px-2 pb-2 flex flex-col gap-1 select-none">
                    <button
                      type="button"
                      onClick={() => onOpenCreateGroup?.()}
                      aria-label={t('sidebar.find_or_create_group', 'Найти или создать группу')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-2xl border-none outline-none cursor-pointer transition-colors text-left"
                      style={{
                        borderRadius: '14px',
                        border: 'none',
                        backgroundColor: surfaceTint,
                        color: 'var(--text-main, #e0e0e0)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = surfaceHoverTint;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = surfaceTint;
                      }}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'rgba(124, 58, 237, 0.18)',
                          color: 'var(--accent-color, #9f7aea)',
                        }}
                      >
                        <Users size={13} />
                      </span>
                      <span className="text-[12.5px] font-medium truncate flex-1 min-w-0">
                        {t('sidebar.find_or_create_group', 'Найти или создать группу')}
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-[var(--text-dim)] opacity-60" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenCreateChannel?.()}
                      aria-label={t('sidebar.find_or_create_channel', 'Найти или создать канал')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-2xl border-none outline-none cursor-pointer transition-colors text-left"
                      style={{
                        borderRadius: '14px',
                        border: 'none',
                        backgroundColor: surfaceTint,
                        color: 'var(--text-main, #e0e0e0)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = surfaceHoverTint;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = surfaceTint;
                      }}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'rgba(88, 101, 242, 0.18)',
                          color: '#8ea1ff',
                        }}
                      >
                        <Megaphone size={13} />
                      </span>
                      <span className="text-[12.5px] font-medium truncate flex-1 min-w-0">
                        {t('sidebar.find_or_create_channel', 'Найти или создать канал')}
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-[var(--text-dim)] opacity-60" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenAddFriend?.()}
                      aria-label={t('sidebar.find_friend', 'Найти друга')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-2xl border-none outline-none cursor-pointer transition-colors text-left"
                      style={{
                        borderRadius: '14px',
                        border: 'none',
                        backgroundColor: surfaceTint,
                        color: 'var(--text-main, #e0e0e0)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = surfaceHoverTint;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = surfaceTint;
                      }}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'rgba(35, 165, 90, 0.18)',
                          color: '#3ba55d',
                        }}
                      >
                        <UserPlus size={13} />
                      </span>
                      <span className="text-[12.5px] font-medium truncate flex-1 min-w-0">
                        {t('sidebar.find_friend', 'Найти друга')}
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-[var(--text-dim)] opacity-60" />
                    </button>
                </div>
              )}

              {downloadedUpdateVersion && !isUpdateBannerDismissed && (
                <div
                  role="button"
                  tabIndex={-1}
                  onClick={() => {
                    if (typeof window !== 'undefined' && (window as any).orbita?.quitAndInstallUpdate) {
                      (window as any).orbita.quitAndInstallUpdate();
                    }
                  }}
                  aria-label={t('common.install_update', 'Установить обновление')}
                  className="group relative cursor-pointer select-none outline-none focus:outline-none"
                  style={{
                    borderRadius: '14px',
                    margin: '2px 8px 6px 8px',
                    width: 'calc(100% - 16px)',
                    height: '64px',
                    minHeight: '64px',
                    maxHeight: '64px',
                    backgroundColor: 'var(--accent-color, #5c54e5)',
                    color: '#ffffff',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    padding: '6px 14px',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    flexShrink: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <div className="flex items-center min-w-0 w-full h-full">
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        marginRight: 10,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <RotateCw size={19} color="#ffffff" strokeWidth={2.2} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#ffffff',
                          fontFamily: 'inherit',
                          lineHeight: '15px',
                          marginBottom: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t('common.update_available_banner_title', 'Доступно обновление')}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 400,
                          color: 'rgba(255, 255, 255, 0.88)',
                          lineHeight: '13px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t('common.update_available_banner_desc', 'Нажмите, чтобы перезапустить Orbita')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissUpdateBanner();
                      }}
                      aria-label={t('common.close', 'Закрыть')}
                      className="p-1.5 rounded-full hover:bg-black/20 active:bg-black/30 transition-colors text-white/80 hover:text-white shrink-0 ml-2"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}
              {(!isServerConnected || !isNetworkOnline) && (
                <div
                  role="button"
                  tabIndex={-1}
                  onClick={handleBannerReconnect}
                  aria-label={!isNetworkOnline ? t('common.network_offline_title') : t('common.network_connecting_title')}
                  className="group relative cursor-pointer select-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                  style={{
                    borderRadius: '14px',
                    margin: '2px 8px 6px 8px',
                    width: 'calc(100% - 16px)',
                    height: '64px',
                    minHeight: '64px',
                    maxHeight: '64px',
                    backgroundColor: '#F5C518',
                    color: '#000000',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    padding: '6px 14px',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    flexShrink: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background-color 0.12s ease',
                  }}
                >
                  <div className="flex items-center min-w-0 w-full h-full">
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        marginRight: 10,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {!isNetworkOnline ? (
                        <WifiOff size={19} color="#000000" strokeWidth={2.2} />
                      ) : (
                        <svg
                          className="animate-spin"
                          viewBox="0 0 24 24"
                          width="19"
                          height="19"
                          fill="none"
                          stroke="#000000"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#000000',
                          fontFamily: 'inherit',
                          lineHeight: '15px',
                          marginBottom: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {!isNetworkOnline ? t('common.network_offline_title') : t('common.network_connecting_title')}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 400,
                          color: '#1a1a1a',
                          lineHeight: '13px',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {!isNetworkOnline ? t('common.network_offline_desc') : t('common.network_connecting_desc')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {searchChannelResult && (
                <div className="w-full">
                  <div
                    onClick={() => handleSelectFoundChannel(searchChannelResult)}
                    className="flex items-center gap-3 cursor-pointer transition-colors rounded-2xl"
                    style={{
                      borderRadius: '14px',
                      border: 'none',
                      margin: '2px 8px',
                      width: 'calc(100% - 16px)',
                      padding: '8px 10px',
                      boxSizing: 'border-box',
                      backgroundColor: 'transparent',
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
                    <Avatar
                      src={searchChannelResult.avatarUrl}
                      alt={searchChannelResult.name}
                      className="w-12 h-12 rounded-full flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[14px] text-[var(--text-main)] truncate">
                          {searchChannelResult.name}
                        </span>
                        {searchChannelResult.isOfficial && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
                            Orbita
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-dim)] truncate mt-0.5">
                        {searchChannelResult.description || `${searchChannelResult.subscribersCount || 1} ${t('createModal.subscribers', 'подписчиков')}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectFoundChannel(searchChannelResult);
                      }}
                      aria-label={chats.some(c => c.id === searchChannelResult.id) ? t('common.open', 'Открыть') : t('common.join', 'Вступить')}
                      className="px-3 py-1.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
                      style={{ borderRadius: '12px', border: 'none' }}
                    >
                      {chats.some(c => c.id === searchChannelResult.id)
                        ? t('common.open', 'Открыть')
                        : t('common.join', 'Вступить')}
                    </button>
                  </div>
                </div>
              )}
              {!isViewingArchive && !searchQuery.trim() && archivedChats.length > 0 && (
                <ArchiveListItem
                  archivedChats={archivedChats}
                  onOpenArchive={() => setIsViewingArchive(true)}
                  t={t}
                  isLightTheme={isLightTheme}
                />
              )}
              {visibleChats.map((chat) => renderChat(chat))}
              {searchQuery.trim().length >= 2 && globalFoundUsers.length > 0 && (
                <div className="w-full">
                  {globalFoundUsers.map((user) => {
                    const myUid = useAuthStore.getState().userId;
                    const myC = useChatStore.getState().myCode;
                    const isMe = user.user_code === myC || user.user_code === myUid;
                    const isSupport = user.user_code === supportService.BOT_ID || user.username?.toLowerCase() === 'support';
                    return (
                      <div
                        key={user.user_code}
                        onClick={() => handleSelectFoundUser(user)}
                        className="flex items-center gap-3 cursor-pointer transition-colors rounded-2xl"
                        style={{
                          borderRadius: '14px',
                          border: 'none',
                          margin: '2px 8px',
                          width: 'calc(100% - 16px)',
                          padding: '8px 10px',
                          boxSizing: 'border-box',
                          backgroundColor: 'transparent',
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
                        <Avatar
                          src={isSupport ? (user.avatar_url || SUPPORT_AVATAR_URL) : user.avatar_url}
                          alt={user.nickname}
                          className="w-12 h-12 rounded-full flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[14px] text-[var(--text-main)] truncate">
                              {user.nickname}
                            </span>
                            {isSupport && (
                              <>
                                <VerifiedBadge size={15} className="flex-shrink-0" />
                                <span className="px-2 py-0.5 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
                                  Support
                                </span>
                              </>
                            )}
                            {isMe && (
                              <span className="px-2 py-0.5 rounded-full bg-[var(--accent-color)] text-white text-[10px] font-bold">
                                {t('common.this_is_you', 'Это вы')}
                              </span>
                            )}
                          </div>
                          {user.username && (
                            <div className="text-xs text-[var(--accent-color,#7C3AED)] truncate mt-0.5 font-mono">
                              @{user.username}
                            </div>
                          )}
                          {!user.username && user.user_code && (
                            <div className="text-xs text-[var(--accent-color,#7C3AED)] truncate mt-0.5 font-mono">
                              ID: {user.user_code}
                            </div>
                          )}
                          {user.bio && (
                            <div className="text-xs text-[var(--text-dim)] truncate mt-0.5">
                              {user.bio}
                            </div>
                          )}
                        </div>
                        {isSupport && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectFoundSupport();
                            }}
                            aria-label={t('common.open', 'Открыть')}
                            className="px-3 py-1.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
                            style={{ borderRadius: '12px', border: 'none' }}
                          >
                            {t('common.open', 'Открыть')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {activeFolderId && !searchQuery.trim() && visibleChats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <span className="text-sm text-[var(--text-dim)]">
                    {t('folderManager.no_chats_in_folder', 'В этой папке пока нет чатов')}
                  </span>
                </div>
              )}
              {searchQuery.trim().length >= 2 && visibleChats.length === 0 && !searchChannelResult && globalFoundUsers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <span className="text-sm text-[var(--text-dim)]">
                    {t('search.no_results', 'Ничего не найдено')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          ref={chatTrackRef}
          className="overlay-scroll-track"
          onMouseDown={(e) => handleScrollbarTrackMouseDown(e, chatListScrollRef.current)}
          style={{
            top: '15px',
            bottom: '8px',
            opacity: 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: 'auto',
          }}
        />

        <div
          ref={chatThumbRef}
          className="overlay-scroll-thumb"
          onMouseDown={(e) => handleScrollbarThumbMouseDown(e, chatListScrollRef.current)}
          style={{
            top: '15px',
            opacity: 0,
            transition: 'opacity 0.2s ease',
            willChange: 'transform',
            pointerEvents: 'auto',
          }}
        />

        <button
          type="button"
          className={`scroll-btn ${showScrollTop ? 'visible' : ''}`}
          onClick={() => {
            if (chatListScrollRef.current) {
              chatListScrollRef.current.scrollTop = 0;
            }
            setShowScrollTop(false);
          }}
          aria-label={t('chatWindow.scroll_up', 'Прокрутить наверх')}
          style={{
            position: 'absolute',
            right: '16px',
            bottom: '16px',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: 'var(--surface-container, #33363f)',
            color: 'var(--text-main)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
            border: 'none',
            outline: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
          }}
        >
          <ChevronUp size={24} strokeWidth={2.4} style={{ color: 'var(--text-main)' }} />
        </button>
      </div>

      <div className="shrink-0 w-full z-20 select-none pointer-events-auto">
        <div
          className="flex items-center justify-between px-2.5 py-2"
          style={{
            background: 'linear-gradient(135deg, #4349a8 0%, #8f3978 100%)',
            borderRadius: 0,
            border: 'none',
          }}
        >
            <button
              type="button"
              onClick={() => {
                if (onOpenProfile) {
                  onOpenProfile();
                } else {
                  useChatStore.getState().openSettings('profile');
                }
              }}
              aria-label={t('mainMenu.my_profile', 'Мой профиль')}
              className="flex items-center gap-2.5 min-w-0 flex-1 hover:bg-white/[0.1] rounded-xl transition-colors bg-transparent border-none outline-none cursor-pointer text-left p-1"
              style={{
                WebkitTapHighlightColor: 'transparent',
                borderRadius: '12px',
                outline: 'none',
                boxShadow: 'none',
                border: 'none',
              }}
            >
              <div className="relative shrink-0">
                <Avatar
                  src={avatarUrl}
                  alt={nickname || 'Saizzi'}
                  className="w-8 h-8 rounded-full"
                />
                <OnlineIndicator
                  online={isServerConnected}
                  showOffline={true}
                  size="xs"
                  ringColor="#4349a8"
                  ariaLabel={isServerConnected ? t('discord.online', 'В сети') : t('common.network_connecting_title', 'Соединение...')}
                />
              </div>
              <div className="flex flex-col min-w-0 flex-1 leading-none">
                <span className="text-[13.5px] font-bold text-white truncate leading-tight">
                  {nickname || 'Saizzi'}
                </span>
                <span className="text-[11px] text-white/80 truncate mt-0.5">
                  {isServerConnected ? t('discord.online', 'В сети') : t('common.network_connecting_title', 'Соединение...')}
                </span>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  const next = !isMicMuted;
                  setIsMicMuted(next);
                  if (!next && isDeafened) {
                    setIsDeafened(false);
                  }
                  callSoundService.play(next ? 'mute' : 'unmute');
                }}
                aria-label={isMicMuted ? t('discord.unmuteMicrophone', 'Включить микрофон') : t('discord.muteMicrophone', 'Отключить микрофон')}
                className="dock-btn w-8 h-8 rounded-xl flex items-center justify-center p-0 m-0 bg-transparent hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors duration-150 border-none outline-none select-none cursor-pointer"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  borderRadius: '12px',
                  outline: 'none',
                  boxShadow: 'none',
                  border: 'none',
                }}
              >
                <MicToggleIcon muted={isMicMuted} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  const next = !isDeafened;
                  setIsDeafened(next);
                  if (next) {
                    setIsMicMuted(true);
                  } else {
                    setIsMicMuted(false);
                  }
                  callSoundService.play(next ? 'mute' : 'unmute');
                }}
                aria-label={isDeafened ? t('discord.undeafenAudio', 'Включить звук') : t('discord.deafenAudio', 'Заглушить звук')}
                className="dock-btn w-8 h-8 rounded-xl flex items-center justify-center p-0 m-0 bg-transparent hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors duration-150 border-none outline-none select-none cursor-pointer"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  borderRadius: '12px',
                  outline: 'none',
                  boxShadow: 'none',
                  border: 'none',
                }}
              >
                <HeadphonesToggleIcon muted={isDeafened} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  if (onOpenSettings) {
                    onOpenSettings();
                  } else {
                    useChatStore.getState().openSettings('main');
                  }
                }}
                aria-label={t('discord.userSettings', 'Настройки пользователя')}
                className="dock-btn w-8 h-8 rounded-xl flex items-center justify-center p-0 m-0 bg-transparent hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors duration-150 border-none outline-none select-none cursor-pointer"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  borderRadius: '12px',
                  outline: 'none',
                  boxShadow: 'none',
                  border: 'none',
                }}
              >
                <GearIcon />
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};
