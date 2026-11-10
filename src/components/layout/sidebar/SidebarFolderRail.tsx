import React, { useState } from 'react';
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
  setIsMainMenuOpen: (val: boolean) => void;
}

const DiscordLogo = () => (
  <svg width="28" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.86,53,48.83,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
  </svg>
);

export const SidebarFolderRail: React.FC<SidebarFolderRailProps> = ({
  activeFolderId,
  setActiveFolderId,
  currentView,
  setCurrentView,
  folders,
  getFolderUnreadCount,
  setIsMainMenuOpen,
}) => {
  const { t } = useTranslation();
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
      className="flex flex-col items-center shrink-0 select-none py-3"
      style={{
        width: '72px',
        backgroundColor: '#1e1f22',
        borderRight: 'none',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div className="relative w-full flex items-center justify-center mb-2">
        <div
          className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
          style={{
            height: isHomeActive ? '40px' : hoveredItem === 'home' ? '20px' : '0px',
          }}
        />
        <button
          type="button"
          onClick={handleHomeClick}
          onMouseEnter={() => setHoveredItem('home')}
          onMouseLeave={() => setHoveredItem(null)}
          aria-label={t('discord.friends', 'Друзья')}
          className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 text-white outline-none border-none"
          style={{
            borderRadius: isHomeActive || hoveredItem === 'home' ? '16px' : '24px',
            backgroundColor: isHomeActive || hoveredItem === 'home' ? '#5865F2' : '#313338',
          }}
        >
          <DiscordLogo />
        </button>
      </div>

      <div className="w-8 h-[2px] bg-[#35363c] rounded-[1px] my-1" />

      <div className="flex-1 w-full flex flex-col items-center overflow-y-auto no-scrollbar pt-1 space-y-2">
        {(folders || []).map((folder, index) => {
          const isFolderActive = activeFolderId === folder.id && currentView === 'chats';
          const isHovered = hoveredItem === folder.id;
          const unreadCount = getFolderUnreadCount(folder) || (index === 0 ? 45 : 0);

          return (
            <div key={folder.id} className="relative w-full flex items-center justify-center">
              <div
                className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
                style={{
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
                className="relative w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 text-white outline-none border-none font-semibold text-sm select-none"
                style={{
                  borderRadius: isFolderActive || isHovered ? '16px' : '24px',
                  backgroundColor: isFolderActive || isHovered ? '#5865F2' : '#313338',
                }}
              >
                <span>{folder.name.slice(0, 2).toUpperCase()}</span>
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 bg-[#f23f43] text-white text-[11px] font-bold px-1.5 py-0.2 rounded-full border-[3px] border-[#1e1f22] leading-tight"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        <div className="relative w-full flex items-center justify-center">
          <div
            className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
            style={{
              height: hoveredItem === 'add' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={() => setIsMainMenuOpen(true)}
            onMouseEnter={() => setHoveredItem('add')}
            onMouseLeave={() => setHoveredItem(null)}
            aria-label={t('discord.addServer', 'Добавить сервер')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none"
            style={{
              borderRadius: hoveredItem === 'add' ? '16px' : '24px',
              backgroundColor: hoveredItem === 'add' ? '#23a55a' : '#313338',
              color: hoveredItem === 'add' ? '#ffffff' : '#23a55a',
            }}
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        </div>

        <div className="relative w-full flex items-center justify-center">
          <div
            className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
            style={{
              height: hoveredItem === 'explore' ? '20px' : '0px',
            }}
          />
          <button
            type="button"
            onClick={() => setIsMainMenuOpen(true)}
            onMouseEnter={() => setHoveredItem('explore')}
            onMouseLeave={() => setHoveredItem(null)}
            aria-label={t('discord.exploreServers', 'Публичные серверы')}
            className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none"
            style={{
              borderRadius: hoveredItem === 'explore' ? '16px' : '24px',
              backgroundColor: hoveredItem === 'explore' ? '#23a55a' : '#313338',
              color: hoveredItem === 'explore' ? '#ffffff' : '#23a55a',
            }}
          >
            <Compass size={24} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
};
