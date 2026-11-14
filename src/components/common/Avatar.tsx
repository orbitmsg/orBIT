import { useState, useMemo, useEffect, useRef } from 'react';

export const AVATAR_COLORS = [
  '#5865F2',
  '#10B981',
  '#3B82F6',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#14B8A6',
  '#6366F1',
];

export const AVATAR_GRADIENTS = AVATAR_COLORS;

export const getAvatarGradient = (seed?: string | null): string => {
  if (!seed || !seed.trim()) {
    const randomIndex = Math.floor(Math.random() * AVATAR_COLORS.length);
    return AVATAR_COLORS[randomIndex];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

interface AvatarProps {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function optimizeAvatarUrl(url: string | null | undefined, size = 128): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed.startsWith('undefined') || trimmed.startsWith('null')) {
    return null;
  }
  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/image/upload/')) {
    if (trimmed.includes('/f_auto') || trimmed.includes('/w_') || trimmed.includes('/q_auto')) {
      return trimmed;
    }
    return trimmed.replace(
      '/image/upload/',
      `/image/upload/c_fill,g_face,w_${size},h_${size},f_auto,q_auto/`
    );
  }
  return trimmed;
}

export function optimizeBannerUrl(url: string | null | undefined, width = 800): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed.startsWith('undefined') || trimmed.startsWith('null')) {
    return null;
  }
  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/image/upload/')) {
    if (trimmed.includes('/f_auto') || trimmed.includes('/w_') || trimmed.includes('/q_auto')) {
      return trimmed;
    }
    return trimmed.replace(
      '/image/upload/',
      `/image/upload/c_limit,w_${width},f_auto,q_auto/`
    );
  }
  return trimmed;
}

export const Avatar = ({ src, alt = '', className = '', style }: AvatarProps) => {
  const [videoError, setVideoError] = useState(false);
  const [imageError, setImageError] = useState(false);

  const cleanSrc = useMemo(() => {
    return optimizeAvatarUrl(src, 128);
  }, [src]);

  const cleanAlt = useMemo(() => {
    if (!alt || typeof alt !== 'string') return '';
    const trimmed = alt.trim();
    if (trimmed === 'undefined' || trimmed === 'null') return '';
    return trimmed;
  }, [alt]);

  const isVideo = useMemo(() => {
    if (!cleanSrc || videoError) return false;
    const lower = cleanSrc.toLowerCase();
    if (lower.startsWith('data:video/')) return true;
    if (lower.includes('/video/')) return true;
    const ext = lower.split('.').pop()?.split('?')[0];
    return ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext || '');
  }, [cleanSrc, videoError]);

  const videoRef = useRef<HTMLVideoElement>(null);

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

  const gradient = useMemo(() => getAvatarGradient(cleanAlt), [cleanAlt]);

  const computedFontSize = useMemo(() => {
    if (style?.fontSize) return style.fontSize;
    const pxMatch = className.match(/w-\[(\d+)px\]/);
    if (pxMatch) {
      const size = parseInt(pxMatch[1], 10);
      return `${Math.round(size * 0.46)}px`;
    }
    if (className.includes('w-24') || className.includes('w-[100px]') || className.includes('w-28') || className.includes('w-32') || className.includes('w-full')) {
      return '44px';
    }
    if (className.includes('w-20')) {
      return '34px';
    }
    if (className.includes('w-16')) {
      return '28px';
    }
    if (className.includes('w-14')) {
      return '24px';
    }
    if (className.includes('w-12')) {
      return '22px';
    }
    if (className.includes('w-10')) {
      return '19px';
    }
    if (className.includes('w-[34px]') || className.includes('w-9')) {
      return '16.5px';
    }
    if (className.includes('w-8') || className.includes('w-7')) {
      return '15px';
    }
    if (className.includes('w-6') || className.includes('w-[24px]')) {
      return '11px';
    }
    if (className.includes('w-[20px]') || className.includes('w-5')) {
      return '9px';
    }
    return '20px';
  }, [className, style?.fontSize]);

  const noDragStyle: React.CSSProperties = {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    ...({ WebkitUserDrag: 'none' } as any),
  };

  useEffect(() => {
    setImageError(false);
    setVideoError(false);
  }, [cleanSrc]);

  const effectiveRadius = style?.borderRadius && style.borderRadius !== '50%' ? style.borderRadius : '14px';

  if (!cleanSrc || (isVideo && videoError) || (!isVideo && imageError)) {
    return (
      <div
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`flex items-center justify-center rounded-[14px] flex-shrink-0 select-none ${className}`}
        style={{
          background: gradient,
          color: '#fff',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          borderRadius: effectiveRadius,
          border: 'none',
          outline: 'none',
          overflow: 'hidden',
          transform: 'translateZ(0)',
          ...noDragStyle,
          ...style,
        }}
      >
        <span
          style={{
            fontSize: computedFontSize,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {cleanAlt ? cleanAlt.charAt(0).toUpperCase() : '?'}
        </span>
      </div>
    );
  }

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
        className={`object-cover rounded-[14px] flex-shrink-0 select-none ${className}`}
        style={{
          borderRadius: effectiveRadius,
          border: 'none',
          outline: 'none',
          overflow: 'hidden',
          transform: 'translateZ(0)',
          willChange: 'transform',
          ...noDragStyle,
          ...style,
        }}
        onError={() => setVideoError(true)}
      />
    );
  }

  return (
    <img
      src={cleanSrc}
      alt={cleanAlt}
      decoding="async"
      loading="eager"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={`object-cover rounded-[14px] flex-shrink-0 select-none ${className}`}
      style={{
        borderRadius: effectiveRadius,
        border: 'none',
        outline: 'none',
        overflow: 'hidden',
        transform: 'translateZ(0)',
        willChange: 'transform',
        ...noDragStyle,
        ...style,
      }}
      onError={() => {
        setImageError(true);
      }}
    />
  );
};