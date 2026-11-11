import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useChatStore, type ChatFolder } from '../../../store/useChatStore';

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
        width: '64px',
        backgroundColor: 'var(--chat-list-bg, #2b2d31)',
        borderRadius: '18px',
        border: 'none',
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
          <Users size={22} />
        </button>
      </div>

      {hasFolders && (
        <>
          <div className="w-8 h-[2px] bg-[#35363c] rounded-full my-1" />

          <div className="flex-1 w-full flex flex-col items-center overflow-y-auto no-scrollbar pt-1 space-y-2">
            {(folders || []).map((folder) => {
              const isFolderActive = activeFolderId === folder.id && currentView === 'chats';
              const isHovered = hoveredItem === folder.id;
              const unreadCount = getFolderUnreadCount(folder);

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
                        className="absolute -top-1 -right-1 bg-[#f23f43] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full border-none leading-tight shadow-sm"
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
