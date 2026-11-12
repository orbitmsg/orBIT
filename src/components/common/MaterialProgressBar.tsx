import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface MaterialProgressBarHandle {
  setProgress: (fraction: number) => void;
  setPlaying: (playing: boolean) => void;
}

interface MaterialProgressBarProps {
  value: number;
  max?: number;
  isPlaying?: boolean;
  interactive?: boolean;
  onSeek?: (newFraction: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (finalFraction: number) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  height?: number;
  activeColor?: string;
  trackColor?: string;
  showThumb?: boolean;
  forwardedContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export const MaterialProgressBar = forwardRef<MaterialProgressBarHandle, MaterialProgressBarProps>(({
  value,
  max = 1,
  isPlaying = false,
  interactive = true,
  onSeek,
  onDragStart,
  onDragEnd,
  onMouseDown,
  onTouchStart,
  ariaLabel,
  className = '',
  style,
  height = 14,
  activeColor,
  trackColor,
  showThumb = true,
  forwardedContainerRef,
}, ref) => {
  const localContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = forwardedContainerRef || localContainerRef;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isHovered, setIsHovered] = useState(false);

  const isDraggingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const fractionRef = useRef(max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);
  const amplitudeRef = useRef(isPlaying ? 3.5 : 0);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      fractionRef.current = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    }
  }, [value, max]);

  useImperativeHandle(ref, () => ({
    setProgress: (newFraction: number) => {
      if (!isDraggingRef.current) {
        fractionRef.current = Math.max(0, Math.min(1, newFraction));
      }
    },
    setPlaying: (playing: boolean) => {
      isPlayingRef.current = playing;
    },
  }), []);

  const updateFromPointer = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    fractionRef.current = fraction;
    onSeek?.(fraction);
  }, [containerRef, onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(e);
    if (!interactive) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    onDragStart?.();
    updateFromPointer(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      updateFromPointer(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onDragEnd?.(fractionRef.current);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [interactive, updateFromPointer, onDragStart, onDragEnd, onMouseDown]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    onTouchStart?.(e);
    if (!interactive || !e.touches[0]) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    onDragStart?.();
    updateFromPointer(e.touches[0].clientX);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (!isDraggingRef.current || !moveEvent.touches[0]) return;
      updateFromPointer(moveEvent.touches[0].clientX);
    };

    const handleTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      onDragEnd?.(fractionRef.current);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  }, [interactive, updateFromPointer, onDragStart, onDragEnd, onTouchStart]);

  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = (now: number) => {
      if (!isRunning) return;

      const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const targetAmplitude = isPlayingRef.current ? 3.5 : 0;
      amplitudeRef.current += (targetAmplitude - amplitudeRef.current) * Math.min(1, dt * 10);

      if (isPlayingRef.current || amplitudeRef.current > 0.05) {
        phaseRef.current -= dt * 18;
      }

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const expectedWidth = Math.round(rect.width * dpr);
      const expectedHeight = Math.round(rect.height * dpr);

      if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
        canvas.width = expectedWidth;
        canvas.height = expectedHeight;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const width = rect.width;
      const h = rect.height;
      const centerY = h / 2;
      const fraction = fractionRef.current;
      const progressX = Math.max(0, Math.min(width, fraction * width));

      const isCurrentHovered = isHoveredRef.current;
      const isCurrentDragging = isDraggingRef.current;
      const isExpanded = isCurrentHovered || isCurrentDragging;

      const strokeW = isExpanded ? 5 : 4;
      let computedActive = '#5865F2';
      let computedTrack = 'rgba(255, 255, 255, 0.16)';

      const containerEl = containerRef.current;
      if (containerEl) {
        const comp = getComputedStyle(containerEl);
        computedActive = activeColor || comp.getPropertyValue('--player-progress').trim() || comp.getPropertyValue('--accent-color').trim() || '#7C3AED';
        computedTrack = trackColor || comp.getPropertyValue('--player-track-bg').trim() || comp.getPropertyValue('--surface-muted').trim() || 'rgba(255, 255, 255, 0.16)';
      }

      if (progressX < width) {
        ctx.beginPath();
        ctx.moveTo(progressX, centerY);
        ctx.lineTo(width, centerY);
        ctx.strokeStyle = computedTrack;
        ctx.lineWidth = strokeW;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      if (progressX > 0) {
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        const currentAmp = amplitudeRef.current;
        const currentPhase = phaseRef.current;
        const wavelength = 32;
        const step = 2;

        for (let x = 0; x <= progressX; x += step) {
          const taperStart = Math.min(1, x / 16);
          const taperEnd = Math.min(1, (progressX - x) / 16);
          const taper = taperStart * taperEnd;
          const y = centerY + Math.sin((x / wavelength) * 2 * Math.PI + currentPhase) * currentAmp * taper;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(progressX, centerY);

        ctx.strokeStyle = computedActive;
        ctx.lineWidth = strokeW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      if (showThumb) {
        if (isExpanded) {
          ctx.beginPath();
          ctx.arc(progressX, centerY, 13, 0, Math.PI * 2);
          ctx.fillStyle = computedActive;
          ctx.globalAlpha = isCurrentDragging ? 0.22 : 0.12;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }

        const thumbRadius = isExpanded ? 6 : 3.5;
        ctx.beginPath();
        ctx.arc(progressX, centerY, thumbRadius, 0, Math.PI * 2);
        ctx.fillStyle = computedActive;
        if (isExpanded) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 1;
        }
        ctx.fill();
        ctx.shadowColor = 'transparent';
      }

      ctx.restore();

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [showThumb, activeColor, trackColor]);

  const normalizedFraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <div
      ref={containerRef}
      className={`material-wavy-progress-container ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={interactive ? 'slider' : 'progressbar'}
      aria-label={ariaLabel}
      aria-valuenow={Math.round(normalizedFraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: 'relative',
        width: '100%',
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        cursor: interactive ? 'pointer' : 'default',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

MaterialProgressBar.displayName = 'MaterialProgressBar';
