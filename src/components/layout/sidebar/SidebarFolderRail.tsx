import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Compass } from 'lucide-react';
import { useChatStore, type ChatFolder } from '../../../store/useChatStore';

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

const RailTooltip: React.FC<{ label: string; isVisible: boolean }> = ({ label, isVisible }) => {
  if (!isVisible) return null;
  return (
    <div
      className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 pointer-events-none select-none z-50 whitespace-nowrap transition-all duration-150"
      style={{
        backgroundColor: '#111214',
        color: '#ffffff',
        fontSize: '13.5px',
        fontWeight: 600,
        padding: '7px 12px',
        borderRadius: '8px',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
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
      {label}
    </div>
  );
};

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
  const planetSvgId = useId().replace(/:/g, '');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const isHomeActive = activeFolderId === null && !activeChatId && currentView === 'chats';

  const handleHomeClick = () => {
    setActiveFolderId(null);
    setActiveChat(null);
    if (currentView !== 'chats') setCurrentView('chats');
  };

  return (
    <div
      className="flex flex-col items-center shrink-0 select-none py-3 relative"
      style={{
        width: '64px',
        backgroundColor: 'var(--title-bar-bg, #121212)',
        borderRadius: '18px',
        border: 'none',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'visible',
        zIndex: 30,
      }}
    >
      <div className="relative w-full flex items-center justify-center mb-1">
        <div
          className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
          style={{
            backgroundColor: '#ffffff',
            height: isHomeActive ? '40px' : hoveredItem === 'home' ? '20px' : '0px',
          }}
        />
        <button
          type="button"
          onClick={handleHomeClick}
          onMouseEnter={() => setHoveredItem('home')}
          onMouseLeave={() => setHoveredItem(null)}
          aria-label={t('sidebar.direct_messages', 'Личные сообщения')}
          className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none"
          style={{
            borderRadius: isHomeActive || hoveredItem === 'home' ? '16px' : '24px',
            backgroundColor: '#5865F2',
            color: '#ffffff',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="60 160 680 480"
            width="28"
            height="20"
            className="shrink-0"
            style={{ overflow: 'visible', display: 'block' }}
            aria-hidden="true"
          >
            <defs>
              <clipPath id={`${planetSvgId}-front-clip`}>
                <rect x="-600" y="0" width="1200" height="600" />
              </clipPath>
              <mask id={`${planetSvgId}-back-ring-mask`}>
                <rect x="0" y="0" width="800" height="800" fill="white" />
                <circle cx="400" cy="400" r="192" fill="black" />
              </mask>
              <mask id={`${planetSvgId}-planet-mask`}>
                <rect x="0" y="0" width="800" height="800" fill="white" />
                <g transform="translate(400, 400) rotate(-26)">
                  <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
                </g>
              </mask>
              <mask id={`${planetSvgId}-ring-hole`}>
                <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
                <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
              </mask>
            </defs>
            <g mask={`url(#${planetSvgId}-back-ring-mask)`}>
              <g transform="translate(400, 400) rotate(-26)">
                <ellipse cx="0" cy="0" rx="360" ry="105" fill="#ffffff" mask={`url(#${planetSvgId}-ring-hole)`} />
              </g>
            </g>
            <circle cx="400" cy="400" r="175" fill="#ffffff" mask={`url(#${planetSvgId}-planet-mask)`} />
            <g transform="translate(400, 400) rotate(-26)">
              <g clipPath={`url(#${planetSvgId}-front-clip)`}>
                <ellipse cx="0" cy="0" rx="360" ry="105" fill="#ffffff" mask={`url(#${planetSvgId}-ring-hole)`} />
              </g>
            </g>
          </svg>
        </button>
        <RailTooltip label={t('sidebar.direct_messages', 'Личные сообщения')} isVisible={hoveredItem === 'home'} />
      </div>

      <div
        className="w-8 h-[2px] rounded-full my-1.5 shrink-0"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
      />

      <div
        className="flex-1 w-full flex flex-col items-center overflow-y-auto no-scrollbar py-1 space-y-2"
        style={{ overflowX: 'visible' }}
      >
        {(folders || []).map((folder) => {
          const isFolderActive = activeFolderId === folder.id && currentView === 'chats';
          const isHovered = hoveredItem === folder.id;
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
                onMouseEnter={() => setHoveredItem(folder.id)}
                onMouseLeave={() => setHoveredItem(null)}
                aria-label={folder.name}
                className="relative w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none font-semibold text-sm select-none"
                style={{
                  borderRadius: isFolderActive || isHovered ? '16px' : '24px',
                  background: isFolderActive
                    ? 'var(--accent-gradient, var(--accent-color, #5865F2))'
                    : isHovered
                    ? 'var(--accent-color, #5865F2)'
                    : 'var(--bg-primary, #313338)',
                  color: isFolderActive || isHovered ? 'var(--accent-on-color, #ffffff)' : 'var(--text-main)',
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
              <RailTooltip label={folder.name} isVisible={isHovered} />
            </div>
          );
        })}

        <div className="relative w-full flex items-center justify-center pt-1">
          <div
            className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
            style={{
              backgroundColor: '#23a55a',
              height: hoveredItem === 'add-lobby' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={() => onOpenCreateLobby?.()}
            onMouseEnter={() => setHoveredItem('add-lobby')}
            onMouseLeave={() => setHoveredItem(null)}
            aria-label={t('sidebar.add_lobby', 'Добавить лобби')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none select-none"
            style={{
              borderRadius: hoveredItem === 'add-lobby' ? '16px' : '24px',
              backgroundColor: hoveredItem === 'add-lobby' ? '#23a55a' : 'var(--surface-container, #18181a)',
              color: hoveredItem === 'add-lobby' ? '#ffffff' : '#23a55a',
            }}
          >
            <Plus size={22} strokeWidth={2.4} />
          </button>
          <RailTooltip label={t('sidebar.add_lobby', 'Добавить лобби')} isVisible={hoveredItem === 'add-lobby'} />
        </div>

        <div className="relative w-full flex items-center justify-center pt-1">
          <div
            className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
            style={{
              backgroundColor: '#23a55a',
              height: hoveredItem === 'explore' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={() => onOpenExplore?.()}
            onMouseEnter={() => setHoveredItem('explore')}
            onMouseLeave={() => setHoveredItem(null)}
            aria-label={t('sidebar.explore_treasures', 'В поисках сокровищ')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none select-none"
            style={{
              borderRadius: hoveredItem === 'explore' ? '16px' : '24px',
              backgroundColor: hoveredItem === 'explore' ? '#23a55a' : 'var(--surface-container, #18181a)',
              color: hoveredItem === 'explore' ? '#ffffff' : 'var(--text-main, #dbdee1)',
            }}
          >
            <Compass size={22} strokeWidth={2} />
          </button>
          <RailTooltip label={t('sidebar.explore_treasures', 'В поисках сокровищ')} isVisible={hoveredItem === 'explore'} />
        </div>
      </div>
    </div>
  );
};
