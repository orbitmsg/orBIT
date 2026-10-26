import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Message } from '../../store/useChatStore';
import { useAudioStore } from '../../store/useAudioStore';
import { useUploadProgressStore } from '../../store/useUploadProgressStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { AudioCoverWithPlay, AudioCoverState } from '../audio/AudioCoverWithPlay';
import { appVisibility } from '../../utils/appVisibility';

export const formatVoiceTime = (seconds: number) => {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number) => {
  if (!bytes || bytes <= 0) return '18.2 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface VoiceMessagePlayerProps {
  url: string;
  fileName?: string;
  sharedSecret: string | undefined;
  mime?: string;
  chatId?: string;
  messageId?: string;
  msg?: Message;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  customRadius?: string;
  onCancelUpload?: () => void;
}

export const VoiceMessagePlayer = memo(({
  url,
  fileName,
  sharedSecret,
  mime,
  chatId,
  messageId,
  msg,
  timeNode,
  isOwn = false,
  customRadius,
  onCancelUpload,
}: VoiceMessagePlayerProps) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);
  const markVoiceListened = useChatStore((state) => state.markVoiceListened);
  const chatElementAnimations = useChatStore((state) => state.chatElementAnimations);

  const trackId = msg?.id || messageId || url;
  const isCurrentTrack = useAudioStore((state) => state.currentTrack?.id === trackId);
  const isGlobalPlaying = useAudioStore((state) => (isCurrentTrack ? state.isPlaying : false));
  const globalCurrentTime = useAudioStore((state) => (isCurrentTrack ? state.currentTime : 0));
  const globalDuration = useAudioStore((state) => (isCurrentTrack ? state.duration : 0));
  const savedPosition = useAudioStore((state) => (trackId ? state.playbackPositions[trackId] || 0 : 0));

  const playTrack = useAudioStore((state) => state.play);
  const pauseTrack = useAudioStore((state) => state.pause);
  const seekTrack = useAudioStore((state) => state.seek);
  const setStoreDuration = useAudioStore((state) => state.setDuration);

  const [localDuration, setLocalDuration] = useState<number>(msg?.duration || 0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasPlayedLocally, setHasPlayedLocally] = useState<boolean>(Boolean(msg?.isListened));

  const waveformRef = useRef<HTMLDivElement>(null);
  const progressOverlayRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const voicePulseRingRef = useRef<HTMLDivElement>(null);
  const voicePulseRingRef2 = useRef<HTMLDivElement>(null);
  const smoothedVolRef = useRef(0.2);

  const liveProgress = useUploadProgressStore((s) => (msg?.id ? s.progressByKey[msg.id] : undefined));
  const isUploading = Boolean(
    (msg?.uploading && (msg?.status === 'sending' || msg?.status === 'pending')) ||
    (liveProgress && liveProgress.totalBytes > 0 && liveProgress.uploadedBytes < liveProgress.totalBytes)
  );
  const itemTotalSize = msg?.fileSize || (msg as any)?.size || (liveProgress ? liveProgress.totalBytes : 0);
  const uploadFraction = liveProgress && liveProgress.totalBytes > 0
    ? liveProgress.fraction
    : (itemTotalSize > 0 && msg?.uploadedMb ? Math.min(1, ((msg.uploadedMb * 1024 * 1024) / itemTotalSize)) : 0.08);

  const effectiveSecret = msg?.mediaKey || sharedSecret;
  const { blobUrl, load, isLoading: mediaLoading, progress: downloadProgress } = useDecryptedMedia(
    url,
    effectiveSecret,
    fileName,
    mime,
    chatId,
    messageId,
    false
  );

  useEffect(() => {
    if (!blobUrl || (localDuration > 0 && isFinite(localDuration))) return;
    let isMounted = true;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = blobUrl;
    audio.onloadedmetadata = () => {
      if (isMounted && audio.duration && isFinite(audio.duration)) {
        setLocalDuration(audio.duration);
        if (isCurrentTrack && (!globalDuration || globalDuration === 0)) {
          setStoreDuration(audio.duration);
        }
      }
    };
    return () => {
      isMounted = false;
      audio.src = '';
    };
  }, [blobUrl, localDuration, isCurrentTrack, globalDuration, setStoreDuration]);

  useEffect(() => {
    if (msg?.duration && msg.duration > 0 && (!localDuration || localDuration === 0)) {
      setLocalDuration(msg.duration);
    }
  }, [msg?.duration, localDuration]);

  useEffect(() => {
    if (isCurrentTrack && localDuration > 0 && (!globalDuration || globalDuration === 0)) {
      setStoreDuration(localDuration);
    } else if (isCurrentTrack && globalDuration > 0 && Math.abs(localDuration - globalDuration) > 0.05) {
      setLocalDuration(globalDuration);
    }
  }, [isCurrentTrack, localDuration, globalDuration, setStoreDuration]);

  const effectiveDuration = isCurrentTrack && globalDuration > 0 ? globalDuration : (localDuration || msg?.duration || 0);
  const effectiveCurrentTime = isCurrentTrack ? globalCurrentTime : savedPosition;
  const isPlaying = isCurrentTrack && isGlobalPlaying;
  const isLoaded = Boolean(blobUrl);
  const isUnplayed = !msg?.isListened && !hasPlayedLocally;

  const handleAction = async () => {
    if (isUploading) return;
    if (!blobUrl) {
      setIsDownloading(true);
      try {
        await load();
      } catch (err) {
        console.error(err);
      } finally {
        setIsDownloading(false);
      }
      return;
    }
    handlePlayToggle();
  };

  const handlePlayToggle = () => {
    if (!blobUrl) {
      handleAction();
      return;
    }
    if (isCurrentTrack) {
      if (isPlaying) {
        pauseTrack();
      } else {
        playTrack();
        if (chatId && trackId) {
          markVoiceListened(chatId, trackId);
        }
        setHasPlayedLocally(true);
      }
    } else {
      const voiceTitle = t('chatWindow.voice_message');
      const voiceArtist = msg?.sender || '';
      playTrack({
        id: trackId,
        chatId: chatId || msg?.id || '',
        title: voiceTitle,
        artist: voiceArtist,
        duration: effectiveDuration,
        cover: null,
        url,
        sharedSecret: effectiveSecret || '',
        mediaType: 'voice',
        message: msg,
      });
      if (chatId && trackId) {
        markVoiceListened(chatId, trackId);
      }
      setHasPlayedLocally(true);
    }
  };

  const BAR_COUNT = 66;
  const bars = useMemo(() => {
    if (msg?.waveform && msg.waveform.length > 0) {
      const src = msg.waveform;
      const step = src.length / BAR_COUNT;
      const res: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.min(src.length - 1, Math.floor(i * step));
        res.push(src[idx]);
      }
      return res;
    }
    const seed = (trackId || 'voice').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const val = Math.sin(seed + i * 0.7) * 40 + Math.cos(seed * 0.3 + i * 1.2) * 30 + 45;
      return Math.max(12, Math.min(100, Math.round(val)));
    });
  }, [msg?.waveform, trackId]);

  const [dragProgressRatio, setDragProgressRatio] = useState<number | null>(null);
  const dragStateRef = useRef<{ isDragging: boolean; targetTime: number; ratio: number }>({
    isDragging: false,
    targetTime: 0,
    ratio: 0,
  });
  const rafIdRef = useRef<number | null>(null);

  const updateSeekVisual = useCallback((clientX: number) => {
    if (!waveformRef.current || !effectiveDuration || effectiveDuration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = offsetX / rect.width;
    const newTime = ratio * effectiveDuration;

    dragStateRef.current.ratio = ratio;
    dragStateRef.current.targetTime = newTime;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      setDragProgressRatio(ratio);
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(newTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }
    });
  }, [effectiveDuration]);

  const commitSeek = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setDragProgressRatio(null);
    const newTime = dragStateRef.current.targetTime;

    if (chatId && trackId) {
      markVoiceListened(chatId, trackId);
    }
    setHasPlayedLocally(true);

    if (isCurrentTrack) {
      seekTrack(newTime);
    } else {
      const voiceTitle = t('chatWindow.voice_message');
      const voiceArtist = msg?.sender || '';
      playTrack({
        id: trackId,
        chatId: chatId || msg?.id || '',
        title: voiceTitle,
        artist: voiceArtist,
        duration: effectiveDuration,
        cover: null,
        url,
        sharedSecret: effectiveSecret || '',
        message: msg,
      });
      setTimeout(() => seekTrack(newTime), 50);
    }
  }, [effectiveDuration, isCurrentTrack, seekTrack, playTrack, trackId, chatId, msg, t, url, effectiveSecret, markVoiceListened]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!blobUrl) {
      handleAction();
      return;
    }
    dragStateRef.current.isDragging = true;
    setIsDragging(true);
    updateSeekVisual(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;
      updateSeekVisual(e.clientX);
    };
    const handleMouseUp = () => commitSeek();
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateSeekVisual, commitSeek]);

  useEffect(() => {
    let animId: number;
    let lastAudioTime = 0;
    let lastSyncTime = performance.now();

    const tick = () => {
      if (dragStateRef.current.isDragging) return;

      const getLiveTime = useAudioStore.getState().getLiveTime;
      const liveAudioTime = isCurrentTrack
        ? (getLiveTime ? getLiveTime() : useAudioStore.getState().currentTime)
        : 0;
      const now = performance.now();

      let currentExactTime = liveAudioTime;
      const playbackRate = useAudioStore.getState().playbackRate || 1;
      if (isPlaying && playbackRate > 0) {
        let expectedTime = ((now - lastSyncTime) / 1000) * playbackRate;
        if (Math.abs(liveAudioTime - expectedTime) > 0.3 || liveAudioTime < 0.1) {
          lastSyncTime = now - (liveAudioTime * 1000) / playbackRate;
          expectedTime = liveAudioTime;
        }
        currentExactTime = Math.min(effectiveDuration, expectedTime);
      }

      if (liveAudioTime !== lastAudioTime) {
        lastAudioTime = liveAudioTime;
      }

      let ratio = effectiveDuration > 0 ? Math.min(1, currentExactTime / effectiveDuration) : 0;
      if (effectiveDuration > 0 && currentExactTime >= effectiveDuration - 0.4) {
        ratio = 1;
      }
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(currentExactTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }

      if (isPlaying) {
        if (chatElementAnimations !== false) {
          const barIndex = Math.min(bars.length - 1, Math.floor(ratio * bars.length));
          const rawVol = (bars[barIndex] || 25) / 100;
          smoothedVolRef.current += (rawVol - smoothedVolRef.current) * 0.22;
          const vol = smoothedVolRef.current;
          if (voicePulseRingRef.current) {
            voicePulseRingRef.current.style.transform = `scale(${1 + vol * 0.22})`;
            voicePulseRingRef.current.style.opacity = isOwn
              ? `${0.22 + vol * 0.22}`
              : `${0.25 + vol * 0.25}`;
          }
          if (voicePulseRingRef2.current) {
            voicePulseRingRef2.current.style.transform = `scale(${1 + vol * 0.38})`;
            voicePulseRingRef2.current.style.opacity = isOwn
              ? `${0.1 + vol * 0.14}`
              : `${0.12 + vol * 0.16}`;
          }
        } else {
          if (voicePulseRingRef.current) voicePulseRingRef.current.style.opacity = '0';
          if (voicePulseRingRef2.current) voicePulseRingRef2.current.style.opacity = '0';
        }
      }

      if (isPlaying && appVisibility.getIsVisible()) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      if (appVisibility.getIsVisible()) {
        animId = requestAnimationFrame(tick);
      } else {
        tick();
      }
    } else {
      let ratio = dragProgressRatio !== null
        ? dragProgressRatio
        : (effectiveDuration > 0 ? Math.min(1, effectiveCurrentTime / effectiveDuration) : 0);
      if (effectiveDuration > 0 && effectiveCurrentTime >= effectiveDuration - 0.4) {
        ratio = 1;
      }
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        if (isUploading) {
          const uploadedBytes = liveProgress ? liveProgress.uploadedBytes : ((msg?.uploadedMb || 0) * 1024 * 1024);
          const totalBytes = liveProgress && liveProgress.totalBytes > 0 ? liveProgress.totalBytes : (itemTotalSize > 0 ? itemTotalSize : 34816);
          timeDisplayRef.current.textContent = `${Math.round(uploadedBytes / 1024)} / ${Math.round(totalBytes / 1024)} KB`;
        } else if (!isLoaded) {
          const rawBytes = msg?.fileSize || (itemTotalSize > 0 ? itemTotalSize : (effectiveDuration ? Math.round(effectiveDuration * 2200) : 18500));
          timeDisplayRef.current.textContent = `${formatVoiceTime(effectiveDuration)}, ${formatFileSize(rawBytes)}`;
        } else {
          timeDisplayRef.current.textContent = isPlaying || effectiveCurrentTime > 0
            ? `${formatVoiceTime(effectiveCurrentTime)} / ${formatVoiceTime(effectiveDuration)}`
            : formatVoiceTime(effectiveDuration);
        }
      }
      if (voicePulseRingRef.current) {
        voicePulseRingRef.current.style.transform = 'scale(1)';
        voicePulseRingRef.current.style.opacity = '0';
      }
      if (voicePulseRingRef2.current) {
        voicePulseRingRef2.current.style.transform = 'scale(1)';
        voicePulseRingRef2.current.style.opacity = '0';
      }
    }

    const unsubVisibility = appVisibility.subscribe((visible) => {
      cancelAnimationFrame(animId);
      if (visible) {
        lastSyncTime = performance.now();
        tick();
      }
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubVisibility();
    };
  }, [isPlaying, isCurrentTrack, effectiveDuration, dragProgressRatio, isUploading, isLoaded, liveProgress, msg?.uploadedMb, msg?.fileSize, itemTotalSize, effectiveCurrentTime, bars, chatElementAnimations]);

  const progressRatio = dragProgressRatio !== null ? dragProgressRatio : (effectiveDuration > 0 ? Math.min(1, effectiveCurrentTime / effectiveDuration) : 0);
  const displayCurrentTime = dragProgressRatio !== null ? dragProgressRatio * effectiveDuration : effectiveCurrentTime;
  const coverState: AudioCoverState = isUploading
    ? 'uploading'
    : (!isLoaded
      ? (isDownloading || mediaLoading ? 'downloading' : 'download')
      : (isPlaying ? 'pause' : 'play'));

  return (
    <div
      className="flex items-center gap-2.5 select-none flex-shrink-0"
      style={{
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        padding: '8px 12px 8px 8px',
        border: 'none',
        borderRadius: customRadius || bubbleRadius,
        width: '280px',
        height: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 48, height: 48 }}>
        <div
          ref={voicePulseRingRef}
          style={{
            position: 'absolute',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: isOwn ? 'rgba(255, 255, 255, 0.45)' : 'var(--accent-color, #7C3AED)',
            opacity: 0,
            pointerEvents: 'none',
            transform: 'scale(1)',
            willChange: 'transform, opacity',
            transition: isPlaying ? 'none' : 'opacity 0.25s ease, transform 0.25s ease',
            zIndex: 0,
          }}
        />
        <div
          ref={voicePulseRingRef2}
          style={{
            position: 'absolute',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: isOwn ? 'rgba(255, 255, 255, 0.28)' : 'var(--accent-color, #7C3AED)',
            opacity: 0,
            pointerEvents: 'none',
            transform: 'scale(1)',
            willChange: 'transform, opacity',
            transition: isPlaying ? 'none' : 'opacity 0.25s ease, transform 0.25s ease',
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: isOwn
              ? 'var(--chat-bubble-own-bg, #2c6bed)'
              : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <AudioCoverWithPlay
            cover={null}
            isPlayingTrack={isPlaying}
            state={coverState}
            size={48}
            progress={isUploading ? uploadFraction : (isDownloading || mediaLoading ? downloadProgress : undefined)}
            onClick={handleAction}
            onCancel={isUploading ? onCancelUpload : undefined}
            isOwn={isOwn}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div
          ref={waveformRef}
          onMouseDown={handleMouseDown}
          className="relative flex items-center cursor-pointer select-none"
          style={{ height: '22px', gap: '1px', width: 'max-content', userSelect: 'none' }}
        >
          {bars.map((h, idx) => {
            const barHeight = isLoaded ? Math.max(3, Math.round((h / 100) * 20)) : 3;
            return (
              <div
                key={idx}
                style={{
                  width: '2px',
                  minWidth: '2px',
                  maxWidth: '2px',
                  height: `${barHeight}px`,
                  flexShrink: 0,
                  backgroundColor: isLoaded
                    ? (isOwn
                        ? 'rgba(255, 255, 255, 0.4)'
                        : 'color-mix(in srgb, var(--text-main) 30%, transparent)')
                    : (isOwn
                        ? 'rgba(255, 255, 255, 0.18)'
                        : 'color-mix(in srgb, var(--text-main) 16%, transparent)'),
                  borderRadius: '1px',
                  transform: 'translateZ(0)',
                  transition: 'height 0.24s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.24s ease',
                }}
              />
            );
          })}

          <div
            ref={progressOverlayRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progressRatio * 100}%`,
              overflow: 'hidden',
              pointerEvents: 'none',
              willChange: 'width',
              transform: 'translateZ(0)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '22px',
                gap: '1px',
                width: 'max-content',
              }}
            >
              {bars.map((h, idx) => {
                const barHeight = isLoaded ? Math.max(3, Math.round((h / 100) * 20)) : 3;
                return (
                  <div
                    key={idx}
                    style={{
                      width: '2px',
                      minWidth: '2px',
                      maxWidth: '2px',
                      height: `${barHeight}px`,
                      flexShrink: 0,
                      backgroundColor: isOwn
                        ? '#ffffff'
                        : 'var(--accent-color, #7C3AED)',
                      borderRadius: '1px',
                      transform: 'translateZ(0)',
                      transition: 'height 0.24s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between" style={{ fontSize: '10.5px', color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)', marginTop: '1px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span ref={timeDisplayRef} className="tabular-nums">
              {isUploading
                ? `${Math.round((liveProgress ? liveProgress.uploadedBytes : ((msg?.uploadedMb || 0) * 1024 * 1024)) / 1024)} / ${Math.round((liveProgress && liveProgress.totalBytes > 0 ? liveProgress.totalBytes : (itemTotalSize > 0 ? itemTotalSize : 34816)) / 1024)} KB`
                : (!isLoaded
                    ? `${formatVoiceTime(effectiveDuration)}, ${formatFileSize(msg?.fileSize || (itemTotalSize > 0 ? itemTotalSize : (effectiveDuration ? Math.round(effectiveDuration * 2200) : 18500)))}`
                    : (isPlaying || displayCurrentTime > 0
                        ? `${formatVoiceTime(displayCurrentTime)} / ${formatVoiceTime(effectiveDuration)}`
                        : formatVoiceTime(effectiveDuration)))}
            </span>
            {isUnplayed && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-color, #7C3AED)',
                  marginLeft: '5px',
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: isOwn ? '2px' : '5px',
          right: isOwn ? '3px' : '10px',
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
