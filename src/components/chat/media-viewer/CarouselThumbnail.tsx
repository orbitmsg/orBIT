import React from 'react';
import { Play } from 'lucide-react';
import { MediaViewerItem } from './types';
import { useDecryptedMedia } from '../../../lib/media-utils';

export const CarouselThumbnail = React.memo(({
  item,
  sharedSecret,
  isSelected,
  onClick,
}: {
  item: MediaViewerItem;
  sharedSecret?: string;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const isDirect = Boolean(
    item.directUrl ||
    (item.url && (item.url.startsWith('blob:') || item.url.startsWith('data:') || item.url.startsWith('orbita-media:')))
  );
  const directSrc = item.directUrl || (isDirect ? item.url : null);
  const effectiveSecret = item.key || item.sharedSecret || sharedSecret;
  const { blobUrl } = useDecryptedMedia(
    directSrc ? null : item.url,
    effectiveSecret,
    item.name,
    undefined,
    item.chatId,
    item.messageId
  );
  const displaySrc = directSrc || blobUrl;

  const isVideoFormat = Boolean(
    item.type === 'video' ||
    item.type === 'videos' ||
    (displaySrc && (/\.mp4(\?.*)?$/i.test(displaySrc) || /\.webm(\?.*)?$/i.test(displaySrc) || displaySrc.startsWith('data:video/'))) ||
    (/\.mp4(\?.*)?$/i.test(item.url || '')) ||
    (item.mime && item.mime.startsWith('video/'))
  );

  return (
    <div
      onClick={onClick}
      style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        backgroundColor: 'rgba(255,255,255,0.15)',
        outline: 'none',
        border: 'none',
        opacity: isSelected ? 1 : 0.5,
        filter: isSelected ? 'brightness(1)' : 'brightness(0.65)',
        transition: 'none',
      }}
      className="hover:opacity-100 hover:brightness-100"
    >
      {item.thumbnail || item.blurPreview ? (
        <img
          src={item.thumbnail || item.blurPreview}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          draggable={false}
        />
      ) : displaySrc ? (
        isVideoFormat ? (
          <video
            src={displaySrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              try {
                if (e.currentTarget.currentTime === 0) {
                  e.currentTarget.currentTime = 0.001;
                }
              } catch {}
            }}
          />
        ) : (
          <img
            src={displaySrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            draggable={false}
          />
        )
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
      )}
      {item.type !== 'gif' && (item.type === 'video' || item.type === 'videos') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.25)',
          }}
        >
          <Play size={14} fill="white" color="white" />
        </div>
      )}
    </div>
  );
});
