
import { useTranslation } from 'react-i18next';
import { RailFolderIcon } from './ChatListItems';
import type { ChatFolder } from '../../../store/useChatStore';

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

export const SidebarFolderRail = ({
  activeFolderId,
  setActiveFolderId,
  currentView,
  setCurrentView,
  folders,
  getFolderUnreadCount,
  isLightTheme,
  setIsMainMenuOpen,
}: SidebarFolderRailProps) => {
  const { t } = useTranslation();
  return (
        <div
          className="flex flex-col items-center shrink-0 select-none"
          style={{
            width: '66px',
            backgroundColor: 'var(--chat-list-bg, #1e1e1e)',
            borderRight: '1px solid var(--border-color)',
          }}
        >
          <div
            className="w-full flex items-center justify-center"
            style={{
              height: '52px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              onClick={() => setIsMainMenuOpen(true)}
              aria-label={t('mainMenu.open_menu', 'Открыть меню')}
              className="flex items-center justify-center cursor-pointer transition-all active:scale-95 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--surface-container)] rounded-xl"
              style={{
                width: '36px',
                height: '36px',
                border: 'none',
                background: 'transparent',
                outline: 'none',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>
          </div>

          <div
            className="flex-1 w-full flex flex-col items-center overflow-y-auto no-scrollbar"
            style={{ boxSizing: 'border-box', paddingTop: '0px', paddingBottom: '7px' }}
          >
            {(() => {
              const isAllActive = activeFolderId === null && currentView === 'chats';
              return (
                <button
                  type="button"
                  onClick={() => {
                    setActiveFolderId(null);
                    if (currentView !== 'chats') setCurrentView('chats');
                  }}
                  aria-label={t('folderManager.all_chats', 'Все чаты')}
                  className="flex flex-col items-center justify-center cursor-pointer select-none"
                  style={{
                    width: '56px',
                    height: '54px',
                    minHeight: '54px',
                    padding: '6px 4px',
                    margin: '2px 0',
                    borderRadius: '10px',
                    border: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    flexShrink: 0,
                    backgroundColor: isAllActive
                      ? (isLightTheme ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)')
                      : 'transparent',
                    color: isAllActive
                      ? (isLightTheme ? '#000000' : '#ffffff')
                      : 'var(--text-dim, #8e8e93)',
                    transition: 'background-color 0.12s ease, color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isAllActive) {
                      e.currentTarget.style.backgroundColor = isLightTheme
                        ? 'rgba(0, 0, 0, 0.04)'
                        : 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = isLightTheme ? '#000000' : '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isAllActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-dim, #8e8e93)';
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                    <path fill="currentColor" d="M1.5 22C1.5 10.678 10.678 1.5 22 1.5c10.994 0 19.966 8.654 20.477 19.521A15.43 15.43 0 0 0 34 18.5c-8.56 0-15.5 6.94-15.5 15.5c0 3.129.927 6.041 2.521 8.477a20.4 20.4 0 0 1-9.602-2.915c-2.081.838-4.47 1.709-6.657 2.316c-1.657.46-3.15-.965-2.73-2.645c.566-2.27 1.438-4.722 2.304-6.823A20.4 20.4 0 0 1 1.5 22"/>
                    <path fill="currentColor" d="M34 21.5c6.904 0 12.5 5.596 12.5 12.5c0 2.3-.622 4.458-1.707 6.31c.4.871.795 1.858 1.112 2.912c.507 1.681-1.023 3.133-2.675 2.593a29 29 0 0 1-2.802-1.093A12.44 12.44 0 0 1 34 46.5c-6.904 0-12.5-5.596-12.5-12.5S27.096 21.5 34 21.5"/>
                  </svg>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 500,
                      marginTop: '4px',
                      textAlign: 'center',
                      lineHeight: 1.1,
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '52px',
                    }}
                  >
                    {t('folderManager.all_chats', 'Все чаты')}
                  </span>
                </button>
              );
            })()}

            {(folders || []).map((folder) => {
              const isFolderActive = activeFolderId === folder.id && currentView === 'chats';
              const unreadCount = getFolderUnreadCount(folder);
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setActiveFolderId(folder.id);
                    if (currentView !== 'chats') setCurrentView('chats');
                  }}
                  aria-label={folder.name}
                  className="flex flex-col items-center justify-center cursor-pointer select-none relative"
                  style={{
                    width: '56px',
                    height: '54px',
                    minHeight: '54px',
                    padding: '6px 4px',
                    margin: '2px 0',
                    borderRadius: '10px',
                    border: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    flexShrink: 0,
                    backgroundColor: isFolderActive
                      ? (isLightTheme ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)')
                      : 'transparent',
                    color: isFolderActive
                      ? (isLightTheme ? '#000000' : '#ffffff')
                      : 'var(--text-dim, #8e8e93)',
                    transition: 'background-color 0.12s ease, color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isFolderActive) {
                      e.currentTarget.style.backgroundColor = isLightTheme
                        ? 'rgba(0, 0, 0, 0.04)'
                        : 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = isLightTheme ? '#000000' : '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isFolderActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-dim, #8e8e93)';
                    }
                  }}
                >
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RailFolderIcon size={20} />
                    {unreadCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-7px',
                          backgroundColor: 'var(--accent-color, #7C3AED)',
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: 600,
                          minWidth: '16px',
                          height: '16px',
                          borderRadius: '9999px',
                          padding: '0 4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        }}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 500,
                      marginTop: '4px',
                      maxWidth: '52px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                      lineHeight: 1.1,
                      userSelect: 'none',
                    }}
                  >
                    {folder.name}
                  </span>
                </button>
              );
            })}
          </div>
    </div>
  );
};
