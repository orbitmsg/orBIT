import React, { useMemo, memo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia, calculateMediaDisplaySize } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { SmartGifPlayer } from './SmartGifPlayer';
import { orbitFs } from './chatUtils';
import { AnimatedVideoVolumeIcon } from './ChatIcons';

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

  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number>(duration || 0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (duration && duration > 0 && videoDuration === 0) {
      setVideoDuration(duration);
    }
  }, [duration, videoDuration]);

  useEffect(() => {
    if (blobUrl && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [blobUrl]);

  const formatCountdown = (totalSec: number, curSec: number) => {
    const rem = Math.max(0, Math.ceil((totalSec || 0) - (curSec || 0)));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime);
            }}
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
                    if (!next) {
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
              <span className="tabular-nums select-none" style={{ color: timeColor, fontSize: orbitFs(11), lineHeight: 1, userSelect: 'none', WebkitUserSelect: 'none' }}>
                {formatCountdown(videoDuration || duration || 0, currentTime)}
              </span>
              <AnimatedVideoVolumeIcon isMuted={isMuted} size={14} style={{ color: timeColor }} />
            </div>
          )}

          {blobUrl && (videoDuration > 0 || duration) && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                zIndex: 4,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(videoDuration || duration || 0) > 0 ? Math.min(100, Math.max(0, (currentTime / (videoDuration || duration || 1)) * 100)) : 0}%`,
                  backgroundColor: 'var(--accent-color, #7C3AED)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
          )}
        </div>
      )}

      {timeNode && (
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{
            position: 'absolute',
            bottom: '14px',
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
