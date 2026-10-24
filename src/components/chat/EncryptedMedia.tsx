import React, { useMemo, memo, useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia, calculateMediaDisplaySize } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { SmartGifPlayer } from './SmartGifPlayer';
import { orbitFs } from './chatUtils';

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
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPillHovered, setIsPillHovered] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(duration || 0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (duration && duration > 0 && videoDuration === 0) {
      setVideoDuration(duration);
    }
  }, [duration, videoDuration]);

  const formatPillTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }
    return `${m}:${String(rem).padStart(2, '0')}`;
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
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              if (e.currentTarget.duration && isFinite(e.currentTarget.duration)) {
                setVideoDuration(e.currentTarget.duration);
              }
            }}
          />

          {blobUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!videoRef.current) return;
                if (videoRef.current.paused) {
                  videoRef.current.play().catch(() => {});
                } else {
                  videoRef.current.pause();
                }
              }}
              aria-label={isPlaying ? t('mediaViewer.pause', 'Пауза') : t('mediaViewer.play', 'Воспроизведение')}
              className={`absolute inset-0 m-auto flex items-center justify-center cursor-pointer transition-all duration-200 z-[3] ${
                isPlaying
                  ? 'opacity-0 group-hover:opacity-90 hover:!opacity-100 hover:scale-110 active:scale-95'
                  : 'opacity-95 hover:opacity-100 hover:scale-110 active:scale-95'
              }`}
              style={{
                width: '48px',
                height: '48px',
                background: 'none',
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
                filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.9))',
              }}
            >
              {isPlaying ? (
                <Pause size={40} className="text-white fill-white" />
              ) : (
                <Play size={40} className="text-white fill-white ml-1" />
              )}
            </button>
          )}

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
              onMouseEnter={() => setIsPillHovered(true)}
              onMouseLeave={() => setIsPillHovered(false)}
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                borderRadius: '9999px',
                backgroundColor: '#18191d',
                padding: '3px 8px',
                height: '22px',
                boxSizing: 'border-box',
                color: timeColor,
                fontSize: orbitFs(11),
                fontWeight: 400,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
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
                {formatPillTime(videoDuration || duration || 0)}
              </span>
              {!isMuted ? (
                <Volume2 size={12} className="shrink-0" style={{ color: timeColor }} />
              ) : isPillHovered ? (
                <VolumeX size={12} className="shrink-0 opacity-70" style={{ color: timeColor }} />
              ) : null}
            </div>
          )}
        </div>
      )}

      {timeNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            borderRadius: '9999px',
            backgroundColor: '#18191d',
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
