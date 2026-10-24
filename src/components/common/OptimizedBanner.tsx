import React, { useRef, useEffect, useMemo, useState } from 'react';
import { optimizeBannerUrl } from './Avatar';

interface OptimizedBannerProps {
  src?: string | null;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export const OptimizedBanner: React.FC<OptimizedBannerProps> = ({
  src,
  className = '',
  style,
  alt = '',
}) => {
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cleanSrc = useMemo(() => {
    if (!src || typeof src !== 'string') return null;
    const trimmed = src.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
    return optimizeBannerUrl(trimmed, 1200) || trimmed;
  }, [src]);

  const isVideo = useMemo(() => {
    if (!cleanSrc || videoError) return false;
    const lower = cleanSrc.toLowerCase();
    if (lower.startsWith('data:video/')) return true;
    if (lower.includes('/video/')) return true;
    const ext = lower.split('.').pop()?.split('?')[0];
    return ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext || '');
  }, [cleanSrc, videoError]);

  useEffect(() => {
    setVideoError(false);
  }, [cleanSrc]);

  useEffect(() => {
    if (!isVideo || !cleanSrc) return;
    const el = videoRef.current;
    if (!el) return;

    let isVisible = false;

    const handleVisibility = () => {
      if (document.hidden) {
        el.pause();
      } else if (isVisible) {
        el.play().catch(() => {});
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = Boolean(entry && entry.isIntersecting);
        if (isVisible && !document.hidden) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isVideo, cleanSrc]);

  if (!cleanSrc) return null;

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={cleanSrc}
        muted
        loop
        playsInline
        preload="metadata"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`select-none ${className}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          transform: 'translateZ(0)',
          willChange: 'transform',
          ...style,
        }}
        onError={() => setVideoError(true)}
      />
    );
  }

  return (
    <img
      src={cleanSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={`select-none ${className}`}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        transform: 'translateZ(0)',
        willChange: 'transform',
        ...style,
      }}
    />
  );
};
