import React from 'react';
import { useTranslation } from 'react-i18next';

interface MediaViewerHeaderProps {
  areControlsVisible: boolean;
  isWindowMaximized: boolean;
  onClose: () => void;
}

export const MediaViewerHeader: React.FC<MediaViewerHeaderProps> = ({
  areControlsVisible,
  isWindowMaximized,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 8px',
        zIndex: 1000,
        background: 'transparent',
        opacity: areControlsVisible ? 1 : 0,
        pointerEvents: areControlsVisible ? 'auto' : 'none',
        transition: 'none',
        ...({ WebkitAppRegion: areControlsVisible ? 'drag' : 'no-drag' } as React.CSSProperties),
      }}
      onDoubleClick={() => {
        if (areControlsVisible) {
          try { ((window as any).orbita?.doubleClickTitleBar?.()); } catch { }
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
        }}
      >
        <button
          onClick={() => {
            try { ((window as any).orbita?.minimizeWindow?.()); } catch { }
          }}
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            color: '#ffffff',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s, color 0.15s',
          }}
          className="hover:bg-white/15 hover:text-white"
          aria-label={t('window.minimize', 'Свернуть')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 10H11" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
          </svg>
        </button>

        <button
          onClick={() => {
            try { ((window as any).orbita?.maximizeWindow?.()); } catch { }
          }}
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            color: '#ffffff',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s, color 0.15s',
          }}
          className="hover:bg-white/15 hover:text-white"
          aria-label={isWindowMaximized ? t('window.restore', 'Восстановить') : t('window.maximize', 'Развернуть')}
        >
          {isWindowMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4.5 1.5H10.5V7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
              <rect x="1.5" y="4.5" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>

        <button
          onClick={onClose}
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            color: '#ffffff',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s, color 0.15s',
          }}
          className="hover:bg-red-500/30 hover:text-red-300"
          aria-label={t('common.close', 'Закрыть')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
          </svg>
        </button>
      </div>
    </div>
  );
};
