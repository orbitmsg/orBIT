import React, { RefObject, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Volume2,
  VolumeX,
  Settings,
  Check,
} from 'lucide-react';
import { formatVideoTime } from './types';

interface MediaViewerVideoControlsProps {
  carouselItemsLength: number;
  isPlaying: boolean;
  areControlsVisible: boolean;
  isVideoControlsHovered: boolean;
  isVideoProgressHovered: boolean;
  isMuted: boolean;
  volume?: number;
  playbackRate: number;
  currentTime: number;
  duration: number;
  videoProgressRef: RefObject<HTMLDivElement | null>;
  videoProgressFillRef: RefObject<HTMLDivElement | null>;
  videoTimeDisplayRef: RefObject<HTMLSpanElement | null>;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange?: (newVolume: number) => void;
  onSelectSpeed?: (speed: number) => void;
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
  volume = 1,
  playbackRate,
  currentTime,
  duration,
  videoProgressRef,
  videoProgressFillRef,
  videoTimeDisplayRef,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onSelectSpeed,
  onProgressMouseDown,
  onProgressTouchStart,
  setIsVideoControlsHovered,
  setIsVideoProgressHovered,
}) => {
  const { t } = useTranslation();
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [showRemaining, setShowRemaining] = useState(true);
  const volumeTrackRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  const speedPresets = [
    { speed: 0.5, label: t('mediaViewer.speedSlow', 'Медленно') },
    { speed: 1.0, label: t('mediaViewer.speedNormal', 'По умолчанию') },
    { speed: 1.2, label: t('mediaViewer.speedFast', 'Ускоренно') },
    { speed: 1.5, label: t('mediaViewer.speedFaster', 'Быстро') },
    { speed: 1.7, label: t('mediaViewer.speedVeryFast', 'Очень быстро') },
    { speed: 2.0, label: t('mediaViewer.speedSuperFast', 'Сверхбыстро') },
  ];

  useEffect(() => {
    if (!isSpeedMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setIsSpeedMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isSpeedMenuOpen]);

  const updateVolumeFromEvent = useCallback((clientX: number) => {
    if (!volumeTrackRef.current || !onVolumeChange) return;
    const rect = volumeTrackRef.current.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const newVol = rect.width > 0 ? clampedX / rect.width : 0;
    onVolumeChange(Math.max(0, Math.min(1, newVol)));
  }, [onVolumeChange]);

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    updateVolumeFromEvent(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      updateVolumeFromEvent(ev.clientX);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleVolumeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.touches[0]) updateVolumeFromEvent(e.touches[0].clientX);

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches[0]) updateVolumeFromEvent(ev.touches[0].clientX);
    };
    const onTouchEnd = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
  };

  const currentVol = isMuted ? 0 : volume;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: carouselItemsLength > 1 ? 75 : 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(440px, calc(100% - 32px))',
        padding: '10px 18px 9px 18px',
        backgroundColor: 'rgba(24, 24, 27, 0.94)',
        backdropFilter: 'blur(20px)',
        borderRadius: '10px',
        border: 'none',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        color: '#ffffff',
        opacity: (!isPlaying || areControlsVisible || isVideoControlsHovered || isSpeedMenuOpen) ? 1 : 0,
        pointerEvents: (!isPlaying || areControlsVisible || isVideoControlsHovered || isSpeedMenuOpen) ? 'auto' : 'none',
        transition: 'opacity 0.15s ease',
        boxShadow: 'none',
        zIndex: 120,
        boxSizing: 'border-box',
      }}
      onMouseEnter={() => setIsVideoControlsHovered(true)}
      onMouseLeave={() => setIsVideoControlsHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          <div
            ref={volumeTrackRef}
            onMouseDown={handleVolumeMouseDown}
            onTouchStart={handleVolumeTouchStart}
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
            style={{
              position: 'relative',
              width: '56px',
              height: '14px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            aria-label="Volume"
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '3px',
                backgroundColor: 'rgba(255, 255, 255, 0.22)',
                borderRadius: '999px',
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${currentVol * 100}%`,
                  backgroundColor: 'var(--accent-color, #7C3AED)',
                  borderRadius: '999px',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    right: '-4px',
                    top: '50%',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    opacity: isVolumeHovered ? 1 : 0,
                    transform: isVolumeHovered ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0)',
                    transition: 'opacity 0.12s ease, transform 0.12s ease',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          </div>
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
            width: '36px',
            height: '36px',
            borderRadius: '999px',
            padding: 0,
            opacity: 0.95,
            transition: 'opacity 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.95';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            style={{
              width: '22px',
              height: '22px',
              overflow: 'visible',
              display: 'block',
            }}
          >
            <path
              fill="#ffffff"
              d="M133 440a35.37 35.37 0 0 1-17.5-4.67c-12-6.8-19.46-20-19.46-34.33V111c0-14.37 7.46-27.53 19.46-34.33a35.13 35.13 0 0 1 35.77.45l247.85 148.36a36 36 0 0 1 0 61l-247.89 148.4A35.5 35.5 0 0 1 133 440"
              style={{
                transformOrigin: '256px 256px',
                transform: isPlaying ? 'scale(0.5) rotate(90deg)' : 'scale(1) rotate(0deg)',
                opacity: isPlaying ? 0 : 1,
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
              }}
            />
            <g
              fill="#ffffff"
              style={{
                transformOrigin: '256px 256px',
                transform: isPlaying ? 'scale(1) rotate(0deg)' : 'scale(0.5) rotate(-90deg)',
                opacity: isPlaying ? 1 : 0,
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
              }}
            >
              <rect x="120" y="72" width="96" height="368" rx="36" ry="36" />
              <rect x="296" y="72" width="96" height="368" rx="36" ry="36" />
            </g>
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 64, justifyContent: 'flex-end', position: 'relative' }}>

          <button
            type="button"
            onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
            aria-label={t('mediaViewer.playbackSpeed', 'Скорость воспроизведения')}
            style={{
              background: isSpeedMenuOpen ? 'rgba(255, 255, 255, 0.2)' : 'none',
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
              opacity: isSpeedMenuOpen ? 1 : 0.85,
              transition: 'opacity 0.15s, background-color 0.15s',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = isSpeedMenuOpen ? '1' : '0.85'; }}
          >
            <Settings size={17} />
          </button>

          {isSpeedMenuOpen && (
            <div
              ref={speedMenuRef}
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 14px)',
                right: 0,
                width: '210px',
                padding: '12px 14px',
                backgroundColor: 'rgba(28, 30, 36, 0.96)',
                backdropFilter: 'blur(20px)',
                borderRadius: '14px',
                border: 'none',
                outline: 'none',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginBottom: 10 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', minWidth: '32px' }}>
                  {playbackRate}x
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={playbackRate}
                  onChange={(e) => onSelectSpeed?.(parseFloat(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: 'var(--accent-color, #7C3AED)',
                    cursor: 'pointer',
                    height: '4px',
                  }}
                  aria-label={t('mediaViewer.playbackSpeed', 'Скорость воспроизведения')}
                />
              </div>

              <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 6 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {speedPresets.map((preset) => {
                  const isSelected = Math.abs(playbackRate - preset.speed) < 0.05;
                  return (
                    <button
                      key={preset.speed}
                      type="button"
                      onClick={() => {
                        onSelectSpeed?.(preset.speed);
                        setIsSpeedMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: 'none',
                        border: 'none',
                        outline: 'none',
                        color: isSelected ? 'var(--accent-color, #a78bfa)' : '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 600 : 500,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background-color 0.12s',
                      }}
                      className="hover:bg-white/10"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ opacity: isSelected ? 1 : 0.7, width: 30 }}>{preset.speed}x</span>
                        <span>{preset.label}</span>
                      </div>
                      {isSelected && <Check size={15} color="var(--accent-color, #a78bfa)" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10 }}>
        <span
          ref={videoTimeDisplayRef}
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.75)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 36,
            userSelect: 'none',
          }}
        >
          {formatVideoTime(currentTime)}
        </span>

        <div
          ref={videoProgressRef}
          onMouseDown={onProgressMouseDown}
          onTouchStart={onProgressTouchStart}
          onMouseEnter={() => setIsVideoProgressHovered(true)}
          onMouseLeave={() => setIsVideoProgressHovered(false)}
          style={{
            position: 'relative',
            flex: 1,
            height: '14px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
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
                  width: isVideoProgressHovered ? '10px' : '8px',
                  height: isVideoProgressHovered ? '10px' : '8px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-color, #7C3AED)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  opacity: isVideoProgressHovered ? 1 : 0,
                  transform: isVideoProgressHovered ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0)',
                  transition: 'opacity 0.12s ease, transform 0.12s ease',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </div>

        <span
          onClick={() => setShowRemaining((prev) => !prev)}
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.75)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 36,
            textAlign: 'right',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {showRemaining ? `-${formatVideoTime(Math.max(0, duration - currentTime))}` : formatVideoTime(duration || 0)}
        </span>
      </div>
    </div>
  );
};
