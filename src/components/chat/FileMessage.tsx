import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/useChatStore';
import { useUploadProgressStore } from '../../store/useUploadProgressStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { AudioCoverWithPlay, type AudioCoverState } from '../audio/AudioCoverWithPlay';
import { arrayBufferToBase64 } from '../../utils/messageUtils';
import { orbitFs } from './chatUtils';
import { cancelActiveMediaUpload } from './window/useChatAudioAndFiles';

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`;
}

interface FileMessageProps {
  url: string;
  fileName?: string;
  sharedSecret: string | undefined;
  chatId?: string;
  messageId?: string;
  size?: number | null;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  customRadius?: string;
  isUploading?: boolean;
}

export const FileMessage = memo(({
  url,
  fileName,
  sharedSecret,
  chatId,
  messageId,
  size: initialSize,
  timeNode,
  isOwn = false,
  customRadius,
  isUploading = false,
}: FileMessageProps) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(() => {
    if (typeof initialSize === 'number' && initialSize > 0) return initialSize;
    return null;
  });
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia('file', fileSizeBytes, isOwn));
  const { blobUrl, blob, load, cancel, isLoading: mediaLoading, progress } = useDecryptedMedia(url, sharedSecret, fileName, undefined, chatId, messageId, autoLoad);
  const [isLoading, setIsLoading] = useState(false);
  const displayName = fileName || t('chatWindow.file');
  const ext = fileName?.split('.').pop()?.toUpperCase() || 'FILE';

  const liveProgress = useUploadProgressStore((state) => (messageId ? state.progressByKey[messageId] : undefined));
  const isCurrentlyUploading = Boolean(isUploading || (isOwn && messageId && liveProgress !== undefined));

  useEffect(() => {
    if (typeof initialSize === 'number' && initialSize > 0) {
      setFileSizeBytes(initialSize);
    }
  }, [initialSize]);

  useEffect(() => {
    if (fileSizeBytes && fileSizeBytes > 0) return;
    if (blob && blob.size > 0) {
      setFileSizeBytes(blob.size);
      return;
    }

    let cancelled = false;

    const probeSize = async () => {
      if (url) {
        const cached = mediaManager.getCachedMedia(url, sharedSecret || '');
        if (cached?.size && cached.size > 0) {
          if (!cancelled) setFileSizeBytes(cached.size);
          return;
        }
      }

      if (window.orbita?.getFileSize && url && !url.startsWith('http') && !url.startsWith('orbita-media:') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        try {
          const sz = await window.orbita.getFileSize(url);
          if (!cancelled && sz > 0) {
            setFileSizeBytes(sz);
            return;
          }
        } catch {}
      }

      const targetUrl = blobUrl || (url && (url.startsWith('http') || url.startsWith('orbita-media:') || url.startsWith('blob:')) ? url : null);
      if (targetUrl) {
        try {
          const res = await fetch(targetUrl, { method: 'HEAD' });
          if (cancelled) return;
          const cl = res.headers.get('content-length');
          if (cl) {
            const parsed = parseInt(cl, 10);
            if (!isNaN(parsed) && parsed > 0) {
              setFileSizeBytes(parsed);
              return;
            }
          }
        } catch {}
      }
    };

    probeSize();

    return () => {
      cancelled = true;
    };
  }, [blob, blobUrl, url, sharedSecret, fileSizeBytes]);

  const fileSize = useMemo(() => {
    const bytes = fileSizeBytes || (blob ? blob.size : null);
    if (!bytes || isNaN(bytes) || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`;
  }, [fileSizeBytes, blob]);

  const isDownloading = isLoading || mediaLoading;

  const uploadFraction = liveProgress ? liveProgress.fraction : (isCurrentlyUploading ? 0.08 : 0);
  const downloadFraction = Math.min(1, Math.max(0, progress || 0));

  const activeState: AudioCoverState = isCurrentlyUploading
    ? 'uploading'
    : isDownloading
    ? 'downloading'
    : blobUrl
    ? 'file'
    : 'download';

  const activeProgress = isCurrentlyUploading ? uploadFraction : (isDownloading ? downloadFraction : undefined);
  const activePercent = isCurrentlyUploading ? Math.round(uploadFraction * 100) : Math.round(downloadFraction * 100);

  const statusText = useMemo(() => {
    if (isCurrentlyUploading) {
      if (liveProgress && liveProgress.totalBytes > 0) {
        return `${formatBytes(liveProgress.uploadedBytes)} / ${formatBytes(liveProgress.totalBytes)} • ${activePercent}%`;
      }
      if (fileSizeBytes && fileSizeBytes > 0) {
        return `${formatBytes(uploadFraction * fileSizeBytes)} / ${formatBytes(fileSizeBytes)} • ${activePercent}%`;
      }
      return `${activePercent}%`;
    }
    if (isDownloading) {
      if (fileSizeBytes && fileSizeBytes > 0) {
        const curBytes = downloadFraction * fileSizeBytes;
        return `${formatBytes(curBytes)} / ${formatBytes(fileSizeBytes)} • ${activePercent}%`;
      }
      return `${activePercent}%`;
    }
    return fileSize ? (ext ? `${fileSize} • ${ext}` : fileSize) : ext || t('chatWindow.document');
  }, [isCurrentlyUploading, isDownloading, liveProgress, activePercent, fileSizeBytes, uploadFraction, downloadFraction, fileSize, ext, t]);

  const handleOpenFile = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isCurrentlyUploading) return;
    if (!blobUrl) {
      if (isDownloading) return;
      setIsLoading(true);
      try {
        await load();
      } catch (err) {
        console.error('Failed to load file:', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    try {
      const response = await fetch(blobUrl);
      const fileBlob = await response.blob();
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      if (window.orbita && window.orbita.openFile) {
        await window.orbita.openFile(base64, displayName);
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = displayName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [blobUrl, displayName, isDownloading, isCurrentlyUploading, load]);

  return (
    <div
      className="group relative flex flex-col cursor-pointer select-none"
      style={{
        borderRadius: customRadius || bubbleRadius,
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        border: 'none',
        padding: '10px 14px 10px 10px',
        position: 'relative',
        width: '280px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
      }}
      onClick={handleOpenFile}
    >
      <div className="flex items-center gap-2.5">
        <AudioCoverWithPlay
          cover={null}
          isPlayingTrack={false}
          size={48}
          onClick={handleOpenFile}
          onCancel={() => {
            if (isCurrentlyUploading) {
              if (messageId) {
                cancelActiveMediaUpload(chatId || useChatStore.getState().activeChatId, messageId);
              }
            } else if (isDownloading) {
              cancel();
            }
          }}
          state={activeState}
          progress={activeProgress}
          isOwn={isOwn}
          ariaLabel={isCurrentlyUploading ? 'Uploading file' : (isDownloading ? 'Cancel download' : (!blobUrl ? 'Download file' : 'Open file'))}
        />
        <div className="flex flex-col min-w-0 flex-1 gap-0.5 overflow-hidden" style={{ maxWidth: '100%' }}>
          <div
            className="font-semibold truncate"
            style={{
              fontSize: orbitFs(13),
              color: isOwn ? 'var(--bubble-own-text, #ffffff)' : '#917bbd',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              overflowWrap: 'break-word',
            }}
          >
            {displayName}
          </div>
          <div
            className="tabular-nums"
            style={{
              fontSize: orbitFs(11),
              color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 78%, transparent)' : 'var(--text-dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {statusText}
          </div>
          {(isCurrentlyUploading || isDownloading) && (
            <div
              style={{
                width: '100%',
                height: '4px',
                background: isOwn
                  ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 22%, transparent)'
                  : 'var(--border-color, rgba(128, 128, 128, 0.22))',
                borderRadius: '4px',
                marginTop: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${activePercent}%`,
                  background: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-color, #6c5ce7)',
                  borderRadius: '4px',
                  transition: 'width 0.14s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: isOwn ? '2px' : '4px',
          right: isOwn ? '4px' : '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        {timeNode}
      </div>
    </div>
  );
});
