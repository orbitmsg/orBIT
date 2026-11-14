import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, flushStorageSet } from '../../store/useChatStore';
import { DiscordSettingsIcon } from './sidebar/ProfileDockIcons';
import { OrbitIcon } from '../common/OrbitBrand';
import { Hash } from 'lucide-react';

export const isElectronApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).__ELECTRON_RENDERER__ ||
    (window as any).orbita?.getDesktopSources ||
    (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent))
  );
};

export interface TitleBarProps {
  title?: string;
  hideTitle?: boolean;
  onClose?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ title, hideTitle, onClose, style, className }) => {
  const { t } = useTranslation();
  const isElectron = isElectronApp();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoverSuppressed, setIsHoverSuppressed] = useState(false);
  const [isHelpHovered, setIsHelpHovered] = useState(false);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChannelName = useChatStore((s) => s.activeChannelName);
  const chats = useChatStore((s) => s.chats);
  const currentView = useChatStore((s) => s.currentView);

  const activeChat = activeChatId ? chats.find((c) => c.id === activeChatId) : null;
  const resolvedTitle = title
    ? title
    : currentView === 'settings'
      ? t('mainMenu.settings', 'Настройки')
      : currentView === 'explore'
        ? t('sidebar.explore_treasures', 'В поисках сокровищ')
        : activeChat
          ? activeChat.type === 'group'
            ? activeChannelName
              ? `${activeChat.name} — #${activeChannelName.replace(/^#+/, '')}`
              : activeChat.name || 'Лобби'
            : activeChat.name || (activeChat.type === 'channel' ? t('titleBar.community', 'Сообщество') : t('titleBar.direct_messages', 'Личные сообщения'))
          : t('discord.friends', 'Друзья');

  useEffect(() => {
    if (!isElectron) return;
    const orbita = (window as any).orbita;

    const checkMaximized = async () => {
      try {
        if (orbita?.isWindowMaximized) {
          const result = await orbita.isWindowMaximized();
          setIsMaximized(result);
        }
      } catch {}
    };
    checkMaximized();

    let unsubscribe: (() => void) | undefined;
    try {
      if (orbita?.onWindowStateChange) {
        unsubscribe = orbita.onWindowStateChange((maximized: boolean) => {
          setIsMaximized(maximized);
          setIsHoverSuppressed(true);
        });
      }
    } catch {}

    const handleMouseMove = () => {
      setIsHoverSuppressed(false);
    };

    const handleBlur = () => {
      setIsHoverSuppressed(true);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('blur', handleBlur);

    return () => {
      unsubscribe?.();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const handleMinimize = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.minimizeWindow?.()); } catch {}
  };

  const handleMaximize = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.maximizeWindow?.()); } catch {}
  };

  const handleClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    setIsHoverSuppressed(true);
    if (onClose) {
      onClose();
      return;
    }
    if (useChatStore.getState().isRecordingVoice) {
      window.dispatchEvent(new CustomEvent('orbita:request-exit-app-voice'));
      return;
    }
    if (useChatStore.getState().isUploadingMedia) {
      window.dispatchEvent(new CustomEvent('orbita:request-exit-app-upload'));
      return;
    }
    flushStorageSet();
    try { ((window as any).orbita?.closeWindow?.()); } catch {}
  };

  const handleDoubleClick = () => {
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.doubleClickTitleBar?.()); } catch {}
  };

  const MinimizeIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );

  const MaximizeIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1.75" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );

  const RestoreIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 0.75H8C8.69 0.75 9.25 1.31 9.25 2V7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="0.75" y="2.5" width="6.75" height="6.75" rx="1.5" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );

  const btnClass = `orbita-titlebar-btn ${isHoverSuppressed ? 'hover-suppressed' : ''}`;

  if (!isElectron) {
    return null;
  }

  return (
    <div
      className={`relative flex items-center justify-between flex-shrink-0 select-none ${className || ''}`}
      style={{
        height: '30px',
        width: '100%',
        backgroundColor: 'var(--title-bar-bg, #121212)',
        padding: 0,
        margin: 0,
        WebkitAppRegion: 'drag',
        ...style,
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="flex items-center gap-1.5 pl-3 select-none pointer-events-none"
        style={{ ['WebkitAppRegion' as any]: 'drag' }}
      />

      {!hideTitle && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 text-xs text-[var(--text-dim,#949ba4)] font-medium pointer-events-none select-none max-w-[45%]"
          style={{
            top: 0,
            bottom: 0,
            ['WebkitAppRegion' as any]: 'no-drag',
          }}
        >
        {!title && currentView === 'settings' ? (
          <DiscordSettingsIcon size={14} className="shrink-0" />
        ) : !title && activeChat ? (
          activeChat.type === 'channel' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" className="shrink-0" aria-hidden="true">
              <path fill="currentColor" d="M5 13a1 1 0 0 1-2 0v-2a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2zm6.276-10.638a.5.5 0 0 1 .724.447v10.382a.5.5 0 0 1-.724.447L6 11V5zm3.171 4.362a1 1 0 0 1 .553.894v.764a1 1 0 0 1-.553.895L13 10V6z" />
            </svg>
          ) : activeChat.type === 'group' ? (
            <Hash size={14} className="shrink-0 text-[#949ba4]" />
          ) : (
            <OrbitIcon size={14} monochrome />
          )
        ) : (
          <OrbitIcon size={14} monochrome />
        )}
          <span className="truncate">{resolvedTitle}</span>
        </div>
      )}
      <div className="flex-1" />
      <style>{`
        .orbita-titlebar-btn {
          width: 24px;
          height: 24px;
          border: none;
          outline: none;
          border-radius: 7px;
          background: transparent;
          color: var(--titlebar-fg, #b0b0b0);
          cursor: pointer;
          padding: 0;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.14s ease, color 0.14s ease;
          -webkit-app-region: no-drag;
          user-select: none;
        }
        .orbita-titlebar-btn:not(.hover-suppressed):hover {
          background-color: var(--titlebar-hover-bg, rgba(255, 255, 255, 0.09));
          color: var(--titlebar-hover-fg, #ffffff);
        }
        .orbita-titlebar-btn:not(.hover-suppressed):active {
          background-color: var(--titlebar-active-bg, rgba(255, 255, 255, 0.16));
        }
        .orbita-titlebar-btn-close:not(.hover-suppressed):hover {
          background-color: rgba(239, 68, 68, 0.22);
          color: #f87171;
        }
        .orbita-titlebar-btn-close:not(.hover-suppressed):active {
          background-color: rgba(239, 68, 68, 0.34);
          color: #fca5a5;
        }
        .orbita-titlebar-btn:focus {
          outline: none;
        }
      `}</style>
      <div
        className="flex items-center h-full gap-1 pr-1.5"
        style={{
          height: '100%',
          ['WebkitAppRegion' as any]: 'no-drag',
        }}
      >
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            className={btnClass}
            onMouseEnter={() => setIsHelpHovered(true)}
            onMouseLeave={() => setIsHelpHovered(false)}
            aria-label={t('titleBar.help', 'Помощь')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <defs>
                <mask id="yesicon-icon-park-solid-help-SVGKI5kpbjS">
                  <g fill="none">
                    <path fill="#fff" stroke="#fff" strokeLinejoin="round" strokeWidth="4" d="M24 44a19.94 19.94 0 0 0 14.142-5.858A19.94 19.94 0 0 0 44 24a19.94 19.94 0 0 0-5.858-14.142A19.94 19.94 0 0 0 24 4A19.94 19.94 0 0 0 9.858 9.858A19.94 19.94 0 0 0 4 24a19.94 19.94 0 0 0 5.858 14.142A19.94 19.94 0 0 0 24 44Z" />
                    <path stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M24 28.625v-4a6 6 0 1 0-6-6" />
                    <path fill="#000" fillRule="evenodd" d="M24 37.625a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5" clipRule="evenodd" />
                  </g>
                </mask>
              </defs>
              <path fill="currentColor" d="M0 0h48v48H0z" mask="url(#yesicon-icon-park-solid-help-SVGKI5kpbjS)" />
            </svg>
          </button>
          {isHelpHovered && (
            <div
              className="absolute pointer-events-none select-none z-50 whitespace-nowrap"
              style={{
                top: 'calc(100% + 7px)',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#111214',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: '8px',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
                lineHeight: 1.2,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-5px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderBottom: '5px solid #111214',
                }}
              />
              {t('titleBar.help', 'Помощь')}
            </div>
          )}
        </div>

        <div
          style={{
            width: '1px',
            height: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.16)',
            margin: '0 6px 0 3px',
            flexShrink: 0,
          }}
        />

        <button
          onClick={handleMinimize}
          className={btnClass}
          aria-label={t('titleBar.minimize', 'Свернуть')}
        >
          <MinimizeIcon />
        </button>

        <button
          onClick={handleMaximize}
          className={btnClass}
          aria-label={isMaximized ? t('titleBar.restore', 'Восстановить') : t('titleBar.maximize', 'Развернуть')}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        <button
          onClick={handleClose}
          className={`${btnClass} orbita-titlebar-btn-close`}
          aria-label={t('titleBar.close', 'Закрыть')}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};
