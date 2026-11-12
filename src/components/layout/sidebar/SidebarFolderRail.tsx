import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type ChatFolder } from '../../../store/useChatStore';

const DiscordLogoIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg width={size} height={Math.round(size * 0.76)} viewBox="0 0 127.14 96.36" fill="currentColor">
    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
  </svg>
);

export interface SidebarFolderRailProps {
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  currentView: string;
  setCurrentView: (view: any) => void;
  folders: ChatFolder[];
  getFolderUnreadCount: (folder: ChatFolder) => number;
  isLightTheme: boolean;
}

export const SidebarFolderRail: React.FC<SidebarFolderRailProps> = ({
  activeFolderId,
  setActiveFolderId,
  currentView,
  setCurrentView,
  folders,
  getFolderUnreadCount,
  isLightTheme: _isLightTheme,
}) => {
  const { t } = useTranslation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const isHomeActive = activeFolderId === null && !activeChatId && currentView === 'chats';
  const hasFolders = (folders || []).length > 0;

  const handleHomeClick = () => {
    setActiveFolderId(null);
    setActiveChat(null);
    if (currentView !== 'chats') setCurrentView('chats');
  };

  return (
    <div
      className="flex flex-col items-center shrink-0 select-none py-3 overflow-hidden"
      style={{
        width: '72px',
        backgroundColor: 'var(--surface-container, #1e1f22)',
        borderRadius: 0,
        border: 'none',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div className="relative w-full flex items-center justify-center mb-1">
        <div
          className="absolute left-0 w-1 rounded-r-full transition-all duration-200"
          style={{
            backgroundColor: 'var(--text-heading, #ffffff)',
            height: isHomeActive ? '40px' : hoveredItem === 'home' ? '20px' : '0px',
          }}
        />
        <button
          type="button"
          onClick={handleHomeClick}
          onMouseEnter={() => setHoveredItem('home')}
          onMouseLeave={() => setHoveredItem(null)}
          aria-label={t('discord.friends', 'Друзья')}
          className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 outline-none border-none"
          style={{
            borderRadius: isHomeActive || hoveredItem === 'home' ? '16px' : '24px',
            backgroundColor: isHomeActive || hoveredItem === 'home'
              ? 'var(--accent-color, #5865F2)'
              : 'var(--surface-container-strong, #313338)',
            color: isHomeActive || hoveredItem === 'home' ? '#ffffff' : 'var(--text-main, #dbdee1)',
          }}
        >
          <DiscordLogoIcon size={26} />
        </button>
      </div>

      <div className="w-8 h-[2px] bg-[var(--border-color,#35373c)] rounded-full my-2 shrink-0" />

      {hasFolders && (
        <>
          <div className="flex-1 w-full flex flex-col items-center overflow-y-auto no-scrollbar pt-1 space-y-2">
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
                      background: isFolderActive || isHovered
                        ? 'var(--accent-color, #5865F2)'
                        : 'var(--surface-container-strong, #313338)',
                      color: isFolderActive || isHovered ? '#ffffff' : 'var(--text-main)',
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
        </>
      )}
    </div>
  );
};
