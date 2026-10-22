import React from 'react';
import { Play, Pause } from 'lucide-react';

export type AudioCoverState = 'play' | 'pause' | 'download' | 'downloading' | 'uploading' | 'file' | 'done';

interface AudioCoverWithPlayProps {
  cover: string | null;
  isPlayingTrack?: boolean;
  size?: number;
  onClick?: () => void;
  onCancel?: () => void;
  state?: AudioCoverState;
  progress?: number;
  customIcon?: React.ReactNode;
  isOwn?: boolean;
  ariaLabel?: string;
}

export const AudioCoverWithPlay: React.FC<AudioCoverWithPlayProps> = ({
  cover,
  isPlayingTrack,
  size = 40,
  onClick,
  onCancel,
  state = 'play',
  progress,
  customIcon,
  isOwn = false,
  ariaLabel,
}) => {
  const iconSize = Math.round(size * 0.42);
  const strokeW = size >= 48 ? 3.5 : (size >= 40 ? 3 : 2.5);
  const radius = Math.max(2, size / 2 - 4);
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(1, typeof progress === 'number' && isFinite(progress) ? progress : 0));
  const dashOffset = circumference * (1 - clampedProgress);

  const handleClick = (e: React.MouseEvent) => {
    if (state === 'uploading' || state === 'downloading') {
      if (onCancel) {
        e.stopPropagation();
        onCancel();
        return;
      }
    }
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  const renderContent = () => {
    if (state === 'uploading') {
      return (
        <>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              transform: 'rotate(-90deg)',
            }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={strokeW}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--accent-color, #6c5ce7)"
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                willChange: 'stroke-dashoffset',
                transition: 'stroke-dashoffset 0.14s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width={Math.round(size * 0.46)} height={Math.round(size * 0.46)} fill="none" stroke="var(--accent-color, #6c5ce7)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
        </>
      );
    }

    if (state === 'downloading') {
      return (
        <>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              transform: 'rotate(-90deg)',
              animation: 'spin-ring 1.4s linear infinite',
            }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={strokeW}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--accent-color, #6c5ce7)"
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                willChange: 'stroke-dashoffset',
                transition: 'stroke-dashoffset 0.14s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width={Math.round(size * 0.42)} height={Math.round(size * 0.42)}>
              <rect x="7" y="7" width="10" height="10" rx="2" fill="#ffffff" />
            </svg>
          </div>
        </>
      );
    }

    if (state === 'done') {
      return (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.46)} height={Math.round(size * 0.46)} fill="none" stroke="#00b894" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      );
    }

    if (state === 'download') {
      return (
        <>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={strokeW}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width={Math.round(size * 0.46)} height={Math.round(size * 0.46)} fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
            </svg>
          </div>
        </>
      );
    }

    if (customIcon) return customIcon;

    if (state === 'file') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={iconSize} height={iconSize}>
          <path fill="currentColor" d="M9 5.5A1.5 1.5 0 0 0 10.5 7H14v5.25A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2H9zm1-3.42c.27.083.517.23.72.433l2.767 2.767c.203.203.35.45.434.72H10.5a.5.5 0 0 1-.5-.5z"/>
        </svg>
      );
    }

    if (isPlayingTrack || state === 'pause') {
      return <Pause size={iconSize} fill="currentColor" strokeWidth={0} />;
    }

    return <Play size={iconSize} fill="currentColor" strokeWidth={0} style={{ transform: 'translateX(1px)' }} />;
  };

  return (
    <div
      role="button"
      aria-label={ariaLabel}
      onClick={handleClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        backgroundColor: cover ? 'transparent' : (state === 'done' ? 'rgba(0, 184, 148, 0.15)' : (isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(45, 48, 62, 0.9)')),
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
      }}
    >
      {cover ? (
        <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {renderContent()}
        </div>
      )}
      {cover && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            color: '#fff',
          }}
        >
          {renderContent()}
        </div>
      )}
    </div>
  );
};