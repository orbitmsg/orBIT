import React, { useMemo, memo, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia, calculateMediaDisplaySize } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { SmartGifPlayer } from './SmartGifPlayer';
import { orbitFs } from './chatUtils';
import { AnimatedVideoVolumeIcon } from './ChatIcons';
import { useAppVisibility } from '../../utils/appVisibility';

interface EncryptedMediaProps {
  url: string;
  type: 'image' | 'video';
  sharedSecret: string | undefined;
  chatId?: string;
  messageId?: string;
  width?: number;
  height?: number;
  duration?: number;
  timeNode?: React.ReactNode;
  isGif?: boolean;
  onContextMenu?: (e: React.MouseEvent, blobUrl: string) => void;
  onClick?: () => void;
  isOwn?: boolean;
  fileSize?: number;
  preview?: string;
  blurPreview?: string;
  thumbnail?: string;
}

export const EncryptedMedia = memo(({
  url,
  type,
  sharedSecret,
  chatId,
  messageId,
  width: msgWidth,
  height: msgHeight,
  duration,
  timeNode,
  isGif: isGifProp,
  onContextMenu,
  onClick,
  isOwn = false,
  fileSize,
  preview,
  blurPreview,
  thumbnail,
}: EncryptedMediaProps) => {
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia(type === 'image' ? 'photo' : 'video', fileSize, isOwn));
  const { blobUrl, load, isLoading, progress, isUnavailable } = useDecryptedMedia(url, sharedSecret, undefined, undefined, chatId, messageId, autoLoad);
  const bubbleRadius = useChatStore.getState().bubbleRadius;
  const { t } = useTranslation();
  const timeColor = isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)';

  const isAppVisible = useAppVisibility();
  const isMediaViewerOpen = useChatStore((s) => s.isMediaViewerOpen);
  const [inView, setInView] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isMuted, setIsMuted] = useState(true);
  const [videoDuration, setVideoDuration] = useState<number>(duration || 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const isDraggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const targetTimeRef = useRef(0);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldPlay = inView && isAppVisible && !isMediaViewerOpen;

  useEffect(() => {
    if (!blobUrl || !videoRef.current || isDraggingRef.current) return;
    if (shouldPlay) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [shouldPlay, blobUrl]);

  useEffect(() => {
    if (duration && duration > 0 && videoDuration === 0) {
      setVideoDuration(duration);
    }
  }, [duration, videoDuration]);

  const formatCountdown = useCallback((totalSec: number, curSec: number) => {
    const rem = Math.max(0, Math.ceil((totalSec || 0) - (curSec || 0)));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animId: number | null = null;
    let lastFormattedTime = '';

    const updateVisuals = () => {
      if (!isDraggingRef.current && video) {
        const cur = video.currentTime || 0;
        const tot = videoDuration || duration || video.duration || 0;
        if (tot > 0) {
          const pct = Math.min(100, Math.max(0, (cur / tot) * 100));
          if (progressFillRef.current) {
            progressFillRef.current.style.width = `${pct}%`;
          }
          const text = formatCountdown(tot, cur);
          if (countdownRef.current && lastFormattedTime !== text) {
            lastFormattedTime = text;
            countdownRef.current.textContent = text;
          }
        }
      }
      if (video && !video.paused && !video.ended) {
        animId = requestAnimationFrame(updateVisuals);
      } else {
        animId = null;
      }
    };

    const onPlay = () => {
      if (animId !== null) cancelAnimationFrame(animId);
      animId = requestAnimationFrame(updateVisuals);
    };

    const onPause = () => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      if (!isDraggingRef.current && video) {
        const cur = video.currentTime || 0;
        const tot = videoDuration || duration || video.duration || 0;
        if (tot > 0 && progressFillRef.current) {
          progressFillRef.current.style.width = `${Math.min(100, Math.max(0, (cur / tot) * 100))}%`;
        }
      }
    };

    const onTimeUpdate = () => {
      if (video.paused && !isDraggingRef.current) {
        const cur = video.currentTime || 0;
        const tot = videoDuration || duration || video.duration || 0;
        if (tot > 0) {
          if (progressFillRef.current) {
            progressFillRef.current.style.width = `${Math.min(100, Math.max(0, (cur / tot) * 100))}%`;
          }
          const text = formatCountdown(tot, cur);
          if (countdownRef.current && lastFormattedTime !== text) {
            lastFormattedTime = text;
            countdownRef.current.textContent = text;
          }
        }
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);

    if (!video.paused && !video.ended) {
      onPlay();
    }

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [videoDuration, duration, blobUrl, formatCountdown]);

  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
    };
  }, []);

  const applySeek = useCallback((clientX: number) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const tot = videoDuration || duration || videoRef.current.duration || 0;
    if (tot <= 0) return;

    const targetTime = ratio * tot;
    targetTimeRef.current = targetTime;

    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${ratio * 100}%`;
    }
    const text = formatCountdown(tot, targetTime);
    if (countdownRef.current && countdownRef.current.textContent !== text) {
      countdownRef.current.textContent = text;
    }

    if (!videoRef.current.seeking) {
      videoRef.current.currentTime = targetTime;
    }
  }, [videoDuration, duration, formatCountdown]);

  const handleSeeked = useCallback(() => {
    if (isDraggingRef.current && videoRef.current) {
      if (Math.abs(videoRef.current.currentTime - targetTimeRef.current) > 0.05) {
        videoRef.current.currentTime = targetTimeRef.current;
      }
    }
  }, []);

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingRef.current = true;
    wasPlayingRef.current = !!(videoRef.current && !videoRef.current.paused && !videoRef.current.ended);
    if (videoRef.current && wasPlayingRef.current) {
      videoRef.current.pause();
    }
    applySeek(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      ev.preventDefault();
      applySeek(ev.clientX);
    };

    const onMouseUp = () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
      }
      isDraggingRef.current = false;
      if (videoRef.current) {
        videoRef.current.currentTime = targetTimeRef.current;
        if (wasPlayingRef.current && shouldPlay) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current = cleanup;

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleProgressBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!e.touches[0]) return;
    isDraggingRef.current = true;
    wasPlayingRef.current = !!(videoRef.current && !videoRef.current.paused && !videoRef.current.ended);
    if (videoRef.current && wasPlayingRef.current) {
      videoRef.current.pause();
    }
    applySeek(e.touches[0].clientX);

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches[0]) applySeek(ev.touches[0].clientX);
    };

    const onTouchEnd = () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
      }
      isDraggingRef.current = false;
      if (videoRef.current) {
        videoRef.current.currentTime = targetTimeRef.current;
        if (wasPlayingRef.current && shouldPlay) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current = cleanup;

    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
  };

  const isFullRes = Boolean(preview || (thumbnail && !thumbnail.startsWith('data:')) || (thumbnail && thumbnail.startsWith('data:') && thumbnail.length > 2048));
  const fullResSrc = preview || thumbnail;
  const activeImageSrc = blobUrl || (url.startsWith('data:') || url.startsWith('blob:') ? url : (preview?.startsWith('data:') || preview?.startsWith('blob:') ? preview : null));

  const isGif = useMemo(() => {
    if (isGifProp !== undefined) return isGifProp;
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('.gif') ||
      lower.includes('image/gif') ||
      lower.includes('giphy.com') ||
      lower.includes('tenor.com')
    );
  }, [isGifProp, url]);

  const mediaSize = useMemo(() => calculateMediaDisplaySize(msgWidth, msgHeight, 440, 400), [msgWidth, msgHeight]);

  if (isGif) {
    return (
      <SmartGifPlayer
        blobUrl={blobUrl}
        width={msgWidth}
        height={msgHeight}
        clampedAspect={mediaSize.aspectRatio}
        bubbleRadius={bubbleRadius}
        timeNode={timeNode}
        onClick={onClick}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: `min(${mediaSize.width}px, 100%)`,
        maxWidth: '100%',
        aspectRatio: `${mediaSize.width} / ${mediaSize.height}`,
        maxHeight: `${mediaSize.height}px`,
        borderRadius: typeof bubbleRadius === 'number' ? `${Math.max(bubbleRadius, 20)}px` : '20px',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
        overflowAnchor: 'none',
      }}
    >
      {(!blobUrl && !activeImageSrc) && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center z-10 select-none ${isUnavailable ? 'pointer-events-none' : 'cursor-pointer'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!isLoading && !isUnavailable) load();
          }}
        >
          {isFullRes ? (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${fullResSrc})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
          ) : (blurPreview || thumbnail) ? (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${blurPreview || thumbnail})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                filter: 'blur(20px)',
                transform: 'scale(1.15)',
              }}
            />
          ) : (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.22), transparent 70%), radial-gradient(circle at 70% 70%, rgba(59, 130, 246, 0.18), transparent 70%), rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(20px)',
              }}
            />
          )}
          {!isUnavailable && (
            <div className="relative z-10 flex flex-col items-center gap-1.5 pointer-events-auto">
              <AudioCoverWithPlay
                cover={null}
                size={48}
                state={isLoading ? 'downloading' : 'download'}
                progress={isLoading ? progress : undefined}
                onClick={() => { if (!isLoading) load(); }}
                ariaLabel={isLoading ? 'Cancel download' : 'Download media'}
              />
              {fileSize && fileSize > 0 && !isLoading && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {(fileSize / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {type === 'image' ? (
        <img
          src={activeImageSrc || undefined}
          alt=""
          className="w-full h-full object-contain cursor-pointer"
          draggable={false}
          style={{ userSelect: 'none', display: 'block', opacity: activeImageSrc ? 1 : 0, transition: 'opacity 0.2s' }}
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            if (activeImageSrc) onContextMenu?.(e, activeImageSrc);
          }}
        />
      ) : (
        <div
          className="w-full h-full relative cursor-pointer group"
          onClick={() => {
            onClick?.();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (blobUrl) onContextMenu?.(e, blobUrl);
          }}
        >
          <video
            ref={videoRef}
            src={blobUrl || undefined}
            poster={preview || (thumbnail && (!thumbnail.startsWith('data:') || thumbnail.length > 2048) ? thumbnail : undefined)}
            className="w-full h-full object-contain pointer-events-none"
            preload="auto"
            autoPlay
            loop
            muted={isMuted}
            playsInline
            style={{ display: 'block', opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
            onSeeked={handleSeeked}
            onLoadedMetadata={(e) => {
              if (e.currentTarget.duration && isFinite(e.currentTarget.duration)) {
                setVideoDuration(e.currentTarget.duration);
              }
            }}
          />

          {blobUrl && (videoDuration > 0 || duration) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted((prev) => {
                  const next = !prev;
                  if (videoRef.current) {
                    videoRef.current.muted = next;
                    if (!next && shouldPlay) {
                      videoRef.current.play().catch(() => {});
                    }
                  }
                  return next;
                });
              }}
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(24, 25, 29, 0.75)',
                padding: '3px 8px',
                height: '22px',
                boxSizing: 'border-box',
                color: timeColor,
                fontSize: orbitFs(11),
                fontWeight: 400,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                lineHeight: 1,
                zIndex: 4,
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
                border: 'none',
                transition: 'background-color 0.15s',
              }}
              aria-label={isMuted ? t('mediaViewer.unmute', 'Включить звук') : t('mediaViewer.mute', 'Выключить звук')}
            >
              <span ref={countdownRef} className="tabular-nums select-none" style={{ color: timeColor, fontSize: orbitFs(11), lineHeight: 1, userSelect: 'none', WebkitUserSelect: 'none' }}>
                {formatCountdown(videoDuration || duration || 0, videoRef.current?.currentTime || 0)}
              </span>
              <AnimatedVideoVolumeIcon isMuted={isMuted} size={16} style={{ color: timeColor, transform: 'translateY(1px)' }} />
            </div>
          )}

          {blobUrl && (videoDuration > 0 || duration) && (
            <div
              ref={progressBarRef}
              onMouseDown={handleProgressBarMouseDown}
              onTouchStart={handleProgressBarTouchStart}
              onClick={(e) => {
                e.stopPropagation();
              }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '14px',
                display: 'flex',
                alignItems: 'flex-end',
                cursor: 'pointer',
                zIndex: 5,
                userSelect: 'none',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '5px',
                  backgroundColor: 'rgba(255, 255, 255, 0.22)',
                  overflow: 'hidden',
                }}
              >
                <div
                  ref={progressFillRef}
                  style={{
                    height: '100%',
                    width: `${(videoDuration || duration || 0) > 0 ? Math.min(100, Math.max(0, ((videoRef.current?.currentTime || 0) / (videoDuration || duration || 1)) * 100)) : 0}%`,
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    willChange: 'width',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {timeNode && (
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '8px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(24, 25, 29, 0.75)',
            padding: '3px 8px',
            height: '22px',
            boxSizing: 'border-box',
            color: timeColor,
            fontSize: orbitFs(11),
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            zIndex: 4,
            pointerEvents: 'none',
            userSelect: 'none',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          }}
        >
          {timeNode}
        </div>
      )}
    </div>
  );
});
