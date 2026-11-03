import React, { useRef, useState, useCallback, useEffect } from 'react';
import '@material/web/progress/linear-progress.js';
import type { MdLinearProgress } from '@material/web/progress/linear-progress.js';

interface MaterialProgressBarProps {
  value: number;
  max?: number;
  buffer?: number;
  indeterminate?: boolean;
  interactive?: boolean;
  onSeek?: (newFraction: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (finalFraction: number) => void;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  trackHeight?: number;
  hoverHeight?: number;
  activeColor?: string;
  trackColor?: string;
  showThumb?: boolean;
  forwardedProgressRef?: React.RefObject<HTMLDivElement | null>;
  forwardedFillRef?: React.RefObject<HTMLDivElement | null>;
  thumbRef?: React.RefObject<HTMLDivElement | null>;
}

export const MaterialProgressBar: React.FC<MaterialProgressBarProps> = ({
  value,
  max = 1,
  buffer = 0,
  indeterminate = false,
  interactive = true,
  onSeek,
  onDragStart,
  onDragEnd,
  ariaLabel,
  className = '',
  style,
  trackHeight = 4,
  hoverHeight = 6,
  activeColor,
  trackColor,
  showThumb = true,
  forwardedProgressRef,
  forwardedFillRef,
  thumbRef,
}) => {
  const localContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = forwardedProgressRef || localContainerRef;
  const mdLinearRef = useRef<MdLinearProgress>(null);
  const localFillRef = useRef<HTMLDivElement>(null);
  const fillRef = forwardedFillRef || localFillRef;
  const localThumbRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = thumbRef || localThumbRef;

  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const lastFractionRef = useRef(0);

  const normalizedFraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  useEffect(() => {
    if (mdLinearRef.current && !isDraggingRef.current) {
      mdLinearRef.current.value = normalizedFraction;
      if (buffer > 0) {
        mdLinearRef.current.buffer = Math.max(0, Math.min(1, buffer / max));
      }
    }
  }, [normalizedFraction, buffer, max]);

  const updateFromPointer = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    lastFractionRef.current = fraction;

    if (mdLinearRef.current) {
      mdLinearRef.current.value = fraction;
    }
    if (fillRef.current) {
      fillRef.current.style.width = `${fraction * 100}%`;
    }
    if (activeThumbRef.current) {
      activeThumbRef.current.style.left = `${fraction * 100}%`;
    }
    onSeek?.(fraction);
  }, [containerRef, fillRef, activeThumbRef, onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    onDragStart?.();
    updateFromPointer(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      updateFromPointer(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onDragEnd?.(lastFractionRef.current);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [interactive, updateFromPointer, onDragStart, onDragEnd]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive || !e.touches[0]) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    onDragStart?.();
    updateFromPointer(e.touches[0].clientX);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (!isDraggingRef.current || !moveEvent.touches[0]) return;
      updateFromPointer(moveEvent.touches[0].clientX);
    };

    const handleTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      onDragEnd?.(lastFractionRef.current);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  }, [interactive, updateFromPointer, onDragStart, onDragEnd]);

  const isExpanded = isHovered || isDragging;
  const currentTrackHeight = isExpanded ? hoverHeight : trackHeight;

  const resolvedActiveColor = activeColor || 'var(--md-sys-color-primary, var(--accent-color, #7C3AED))';
  const resolvedTrackColor = trackColor || 'var(--md-sys-color-surface-container-highest, rgba(255, 255, 255, 0.16))';

  return (
    <div
      ref={containerRef}
      className={`material-progress-container ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={ariaLabel}
      role={interactive ? 'slider' : 'progressbar'}
      aria-valuenow={Math.round(normalizedFraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: 'relative',
        width: '100%',
        height: `${Math.max(14, currentTrackHeight + 10)}px`,
        display: 'flex',
        alignItems: 'center',
        cursor: interactive ? 'pointer' : 'default',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${currentTrackHeight}px`,
          borderRadius: '9999px',
          overflow: 'hidden',
          backgroundColor: resolvedTrackColor,
          transition: 'height 0.15s cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <md-linear-progress
          ref={mdLinearRef}
          value={normalizedFraction}
          max={1}
          buffer={buffer > 0 ? buffer / max : 0}
          indeterminate={indeterminate}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            '--md-linear-progress-active-indicator-color': resolvedActiveColor,
            '--md-linear-progress-track-color': resolvedTrackColor,
            '--md-linear-progress-track-height': `${currentTrackHeight}px`,
            '--md-linear-progress-active-indicator-height': `${currentTrackHeight}px`,
            '--md-linear-progress-track-shape': '9999px',
          } as React.CSSProperties}
        />
        <div
          ref={fillRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${normalizedFraction * 100}%`,
            backgroundColor: resolvedActiveColor,
            borderRadius: '9999px',
            pointerEvents: 'none',
            willChange: 'width',
          }}
        />
      </div>

      {showThumb && interactive && (
        <div
          ref={activeThumbRef}
          style={{
            position: 'absolute',
            left: `${normalizedFraction * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: isDragging ? 'none' : 'left 0.05s linear',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '28px',
              height: '28px',
              borderRadius: '9999px',
              backgroundColor: resolvedActiveColor,
              opacity: isDragging ? 0.16 : isHovered ? 0.08 : 0,
              transform: isExpanded ? 'scale(1)' : 'scale(0)',
              transition: 'transform 0.15s cubic-bezier(0.2, 0, 0, 1), opacity 0.15s ease',
            }}
          />
          <div
            style={{
              width: isExpanded ? '12px' : '4px',
              height: isExpanded ? '12px' : `${currentTrackHeight}px`,
              borderRadius: '9999px',
              backgroundColor: resolvedActiveColor,
              boxShadow: isExpanded ? '0 1px 3px rgba(0, 0, 0, 0.4)' : 'none',
              transform: isExpanded ? 'scale(1)' : 'scale(0.8)',
              transition: 'width 0.15s ease, height 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
            }}
          />
        </div>
      )}
    </div>
  );
};
