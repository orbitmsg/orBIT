import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Compass } from 'lucide-react';
import { useChatStore, type ChatFolder } from '../../../store/useChatStore';
import { OrbitIcon } from '../../common/OrbitBrand';

export interface SidebarFolderRailProps {
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  currentView: string;
  setCurrentView: (view: any) => void;
  folders: ChatFolder[];
  getFolderUnreadCount: (folder: ChatFolder) => number;
  isLightTheme: boolean;
  onOpenCreateLobby?: () => void;
  onOpenExplore?: () => void;
}

interface HoveredTooltipInfo {
  id: string;
  rect: DOMRect;
  label: string;
}

export const SidebarFolderRail: React.FC<SidebarFolderRailProps> = ({
  activeFolderId,
  setActiveFolderId,
  currentView,
  setCurrentView,
  folders,
  getFolderUnreadCount,
  isLightTheme: _isLightTheme,
  onOpenCreateLobby,
  onOpenExplore,
}) => {
  const { t } = useTranslation();
  const [hoveredInfo, setHoveredInfo] = useState<HoveredTooltipInfo | null>(null);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const chats = useChatStore((s) => s.chats);
  const lobbies = chats.filter((c) => c.type === 'group');

  const isHomeActive = activeFolderId === null && !activeChatId && currentView === 'chats';

  const handleHomeClick = () => {
    setActiveFolderId(null);
    setActiveChat(null);
    if (currentView !== 'chats') setCurrentView('chats');
  };

  const showTooltip = (e: React.MouseEvent<HTMLElement>, id: string, label: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredInfo({ id, rect, label });
  };

  const hideTooltip = () => {
    setHoveredInfo(null);
  };

  return (
    <div
      className="flex flex-col items-center shrink-0 select-none py-3 relative"
      style={{
        width: '64px',
        backgroundColor: 'var(--title-bar-bg, #121212)',
        border: 'none',
        height: '100%',
        boxSizing: 'border-box',
        zIndex: 30,
      }}
    >
      <div className="w-full flex flex-col items-center gap-2 shrink-0">
        <div className="relative w-full flex items-center justify-center">
          <div
            className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
            style={{
              backgroundColor: '#ffffff',
              height: isHomeActive ? '40px' : hoveredInfo?.id === 'home' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={handleHomeClick}
            onMouseEnter={(e) => showTooltip(e, 'home', t('sidebar.direct_messages', 'Личные сообщения'))}
            onMouseLeave={hideTooltip}
            aria-label={t('sidebar.direct_messages', 'Личные сообщения')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none select-none"
            style={{
              borderRadius: isHomeActive || hoveredInfo?.id === 'home' ? '16px' : '24px',
              backgroundColor: isHomeActive || hoveredInfo?.id === 'home' ? 'var(--accent-color, #917bbd)' : '#313338',
              color: '#ffffff',
            }}
          >
            <OrbitIcon size={26} monochrome />
          </button>
        </div>

        <div className="relative w-full flex items-center justify-center">
          <div
            className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
            style={{
              backgroundColor: 'var(--accent-color, #917bbd)',
              height: hoveredInfo?.id === 'add-lobby' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={() => onOpenCreateLobby?.()}
            onMouseEnter={(e) => showTooltip(e, 'add-lobby', t('sidebar.add_lobby', 'Добавить лобби'))}
            onMouseLeave={hideTooltip}
            aria-label={t('sidebar.add_lobby', 'Добавить лобби')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none select-none"
            style={{
              borderRadius: hoveredInfo?.id === 'add-lobby' ? '16px' : '24px',
              backgroundColor: hoveredInfo?.id === 'add-lobby' ? 'var(--accent-color, #917bbd)' : '#313338',
              color: hoveredInfo?.id === 'add-lobby' ? '#ffffff' : 'var(--accent-color, #917bbd)',
            }}
          >
            <Plus size={24} strokeWidth={2.4} />
          </button>
        </div>

        <div className="relative w-full flex items-center justify-center">
          <div
            className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
            style={{
              backgroundColor: 'var(--accent-color, #917bbd)',
              height: currentView === 'explore' ? '40px' : hoveredInfo?.id === 'explore' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={() => onOpenExplore?.()}
            onMouseEnter={(e) => showTooltip(e, 'explore', t('sidebar.explore_treasures', 'В поисках сокровищ'))}
            onMouseLeave={hideTooltip}
            aria-label={t('sidebar.explore_treasures', 'В поисках сокровищ')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none select-none"
            style={{
              borderRadius: currentView === 'explore' || hoveredInfo?.id === 'explore' ? '16px' : '24px',
              backgroundColor: currentView === 'explore' || hoveredInfo?.id === 'explore' ? 'var(--accent-color, #917bbd)' : '#313338',
              color: currentView === 'explore' || hoveredInfo?.id === 'explore' ? '#ffffff' : 'var(--accent-color, #917bbd)',
            }}
          >
            <Compass size={24} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div
        className="w-8 h-[2px] rounded-full my-2 shrink-0"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
      />

      <div className="flex-1 w-full flex flex-col items-center overflow-y-auto no-scrollbar py-1 space-y-2">
        {lobbies.map((lobby) => {
          const isLobbyActive = activeChatId === lobby.id && currentView === 'chats';
          const isHovered = hoveredInfo?.id === lobby.id;
          const unreadCount = lobby.unreadCount || 0;

          return (
            <div key={lobby.id} className="relative w-full flex items-center justify-center">
              <div
                className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
                style={{
                  backgroundColor: '#ffffff',
                  height: isLobbyActive ? '40px' : isHovered ? '20px' : '0px',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setActiveChat(lobby.id);
                  if (currentView !== 'chats') setCurrentView('chats');
                }}
                onMouseEnter={(e) => showTooltip(e, lobby.id, lobby.name)}
                onMouseLeave={hideTooltip}
                aria-label={lobby.name}
                className="relative w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none font-semibold text-sm select-none overflow-hidden"
                style={{
                  borderRadius: isLobbyActive || isHovered ? '16px' : '24px',
                  backgroundColor: isLobbyActive || isHovered ? 'var(--accent-color, #917bbd)' : '#313338',
                  color: isLobbyActive || isHovered ? '#ffffff' : '#dbdee1',
                }}
              >
                {lobby.avatarUrl ? (
                  <img src={lobby.avatarUrl} alt={lobby.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{lobby.name.slice(0, 2).toUpperCase()}</span>
                )}
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full border-none leading-tight shadow-sm"
                    style={{
                      backgroundColor: '#e11d48',
                      color: '#ffffff',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {(folders || []).map((folder) => {
          const isFolderActive = activeFolderId === folder.id && currentView === 'chats';
          const isHovered = hoveredInfo?.id === folder.id;
          const unreadCount = getFolderUnreadCount(folder);

          return (
            <div key={folder.id} className="relative w-full flex items-center justify-center">
              <div
                className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
                style={{
                  backgroundColor: 'var(--text-heading, var(--text-main))',
                  height: isFolderActive ? '40px' : isHovered ? '20px' : '0px',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setActiveFolderId(folder.id);
                  if (currentView !== 'chats') setCurrentView('chats');
                }}
                onMouseEnter={(e) => showTooltip(e, folder.id, folder.name)}
                onMouseLeave={hideTooltip}
                aria-label={folder.name}
                className="relative w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none font-semibold text-sm select-none"
                style={{
                  borderRadius: '16px',
                  backgroundColor: isFolderActive || isHovered ? 'var(--accent-color, #917bbd)' : 'var(--surface-container, #18181a)',
                  color: isFolderActive || isHovered ? '#ffffff' : 'var(--text-dim, #8e8e93)',
                }}
              >
                <span>{folder.name.slice(0, 2).toUpperCase()}</span>
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full border-none leading-tight shadow-sm"
                    style={{
                      backgroundColor: '#e11d48',
                      color: '#ffffff',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {hoveredInfo && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed pointer-events-none select-none z-[999999] whitespace-nowrap"
          style={{
            top: hoveredInfo.rect.top + hoveredInfo.rect.height / 2,
            left: hoveredInfo.rect.right + 12,
            transform: 'translateY(-50%)',
            backgroundColor: '#111214',
            color: '#ffffff',
            fontSize: '13.5px',
            fontWeight: 600,
            padding: '7px 12px',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
            lineHeight: 1.2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '-5px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: '5px solid #111214',
            }}
          />
          {hoveredInfo.label}
        </div>,
        document.body
      )}
    </div>
  );
};
