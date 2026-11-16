import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Download,
  RotateCw,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useDecryptedMedia } from '../../lib/media-utils';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { mediaManager } from '../../services/mediaManager';
import { arrayBufferToBase64 } from '../../utils/messageUtils';
import { useToastStore } from '../../store/useToastStore';
import { useChatStore, FONT_MAP, FontFamily } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  MediaViewerItem,
  TelegramMediaViewerProps,
  formatTelegramDate,
  formatVideoTime,
} from './media-viewer/types';
import { CarouselThumbnail } from './media-viewer/CarouselThumbnail';
import { MediaViewerHeader } from './media-viewer/MediaViewerHeader';
import { MediaViewerOptionsMenu } from './media-viewer/MediaViewerOptionsMenu';
import { MediaViewerVideoControls } from './media-viewer/MediaViewerVideoControls';

export type { MediaViewerItem, TelegramMediaViewerProps };
export { formatTelegramDate, formatVideoTime };

export const TelegramMediaViewer: React.FC<TelegramMediaViewerProps> = ({
  isOpen,
  items,
  initialIndex = 0,
  sharedSecret,
  showCarouselAlways = false,
  isWindowMode = false,
  onClose,
  onGoToMessage,
  onForwardMessage,
  onDeleteMessage,
  onOpenAllMedia,
}) => {
  const { t, i18n } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [rotation, setRotation] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initPanX: number; initPanY: number } | null>(null);

  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isVideoControlsHovered, setIsVideoControlsHovered] = useState(false);
  const videoProgressRef = useRef<HTMLDivElement>(null);
  const videoProgressFillRef = useRef<HTMLDivElement>(null);
  const videoTimeDisplayRef = useRef<HTMLSpanElement>(null);
  const isVideoDraggingRef = useRef(false);
  const [isVideoProgressHovered, setIsVideoProgressHovered] = useState(false);
  const isRepairingRef = useRef(false);
  const [videoFirstFrame, setVideoFirstFrame] = useState<string | null>(null);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const currentMediaKey = `${items[currentIndex]?.id || ''}_${items[currentIndex]?.url || ''}_${currentIndex}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const isCurrentMediaLoaded = Boolean(isMediaLoaded && loadedKey === currentMediaKey);

  const handleInstantClose = useCallback(() => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
    }
    const el = document.getElementById('telegram-media-viewer-root');
    if (el) el.style.display = 'none';
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      } catch {}
    }
    onClose();
  }, [onClose]);

  const captureVideoFrame = useCallback((force = false) => {
    if (!videoRef.current) return null;
    const v = videoRef.current;
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(v.videoWidth, 640);
      canvas.height = Math.round(canvas.width * (v.videoHeight / v.videoWidth));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl && dataUrl.length > 256) {
          setVideoFirstFrame((prev) => {
            if (!prev || force || v.currentTime > 0.05) {
              return dataUrl;
            }
            return prev;
          });
          return dataUrl;
        }
      }
    } catch {}
    return null;
  }, []);

  const carouselRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const resetIdleTimer = useCallback(() => {
    setAreControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setAreControlsVisible(false);
    }, 2500);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const el = document.getElementById('telegram-media-viewer-root');
      if (el) el.style.display = 'flex';
      useChatStore.getState().setMediaViewerOpen(true);
      return () => {
        useChatStore.getState().setMediaViewerOpen(false);
      };
    } else {
      useChatStore.getState().setMediaViewerOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setAreControlsVisible(true);
    resetIdleTimer();

    const handleGlobalMouseMove = () => {
      resetIdleTimer();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isOpen, resetIdleTimer]);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevItems, setPrevItems] = useState(items);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);

  if (isOpen && (!prevIsOpen || items !== prevItems || initialIndex !== prevInitialIndex)) {
    setPrevIsOpen(isOpen);
    setPrevItems(items);
    setPrevInitialIndex(initialIndex);
    setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
    setRotation(0);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setShowOptionsMenu(false);
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setFallbackBlobUrl(null);
  }, [currentIndex, items[currentIndex]?.id, items[currentIndex]?.url]);

  useEffect(() => {
    if (!isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        resetIdleTimer();
        const delta = -e.deltaY * 0.0025;
        setZoomScale((prev) => {
          const next = Math.max(1, Math.min(15, prev + delta * prev));
          if (next <= 1) {
            setPanOffset({ x: 0, y: 0 });
            return 1;
          }
          return next;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isOpen, resetIdleTimer]);

  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (zoomScale > 1 && e.button === 0) {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initPanX: panOffset.x,
        initPanY: panOffset.y,
      };
    }
  };

  const handleGlobalMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setPanOffset({
        x: dragStartRef.current.initPanX + dx,
        y: dragStartRef.current.initPanY + dy,
      });
    }
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleImageDoubleClick = () => {
    if (zoomScale > 1) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoomScale(2.5);
    }
  };

  const currentItem: MediaViewerItem | undefined = items[currentIndex];
  const isAvatar = Boolean(
    (currentItem as any)?.isAvatar ||
    currentItem?.id?.startsWith('avatar') ||
    currentItem?.id?.startsWith('my_avatar') ||
    currentItem?.name?.toLowerCase().includes('avatar')
  );
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null);
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);
  const currentItemKey = `${currentItem?.id || ''}_${currentItem?.url || ''}_${currentIndex}`;

  if (activeItemKey !== currentItemKey) {
    setActiveItemKey(currentItemKey);
    setFallbackBlobUrl(null);
    setVideoFirstFrame(null);
    setIsMediaLoaded(false);
    setLoadedKey(null);
    if (currentItem?.width && currentItem?.height) {
      setMediaDimensions({ width: currentItem.width, height: currentItem.height });
    } else if (isAvatar) {
      setMediaDimensions({ width: 640, height: 640 });
    } else {
      setMediaDimensions(null);
    }
  }

  useEffect(() => {
    if (currentItem?.width && currentItem?.height) {
      setMediaDimensions({ width: currentItem.width, height: currentItem.height });
    } else if (isAvatar) {
      setMediaDimensions({ width: 640, height: 640 });
    } else {
      setMediaDimensions(null);
    }
  }, [currentIndex, currentItem?.id, currentItem?.width, currentItem?.height, isAvatar]);

  const effectiveSecret = currentItem?.key || currentItem?.sharedSecret || sharedSecret;
  const cachedDecrypted = useMemo(() => {
    if (!currentItem?.url) return null;
    return mediaManager.getCachedMedia(currentItem.url, effectiveSecret || '');
  }, [currentItem?.url, effectiveSecret]);

  const validDirectUrl = currentItem?.directUrl || null;
  const hasDirectReady = Boolean(validDirectUrl && (validDirectUrl.startsWith('blob:') || validDirectUrl.startsWith('data:') || validDirectUrl.startsWith('http')));

  const { blobUrl, blob } = useDecryptedMedia(
    currentItem?.url || null,
    effectiveSecret,
    currentItem?.name,
    currentItem?.mime,
    currentItem?.chatId,
    currentItem?.messageId,
    !hasDirectReady
  );
  const isGif = currentItem?.type === 'gif' || Boolean(
    (currentItem?.mime === 'image/gif') ||
    (currentItem?.name && /\.gif(\?.*)?$/i.test(currentItem.name)) ||
    (currentItem?.url && (/\.gif(\?.*)?$/i.test(currentItem.url) || currentItem.url.includes('tenor.com') || currentItem.url.includes('giphy.com'))) ||
    (currentItem?.caption && /^\[GIF\]/i.test(currentItem.caption.trim()))
  );
  const isVideo = !isGif && Boolean(
    currentItem?.type === 'video' ||
    currentItem?.type === 'videos' ||
    Boolean(currentItem?.mime && currentItem.mime.startsWith('video/')) ||
    Boolean(currentItem?.name && /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(currentItem.name)) ||
    Boolean(currentItem?.url && /\.(mp4|mov|avi|webm|mkv|m4v)(\?.*)?$/i.test(currentItem.url))
  );
  const isPhoto = !isVideo && !isGif;

  const isPlaintextUrl = Boolean(currentItem?.url && (currentItem.url.startsWith('blob:') || currentItem.url.startsWith('data:') || currentItem.url.includes('tenor.com') || currentItem.url.includes('giphy.com')));
  const isBlobUrlForCurrent = Boolean(blobUrl && currentItem?.url);
  const validBlobUrl = isBlobUrlForCurrent ? blobUrl : null;
  const validCachedUrl = cachedDecrypted?.blobUrl || null;
  const displaySrc = (hasDirectReady ? validDirectUrl : null) || validCachedUrl || fallbackBlobUrl || validBlobUrl || (isPlaintextUrl ? currentItem?.url : null) || validDirectUrl;
  const previewSrc = currentItem?.thumbnail || currentItem?.blurPreview || (currentItem as any)?.preview || videoFirstFrame;
  const placeholderSrc = previewSrc || (isPhoto ? (hasDirectReady ? validDirectUrl : (isPlaintextUrl ? currentItem?.url : null)) : undefined);

  useEffect(() => {
    setIsMediaLoaded(false);
    setLoadedKey(null);
  }, [currentIndex, displaySrc, currentItem?.id, currentItem?.url]);

  useEffect(() => {
    if (!isOpen || !isVideo || !displaySrc) return;
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
      video.muted = isMuted;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().then(() => {
            setIsPlaying(true);
          }).catch(() => {
            setIsPlaying(false);
          });
        });
      }
    }
  }, [isOpen, isVideo, displaySrc, currentIndex, playbackRate, isMuted]);

  const isAlbumItem = Boolean(currentItem?.isAlbum && currentItem?.albumGroupId);
  const carouselItems = useMemo(() => {
    if (showCarouselAlways) return items;
    if (isAlbumItem && currentItem?.albumGroupId) {
      return items.filter((it) => it.albumGroupId === currentItem.albumGroupId);
    }
    return [];
  }, [showCarouselAlways, isAlbumItem, currentItem?.albumGroupId, items]);

  useEffect(() => {
    if (carouselRef.current && carouselItems.length > 0) {
      const activeItemIndex = carouselItems.findIndex((it) => it === currentItem || it.id === currentItem?.id);
      if (activeItemIndex !== -1) {
        const activeChild = carouselRef.current.children[activeItemIndex] as HTMLElement | undefined;
        if (activeChild) {
          activeChild.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }
  }, [currentIndex, carouselItems, currentItem]);

  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    const timer = setTimeout(() => {
      const preloadIndices = [
        currentIndex + 1,
        currentIndex + 2,
        currentIndex + 3,
        currentIndex - 1,
        currentIndex - 2,
      ].filter((idx) => idx >= 0 && idx < items.length);

      preloadIndices.forEach((idx) => {
        const item = items[idx];
        const itemSecret = item?.key || item?.sharedSecret || sharedSecret;
        if (item && item.url && !item.url.startsWith('blob:') && !item.url.startsWith('data:')) {
          mediaManager.getMedia(item.url, itemSecret || '', item.name, undefined, item.messageId).catch(() => {});
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, currentIndex, items, sharedSecret]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetIdleTimer();
      if (e.key === 'Escape') {
        e.preventDefault();
        handleInstantClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isVideo && videoRef.current && !e.shiftKey) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          setCurrentTime(videoRef.current.currentTime);
        } else if (currentIndex > 0) {
          setCurrentIndex((idx) => idx - 1);
          setRotation(0);
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isVideo && videoRef.current && !e.shiftKey) {
          videoRef.current.currentTime = Math.min(duration || 10000, videoRef.current.currentTime + 5);
          setCurrentTime(videoRef.current.currentTime);
        } else if (currentIndex < items.length - 1) {
          setCurrentIndex((idx) => idx + 1);
          setRotation(0);
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
        }
      } else if (e.key === ' ' && isVideo && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => { });
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, items.length, isVideo, duration, handleInstantClose, resetIdleTimer]);

  useEffect(() => {
    if (!showOptionsMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showOptionsMenu]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [isVideo, displaySrc]);

  useEffect(() => {
    setVideoFirstFrame(null);
  }, [currentIndex]);

  const usersById = useChatStore((s) => s.usersById);
  const myUserId = useAuthStore((s) => s.userId);
  const myNickname = useAuthStore((s) => s.nickname);

  const dynamicSender = useMemo(() => {
    if (!currentItem) return '';
    const sid = currentItem.senderId;
    if (sid) {
      if (myUserId && sid === myUserId) {
        return myNickname || currentItem.sender || '';
      }
      const user = (usersById || {})[sid];
      if (user?.nickname) {
        return user.nickname;
      }
    }
    if (currentItem.isOwn && myNickname) {
      return myNickname;
    }
    return currentItem.sender || '';
  }, [currentItem, usersById, myUserId, myNickname]);

  const senderNick = dynamicSender || (currentItem?.chatId ? useChatStore.getState().chats.find((c) => c.id === currentItem.chatId)?.name : null) || 'Orbita';

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const handleInstantCloseRef = useRef(handleInstantClose);
  handleInstantCloseRef.current = handleInstantClose;

  useEffect(() => {
    if (!isOpen || !isVideo || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.setActionHandler('play', () => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (currentIndexRef.current > 0) {
        setCurrentIndex(currentIndexRef.current - 1);
        setRotation(0);
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
      }
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (currentIndexRef.current < itemsRef.current.length - 1) {
        setCurrentIndex(currentIndexRef.current + 1);
        setRotation(0);
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
      }
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number' && videoRef.current) {
        videoRef.current.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      handleInstantCloseRef.current();
    });

    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'none';
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('seekto', null);
          navigator.mediaSession.setActionHandler('stop', null);
        } catch {}
      }
    };
  }, [isOpen, isVideo]);

  useEffect(() => {
    if (!isOpen || !isVideo || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const rawArtwork = videoFirstFrame || currentItem?.thumbnail || currentItem?.blurPreview || '/icons/512x512.png';
    const resolvedArtwork = rawArtwork.startsWith('/')
      ? new URL(rawArtwork, window.location.href).href
      : rawArtwork;

    const mime = (resolvedArtwork.startsWith('data:image/png') || resolvedArtwork.endsWith('.png'))
      ? 'image/png'
      : 'image/jpeg';

    const artworkList = [
      { src: resolvedArtwork, sizes: '512x512', type: mime },
      { src: resolvedArtwork, sizes: '384x384', type: mime },
      { src: resolvedArtwork, sizes: '256x256', type: mime },
      { src: resolvedArtwork, sizes: '192x192', type: mime },
      { src: resolvedArtwork, sizes: '128x128', type: mime },
      { src: resolvedArtwork, sizes: '96x96', type: mime },
    ];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: senderNick,
        artist: senderNick,
        album: 'Orbita',
        artwork: artworkList,
      });
    } catch {}
  }, [isOpen, isVideo, senderNick, videoFirstFrame, currentItem?.thumbnail, currentItem?.blurPreview]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !isVideo) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}
  }, [isPlaying, isVideo]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !isVideo) return;
    if ('setPositionState' in navigator.mediaSession && duration && isFinite(duration) && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: playbackRate || 1,
          position: Math.min(Math.max(0, currentTime), duration),
        });
      } catch {}
    }
  }, [currentTime, duration, playbackRate, isVideo]);

  const handleDownload = useCallback(async () => {
    if (!displaySrc || !currentItem) return;
    const isAnimation = isGif || Boolean(currentItem.name && (currentItem.name.endsWith('.mp4') || currentItem.name.includes('animation') || currentItem.name.endsWith('.gif')));
    const rawName = currentItem.name || (isVideo || isAnimation ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`);
    const defaultName = isAnimation ? rawName.replace(/\.gif$/i, '.mp4') : rawName;

    const filters = (isVideo || isAnimation)
      ? [{ name: 'video/mp4 (*.mp4 *.mp4v *.mpg4)', extensions: ['mp4', 'mp4v', 'mpg4'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }, { name: 'All Files', extensions: ['*'] }];

    try {
      if (window.orbita && window.orbita.saveFileAs) {
        let arrayBuffer: ArrayBuffer | null = null;
        if (blob) {
          arrayBuffer = await blob.arrayBuffer();
        } else if (displaySrc.startsWith('blob:') || displaySrc.startsWith('data:')) {
          const response = await fetch(displaySrc);
          const fetchedBlob = await response.blob();
          arrayBuffer = await fetchedBlob.arrayBuffer();
        } else {
          const fileSecret = currentItem.key || currentItem.sharedSecret;
          if (fileSecret) {
            const item = await mediaManager.getMedia(displaySrc, fileSecret, defaultName);
            if (item && item.blobUrl) {
              const response = await fetch(item.blobUrl);
              const fetchedBlob = await response.blob();
              arrayBuffer = await fetchedBlob.arrayBuffer();
            }
          }
          if (!arrayBuffer) {
            const response = await fetch(displaySrc);
            const fetchedBlob = await response.blob();
            arrayBuffer = await fetchedBlob.arrayBuffer();
          }
        }
        if (arrayBuffer) {
          const uint8 = new Uint8Array(arrayBuffer);
          await window.orbita.saveFileAs(uint8, defaultName, filters);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to save file:', err);
    }
    const a = document.createElement('a');
    a.href = displaySrc;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [displaySrc, currentItem, isVideo, isGif, blob]);

  const handleCopyImage = useCallback(async () => {
    if (!displaySrc) return;
    try {
      let imageBlob = blob;
      if (!imageBlob) {
        const response = await fetch(displaySrc);
        imageBlob = await response.blob();
      }
      const arrayBuffer = await imageBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      if (window.orbita && window.orbita.copyImage) {
        await window.orbita.copyImage(base64);
        useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ [imageBlob.type || 'image/png']: imageBlob }),
      ]);
      useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  }, [displaySrc, blob, t]);

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.muted = isMuted;
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      if (newVol === 0) {
        videoRef.current.muted = true;
        setIsMuted(true);
      } else if (isMuted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      }
    }
  }, [isMuted]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
        if (!next && volume === 0) {
          setVolume(1);
          videoRef.current.volume = 1;
        }
      }
      return next;
    });
  }, [volume]);

  const handleSelectSpeed = useCallback((speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);


  const handleCopyFrame = useCallback(async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    if (!v.videoWidth || !v.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        if (window.orbita?.copyImage) {
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
          await window.orbita.copyImage(base64);
        }
        canvas.toBlob(async (blob) => {
          if (blob && navigator.clipboard && (window as any).ClipboardItem) {
            try {
              await navigator.clipboard.write([
                new (window as any).ClipboardItem({ 'image/png': blob }),
              ]);
            } catch {}
          }
        }, 'image/png');
        useToastStore.getState().showToast(t('mediaViewer.frameCopied', 'Кадр скопирован в буфер обмена'), 'image');
      }
    } catch {}
  }, [t]);

  const handleSendFromTime = useCallback((timeSec: number) => {
    const timeFormatted = formatVideoTime(timeSec);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(timeFormatted).catch(() => {});
    }
    useToastStore.getState().showToast(t('mediaViewer.timestampCopied', 'Отметка времени скопирована'), 'text');
  }, [t]);

  const handleOpenAllMedia = useCallback(() => {
    if (onOpenAllMedia) {
      onOpenAllMedia();
      return;
    }
    if (currentItem?.chatId) {
      useChatStore.getState().setActiveProfileChatId(currentItem.chatId);
      handleInstantClose();
    }
  }, [onOpenAllMedia, currentItem?.chatId, handleInstantClose]);

  useEffect(() => {
    if (!isVideo) return;
    let animId: number;
    const tick = () => {
      const v = videoRef.current;
      if (v && !isVideoDraggingRef.current) {
        const cur = v.currentTime;
        const dur = (v.duration && isFinite(v.duration)) ? v.duration : (duration || 0);
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        if (videoProgressFillRef.current) {
          videoProgressFillRef.current.style.width = `${pct}%`;
        }
        if (videoTimeDisplayRef.current) {
          videoTimeDisplayRef.current.textContent = `${formatVideoTime(cur)}/${formatVideoTime(dur)}`;
        }
      }
      if (videoRef.current && !videoRef.current.paused) {
        animId = requestAnimationFrame(tick);
      }
    };
    if (isPlaying) {
      animId = requestAnimationFrame(tick);
    } else {
      const v = videoRef.current;
      const cur = v ? v.currentTime : currentTime;
      const dur = (v && v.duration && isFinite(v.duration)) ? v.duration : (duration || 0);
      const pct = dur > 0 ? (cur / dur) * 100 : 0;
      if (videoProgressFillRef.current) {
        videoProgressFillRef.current.style.width = `${pct}%`;
      }
      if (videoTimeDisplayRef.current) {
        videoTimeDisplayRef.current.textContent = `${formatVideoTime(cur)}/${formatVideoTime(dur)}`;
      }
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isVideo, isPlaying, duration, currentTime]);

  const updateVideoProgress = useCallback((clientX: number) => {
    const el = videoProgressRef.current;
    const video = videoRef.current;
    const dur = (video && video.duration && isFinite(video.duration)) ? video.duration : (duration || 0);
    if (!el || !video || !dur || dur <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const rawPercent = (clientX - rect.left) / rect.width;
    const clampedPercent = Math.max(0, Math.min(rawPercent, 1));
    const newTime = clampedPercent * dur;

    if (videoProgressFillRef.current) {
      videoProgressFillRef.current.style.width = `${clampedPercent * 100}%`;
    }
    if (videoTimeDisplayRef.current) {
      videoTimeDisplayRef.current.textContent = `${formatVideoTime(newTime)}/${formatVideoTime(dur)}`;
    }
    return newTime;
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isVideoDraggingRef.current = true;
    updateVideoProgress(e.clientX);
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isVideoDraggingRef.current) return;
      updateVideoProgress(moveEvent.clientX);
    };
    const handleMouseUp = (upEvent: MouseEvent) => {
      if (isVideoDraggingRef.current) {
        isVideoDraggingRef.current = false;
        const finalTime = updateVideoProgress(upEvent.clientX);
        if (videoRef.current && finalTime !== undefined) {
          videoRef.current.currentTime = finalTime;
          setCurrentTime(finalTime);
        }
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [updateVideoProgress]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return;
    e.stopPropagation();
    isVideoDraggingRef.current = true;
    updateVideoProgress(e.touches[0].clientX);
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (!isVideoDraggingRef.current || !moveEvent.touches[0]) return;
      updateVideoProgress(moveEvent.touches[0].clientX);
    };
    const handleTouchEnd = (endEvent: TouchEvent) => {
      if (isVideoDraggingRef.current) {
        isVideoDraggingRef.current = false;
        const touch = endEvent.changedTouches[0];
        if (touch) {
          const finalTime = updateVideoProgress(touch.clientX);
          if (videoRef.current && finalTime !== undefined) {
            videoRef.current.currentTime = finalTime;
            setCurrentTime(finalTime);
          }
        }
      }
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  }, [updateVideoProgress]);

  useEffect(() => {
    if (!isOpen) return;

    document.body.setAttribute('data-media-viewer-open', 'true');
    const pausedVideos = new Set<HTMLVideoElement>();

    const pauseBackgroundVideos = () => {
      const viewerRoot = document.getElementById('telegram-media-viewer-root');
      const allVideos = Array.from(document.querySelectorAll('#root video')) as HTMLVideoElement[];
      allVideos.forEach((v) => {
        if (viewerRoot && viewerRoot.contains(v)) return;
        if (!v.paused) {
          try {
            v.pause();
            pausedVideos.add(v);
          } catch {}
        }
      });
    };

    pauseBackgroundVideos();

    return () => {
      document.body.removeAttribute('data-media-viewer-open');
      pausedVideos.forEach((v) => {
        try {
          v.play().catch(() => {});
        } catch {}
      });
    };
  }, [isOpen]);

  useEffect(() => {
    const orbita = (window as any).orbita;
    const checkMaximized = async () => {
      try {
        if (orbita?.isWindowMaximized) {
          const result = await orbita.isWindowMaximized();
          setIsWindowMaximized(result);
        }
      } catch { }
    };
    checkMaximized();

    let unsubscribe: (() => void) | undefined;
    try {
      if (orbita?.onWindowStateChange) {
        unsubscribe = orbita.onWindowStateChange((maximized: boolean) => {
          setIsWindowMaximized(maximized);
        });
      }
    } catch { }

    return () => {
      unsubscribe?.();
    };
  }, []);

  if (!isOpen) return null;

  const typeLabel = isVideo ? t('mediaViewer.video', 'Видео') : isGif ? t('mediaViewer.gif', 'GIF') : t('mediaViewer.photo', 'Фотография');
  const dateStr = currentItem?.time ? formatTelegramDate(currentItem.time, i18n.language) : '';
  const senderStr = dynamicSender;

  const userFontFamily = useChatStore((s) => s.fontFamily);
  const activeFont = (userFontFamily && userFontFamily !== 'system' && FONT_MAP[userFontFamily as FontFamily]) 
    ? FONT_MAP[userFontFamily as FontFamily] 
    : 'var(--main-font, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)';

  const viewerContent = (
    <div
      id="telegram-media-viewer-root"
      style={{
        position: isWindowMode ? 'relative' : 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: isWindowMode ? 1 : 999999,
        backgroundColor: isWindowMode ? 'transparent' : 'rgba(33, 37, 41, 0.85)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        overflow: 'hidden',
        cursor: areControlsVisible ? (zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default') : 'none',
        fontFamily: activeFont,
      }}
      onClick={handleInstantClose}
    >
      <style>{`
        #telegram-media-viewer-root,
        #telegram-media-viewer-root * {
          font-family: var(--main-font, inherit) !important;
        }
        @keyframes tgSpinner {
          to { transform: rotate(360deg); }
        }
        @keyframes spin-ring {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        body[data-media-viewer-open="true"] #root * {
          animation-play-state: paused !important;
        }
      `}</style>
      {!isWindowMode && (
        <MediaViewerHeader
          areControlsVisible={areControlsVisible}
          isWindowMaximized={isWindowMaximized}
          onClose={handleInstantClose}
        />
      )}

      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
              setCurrentIndex((i) => i - 1);
              setRotation(0);
              setZoomScale(1);
              setPanOffset({ x: 0, y: 0 });
            }
          }}
          disabled={currentIndex === 0}
          style={{
            position: isWindowMode ? 'absolute' : 'fixed',
            left: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            cursor: currentIndex > 0 ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: currentIndex === 0 ? 0 : (isPhoto || areControlsVisible ? 1 : 0),
            pointerEvents: currentIndex > 0 && (isPhoto || areControlsVisible) ? 'auto' : 'none',
            transition: 'none',
            zIndex: 100,
            backgroundColor: 'transparent',
            color: 'rgba(255, 255, 255, 0.65)',
          }}
          onMouseEnter={(e) => {
            if (currentIndex > 0) {
              e.currentTarget.style.backgroundColor = 'rgba(65, 65, 70, 0.85)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)';
          }}
          aria-label={t('mediaViewer.previousPhoto', 'Предыдущее')}
        >
          <ChevronLeft size={26} strokeWidth={2.2} />
        </button>
      )}

      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex < items.length - 1) {
              setCurrentIndex((i) => i + 1);
              setRotation(0);
              setZoomScale(1);
              setPanOffset({ x: 0, y: 0 });
            }
          }}
          disabled={currentIndex === items.length - 1}
          style={{
            position: isWindowMode ? 'absolute' : 'fixed',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            cursor: currentIndex < items.length - 1 ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: currentIndex === items.length - 1 ? 0 : (isPhoto || areControlsVisible ? 1 : 0),
            pointerEvents: currentIndex < items.length - 1 && (isPhoto || areControlsVisible) ? 'auto' : 'none',
            transition: 'none',
            zIndex: 100,
            backgroundColor: 'transparent',
            color: 'rgba(255, 255, 255, 0.65)',
          }}
          onMouseEnter={(e) => {
            if (currentIndex < items.length - 1) {
              e.currentTarget.style.backgroundColor = 'rgba(65, 65, 70, 0.85)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)';
          }}
          aria-label={t('mediaViewer.nextPhoto', 'Следующее')}
        >
          <ChevronRight size={26} strokeWidth={2.2} />
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          pointerEvents: 'none',
          paddingTop: 54,
          paddingBottom: carouselItems.length > 1 ? 160 : 100,
          paddingLeft: 60,
          paddingRight: 60,
          boxSizing: 'border-box',
        }}
      >
        {displaySrc ? (
          isVideo ? (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
                aspectRatio: mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : undefined,
                maxWidth: mediaDimensions ? `${mediaDimensions.width}px` : '100%',
                maxHeight: mediaDimensions ? `${mediaDimensions.height}px` : '100%',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                clipPath: 'inset(0)',
              }}
              onMouseEnter={() => setIsVideoControlsHovered(true)}
              onMouseLeave={() => setIsVideoControlsHovered(false)}
            >
              {placeholderSrc && !isCurrentMediaLoaded && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    clipPath: 'inset(0)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                >
                  <img
                    src={placeholderSrc}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: '-20px',
                      width: 'calc(100% + 40px)',
                      height: 'calc(100% + 40px)',
                      objectFit: 'cover',
                      filter: 'blur(20px)',
                      transform: 'scale(1.15)',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  />
                </div>
              )}
              <video
                key={displaySrc || currentItem?.id || String(currentIndex)}
                ref={videoRef}
                src={displaySrc}
                crossOrigin="anonymous"
                poster={currentItem?.thumbnail && (!currentItem.thumbnail.startsWith('data:') || currentItem.thumbnail.length > 2048) ? currentItem.thumbnail : undefined}
                playsInline
                preload="auto"
                disableRemotePlayback
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                onClick={handleTogglePlay}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    const vw = videoRef.current.videoWidth;
                    const vh = videoRef.current.videoHeight;
                    if (vw && vh) {
                      setMediaDimensions({ width: vw, height: vh });
                    }
                    if (videoRef.current.duration && isFinite(videoRef.current.duration)) {
                      setDuration(videoRef.current.duration);
                      setCurrentTime(videoRef.current.currentTime);
                      videoRef.current.playbackRate = playbackRate;
                    }
                  }
                }}
                onLoadedData={() => {
                  setIsMediaLoaded(true);
                  setLoadedKey(currentMediaKey);
                  captureVideoFrame();
                }}
                onCanPlay={() => {
                  setIsMediaLoaded(true);
                  setLoadedKey(currentMediaKey);
                  captureVideoFrame();
                  if (videoRef.current && isPlaying && videoRef.current.paused) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onSeeked={() => {
                  captureVideoFrame(true);
                }}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                    if (!videoFirstFrame && videoRef.current.currentTime > 0.05) {
                      captureVideoFrame();
                    }
                  }
                }}
                onPlay={() => {
                  setIsPlaying(true);
                  if (!videoFirstFrame) {
                    captureVideoFrame();
                  }
                }}
                onPlaying={() => {
                  setIsPlaying(true);
                  if (!videoFirstFrame) {
                    captureVideoFrame();
                  }
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={async () => {
                  if (currentItem?.url && !isRepairingRef.current) {
                    isRepairingRef.current = true;
                    try {
                      if (window.orbita?.repairVideoMedia) {
                        const res = await window.orbita.repairVideoMedia(currentItem.url);
                        if (res?.data) {
                          const repairedBlob = new Blob([res.data], { type: 'video/mp4' });
                          const repairedBlobUrl = URL.createObjectURL(repairedBlob);
                          mediaManager.addToMemoryCache(
                            `${currentItem.url}::${currentItem.key || currentItem.sharedSecret || sharedSecret || 'public'}`,
                            {
                              id: currentItem.url,
                              blobUrl: repairedBlobUrl,
                              blob: repairedBlob,
                              imageBitmap: null,
                              mimeType: 'video/mp4',
                              size: repairedBlob.size,
                              lastAccessed: Date.now(),
                            }
                          );
                          setFallbackBlobUrl(repairedBlobUrl);
                          return;
                        }
                      }
                      if (!fallbackBlobUrl) {
                        const media = await mediaManager.getMedia(
                          currentItem.url,
                          effectiveSecret || '',
                          currentItem.name,
                          currentItem.chatId,
                          currentItem.messageId,
                          currentItem.mime || 'video/mp4'
                        );
                        if (media?.blobUrl) {
                          setFallbackBlobUrl(media.blobUrl);
                        }
                      }
                    } catch {} finally {
                      isRepairingRef.current = false;
                    }
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'block',
                  transform: (rotation !== 0 || zoomScale > 1 || panOffset.x !== 0 || panOffset.y !== 0)
                    ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) rotate(${rotation}deg) scale(${zoomScale})`
                    : 'none',
                  filter: isMediaLoaded ? 'blur(0px)' : 'blur(8px)',
                  transition: isMediaLoaded ? 'filter 0.15s ease' : 'none',
                  position: 'relative',
                  zIndex: 2,
                }}
              />
              {!isCurrentMediaLoaded && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <MD3CircularSpinner size={60} color="var(--accent-color, #7C3AED)" />
                </div>
              )}
            </div>
          ) : isGif ? (
            displaySrc && (
              displaySrc.toLowerCase().includes('.mp4') ||
              displaySrc.toLowerCase().includes('.webm') ||
              displaySrc.startsWith('data:video/') ||
              (currentItem?.name && /\.(mp4|webm)$/i.test(currentItem.name)) ||
              (currentItem?.mime && currentItem.mime.startsWith('video/')) ||
              (currentItem?.url && (currentItem.url.includes('tenor.com') || currentItem.url.includes('giphy.com')))
            ) ? (
              <video
                src={displaySrc}
                autoPlay
                loop
                muted
                playsInline
                disableRemotePlayback
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                onClick={(e) => e.stopPropagation()}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) {
                    setMediaDimensions({ width: v.videoWidth, height: v.videoHeight });
                  }
                }}
                style={{
                  aspectRatio: mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : undefined,
                  maxWidth: mediaDimensions ? `${mediaDimensions.width}px` : '100%',
                  maxHeight: mediaDimensions ? `${mediaDimensions.height}px` : '100%',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: 0,
                  pointerEvents: 'auto',
                  display: 'block',
                }}
              />
            ) : (
              <img
                src={displaySrc}
                alt=""
                onClick={(e) => e.stopPropagation()}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setMediaDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  }
                }}
                style={{
                  aspectRatio: mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : undefined,
                  maxWidth: mediaDimensions ? `${mediaDimensions.width}px` : '100%',
                  maxHeight: mediaDimensions ? `${mediaDimensions.height}px` : '100%',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: 0,
                  pointerEvents: 'auto',
                  display: 'block',
                }}
                draggable={false}
              />
            )
          ) : (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: zoomScale > 1 ? 'none' : (isAvatar ? 'min(640px, 85vw, 85vh)' : '100%'),
                maxHeight: zoomScale > 1 ? 'none' : (isAvatar ? 'min(640px, 85vw, 85vh)' : '100%'),
                width: zoomScale > 1 ? 'auto' : (isAvatar ? 'min(640px, 85vw, 85vh)' : (mediaDimensions ? (mediaDimensions.width >= mediaDimensions.height ? 'min(100%, 100vw)' : 'auto') : 'auto')),
                height: zoomScale > 1 ? 'auto' : (isAvatar ? 'min(640px, 85vw, 85vh)' : (mediaDimensions ? (mediaDimensions.height > mediaDimensions.width ? 'min(100%, 100vh)' : 'auto') : 'auto')),
                aspectRatio: isAvatar ? '1 / 1' : (mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : undefined),
                overflow: zoomScale > 1 ? 'visible' : 'hidden',
                clipPath: zoomScale > 1 ? 'none' : 'inset(0)',
              }}
            >
              {placeholderSrc && !isCurrentMediaLoaded && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    clipPath: 'inset(0)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                >
                  <img
                    src={placeholderSrc}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setMediaDimensions((prev) => prev || { width: img.naturalWidth, height: img.naturalHeight });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      inset: '-20px',
                      width: 'calc(100% + 40px)',
                      height: 'calc(100% + 40px)',
                      objectFit: 'cover',
                      filter: 'blur(20px)',
                      transform: 'scale(1.15)',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  />
                </div>
              )}
              <img
                key={currentMediaKey}
                ref={(el) => {
                  if (el && el.complete && el.naturalWidth > 0 && !isCurrentMediaLoaded) {
                    setIsMediaLoaded(true);
                    setLoadedKey(currentMediaKey);
                    if (el.naturalWidth && el.naturalHeight) {
                      setMediaDimensions({ width: el.naturalWidth, height: el.naturalHeight });
                    }
                  }
                }}
                src={displaySrc}
                alt=""
                decoding="async"
                loading="eager"
                onLoad={(e) => {
                  setIsMediaLoaded(true);
                  setLoadedKey(currentMediaKey);
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setMediaDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  }
                }}
                style={{
                  maxWidth: zoomScale > 1 ? 'none' : (isAvatar ? 'min(640px, 85vw, 85vh)' : '100%'),
                  maxHeight: zoomScale > 1 ? 'none' : (isAvatar ? 'min(640px, 85vw, 85vh)' : '100%'),
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: 0,
                  transform: (rotation !== 0 || zoomScale > 1 || panOffset.x !== 0 || panOffset.y !== 0)
                    ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) rotate(${rotation}deg) scale(${zoomScale})`
                    : 'none',
                  opacity: isCurrentMediaLoaded ? 1 : 0,
                  cursor: areControlsVisible ? (zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default') : 'none',
                  pointerEvents: 'auto',
                  display: 'block',
                  userSelect: 'none',
                  position: 'relative',
                  zIndex: 2,
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={handleImageMouseDown}
                onDoubleClick={handleImageDoubleClick}
                draggable={false}
              />
              {!isCurrentMediaLoaded && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <MD3CircularSpinner size={60} color="var(--accent-color, #7C3AED)" />
                </div>
              )}
            </div>
          )
        ) : currentItem ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
            }}
          >
            {placeholderSrc && (
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  aspectRatio: isAvatar ? '1 / 1' : (mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : undefined),
                  maxWidth: isAvatar ? 'min(640px, 85vw, 85vh)' : '100%',
                  maxHeight: isAvatar ? 'min(640px, 85vw, 85vh)' : '100%',
                  width: isAvatar ? 'min(640px, 85vw, 85vh)' : (mediaDimensions ? (mediaDimensions.width >= mediaDimensions.height ? 'min(100%, 100vw)' : 'auto') : 'auto'),
                  height: isAvatar ? 'min(640px, 85vw, 85vh)' : (mediaDimensions ? (mediaDimensions.height > mediaDimensions.width ? 'min(100%, 100vh)' : 'auto') : 'auto'),
                  overflow: 'hidden',
                  clipPath: 'inset(0)',
                  pointerEvents: 'none',
                }}
              >
                <img
                  src={placeholderSrc}
                  alt=""
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setMediaDimensions((prev) => prev || { width: img.naturalWidth, height: img.naturalHeight });
                    }
                  }}
                  style={{
                    position: 'absolute',
                    inset: '-20px',
                    width: 'calc(100% + 40px)',
                    height: 'calc(100% + 40px)',
                    objectFit: 'cover',
                    filter: 'blur(20px)',
                    transform: 'scale(1.15)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                  draggable={false}
                />
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <MD3CircularSpinner size={60} color="var(--accent-color, #7C3AED)" />
            </div>
          </div>
        ) : null}
      </div>

      {isVideo && (
        <MediaViewerVideoControls
          carouselItemsLength={carouselItems.length}
          isPlaying={isPlaying}
          areControlsVisible={areControlsVisible}
          isVideoControlsHovered={isVideoControlsHovered}
          isVideoProgressHovered={isVideoProgressHovered}
          isMuted={isMuted}
          volume={volume}
          playbackRate={playbackRate}
          currentTime={currentTime}
          duration={duration}
          videoProgressRef={videoProgressRef}
          videoProgressFillRef={videoProgressFillRef}
          videoTimeDisplayRef={videoTimeDisplayRef}
          onTogglePlay={handleTogglePlay}
          onToggleMute={handleToggleMute}
          onVolumeChange={handleVolumeChange}
          onSelectSpeed={handleSelectSpeed}
          onProgressMouseDown={handleProgressMouseDown}
          onProgressTouchStart={handleProgressTouchStart}
          setIsVideoControlsHovered={setIsVideoControlsHovered}
          setIsVideoProgressHovered={setIsVideoProgressHovered}
        />
      )}

      {currentItem && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 70,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            opacity: areControlsVisible ? 1 : 0,
            pointerEvents: areControlsVisible ? 'auto' : 'none',
            transition: 'none',
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
              {items.length > 1 ? t('mediaViewer.counter', { type: typeLabel, current: currentIndex + 1, total: items.length }) : typeLabel}
            </span>
            <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)' }}>
              {senderStr ? `${senderStr} • ` : ''}{dateStr}
            </span>
          </div>

          {carouselItems.length > 1 && (
            <div
              ref={carouselRef}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                maxWidth: 'min(500px, 50vw)',
                overflowX: 'auto',
                padding: '4px 0',
              }}
              className="no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              {carouselItems.map((item) => {
                const globalIdx = items.indexOf(item);
                return (
                  <CarouselThumbnail
                    key={item.id}
                    item={item}
                    sharedSecret={sharedSecret}
                    isSelected={globalIdx === currentIndex}
                    onClick={() => {
                      if (globalIdx !== -1) {
                        setCurrentIndex(globalIdx);
                        setRotation(0);
                        setZoomScale(1);
                        setPanOffset({ x: 0, y: 0 });
                      }
                    }}
                  />
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, justifyContent: 'flex-end', position: 'relative' }}>
            {isPhoto && (
              <button
                onClick={handleRotate}
                style={{ background: 'none', border: 'none', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))', cursor: 'pointer', padding: 6, borderRadius: '50%' }}
                className="hover:text-white hover:bg-white/15 transition-colors"
                aria-label={t('mediaViewer.rotate', 'Повернуть')}
              >
                <RotateCw size={19} />
              </button>
            )}

            <button
              onClick={handleDownload}
              style={{ background: 'none', border: 'none', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))', cursor: 'pointer', padding: 6, borderRadius: '50%' }}
              className="hover:text-white hover:bg-white/15 transition-colors"
              aria-label={t('mediaViewer.save', 'Сохранить')}
            >
              <Download size={20} />
            </button>

            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              style={{ background: 'none', border: 'none', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))', cursor: 'pointer', padding: 6, borderRadius: '50%' }}
              className="hover:text-white hover:bg-white/15 transition-colors"
              aria-label={t('mediaViewer.options', 'Опции')}
            >
              <MoreVertical size={20} />
            </button>

            {showOptionsMenu && (
              <MediaViewerOptionsMenu
                ref={optionsMenuRef}
                currentItem={currentItem}
                isPhoto={isPhoto}
                isVideo={isVideo}
                currentTime={currentTime}
                onGoToMessage={onGoToMessage}
                onForwardMessage={onForwardMessage}
                onDeleteMessage={onDeleteMessage}
                onOpenAllMedia={onOpenAllMedia || handleOpenAllMedia}
                onClose={() => setShowOptionsMenu(false)}
                onCopyImage={handleCopyImage}
                onCopyFrame={handleCopyFrame}
                onSendFromTime={handleSendFromTime}
                onDownload={handleDownload}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return isWindowMode
    ? viewerContent
    : (typeof document !== 'undefined' ? createPortal(viewerContent, document.body) : null);
};
