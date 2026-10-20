import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecryptedMedia } from '../../../lib/media-utils';
import { arrayBufferToBase64 } from '../../../utils/messageUtils';
import { useAudioStore } from '../../../store/useAudioStore';
import { AudioCoverWithPlay } from '../../audio/AudioCoverWithPlay';
import { getDomainHost } from '../../../utils/linkPreviewUtils';
import { getAvatarGradient } from '../../common/Avatar';
import type { Message } from '../../../store/useChatStore';
import {
  type MediaGridItem,
  formatTelegramDate,
  formatAudioDuration,
  formatVideoDuration,
} from './types';

export const ProfileMediaGridTile = memo(({
  item,
  sharedSecret,
  type,
  isViewerOpen = false,
  onMediaClick,
}: {
  item: MediaGridItem;
  sharedSecret: string;
  type: 'photos' | 'videos' | 'gif';
  isViewerOpen?: boolean;
  onMediaClick?: (item: MediaGridItem, displaySrc: string | null) => void;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaUrl = item.url || (item.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, item.key || sharedSecret, item.name);
  const displaySrc = blobUrl || (mediaUrl && mediaUrl.startsWith('http') ? mediaUrl : null);

  const [duration, setDuration] = useState<number>(item.duration || 0);
  const [inView, setInView] = useState(true);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  const isVideoFormat = useMemo(() => {
    const src = (displaySrc || item.url || item.name || '').toLowerCase();
    return src.endsWith('.mp4') || src.endsWith('.webm') || src.endsWith('.mov') || src.includes('.mp4') || src.includes('.webm') || (item as any).mediaType === 'video' || (item as any).isVideo;
  }, [displaySrc, item]);

  useEffect(() => {
    if (type !== 'gif' || isVideoFormat || !displaySrc) return;
    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = displaySrc;
    img.onload = () => {
      if (isCancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(img.naturalWidth || 300, 400);
        canvas.height = Math.min(img.naturalHeight || 300, 400);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          if (!isCancelled) setPosterUrl(dataUrl);
        }
      } catch (err) {}
    };
    return () => {
      isCancelled = true;
    };
  }, [type, displaySrc, isVideoFormat]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (type !== 'videos' || duration > 0 || !displaySrc) return;
    let cancelled = false;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = displaySrc;
    v.onloadedmetadata = () => {
      if (!cancelled && v.duration && isFinite(v.duration)) {
        setDuration(Math.round(v.duration));
      }
    };
    return () => {
      cancelled = true;
      v.src = '';
    };
  }, [type, displaySrc, duration]);

  const handleClick = () => {
    if (onMediaClick) {
      onMediaClick(item, displaySrc);
    }
  };

  const shouldAnimateGif = type === 'gif' && inView && !isViewerOpen && !!displaySrc;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        borderRadius: '4px',
        position: 'relative',
        background: 'var(--surface-muted, rgba(255, 255, 255, 0.05))',
        contain: 'strict',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      className="group transition-opacity duration-150 hover:opacity-90"
    >
      {displaySrc ? (
        type === 'photos' ? (
          <img
            src={displaySrc}
            alt={item.name || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
            decoding="async"
          />
        ) : type === 'gif' ? (
          isVideoFormat ? (
            <video
              src={displaySrc}
              autoPlay={shouldAnimateGif}
              loop
              muted
              playsInline
              preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              ref={(v) => {
                if (v) {
                  if (shouldAnimateGif) {
                    v.play().catch(() => {});
                  } else {
                    v.pause();
                  }
                }
              }}
            />
          ) : shouldAnimateGif ? (
            <img
              src={displaySrc}
              alt={item.name || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <img
              src={posterUrl || displaySrc}
              alt={item.name || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )
        ) : (
          <>
            <video
              src={displaySrc}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
              preload="metadata"
              playsInline
            />
            <div
              style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                color: '#ffffff',
                padding: '2px 5px 2px 4px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                lineHeight: 1,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{formatVideoDuration(duration)}</span>
            </div>
          </>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5 animate-pulse" />
      )}

      {type === 'gif' && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            padding: '2px 5px',
            borderRadius: '4px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: '#ffffff',
            fontSize: '10.5px',
            fontWeight: 700,
            lineHeight: 1.1,
            zIndex: 2,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          GIF
        </div>
      )}
    </div>
  );
});

export const ProfileFileListItem = memo(({ msg, sharedSecret, i18nLang }: { msg: Message; sharedSecret: string; i18nLang: string }) => {
  const mediaUrl = msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, msg.mediaKey || sharedSecret, msg.mediaName);
  const fileName = msg.mediaName || msg.text?.replace(/^\[(?:File|Document|Photo|Video|Audio)\]\s*/i, '').trim() || 'File';
  const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'file';
  const dateStr = formatTelegramDate(msg.time, i18nLang);

  const handleOpenFile = useCallback(async () => {
    if (!blobUrl) return;
    try {
      const response = await fetch(blobUrl);
      const fileBlob = await response.blob();
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      if (window.orbita && window.orbita.openFile) {
        await window.orbita.openFile(base64, fileName);
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [blobUrl, fileName]);

  return (
    <div
      className="group flex items-center gap-3 transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]"
      style={{
        minHeight: '52px',
        contain: 'layout paint',
        padding: '6px 10px',
        borderRadius: '12px',
        margin: '2px 8px',
        cursor: 'pointer',
        width: 'calc(100% - 16px)',
        boxSizing: 'border-box',
      }}
      onClick={handleOpenFile}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-white uppercase text-[11.5px] shadow-sm select-none"
        style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
      >
        {ext.length <= 4 ? ext : ext.slice(0, 3)}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="truncate text-[13.5px] font-medium text-[var(--text-main)] leading-tight">
          {fileName}
        </span>
        <div className="text-[11.5px] text-[var(--text-dim)] flex items-center gap-2 mt-0.5">
          <span>{dateStr}</span>
        </div>
      </div>
    </div>
  );
});

export const ProfileAudioListItem = memo(({ msg, sharedSecret, i18nLang }: { msg: Message; sharedSecret: string; i18nLang: string }) => {
  const effectiveSecret = msg.mediaKey || sharedSecret;
  const mediaUrl = msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, effectiveSecret, msg.mediaName);
  const trackName = msg.audioMetadata?.title || msg.mediaName || msg.text || 'Audio Track';
  const artistName = msg.audioMetadata?.artist || '';
  const [cover, setCover] = useState<string | null>(msg.audioMetadata?.cover || null);

  const isCurrentTrack = useAudioStore((s) => s.currentTrack?.id === (msg.id || String(msg.time)));
  const isPlaying = useAudioStore((s) => (isCurrentTrack ? s.isPlaying : false));
  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);
  const dateStr = formatTelegramDate(msg.time, i18nLang);

  useEffect(() => {
    if (!blobUrl || cover) return;
    let cancelled = false;
    if (typeof (window as any).jsmediatags !== 'undefined') {
      try {
        fetch(blobUrl)
          .then((res) => res.blob())
          .then((blob) => {
            (window as any).jsmediatags.read(blob, {
              onSuccess: (tag: any) => {
                if (cancelled) return;
                const picture = tag.tags.picture;
                if (picture) {
                  let binary = '';
                  for (let i = 0; i < picture.data.length; i++) {
                    binary += String.fromCharCode(picture.data[i]);
                  }
                  setCover(`data:${picture.format};base64,${window.btoa(binary)}`);
                }
              },
              onError: () => {},
            });
          })
          .catch(() => {});
      } catch (err) {}
    }
    return () => {
      cancelled = true;
    };
  }, [blobUrl, cover]);

  const handlePlayClick = () => {
    if (!blobUrl) return;
    if (isPlaying) {
      pause();
    } else {
      play({
        id: msg.id || String(msg.time),
        chatId: '',
        title: trackName,
        artist: artistName,
        duration: msg.audioMetadata?.duration || 0,
        cover: cover,
        url: blobUrl,
        sharedSecret: effectiveSecret,
        mediaType: 'audio',
        message: msg,
      });
    }
  };

  const durationStr = msg.audioMetadata?.duration ? formatAudioDuration(msg.audioMetadata.duration) : '';
  const subText = durationStr ? `${durationStr}, ${dateStr}` : dateStr;

  return (
    <div
      className="group flex items-center gap-3 transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]"
      style={{
        minHeight: '52px',
        contain: 'layout paint',
        padding: '6px 10px',
        borderRadius: '12px',
        margin: '2px 8px',
        cursor: 'pointer',
        width: 'calc(100% - 16px)',
        boxSizing: 'border-box',
      }}
      onClick={handlePlayClick}
    >
      <AudioCoverWithPlay
        cover={cover}
        isPlayingTrack={isPlaying}
        size={40}
        onClick={handlePlayClick}
        state={!blobUrl ? 'download' : (isPlaying ? 'pause' : 'play')}
      />

      <div className="flex flex-col min-w-0 flex-1 gap-0.5 select-none">
        <div
          className="text-sm font-semibold truncate"
          style={{
            color: isCurrentTrack ? 'var(--accent-color, #7C3AED)' : 'var(--text-main, #ffffff)',
          }}
        >
          {trackName}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--text-dim, #9ca3af)' }}>
          {artistName ? `${artistName} • ${subText}` : subText}
        </div>
      </div>
    </div>
  );
});

export const ProfileVoiceListItem = memo(({ msg, sharedSecret, i18nLang }: { msg: Message; sharedSecret: string; i18nLang: string }) => {
  const { t } = useTranslation();
  const effectiveSecret = msg.mediaKey || sharedSecret;
  const mediaUrl = msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, effectiveSecret, msg.mediaName);

  const isCurrentTrack = useAudioStore((s) => s.currentTrack?.id === (msg.id || String(msg.time)));
  const isPlaying = useAudioStore((s) => (isCurrentTrack ? s.isPlaying : false));
  const currentTime = useAudioStore((s) => (isCurrentTrack ? s.currentTime : 0));
  const duration = useAudioStore((s) => (isCurrentTrack ? s.duration : 0));

  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);

  const dateStr = formatTelegramDate(msg.time, i18nLang);
  const senderName = msg.sender || '~/user';

  const [audioDuration, setAudioDuration] = useState<number>(() => {
    return msg.audioMetadata?.duration || msg.duration || 0;
  });

  useEffect(() => {
    if (msg.audioMetadata?.duration) {
      setAudioDuration(msg.audioMetadata.duration);
    } else if (msg.duration) {
      setAudioDuration(msg.duration);
    }
  }, [msg.audioMetadata?.duration, msg.duration]);

  useEffect(() => {
    if (!blobUrl || audioDuration > 0) return;
    let cancelled = false;
    const audio = new Audio(blobUrl);
    audio.addEventListener('loadedmetadata', () => {
      if (!cancelled && audio.duration && isFinite(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
    });
    audio.load();
    return () => {
      cancelled = true;
    };
  }, [blobUrl, audioDuration]);

  const totalDuration = duration > 0 ? duration : audioDuration;

  const timeDisplay = isPlaying
    ? `${dateStr}, ${formatAudioDuration(currentTime)} / ${formatAudioDuration(totalDuration)}`
    : `${dateStr}, ${formatAudioDuration(totalDuration)}`;

  const handlePlayClick = () => {
    if (!blobUrl) return;
    if (isPlaying) {
      pause();
    } else {
      play({
        id: msg.id || String(msg.time),
        chatId: '',
        title: t('chatWindow.voice_message', 'Голосовое сообщение'),
        artist: senderName,
        duration: totalDuration,
        cover: null,
        url: blobUrl,
        sharedSecret: effectiveSecret,
        mediaType: 'voice',
        message: msg,
      });
    }
  };

  return (
    <div
      className="group flex items-center gap-3 transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]"
      style={{
        minHeight: '52px',
        contain: 'layout paint',
        padding: '6px 10px',
        borderRadius: '12px',
        margin: '2px 8px',
        cursor: 'pointer',
        width: 'calc(100% - 16px)',
        boxSizing: 'border-box',
      }}
    >
      <AudioCoverWithPlay
        cover={null}
        isPlayingTrack={isPlaying}
        size={40}
        onClick={handlePlayClick}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="truncate text-[13.5px] font-medium text-[var(--text-main)] leading-tight">
          {senderName}
        </span>
        <div className="text-[11.5px] text-[var(--text-dim)] flex items-center gap-2 mt-0.5">
          <span>{timeDisplay}</span>
        </div>
      </div>
    </div>
  );
});

export const ProfileLinkListItem = memo(({
  msg,
  onLinkClick,
}: {
  msg: Message;
  onLinkClick?: (url: string) => void;
}) => {
  const urlMatch = msg.text?.match(/\b(?:https?:\/\/|ftp:\/\/)?(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s]*)?/i);
  const rawUrl = urlMatch ? urlMatch[0].trim() : '';
  const fullUrl = rawUrl ? (rawUrl.match(/^(https?:\/\/|ftp:\/\/)/i) ? rawUrl : `https://${rawUrl}`) : '';

  const preview = msg.linkPreview;
  const host = getDomainHost(fullUrl);

  const title = preview?.title || host || 'Link';
  const cleanHost = host.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');
  const domainInitial = (cleanHost.charAt(0) || title.charAt(0) || 'L').toUpperCase();

  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(preview?.image && !imgError);

  const handleLinkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (fullUrl) {
      if (onLinkClick) {
        onLinkClick(fullUrl);
      } else if ((window as any).orbita?.openExternal) {
        (window as any).orbita.openExternal(fullUrl);
      }
    }
  };

  const cleanDescription = preview?.description || msg.text?.replace(/\b(?:https?:\/\/|ftp:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/gi, '').replace(/\n+/g, ' ').trim() || '';

  return (
    <div
      onClick={handleLinkClick}
      className="group flex items-start gap-3 cursor-pointer transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))] select-none"
      style={{
        contain: 'layout paint',
        padding: '8px 10px',
        borderRadius: '12px',
        margin: '2px 8px',
        width: 'calc(100% - 16px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-base text-white shadow-sm mt-0.5"
        style={{
          background: hasImage ? 'transparent' : getAvatarGradient(cleanHost || title),
        }}
      >
        {hasImage ? (
          <img
            src={preview!.image}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{ userSelect: 'none' }}>{domainInitial}</span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h4 className="font-bold text-[13.5px] text-[var(--text-main)] truncate leading-snug">
          {title}
        </h4>

        {cleanDescription ? (
          <p className="text-[12px] text-[var(--text-dim)] line-clamp-2 leading-relaxed mt-0.5 opacity-85">
            {cleanDescription}
          </p>
        ) : null}

        <span className="text-[12px] text-[var(--accent-color)] hover:underline truncate mt-0.5 font-medium block">
          {fullUrl}
        </span>
      </div>
    </div>
  );
});
