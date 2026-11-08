import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaItem, Message, useChatStore } from '../../store/useChatStore';
import { useUploadProgressStore } from '../../store/useUploadProgressStore';
import { useDecryptedMedia, calculateMediaDisplaySize } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { orbitFs } from './chatUtils';
import { AnimatedVideoVolumeIcon } from './ChatIcons';
import { useAppVisibility } from '../../utils/appVisibility';

interface TelegramAlbumGridProps {
  items: MediaItem[];
  sharedSecret: string | undefined;
  msg: Message;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  onMediaClick: (index: number) => void;
  maxWidth?: number;
  customRadius?: string;
}

const AlbumTile = memo(({
  item,
  itemIdx,
  sharedSecret,
  onClick,
  style,
  isOwn = false,
  msg,
  isSingle = false,
  onDimensionsLoaded,
}: {
  item: MediaItem;
  itemIdx: number;
  sharedSecret: string | undefined;
  onClick: () => void;
  style: React.CSSProperties;
  isOwn?: boolean;
  msg: Message;
  isSingle?: boolean;
  onDimensionsLoaded?: (width: number, height: number, itemIdx: number) => void;
}) => {
  const { t } = useTranslation();
  const isAppVisible = useAppVisibility();
  const isMediaViewerOpen = useChatStore((s) => s.isMediaViewerOpen);
  const chatAutoPlayVideos = useChatStore((s) => s.chatAutoPlayVideos);
  const [inView, setInView] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoDuration, setVideoDuration] = useState<number>(item.duration || 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const isDraggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const targetTimeRef = useRef(0);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const timeColor = isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)';

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

  const formatCountdown = useCallback((totalSec: number, curSec: number) => {
    const rem = Math.max(0, Math.ceil((totalSec || 0) - (curSec || 0)));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);
  const isGif = Boolean(
    item.type === 'gif' ||
    msg.mediaType === 'gif' ||
    item.mime === 'image/gif' ||
    /\.gif(\?.*)?$/i.test(item.name || item.url || '') ||
    Boolean(item.url && (item.url.includes('tenor.com') || item.url.includes('giphy.com'))) ||
    (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
  );
  const isVideo = !isGif && Boolean(
    item.type === 'video' ||
    item.mime?.startsWith('video/') ||
    /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(item.name || '') ||
    (item.url && /\.(mp4|mov|avi|webm|mkv|m4v)(\?.*)?$/i.test(item.url))
  );

  const isUploading = Boolean(item.uploading || (isOwn && (msg.uploading || msg.status === 'sending' || msg.status === 'pending')));
  const shouldAutoLoad = useChatStore((state) => state.shouldAutoLoadMedia(isVideo ? 'video' : 'photo', item.size, isOwn));
  const autoLoad = !isUploading && (isGif || shouldAutoLoad);
  const effectiveSecret = item.key || (msg as any).mediaKey || sharedSecret;
  const { blobUrl, load, isLoading, progress, isUnavailable } = useDecryptedMedia(
    item.url,
    effectiveSecret,
    item.name,
    item.mime,
    (msg as any).chatId || (msg as any).chat_id,
    msg.id,
    autoLoad
  );

  const isDownloading = isLoading;
  const isLocalMedia = Boolean((item as any).preview || (item.url?.startsWith('data:') && item.url.length > 2048) || item.url?.startsWith('blob:'));
  const posterSrc = (item as any).preview || (isLocalMedia ? item.url : undefined) || (item.thumbnail && (!item.thumbnail.startsWith('data:') || item.thumbnail.length > 2048) ? item.thumbnail : undefined);
  const blurSrc = item.blurPreview || (item.thumbnail?.startsWith('data:') ? item.thumbnail : null) || (!posterSrc && item.url?.startsWith('data:') ? item.url : null);
  const mediaSrc = blobUrl || (isLocalMedia ? ((item as any).preview || item.url) : undefined);

  const shouldPlay = inView && isAppVisible && !isMediaViewerOpen && chatAutoPlayVideos;

  useEffect(() => {
    if (!mediaSrc || !videoRef.current || isDraggingRef.current || !isVideo) return;
    if (shouldPlay) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [shouldPlay, mediaSrc, isVideo]);

  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;

    let animId: number | null = null;
    let lastFormattedTime = '';

    const updateVisuals = () => {
      if (!isDraggingRef.current && video) {
        const cur = video.currentTime || 0;
        const tot = videoDuration || item.duration || video.duration || 0;
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
        const tot = videoDuration || item.duration || video.duration || 0;
        if (tot > 0 && progressFillRef.current) {
          progressFillRef.current.style.width = `${Math.min(100, Math.max(0, (cur / tot) * 100))}%`;
        }
      }
    };

    const onTimeUpdate = () => {
      if (video.paused && !isDraggingRef.current) {
        const cur = video.currentTime || 0;
        const tot = videoDuration || item.duration || video.duration || 0;
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
  }, [videoDuration, item.duration, mediaSrc, isVideo, formatCountdown]);

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
    const tot = videoDuration || item.duration || videoRef.current.duration || 0;
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
  }, [videoDuration, item.duration, formatCountdown]);

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

  const itemTotalSize = item.size || msg.fileSize || (item.audioMetadata?.size || 0);
  const progressKey = `${msg.id}_${itemIdx}`;
  const liveProgress = useUploadProgressStore((s) => {
    if (!msg.id) return undefined;
    return s.progressByKey[progressKey] ?? ((!msg.mediaItems || msg.mediaItems.length <= 1) ? s.progressByKey[msg.id] : undefined);
  });
  const highestProgressRef = useRef(0);
  const currentFraction = liveProgress ? liveProgress.fraction : 0;
  if (currentFraction > highestProgressRef.current) {
    highestProgressRef.current = currentFraction;
  }
  const uploadProgress = Math.min(1, Math.max(highestProgressRef.current, liveProgress
    ? Math.max(0, liveProgress.fraction)
    : (itemTotalSize > 0 ? Math.min(1, Math.max(0, ((item.uploadedMb || msg.uploadedMb || 0) * 1024 * 1024) / itemTotalSize)) : 0)));

  return (
    <div
      ref={containerRef}
      onClick={() => {
        console.log('[AlbumTile] Clicked tile:', { itemIdx, url: item.url, type: item.type, isVideo, hasBlobUrl: Boolean(blobUrl), isUploading });
        onClick();
      }}
      className="relative overflow-hidden cursor-pointer bg-[var(--surface-muted,rgba(0,0,0,0.2))] group"
      style={{
        ...style,
        position: 'relative',
      }}
    >
      {posterSrc ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${posterSrc})`,
            backgroundSize: isSingle ? 'contain' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : blurSrc ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${blurSrc})`,
            backgroundSize: isSingle ? 'contain' : 'cover',
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
            backdropFilter: 'none',
          }}
        />
      )}

      {mediaSrc && (
        (isVideo || isGif) ? (
          isGif ? (
            item.mime === 'image/gif' || /\.gif(\?.*)?$/i.test(item.name || item.url || '') ? (
              <img
                src={mediaSrc}
                alt={item.name || ''}
                className={`w-full h-full pointer-events-none relative z-[1] transition-opacity duration-200 ${isSingle ? 'object-contain' : 'object-cover'}`}
                style={{ opacity: isLoaded ? 1 : 0 }}
                onLoad={(e) => {
                  setIsLoaded(true);
                  const nw = e.currentTarget.naturalWidth;
                  const nh = e.currentTarget.naturalHeight;
                  if (nw > 0 && nh > 0) {
                    onDimensionsLoaded?.(nw, nh, itemIdx);
                  }
                }}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <video
                ref={videoRef}
                src={mediaSrc}
                className={`w-full h-full pointer-events-none relative z-[1] transition-opacity duration-200 ${isSingle ? 'object-contain' : 'object-cover'}`}
                style={{ opacity: isLoaded ? 1 : 0 }}
                onLoadedMetadata={(e) => {
                  const vw = e.currentTarget.videoWidth;
                  const vh = e.currentTarget.videoHeight;
                  if (vw > 0 && vh > 0) {
                    onDimensionsLoaded?.(vw, vh, itemIdx);
                  }
                  if (e.currentTarget.duration && isFinite(e.currentTarget.duration)) {
                    setVideoDuration(e.currentTarget.duration);
                  }
                }}
                onLoadedData={() => setIsLoaded(true)}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                preload="auto"
              />
            )
          ) : (
            <video
              ref={videoRef}
              src={mediaSrc}
              poster={posterSrc || undefined}
              className={`w-full h-full pointer-events-none relative z-[1] transition-opacity duration-200 ${isSingle ? 'object-contain' : 'object-cover'}`}
              style={{ opacity: isLoaded ? 1 : 0 }}
              onSeeked={handleSeeked}
              onLoadedMetadata={(e) => {
                const vw = e.currentTarget.videoWidth;
                const vh = e.currentTarget.videoHeight;
                if (vw > 0 && vh > 0) {
                  onDimensionsLoaded?.(vw, vh, itemIdx);
                }
                if (e.currentTarget.duration && isFinite(e.currentTarget.duration)) {
                  setVideoDuration(e.currentTarget.duration);
                }
              }}
              onLoadedData={() => setIsLoaded(true)}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              preload="auto"
            />
          )
        ) : (
          <img
            src={mediaSrc}
            alt={item.name || ''}
            className={`w-full h-full pointer-events-none relative z-[1] transition-opacity duration-200 ${isSingle ? 'object-contain' : 'object-cover'}`}
            style={{ opacity: isLoaded ? 1 : 0 }}
            onLoad={(e) => {
              setIsLoaded(true);
              const nw = e.currentTarget.naturalWidth;
              const nh = e.currentTarget.naturalHeight;
              if (nw > 0 && nh > 0) {
                onDimensionsLoaded?.(nw, nh, itemIdx);
              }
            }}
            loading="lazy"
            decoding="async"
          />
        )
      )}

      {isGif && (
        <div
          className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[11px] font-semibold tracking-wider uppercase backdrop-blur-sm z-[3] pointer-events-none select-none"
          style={{ lineHeight: 1 }}
        >
          GIF
        </div>
      )}

      {(!blobUrl || isUploading) && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center z-[2] select-none ${isUnavailable ? 'pointer-events-none' : 'cursor-pointer'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDownloading && !isUploading && !isUnavailable) load();
          }}
        >
          {!isUnavailable && (
            <div className="relative z-10 flex flex-col items-center gap-1">
              <AudioCoverWithPlay
                cover={null}
                size={44}
                state={isUploading ? 'uploading' : (isDownloading ? 'downloading' : 'download')}
                progress={isUploading ? uploadProgress : progress}
                onClick={() => { if (!isDownloading && !isUploading) load(); }}
                ariaLabel={isDownloading ? 'Cancel download' : (!blobUrl ? 'Download' : 'Open')}
              />
              {(isUploading || isDownloading) && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backdropFilter: 'blur(4px)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {Math.round((isUploading ? uploadProgress : progress) * 100)}%
                </span>
              )}
              {item.size && item.size > 0 && !isDownloading && !isUploading && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {(item.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isVideo && isLoaded && !isGif && !isUploading && (
        <>
          {(videoDuration > 0 || item.duration) ? (
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
              className="absolute top-2 left-2 flex items-center justify-center tabular-nums select-none z-[3] cursor-pointer"
              style={{
                padding: '3px 8px',
                height: '22px',
                boxSizing: 'border-box',
                borderRadius: '9999px',
                backgroundColor: 'rgba(24, 25, 29, 0.75)',
                color: timeColor,
                fontSize: orbitFs(11),
                fontWeight: 400,
                gap: '5px',
                lineHeight: 1,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
              }}
              aria-label={isMuted ? t('mediaViewer.unmute', 'Включить звук') : t('mediaViewer.mute', 'Выключить звук')}
            >
              <span ref={countdownRef} className="tabular-nums" style={{ color: timeColor, fontSize: orbitFs(11), lineHeight: 1 }}>
                {formatCountdown(videoDuration || item.duration || 0, videoRef.current?.currentTime || 0)}
              </span>
              <AnimatedVideoVolumeIcon isMuted={isMuted} size={16} style={{ color: timeColor, transform: 'translateY(1px)' }} />
            </div>
          ) : null}

          {(videoDuration > 0 || item.duration) ? (
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
                    width: `${(videoDuration || item.duration || 0) > 0 ? Math.min(100, Math.max(0, ((videoRef.current?.currentTime || 0) / (videoDuration || item.duration || 1)) * 100)) : 0}%`,
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    willChange: 'width',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}, (prev, next) =>
  prev.item === next.item &&
  prev.itemIdx === next.itemIdx &&
  prev.sharedSecret === next.sharedSecret &&
  prev.isOwn === next.isOwn &&
  prev.msg.id === next.msg.id &&
  prev.msg.status === next.msg.status &&
  prev.msg.uploading === next.msg.uploading &&
  prev.isSingle === next.isSingle &&
  prev.onDimensionsLoaded === next.onDimensionsLoaded &&
  prev.style?.borderRadius === next.style?.borderRadius
);

AlbumTile.displayName = 'AlbumTile';

function partitionAlbum(items: MediaItem[]): number[][] {
  const count = items.length;
  if (count <= 1) return [[0]];
  if (count === 2) return [[0, 1]];
  if (count === 3) return [[0], [1, 2]];
  if (count === 4) return [[0, 1], [2, 3]];
  if (count === 5) return [[0, 1], [2, 3, 4]];
  if (count === 6) return [[0, 1, 2], [3, 4, 5]];
  if (count === 7) return [[0], [1, 2, 3], [4, 5, 6]];
  if (count === 8) return [[0, 1], [2, 3, 4], [5, 6, 7]];
  if (count === 9) return [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
  if (count === 10) return [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]];

  const rows: number[][] = [];
  let curr: number[] = [];
  for (let i = 0; i < count; i++) {
    curr.push(i);
    if (curr.length === 3 || i === count - 1) {
      rows.push(curr);
      curr = [];
    }
  }
  return rows;
}

export const TelegramAlbumGrid = memo(({
  items,
  sharedSecret,
  msg,
  timeNode,
  onMediaClick,
  maxWidth = 440,
  customRadius,
  isOwn,
}: TelegramAlbumGridProps) => {
  const [loadedDimensions, setLoadedDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const rows = useMemo(() => partitionAlbum(items), [items]);
  const cleanCaption = msg.text ? msg.text.replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*(https?:\/\/[^\s]+)?/i, '').trim() : '';
  const hasCaption = Boolean(cleanCaption);

  const handleDimensionsLoaded = useCallback((w: number, h: number, idx: number) => {
    setLoadedDimensions((prev) => {
      if (prev[idx]?.width === w && prev[idx]?.height === h) return prev;
      return { ...prev, [idx]: { width: w, height: h } };
    });
    if (msg.id) {
      const activeChatId = useChatStore.getState().activeChatId;
      if (activeChatId) {
        useChatStore.getState().updateMessageMediaDimensions(activeChatId, msg.id, w, h, idx);
      }
    }
  }, [msg.id]);

  const item0 = items[0];
  const dims0 = loadedDimensions[0];
  const effectiveW = item0?.width || dims0?.width || (msg as any).width;
  const effectiveH = item0?.height || dims0?.height || (msg as any).height;

  const singleMediaSize = useMemo(() => {
    if (items.length !== 1) return null;
    return calculateMediaDisplaySize(effectiveW, effectiveH, maxWidth, 400);
  }, [items.length, effectiveW, effectiveH, maxWidth]);

  const { photoBorderRadius, innerTL, innerTR, innerBL, innerBR } = useMemo(() => {
    let tl = 20;
    let tr = 20;
    let br = 20;
    let bl = 20;
    if (customRadius) {
      const parts = customRadius.trim().split(/\s+/);
      const parseVal = (v?: string, fallback = 20) => {
        if (!v) return fallback;
        const n = parseFloat(v);
        return isNaN(n) ? fallback : n;
      };
      const rawTL = parseVal(parts[0], 20);
      const rawTR = parseVal(parts[1] || parts[0], 20);
      const rawBR = parseVal(parts[2] || parts[0], 20);
      const rawBL = parseVal(parts[3] || parts[1] || parts[0], 20);

      tl = rawTL <= 10 ? 8 : Math.max(20, rawTL);
      tr = rawTR <= 10 ? 8 : Math.max(20, rawTR);
      br = rawBR <= 10 ? 8 : Math.max(20, rawBR);
      bl = rawBL <= 10 ? 8 : Math.max(20, rawBL);
    }
    const computedRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    if (!hasCaption) {
      return {
        photoBorderRadius: computedRadius,
        innerTL: tl,
        innerTR: tr,
        innerBL: bl,
        innerBR: br,
      };
    }
    const cTL = Math.max(0, tl - 2);
    const cTR = Math.max(0, tr - 2);
    return {
      photoBorderRadius: `${cTL}px ${cTR}px 6px 6px`,
      innerTL: cTL,
      innerTR: cTR,
      innerBL: 6,
      innerBR: 6,
    };
  }, [customRadius, hasCaption]);

  const containerWidth = useMemo(() => {
    if (singleMediaSize) {
      const targetW = hasCaption ? Math.max(singleMediaSize.width, 260) : singleMediaSize.width;
      return `min(${targetW}px, 100%)`;
    }
    return `min(${maxWidth}px, 100%)`;
  }, [singleMediaSize, hasCaption, maxWidth]);

  return (
    <div
      className="flex flex-col overflow-hidden w-full select-none"
      style={{
        width: containerWidth,
        maxWidth: `${maxWidth}px`,
        borderRadius: photoBorderRadius,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="flex flex-col w-full overflow-hidden"
        style={{
          width: '100%',
          gap: '2px',
          borderRadius: photoBorderRadius,
        }}
      >
        {rows.map((rowIndices, rIdx) => {
          const rowCount = rowIndices.length;
          let rowAspectRatio = '2 / 1';
          let rowMaxHeight: string | undefined = undefined;

          if (rowCount === 1) {
            if (items.length === 1 && singleMediaSize) {
              rowAspectRatio = `${singleMediaSize.width} / ${singleMediaSize.height}`;
              rowMaxHeight = `${singleMediaSize.height}px`;
            } else if (items.length === 1 && (effectiveW && effectiveH)) {
              const r = effectiveW / effectiveH;
              const clamped = Math.max(0.45, Math.min(2.4, r));
              rowAspectRatio = `${clamped} / 1`;
              rowMaxHeight = '400px';
            } else {
              rowAspectRatio = items.length === 1 ? '16 / 11' : '16 / 9';
              rowMaxHeight = items.length === 1 ? '380px' : undefined;
            }
          } else if (rowCount === 2) {
            rowAspectRatio = '2 / 1';
          } else if (rowCount === 3) {
            rowAspectRatio = '3 / 1';
          } else {
            rowAspectRatio = `${rowCount} / 1`;
          }

          return (
            <div
              key={rIdx}
              className="flex w-full overflow-hidden"
              style={{
                width: '100%',
                gap: '2px',
                aspectRatio: rowAspectRatio,
                maxHeight: rowMaxHeight,
              }}
            >
              {rowIndices.map((itemIdx, colIdx) => {
                const item = items[itemIdx];
                const isTopRow = rIdx === 0;
                const isBottomRow = rIdx === rows.length - 1;
                const isFirstCol = colIdx === 0;
                const isLastCol = colIdx === rowCount - 1;
                const tileRadius = `${isTopRow && isFirstCol ? innerTL : 0}px ${isTopRow && isLastCol ? innerTR : 0}px ${isBottomRow && isLastCol ? innerBR : 0}px ${isBottomRow && isFirstCol ? innerBL : 0}px`;
                return (
                  <div
                    key={itemIdx}
                    style={{
                      flex: 1,
                      height: '100%',
                      minWidth: 0,
                      borderRadius: tileRadius,
                      overflow: 'hidden',
                    }}
                  >
                    <AlbumTile
                      item={item}
                      itemIdx={itemIdx}
                      sharedSecret={sharedSecret}
                      onClick={() => onMediaClick(itemIdx)}
                      style={{ width: '100%', height: '100%', borderRadius: tileRadius }}
                      isOwn={isOwn}
                      msg={msg}
                      isSingle={items.length === 1}
                      onDimensionsLoaded={handleDimensionsLoaded}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        {!hasCaption && timeNode && (
          <div
            className="absolute bottom-2.5 right-2 flex items-center justify-center z-[4] pointer-events-none select-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{
              padding: '3px 8px',
              height: '22px',
              boxSizing: 'border-box',
              borderRadius: '9999px',
              backgroundColor: 'rgba(24, 25, 29, 0.75)',
              color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)',
              lineHeight: 1,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
            }}
          >
            {timeNode}
          </div>
        )}
      </div>

      {hasCaption && (
        <div
          className="flex items-end justify-between gap-3 px-2 pt-1 pb-0.5 select-none"
          style={{
            backgroundColor: 'inherit',
          }}
        >
          <div className="text-[13.5px] text-[var(--text-main)] leading-snug break-words flex-1 select-text">
            {cleanCaption}
          </div>
          <div
            className="flex items-center justify-end gap-1 flex-shrink-0 select-none message-time-badge"
            style={{
              marginRight: isOwn ? '1px' : '3px',
              marginBottom: '-2px',
            }}
          >
            {timeNode}
          </div>
        </div>
      )}
    </div>
  );
});

TelegramAlbumGrid.displayName = 'TelegramAlbumGrid';
