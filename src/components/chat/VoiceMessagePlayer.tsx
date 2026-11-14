import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Message } from '../../store/useChatStore';
import { useAudioStore } from '../../store/useAudioStore';
import { useUploadProgressStore } from '../../store/useUploadProgressStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { AudioCoverWithPlay, AudioCoverState } from '../audio/AudioCoverWithPlay';
import { MessageReactions } from './ReactionBadge';
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

const drawCircularWaveLayer = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  amplitude: number,
  phase: number,
  seed: number,
  colorRgb: [number, number, number],
  alpha: number
) => {
  const steps = 72;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const h1 = Math.sin(theta + phase * 0.7 + seed) * 0.20;
    const h2 = Math.cos(2 * theta - phase * 0.55 + seed * 1.3) * 0.22;
    const h3 = Math.sin(3 * theta + phase * 0.38 + seed * 2.1) * 0.14;
    const h4 = Math.cos(4 * theta - phase * 0.29 + seed * 0.7) * 0.10;
    const h5 = Math.sin(5 * theta + phase * 0.21 + seed * 3.4) * 0.06;
    const sum = h1 + h2 + h3 + h4 + h5;
    const norm = Math.max(0, Math.min(1, (sum + 0.72) / 1.44));
    const elevation = amplitude * (0.60 + 0.40 * norm);
    const r = baseR + elevation;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const [r, g, b] = colorRgb;
  const maxR = baseR + amplitude + 2;
  const grad = ctx.createRadialGradient(cx, cy, Math.max(0, baseR * 0.7), cx, cy, maxR);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${alpha * 0.72})`);
  grad.addColorStop(0.88, `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fill();
};

const parseHexColor = (hex: string): [number, number, number] | null => {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  return null;
};

const renderCircularWaves = (
  canvas: HTMLCanvasElement,
  vol: number,
  phase: number,
  isOwn: boolean
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const targetSize = Math.round(76 * dpr);
  if (canvas.width !== targetSize || canvas.height !== targetSize) {
    canvas.width = targetSize;
    canvas.height = targetSize;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 76, 76);

  const cx = 38;
  const cy = 38;
  const baseR = 24;
  const pulse = Math.sin(phase * 0.6) * 0.6;
  const baseAmp = 3.5 + pulse + vol * 7.2;

  if (isOwn) {
    let ownRgb: [number, number, number] = [255, 255, 255];
    if (typeof document !== 'undefined') {
      const ownText = getComputedStyle(document.documentElement).getPropertyValue('--bubble-own-text').trim();
      const parsedOwn = parseHexColor(ownText);
      if (parsedOwn) ownRgb = parsedOwn;
    }
    drawCircularWaveLayer(ctx, cx, cy, baseR, baseAmp, phase * 0.65, 0, ownRgb, 0.18 + vol * 0.12);
    drawCircularWaveLayer(ctx, cx, cy, baseR, baseAmp * 0.75, -phase * 0.50 + 1.7, 2.1, ownRgb, 0.28 + vol * 0.18);
    drawCircularWaveLayer(ctx, cx, cy, baseR, baseAmp * 0.45, phase * 0.85 + 3.2, 4.3, ownRgb, 0.45 + vol * 0.22);
  } else {
    let rgb: [number, number, number] = [124, 58, 237];
    if (typeof document !== 'undefined') {
      const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
      const parsed = parseHexColor(val);
      if (parsed) rgb = parsed;
    }
    const [r, g, b] = rgb;
    drawCircularWaveLayer(ctx, cx, cy, baseR, baseAmp, phase * 0.65, 0, [r, g, b], 0.20 + vol * 0.14);
    drawCircularWaveLayer(ctx, cx, cy, baseR, baseAmp * 0.75, -phase * 0.50 + 1.7, 2.1, [Math.min(255, r + 15), Math.min(255, g + 15), Math.min(255, b + 15)], 0.32 + vol * 0.20);
    drawCircularWaveLayer(ctx, cx, cy, baseR, baseAmp * 0.45, phase * 0.85 + 3.2, 4.3, [Math.min(255, r + 30), Math.min(255, g + 30), Math.min(255, b + 30)], 0.52 + vol * 0.25);
  }
};

const clearCircularWaves = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
};

const drawWaveformCanvas = (
  canvas: HTMLCanvasElement,
  bars: number[],
  ratio: number,
  isLoaded: boolean,
  isOwn: boolean
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const w = 198;
  const h = 22;
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const barCount = bars.length;
  if (barCount === 0) return;

  const isLightTheme =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme-light') === 'true';

  let ownTextColor = '#ffffff';
  let accentColor = '#5865F2';
  if (typeof document !== 'undefined') {
    const styles = getComputedStyle(document.documentElement);
    const ownVal = styles.getPropertyValue('--bubble-own-text').trim();
    if (ownVal) ownTextColor = ownVal;
    const accentVal = styles.getPropertyValue('--accent-text').trim() || styles.getPropertyValue('--accent-color').trim();
    if (accentVal) accentColor = accentVal;
  }

  const isOwnDarkText = ownTextColor.toLowerCase() === '#111318';
  const inactiveOwn = isLoaded
    ? (isOwnDarkText ? 'rgba(17, 19, 24, 0.36)' : 'rgba(255, 255, 255, 0.40)')
    : (isOwnDarkText ? 'rgba(17, 19, 24, 0.18)' : 'rgba(255, 255, 255, 0.18)');
  const inactiveIncoming = isLoaded
    ? (isLightTheme ? 'rgba(24, 27, 34, 0.26)' : 'rgba(255, 255, 255, 0.28)')
    : (isLightTheme ? 'rgba(24, 27, 34, 0.14)' : 'rgba(255, 255, 255, 0.12)');
  const inactiveColor = isOwn ? inactiveOwn : inactiveIncoming;
  const activeColor = isOwn ? ownTextColor : accentColor;

  ctx.beginPath();
  for (let i = 0; i < barCount; i++) {
    const x = i * 3;
    const barH = isLoaded ? Math.max(3, Math.round((bars[i] / 100) * 20)) : 3;
    const y = (h - barH) / 2;
    if (ctx.roundRect) {
      ctx.roundRect(x, y, 2, barH, 1);
    } else {
      ctx.rect(x, y, 2, barH);
    }
  }
  ctx.fillStyle = inactiveColor;
  ctx.fill();

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  if (clampedRatio > 0) {
    const totalWaveWidth = barCount * 3 - 1;
    const playX = clampedRatio * totalWaveWidth;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, playX, h);
    ctx.clip();

    ctx.beginPath();
    for (let i = 0; i < barCount; i++) {
      const x = i * 3;
      if (x > playX) break;
      const barH = isLoaded ? Math.max(3, Math.round((bars[i] / 100) * 20)) : 3;
      const y = (h - barH) / 2;
      if (ctx.roundRect) {
        ctx.roundRect(x, y, 2, barH, 1);
      } else {
        ctx.rect(x, y, 2, barH);
      }
    }
    ctx.fillStyle = activeColor;
    ctx.fill();
    ctx.restore();
  }
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
  reactions?: Record<string, string[]>;
  onToggleReaction?: (emoji: string) => void;
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
  reactions,
  onToggleReaction,
}: VoiceMessagePlayerProps) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);
  const markVoiceListened = useChatStore((state) => state.markVoiceListened);
  const chatElementAnimations = useChatStore((state) => state.chatElementAnimations);
  const currentTheme = useChatStore((state) => state.currentTheme);
  const themeTintId = useChatStore((state) => state.themeTintId);
  const chatColor = useChatStore((state) => state.chatColor);

  const trackId = msg?.id || messageId || url;
  const isCurrentTrack = useAudioStore((state) => state.currentTrack?.id === trackId);
  const isGlobalPlaying = useAudioStore((state) => (isCurrentTrack ? state.isPlaying : false));
  const globalDuration = useAudioStore((state) => (isCurrentTrack ? state.duration : 0));
  const savedPosition = useAudioStore((state) => (
    (state.isPlaying && state.currentTrack?.id === trackId)
      ? 0
      : (trackId ? state.playbackPositions[trackId] || 0 : 0)
  ));

  const playTrack = useAudioStore((state) => state.play);
  const pauseTrack = useAudioStore((state) => state.pause);
  const seekTrack = useAudioStore((state) => state.seek);
  const setStoreDuration = useAudioStore((state) => state.setDuration);

  const [localDuration, setLocalDuration] = useState<number>(msg?.duration || 0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasPlayedLocally, setHasPlayedLocally] = useState<boolean>(Boolean(msg?.isListened));

  const waveformRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const wavePhaseRef = useRef<number>(0);
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

  const autoLoadAudio = useChatStore((state) => state.autoLoadAudio !== false);
  const effectiveSecret = msg?.mediaKey || sharedSecret;
  const { blobUrl, load, isLoading: mediaLoading, progress: downloadProgress } = useDecryptedMedia(
    url,
    effectiveSecret,
    fileName,
    mime,
    chatId,
    messageId,
    autoLoadAudio
  );

  const [isLocallySaved, setIsLocallySaved] = useState<boolean>(() => {
    return mediaManager.isMediaSavedLocallySync(url);
  });

  useEffect(() => {
    if (isLocallySaved) return;
    let active = true;
    mediaManager.isMediaSavedLocally(url).then((saved) => {
      if (active && saved) {
        setIsLocallySaved(true);
      }
    });
    return () => {
      active = false;
    };
  }, [url, isLocallySaved]);

  const effectiveDuration = isCurrentTrack && globalDuration > 0 ? globalDuration : (localDuration || msg?.duration || 0);
  const isPlaying = isCurrentTrack && isGlobalPlaying;
  const isLoaded = Boolean(blobUrl || isLocallySaved);
  const isUnplayed = !msg?.isListened && !hasPlayedLocally;

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

  useEffect(() => {
    if (!waveformCanvasRef.current || isPlaying) return;
    const canvas = waveformCanvasRef.current;
    const ratio = effectiveDuration > 0 ? Math.min(1, Math.max(0, savedPosition / effectiveDuration)) : 0;
    drawWaveformCanvas(canvas, bars, ratio, isLoaded, isOwn);
  }, [bars, isLoaded, isOwn, isPlaying, savedPosition, effectiveDuration, currentTheme, themeTintId, chatColor]);

  const handlePlayToggle = useCallback(() => {
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
  }, [isCurrentTrack, isPlaying, pauseTrack, playTrack, chatId, trackId, markVoiceListened, t, msg, effectiveDuration, url, effectiveSecret]);

  const handleAction = async () => {
    if (isUploading) return;
    if (!blobUrl) {
      setIsDownloading(true);
      try {
        await load();
        handlePlayToggle();
      } catch (err) {
        console.error(err);
      } finally {
        setIsDownloading(false);
      }
      return;
    }
    handlePlayToggle();
  };

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
      if (waveformCanvasRef.current) {
        drawWaveformCanvas(waveformCanvasRef.current, bars, ratio, isLoaded, isOwn);
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(newTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }
    });
  }, [effectiveDuration, bars, isLoaded, isOwn]);

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

    const getLiveTime = useAudioStore.getState().getLiveTime;
    let lastTime = -1;
    let lastPerf = performance.now();

    const tick = () => {
      if (dragStateRef.current.isDragging) return;

      const liveTime = isCurrentTrack && getLiveTime ? getLiveTime() : null;
      const now = performance.now();
      const playbackRate = useAudioStore.getState().playbackRate || 1;

      let currentExactTime = 0;
      if (typeof liveTime === 'number' && isFinite(liveTime) && liveTime >= 0) {
        if (liveTime !== lastTime) {
          lastTime = liveTime;
          lastPerf = now;
          currentExactTime = liveTime;
        } else {
          const delta = Math.max(0, (now - lastPerf) / 1000) * playbackRate;
          currentExactTime = liveTime + delta;
        }
      } else {
        currentExactTime = savedPosition;
      }

      currentExactTime = Math.min(effectiveDuration, Math.max(0, currentExactTime));
      const ratio = effectiveDuration > 0 ? currentExactTime / effectiveDuration : 0;

      if (waveformCanvasRef.current) {
        drawWaveformCanvas(waveformCanvasRef.current, bars, ratio, isLoaded, isOwn);
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(currentExactTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }

      if (waveCanvasRef.current) {
        if (isPlaying && chatElementAnimations !== false) {
          const barIndex = Math.min(bars.length - 1, Math.floor(ratio * bars.length));
          const rawVol = (bars[barIndex] || 25) / 100;
          smoothedVolRef.current += (rawVol - smoothedVolRef.current) * 0.12;
          const vol = smoothedVolRef.current;

          wavePhaseRef.current += 0.012 + vol * 0.016;
          renderCircularWaves(waveCanvasRef.current, vol, wavePhaseRef.current, isOwn);
        } else {
          clearCircularWaves(waveCanvasRef.current);
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
      const ratio = effectiveDuration > 0 ? Math.min(1, Math.max(0, savedPosition / effectiveDuration)) : 0;
      if (waveformCanvasRef.current) {
        drawWaveformCanvas(waveformCanvasRef.current, bars, ratio, isLoaded, isOwn);
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
          timeDisplayRef.current.textContent = savedPosition > 0
            ? `${formatVoiceTime(savedPosition)} / ${formatVoiceTime(effectiveDuration)}`
            : formatVoiceTime(effectiveDuration);
        }
      }
      if (waveCanvasRef.current) {
        clearCircularWaves(waveCanvasRef.current);
      }
    }

    const unsubVisibility = appVisibility.subscribe((visible) => {
      cancelAnimationFrame(animId);
      if (visible && isPlaying) {
        lastPerf = performance.now();
        tick();
      }
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubVisibility();
      if (waveCanvasRef.current) {
        clearCircularWaves(waveCanvasRef.current);
      }
    };
  }, [isPlaying, isCurrentTrack, effectiveDuration, dragProgressRatio, isUploading, isLoaded, liveProgress, msg?.uploadedMb, msg?.fileSize, itemTotalSize, savedPosition, bars, chatElementAnimations, isOwn]);

  const hasReactions = Boolean(
    reactions &&
      Object.keys(reactions).some(
        (k) => !k.startsWith('_') && Array.isArray(reactions[k]) && reactions[k]!.length > 0
      )
  );

  const displayCurrentTime = dragProgressRatio !== null ? dragProgressRatio * effectiveDuration : savedPosition;
  const coverState: AudioCoverState = isUploading
    ? 'uploading'
    : (!isLoaded
      ? (isDownloading || mediaLoading ? 'downloading' : 'download')
      : (isPlaying ? 'pause' : 'play'));

  return (
    <div
      className="flex flex-col select-none flex-shrink-0"
      style={{
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        padding: '8px 12px 8px 8px',
        border: 'none',
        borderRadius: customRadius || bubbleRadius,
        width: '280px',
        height: hasReactions ? 'auto' : '64px',
        minHeight: '64px',
        boxSizing: 'border-box',
        overflow: hasReactions ? 'visible' : 'hidden',
        position: 'relative',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2.5 w-full">
        <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 48, height: 48 }}>
          <canvas
            ref={waveCanvasRef}
            style={{
              position: 'absolute',
              width: '76px',
              height: '76px',
              top: '-14px',
              left: '-14px',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: isOwn
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
            style={{ height: '22px', width: '198px', userSelect: 'none' }}
          >
            <canvas
              ref={waveformCanvasRef}
              style={{
                width: '198px',
                height: '22px',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          </div>

          <div
            className="flex items-center justify-between"
            style={{
              fontSize: '10.5px',
              color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 78%, transparent)' : 'var(--text-dim)',
              marginTop: '1px',
            }}
          >
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
                    backgroundColor: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color, #7C3AED))',
                    marginLeft: '5px',
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {hasReactions && (
        <div
          className="flex items-end justify-between mt-1.5 w-full select-none"
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            gap: '10px',
            flexWrap: 'nowrap',
            paddingTop: '2px',
          }}
        >
          <MessageReactions
            reactions={reactions}
            onToggleReaction={(emoji) => onToggleReaction?.(emoji)}
            isOwn={isOwn}
            activeChatId={chatId}
          />
          <div
            className="flex-shrink-0 select-none message-time-badge ml-auto"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              lineHeight: 1,
              alignSelf: 'flex-end',
            }}
          >
            {timeNode}
          </div>
        </div>
      )}

      {!hasReactions && (
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
      )}
    </div>
  );
});
