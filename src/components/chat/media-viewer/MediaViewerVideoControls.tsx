import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { formatVideoTime } from './types';

interface MediaViewerVideoControlsProps {
  carouselItemsLength: number;
  isPlaying: boolean;
  areControlsVisible: boolean;
  isVideoControlsHovered: boolean;
  isVideoProgressHovered: boolean;
  isMuted: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  videoProgressRef: RefObject<HTMLDivElement | null>;
  videoProgressFillRef: RefObject<HTMLDivElement | null>;
  videoTimeDisplayRef: RefObject<HTMLSpanElement | null>;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onCycleSpeed: () => void;
  onProgressMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onProgressTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  setIsVideoControlsHovered: (hovered: boolean) => void;
  setIsVideoProgressHovered: (hovered: boolean) => void;
}

export const MediaViewerVideoControls: React.FC<MediaViewerVideoControlsProps> = ({
  carouselItemsLength,
  isPlaying,
  areControlsVisible,
  isVideoControlsHovered,
  isVideoProgressHovered,
  isMuted,
  playbackRate,
  currentTime,
  duration,
  videoProgressRef,
  videoProgressFillRef,
  videoTimeDisplayRef,
  onTogglePlay,
  onToggleMute,
  onCycleSpeed,
  onProgressMouseDown,
  onProgressTouchStart,
  setIsVideoControlsHovered,
  setIsVideoProgressHovered,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: carouselItemsLength > 1 ? 75 : 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(420px, calc(100% - 32px))',
        padding: '6px 18px 7px 18px',
        backgroundColor: 'rgba(28, 28, 28, 0.88)',
        backdropFilter: 'blur(20px)',
        borderRadius: '999px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        color: '#ffffff',
        opacity: (!isPlaying || areControlsVisible || isVideoControlsHovered) ? 1 : 0,
        pointerEvents: (!isPlaying || areControlsVisible || isVideoControlsHovered) ? 'auto' : 'none',
        transition: 'opacity 0.15s ease',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
        zIndex: 120,
        boxSizing: 'border-box',
      }}
      onMouseEnter={() => setIsVideoControlsHovered(true)}
      onMouseLeave={() => setIsVideoControlsHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 32 }}>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? t('mediaViewer.unmute', 'Включить звук') : t('mediaViewer.mute', 'Выключить звук')}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '999px',
              opacity: isMuted ? 0.6 : 0.95,
              transition: 'opacity 0.15s',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = isMuted ? '0.6' : '0.95'; }}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? t('mediaViewer.pause', 'Пауза') : t('mediaViewer.play', 'Воспроизведение')}
          style={{
            background: 'none',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '999px',
            padding: 0,
            opacity: 0.95,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.95'; }}
        >
          {isPlaying ? (
            <Pause size={22} fill="white" />
          ) : (
            <Play size={22} fill="white" style={{ marginLeft: 2 }} />
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 32 }}>
          <button
            type="button"
            onClick={onCycleSpeed}
            aria-label={t('mediaViewer.playbackSpeed', 'Скорость воспроизведения')}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'; }}
          >
            {playbackRate}x
          </button>
        </div>
      </div>

      <div
        ref={videoProgressRef}
        onMouseDown={onProgressMouseDown}
        onTouchStart={onProgressTouchStart}
        onMouseEnter={() => setIsVideoProgressHovered(true)}
        onMouseLeave={() => setIsVideoProgressHovered(false)}
        style={{
          position: 'relative',
          width: '100%',
          height: '10px',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          margin: '1px 0',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: isVideoProgressHovered ? '4px' : '3px',
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            borderRadius: '999px',
            transition: 'height 0.12s ease',
            overflow: 'visible',
          }}
        >
          <div
            ref={videoProgressFillRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              backgroundColor: 'var(--accent-color, #7C3AED)',
              borderRadius: '999px',
              willChange: 'width',
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: '-5px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: isVideoProgressHovered ? '10px' : '8px',
                height: isVideoProgressHovered ? '10px' : '8px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                transition: 'width 0.12s ease, height 0.12s ease',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums', padding: '0 4px', height: '14px' }}>
        <span ref={videoTimeDisplayRef}>
          {formatVideoTime(currentTime)}/{formatVideoTime(duration || 0)}
        </span>
      </div>
    </div>
  );
};
