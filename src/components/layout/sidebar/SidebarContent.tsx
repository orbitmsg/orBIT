import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowLeft, RotateCw, WifiOff, ChevronUp } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
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
  setIsMainMenuOpen: (val: boolean) => void;
}

const GearIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="20" height="20" className="gear-icon">
    <style>{`
      .gear-icon {
        cursor: pointer;
        overflow: visible;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .gear-body {
        transform-origin: 16px 16px;
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), fill 0.2s ease;
      }
      .gear-icon:hover {
        transform: scale(1.14);
      }
      .gear-icon:hover .gear-body {
        animation: spinHover 2.4s linear infinite;
        fill: #ffffff;
      }
      .gear-icon:active {
        transform: scale(0.86);
      }
      .gear-icon:active .gear-body {
        animation: none;
        transform: rotate(180deg) scale(0.92);
        fill: #7c75f2;
      }
      @keyframes spinHover {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
    <g className="gear-body">
      <path fill="#ffffff" d="M27 16.76v-1.53l1.92-1.68A2 2 0 0 0 29.3 11l-2.36-4a2 2 0 0 0-1.73-1a2 2 0 0 0-.64.1l-2.43.82a11 11 0 0 0-1.31-.75l-.51-2.52a2 2 0 0 0-2-1.61h-4.68a2 2 0 0 0-2 1.61l-.51 2.52a11.5 11.5 0 0 0-1.32.75l-2.38-.86A2 2 0 0 0 6.79 6a2 2 0 0 0-1.73 1L2.7 11a2 2 0 0 0 .41 2.51L5 15.24v1.53l-1.89 1.68A2 2 0 0 0 2.7 21l2.36 4a2 2 0 0 0 1.73 1a2 2 0 0 0 .64-.1l2.43-.82a11 11 0 0 0 1.31.75l.51 2.52a2 2 0 0 0 2 1.61h4.72a2 2 0 0 0 2-1.61l.51-2.52a11.5 11.5 0 0 0 1.32-.75l2.42.82a2 2 0 0 0 .64.1a2 2 0 0 0 1.73-1l2.28-4a2 2 0 0 0-.41-2.51ZM25.21 24l-3.43-1.16a8.9 8.9 0 0 1-2.71 1.57L18.36 28h-4.72l-.71-3.55a9.4 9.4 0 0 1-2.7-1.57L6.79 24l-2.36-4l2.72-2.4a8.9 8.9 0 0 1 0-3.13L4.43 12l2.36-4l3.43 1.16a8.9 8.9 0 0 1 2.71-1.57L13.64 4h4.72l.71 3.55a9.4 9.4 0 0 1 2.7 1.57L25.21 8l2.36 4l-2.72 2.4a8.9 8.9 0 0 1 0 3.13L27.57 20Z" />
      <path fill="#ffffff" d="M16 22a6 6 0 1 1 6-6a5.94 5.94 0 0 1-6 6m0-10a3.91 3.91 0 0 0-4 4a3.91 3.91 0 0 0 4 4a3.91 3.91 0 0 0 4-4a3.91 3.91 0 0 0-4-4" />
    </g>
  </svg>
);

const MicToggleIcon = ({ muted }: { muted: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" className={`toggle-svg mic-icon ${muted ? 'muted' : ''}`}>
    <style>{`
      .mic-icon {
        cursor: pointer;
        overflow: visible;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .mic-icon:hover {
        transform: scale(1.14);
      }
      .mic-icon:active {
        transform: scale(0.86);
      }
      .mic-body {
        transform-origin: 12px 12px;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), fill 0.2s ease;
      }
      .mic-icon:not(.muted):hover .mic-body {
        animation: micPulse 0.8s ease-in-out infinite alternate;
      }
      @keyframes micPulse {
        0% { transform: translateY(0) scale(1); }
        100% { transform: translateY(-1.2px) scale(1.05); }
      }
      .mic-slash {
        stroke: #f23f43;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-dasharray: 28;
        stroke-dashoffset: 28;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
        transition: stroke-dashoffset 0.24s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .mic-icon.muted .mic-slash {
        stroke-dashoffset: 0;
      }
      .mic-icon.muted .mic-body {
        fill: #ffffff;
        opacity: 1;
      }
    `}</style>
    <path className="mic-body" fill="#ffffff" d="M19 9a1 1 0 0 1 1 1a8 8 0 0 1-6.999 7.938L13 20h3a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2h3v-2.062A8 8 0 0 1 4 10a1 1 0 1 1 2 0a6 6 0 0 0 12 0a1 1 0 0 1 1-1m-7-8a4 4 0 0 1 4 4v5a4 4 0 1 1-8 0V5a4 4 0 0 1 4-4" />
    <line className="mic-slash" x1="4" y1="4" x2="20" y2="20" />
  </svg>
);

const HeadphonesToggleIcon = ({ muted }: { muted: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="20" height="20" className={`toggle-svg phone-icon ${muted ? 'muted' : ''}`}>
    <style>{`
      .phone-icon {
        cursor: pointer;
        overflow: visible;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .phone-icon:hover {
        transform: scale(1.14);
      }
      .phone-icon:active {
        transform: scale(0.86);
      }
      .phone-body {
        transform-origin: 256px 256px;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), fill 0.2s ease;
      }
      .phone-icon:not(.muted):hover .phone-body {
        animation: bassPump 0.6s ease-in-out infinite alternate;
      }
      @keyframes bassPump {
        0% { transform: scale(1); }
        100% { transform: scale(1.08); }
      }
      .phone-slash {
        stroke: #f23f43;
        stroke-width: 44;
        stroke-linecap: round;
        stroke-dasharray: 550;
        stroke-dashoffset: 550;
        filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.5));
        transition: stroke-dashoffset 0.24s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .phone-icon.muted .phone-slash {
        stroke-dashoffset: 0;
      }
      .phone-icon.muted .phone-body {
        fill: #ffffff;
        opacity: 1;
      }
    `}</style>
    <path className="phone-body" fill="#ffffff" d="M256 80C149.9 80 62.4 159.4 49.6 262c9.4-3.8 19.6-6 30.4-6c26.5 0 48 21.5 48 48v128c0 26.5-21.5 48-48 48c-44.2 0-80-35.8-80-80V288C0 146.6 114.6 32 256 32s256 114.6 256 256v112c0 44.2-35.8 80-80 80c-26.5 0-48-21.5-48-48V304c0-26.5 21.5-48 48-48c10.8 0 21 2.1 30.4 6C449.6 159.4 362.1 80 256 80" />
    <line className="phone-slash" x1="72" y1="72" x2="440" y2="440" />
  </svg>
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
  setIsMainMenuOpen,
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
            <>
              {isMobileView && (
                <button
                  type="button"
                  onClick={() => setIsMainMenuOpen(true)}
                  aria-label={t('mainMenu.open_menu', 'Открыть меню')}
                  className="flex items-center justify-center cursor-pointer transition-all active:scale-95 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--surface-container)] rounded-full shrink-0"
                  style={{
                    width: '36px',
                    height: '36px',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    marginRight: '8px',
                    padding: 0,
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                </button>
              )}
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
            </>
          )}
        </div>
      </div>

      {isMobileView && (
        <div
          className="flex items-center px-4 pt-2.5 pb-1 gap-5 overflow-x-auto no-scrollbar select-none"
          style={{
            borderBottom: '1px solid var(--border-color)',
          }}
        >
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
                    borderRadius: 0,
                    width: '100%',
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
                    borderRadius: 0,
                    width: '100%',
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
                    className="flex items-center gap-3 cursor-pointer transition-colors"
                    style={{
                      borderRadius: '12px',
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
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
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
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
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
                        className="flex items-center gap-3 cursor-pointer transition-colors"
                        style={{
                          borderRadius: '12px',
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
                                <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
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
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
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
            bottom: '6px',
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
            width: '48px',
            height: '48px',
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
      <div className="shrink-0 select-none bg-[#232428] border-t border-[#1f2023] p-1.5">
        <div
          className="flex items-center justify-between p-1.5 rounded-[8px]"
          style={{
            background: 'linear-gradient(135deg, rgba(88, 101, 242, 0.45) 0%, rgba(235, 69, 158, 0.45) 100%)',
            border: 'none',
          }}
        >
          <button
            type="button"
            onClick={() => useChatStore.getState().openSettings('profile')}
            className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-90 transition-opacity bg-transparent border-none outline-none cursor-pointer text-left p-1"
            style={{
              WebkitTapHighlightColor: 'transparent',
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
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#23a55a] border-2 border-[#232428]"
              />
            </div>
            <div className="flex flex-col min-w-0 flex-1 leading-none">
              <span className="text-[13.5px] font-bold text-white truncate leading-tight">
                {nickname || 'Saizzi'}
              </span>
              <span className="text-[11px] text-[#dbdee1]/80 truncate mt-0.5">
                {t('discord.online', 'В сети')}
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
                callSoundService.play(next ? 'mute' : 'unmute');
              }}
              aria-label={isMicMuted ? t('discord.unmuteMicrophone', 'Включить микрофон') : t('discord.muteMicrophone', 'Отключить микрофон')}
              className="w-8 h-8 rounded-full flex items-center justify-center p-0 m-0 bg-transparent hover:bg-white/10 active:bg-white/15 transition-colors duration-150 border-none outline-none select-none cursor-pointer"
              style={{
                WebkitTapHighlightColor: 'transparent',
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
                callSoundService.play(next ? 'mute' : 'unmute');
              }}
              aria-label={isDeafened ? t('discord.undeafenAudio', 'Включить звук') : t('discord.deafenAudio', 'Заглушить звук')}
              className="w-8 h-8 rounded-full flex items-center justify-center p-0 m-0 bg-transparent hover:bg-white/10 active:bg-white/15 transition-colors duration-150 border-none outline-none select-none cursor-pointer"
              style={{
                WebkitTapHighlightColor: 'transparent',
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
                useChatStore.getState().openSettings('main');
              }}
              aria-label={t('discord.userSettings', 'Настройки пользователя')}
              className="w-8 h-8 rounded-full flex items-center justify-center p-0 m-0 bg-transparent hover:bg-white/10 active:bg-white/15 transition-colors duration-150 border-none outline-none select-none cursor-pointer"
              style={{
                WebkitTapHighlightColor: 'transparent',
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
