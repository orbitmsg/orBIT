import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, flushStorageSet } from '../../store/useChatStore';

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
  onClose?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ title, onClose, style, className }) => {
  const { t } = useTranslation();
  const isElectron = isElectronApp();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoverSuppressed, setIsHoverSuppressed] = useState(false);

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
      <rect x="0.75" y="2.5" width="6.75" height="6.75" rx="1.5" stroke="currentColor" strokeWidth="1.1" fill="var(--title-bar-bg, var(--md-surface, #2a253b))" />
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
        backgroundColor: 'var(--title-bar-bg, var(--md-surface, #2a253b))',
        padding: 0,
        margin: 0,
        WebkitAppRegion: 'drag',
        ...style,
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 text-xs text-[var(--text-dim,#949ba4)] font-medium pointer-events-none select-none"
        style={{
          top: 0,
          bottom: 0,
          ['WebkitAppRegion' as any]: 'no-drag',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#949ba4] shrink-0">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>{title || t('discord.friends', 'Друзья')}</span>
      </div>
      <div className="flex-1" />
      <style>{`
        .orbita-titlebar-btn {
          width: 30px;
          height: 22px;
          border: none;
          outline: none;
          border-radius: 9999px;
          background: transparent;
          color: var(--text-dim, #9f96b3);
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
          background-color: rgba(255, 255, 255, 0.09);
          color: var(--text-main, #ffffff);
        }
        .orbita-titlebar-btn:not(.hover-suppressed):active {
          background-color: rgba(255, 255, 255, 0.16);
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
        <button
          onClick={handleMinimize}
          className={btnClass}
          aria-label="Minimize"
        >
          <MinimizeIcon />
        </button>

        <button
          onClick={handleMaximize}
          className={btnClass}
          aria-label="Maximize"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        <button
          onClick={handleClose}
          className={`${btnClass} orbita-titlebar-btn-close`}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};
