import React, { useMemo, memo } from 'react';
import { Play } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia, calculateMediaDisplaySize } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { SmartGifPlayer } from './SmartGifPlayer';

interface EncryptedMediaProps {
  url: string;
  type: 'image' | 'video';
  sharedSecret: string | undefined;
  chatId?: string;
  messageId?: string;
  width?: number;
  height?: number;
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
            console.log('[EncryptedMedia] Clicked video preview in chat bubble:', { url, hasBlobUrl: Boolean(blobUrl) });
            onClick?.();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (blobUrl) onContextMenu?.(e, blobUrl);
          }}
        >
          <video
            src={blobUrl || undefined}
            poster={preview || (thumbnail && (!thumbnail.startsWith('data:') || thumbnail.length > 2048) ? thumbnail : undefined)}
            className="w-full h-full object-contain pointer-events-none"
            preload="metadata"
            muted
            playsInline
            style={{ display: 'block', opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
          />
          {blobUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 z-[2]">
              <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white shadow-lg transition-transform duration-150 group-hover:scale-105">
                <Play size={20} fill="white" className="ml-0.5" />
              </div>
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
            color: '#ffffff',
            fontSize: '11px',
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
