import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  ArrowLeft,
  RotateCw,
  WifiOff,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { OnlineIndicator } from '../../common/OnlineIndicator';
import { VerifiedBadge } from '../../common/VerifiedBadge';
import { ArchiveListItem } from './ChatListItems';
import { GearIcon, MicToggleIcon, HeadphonesToggleIcon } from './ProfileDockIcons';
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

export const SidebarContent: React.FC<SidebarContentProps> = ({
  isMobileView,
  isViewingArchive,
  setIsViewingArchive,
  archivedChats,
  searchQuery,
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
  const nickname = useAuthStore((s) => s.nickname);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const isInChatSearch = Boolean(inChatSearch?.isOpen);

  const surfaceTint = 'var(--surface-container-soft, rgba(255, 255, 255, 0.045))';
  const surfaceHoverTint = isLightTheme ? 'rgba(0, 0, 0, 0.075)' : 'rgba(255, 255, 255, 0.085)';

  if (isInChatSearch) {
    return (
      <div
        className="flex flex-col h-full rounded-[18px] overflow-hidden"
        style={{ backgroundColor: 'var(--chat-list-bg, #2b2d31)' }}
      >
        <InChatSidebarSearch
          onClose={closeInChatSearch}
          activeChatId={activeChatId}
          isMobileView={isMobileView}
        />
      </div>
    );
  }

  return (
    <div className={isMobileView ? 'flex flex-col h-full gap-2 p-2' : 'flex flex-col h-full gap-2'}>
      {isMobileView && !activeChatId && (isCallMinimized ? <CallMiniPlayer /> : <GlobalAudioPlayer />)}

      {isViewingArchive ? (
        <div
          className="px-3 py-2 select-none shrink-0 rounded-[18px] overflow-hidden"
          style={{
            backgroundColor: 'var(--chat-list-bg, #2b2d31)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
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
        <div
          className="shrink-0 rounded-[18px] overflow-hidden p-2 flex flex-col gap-1.5 select-none"
          style={{ backgroundColor: 'var(--chat-list-bg, #2b2d31)' }}
        >
          {[
            {
              label: t('sidebar.find_or_create_group', 'Найти или создать группу'),
              onClick: onOpenCreateGroup,
            },
            {
              label: t('sidebar.find_or_create_channel', 'Найти или создать канал'),
              onClick: onOpenCreateChannel,
            },
            {
              label: t('sidebar.find_friend', 'Найти друга'),
              onClick: onOpenAddFriend,
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => item.onClick?.()}
              aria-label={item.label}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border-none outline-none cursor-pointer transition-colors text-left"
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
              <span className="text-[12.5px] font-medium truncate flex-1 min-w-0">
                {item.label}
              </span>
              <ChevronRight size={14} className="shrink-0 text-[var(--text-dim)] opacity-60" />
            </button>
          ))}
        </div>
      )}

      {incomingFriendRequests.length > 0 && (
        <div
          className="shrink-0 rounded-[18px] overflow-hidden p-2"
          style={{ backgroundColor: 'var(--chat-list-bg, #2b2d31)' }}
        >
          <button
            type="button"
            onClick={() => setShowFriendRequestsModal(true)}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl hover:opacity-90 transition-opacity text-xs font-medium cursor-pointer shadow-none select-none"
            style={{
              borderRadius: '14px',
              border: 'none',
              backgroundColor: surfaceTint,
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
        className="relative flex-1 min-h-0 overflow-hidden flex flex-col rounded-[18px]"
        style={{ backgroundColor: 'var(--chat-list-bg, #2b2d31)' }}
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
            marginTop: 0,
            paddingTop: '8px',
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
            top: '18px',
            bottom: '18px',
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
            top: '18px',
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

      <div className="shrink-0 w-full z-20 select-none pointer-events-auto rounded-[18px] overflow-hidden">
        <div
          className="flex items-center justify-between px-2.5 py-2"
          style={{
            background: 'var(--accent-gradient, linear-gradient(135deg, var(--accent-color, #5865F2) 0%, var(--accent-dark, #4752c4) 100%))',
            borderRadius: '18px',
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
                  ringColor="var(--accent-dark, var(--accent-color, #5865F2))"
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
                className="dock-btn flex items-center justify-center m-0 bg-transparent hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors duration-150 border-none outline-none select-none cursor-pointer"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  padding: '5px',
                  borderRadius: '5px',
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
                className="dock-btn flex items-center justify-center m-0 bg-transparent hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors duration-150 border-none outline-none select-none cursor-pointer"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  padding: '5px',
                  borderRadius: '5px',
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
                className="dock-btn flex items-center justify-center m-0 bg-transparent hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors duration-150 border-none outline-none select-none cursor-pointer"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  padding: '5px',
                  borderRadius: '5px',
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
