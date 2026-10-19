import React, { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import { appVisibility } from '../../utils/appVisibility';

interface TgsPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  autoplay?: boolean;
  isPlaying?: boolean;
  playOnHover?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const MAX_CACHE_SIZE = 256;
const tgsCache = new Map<string, any>();
const pendingRequests = new Map<string, Promise<any>>();

export function clearTgsCache(): void {
  tgsCache.clear();
  pendingRequests.clear();
}

function getFromCache(key: string): any {
  if (!tgsCache.has(key)) return null;
  const val = tgsCache.get(key);
  tgsCache.delete(key);
  tgsCache.set(key, val);
  return val;
}

function addToCache(key: string, data: any): void {
  if (tgsCache.has(key)) {
    tgsCache.delete(key);
  } else if (tgsCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = tgsCache.keys().next().value;
    if (oldestKey) {
      tgsCache.delete(oldestKey);
    }
  }
  tgsCache.set(key, data);
}

const MAX_CONCURRENT_DECOMPRESSIONS = 8;
let activeDecompressions = 0;
const decompressionQueue: Array<() => void> = [];

async function acquireDecompressionSlot(): Promise<void> {
  if (activeDecompressions < MAX_CONCURRENT_DECOMPRESSIONS) {
    activeDecompressions++;
    return;
  }
  return new Promise((resolve) => {
    decompressionQueue.push(() => {
      activeDecompressions++;
      resolve();
    });
  });
}

function releaseDecompressionSlot(): void {
  activeDecompressions--;
  const next = decompressionQueue.shift();
  if (next) {
    next();
  }
}

type ObserverCallback = (isIntersecting: boolean) => void;
const observerCallbacks = new Map<Element, ObserverCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const cb = observerCallbacks.get(entry.target);
          if (cb) {
            cb(entry.isIntersecting);
          }
        }
      },
      { rootMargin: '120px 0px 120px 0px', threshold: 0.01 }
    );
  }
  return sharedObserver;
}

function observeElement(el: Element, cb: ObserverCallback): () => void {
  const obs = getSharedObserver();
  if (!obs) {
    cb(true);
    return () => {};
  }
  observerCallbacks.set(el, cb);
  obs.observe(el);
  return () => {
    observerCallbacks.delete(el);
    obs.unobserve(el);
  };
}

const lottieInitQueue: Array<() => void> = [];
let lottieInitScheduled = false;

function processLottieQueue() {
  const batch = lottieInitQueue.splice(0, 3);
  for (let i = 0; i < batch.length; i++) {
    batch[i]();
  }
  if (lottieInitQueue.length > 0) {
    requestAnimationFrame(processLottieQueue);
  } else {
    lottieInitScheduled = false;
  }
}

function scheduleLottieInit(fn: () => void): () => void {
  lottieInitQueue.push(fn);
  if (!lottieInitScheduled) {
    lottieInitScheduled = true;
    requestAnimationFrame(processLottieQueue);
  }
  return () => {
    const idx = lottieInitQueue.indexOf(fn);
    if (idx !== -1) {
      lottieInitQueue.splice(idx, 1);
    }
  };
}

export function prewarmTgsAnimations(urls: string[]): void {
  let idx = 0;
  function step() {
    if (idx >= urls.length) return;
    const url = urls[idx++];
    if (!getFromCache(url)) {
      loadTgsAnimation(url).finally(() => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(step);
        } else {
          setTimeout(step, 30);
        }
      });
    } else {
      step();
    }
  }
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(step);
  } else {
    setTimeout(step, 50);
  }
}

export async function loadTgsAnimation(src: string): Promise<any> {
  const cached = getFromCache(src);
  if (cached) {
    return cached;
  }
  if (pendingRequests.has(src)) {
    return pendingRequests.get(src)!;
  }

  const promise = (async () => {
    await acquireDecompressionSlot();
    try {
      const existing = getFromCache(src);
      if (existing) {
        return existing;
      }

      const candidateUrls: string[] = [];
      candidateUrls.push(src);
      if (src.startsWith('./')) {
        candidateUrls.push(src.slice(2));
        candidateUrls.push('/' + src.slice(2));
      } else if (src.startsWith('/')) {
        candidateUrls.push('.' + src);
        candidateUrls.push(src.slice(1));
      } else if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('blob:')) {
        candidateUrls.push('./' + src);
        candidateUrls.push('/' + src);
      }
      if (typeof window !== 'undefined' && window.location?.href) {
        try {
          candidateUrls.push(new URL(src, window.location.href).href);
        } catch {}
      }

      let buffer: ArrayBuffer | null = null;
      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          if (res && (res.ok || res.status === 0)) {
            const b = await res.arrayBuffer();
            if (b && b.byteLength > 0) {
              buffer = b;
              break;
            }
          }
        } catch {}

        try {
          const b = await new Promise<ArrayBuffer>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
              if ((xhr.status === 200 || xhr.status === 0) && xhr.response && (xhr.response as ArrayBuffer).byteLength > 0) {
                resolve(xhr.response as ArrayBuffer);
              } else {
                reject(new Error(`Status ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('XHR error'));
            xhr.send();
          });
          if (b && b.byteLength > 0) {
            buffer = b;
            break;
          }
        } catch {}
      }

      if (!buffer) {
        throw new Error(`Failed to load sticker binary: ${src}`);
      }

      let json: any = null;
      if (typeof DecompressionStream !== 'undefined') {
        try {
          const ds = new DecompressionStream('gzip');
          const blob = new Blob([buffer]);
          const decompressedStream = blob.stream().pipeThrough(ds);
          const decompressedBuffer = await new Response(decompressedStream).arrayBuffer();
          const text = new TextDecoder().decode(decompressedBuffer);
          json = JSON.parse(text);
        } catch {
          try {
            const ds2 = new DecompressionStream('deflate');
            const blob2 = new Blob([buffer]);
            const decompressedStream2 = blob2.stream().pipeThrough(ds2);
            const decompressedBuffer2 = await new Response(decompressedStream2).arrayBuffer();
            const text2 = new TextDecoder().decode(decompressedBuffer2);
            json = JSON.parse(text2);
          } catch {
            try {
              const text = new TextDecoder().decode(buffer);
              json = JSON.parse(text);
            } catch {}
          }
        }
      } else {
        const text = new TextDecoder().decode(buffer);
        json = JSON.parse(text);
      }

      if (!json) {
        throw new Error(`Failed to parse sticker: ${src}`);
      }

      addToCache(src, json);
      return json;
    } finally {
      releaseDecompressionSlot();
      pendingRequests.delete(src);
    }
  })();

  pendingRequests.set(src, promise);
  return promise;
}

export const TgsPlayer: React.FC<TgsPlayerProps> = ({
  src,
  className = '',
  style,
  loop = true,
  autoplay = true,
  isPlaying,
  playOnHover = false,
  onClick,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const isPlayingPropRef = useRef(isPlaying);
  isPlayingPropRef.current = isPlaying;
  const [shouldLoad, setShouldLoad] = useState<boolean>(() => !!getFromCache(src));
  const [animData, setAnimData] = useState<any>(() => getFromCache(src));
  const [isReady, setIsReady] = useState(false);
  const hasPlayedRef = useRef(false);
  const isIntersectingRef = useRef(false);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (!shouldLoad) return;
    let isMounted = true;
    const cached = getFromCache(src);
    if (!cached) {
      loadTgsAnimation(src)
        .then((data) => {
          if (isMounted) {
            setAnimData(data);
          }
        })
        .catch((err) => {
          console.error('[TgsPlayer] load error:', src, err);
        });
    } else {
      setAnimData(cached);
    }
    return () => {
      isMounted = false;
    };
  }, [src, shouldLoad]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !animData) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    let anim: AnimationItem | null = null;
    const cancelSchedule = scheduleLottieInit(() => {
      if (!containerRef.current) return;
      try {
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay: false,
          animationData: animData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
          },
        });
        anim.setSubframe(false);
        const handleReady = () => {
          setIsReady(true);
          const canPlay = appVisibility.getIsVisible() && !document.hidden && isIntersectingRef.current;
          if (!canPlay) {
            isPlayingRef.current = false;
            anim?.pause();
          } else if (isPlayingPropRef.current !== undefined) {
            if (isPlayingPropRef.current) {
              isPlayingRef.current = true;
              anim?.goToAndPlay(0, true);
            } else {
              isPlayingRef.current = false;
              anim?.goToAndStop(0, true);
            }
          } else if (autoplay) {
            isPlayingRef.current = true;
            anim?.goToAndPlay(0, true);
          }
        };
        anim.addEventListener('DOMLoaded', handleReady);
        anim.addEventListener('data_ready', handleReady);
        if ((anim as any).isLoaded) {
          handleReady();
        }
        setTimeout(() => {
          if (animRef.current) {
            setIsReady(true);
          }
        }, 60);
        anim.addEventListener('complete', () => {
          if (!loop) {
            isPlayingRef.current = false;
          }
        });
        animRef.current = anim;

        const isAppVis = appVisibility.getIsVisible() && !document.hidden;
        if (isIntersectingRef.current && isAppVis) {
          if (isPlayingPropRef.current !== undefined) {
            if (isPlayingPropRef.current) {
              isPlayingRef.current = true;
              anim.goToAndPlay(0, true);
            } else {
              isPlayingRef.current = false;
              anim.goToAndStop(0, true);
            }
          } else if (loop && autoplay) {
            isPlayingRef.current = true;
            anim.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            anim.goToAndPlay(0, true);
          } else {
            anim.goToAndStop(0, true);
          }
        } else {
          anim.goToAndStop(0, true);
        }
      } catch (e) {
        console.error('[TgsPlayer] render error:', e);
      }
    });

    return () => {
      cancelSchedule();
      if (anim) {
        anim.destroy();
      }
      if (containerRef.current) {
        const canvases = containerRef.current.querySelectorAll('canvas');
        canvases.forEach((c) => {
          c.width = 0;
          c.height = 0;
        });
        containerRef.current.innerHTML = '';
      }
      animRef.current = null;
      isPlayingRef.current = false;
      setIsReady(false);
    };
  }, [animData, loop, autoplay]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      setShouldLoad(true);
      isIntersectingRef.current = true;
      return;
    }

    return observeElement(el, (isIntersecting) => {
      isIntersectingRef.current = isIntersecting;
      if (isIntersecting) {
        setShouldLoad(true);
        const isAppVis = appVisibility.getIsVisible() && !document.hidden;
        if (isAppVis && animRef.current) {
          if (isPlayingPropRef.current !== undefined) {
            if (isPlayingPropRef.current) {
              isPlayingRef.current = true;
              animRef.current.goToAndPlay(0, true);
            } else {
              isPlayingRef.current = false;
              animRef.current.goToAndStop(0, true);
            }
          } else if (loop && autoplay) {
            isPlayingRef.current = true;
            animRef.current.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            animRef.current.goToAndPlay(0, true);
          } else if (isPlayingRef.current) {
            animRef.current.play();
          } else {
            animRef.current.goToAndStop(0, true);
          }
        }
      } else {
        isPlayingRef.current = false;
        animRef.current?.pause();
      }
    });
  }, [loop, autoplay]);

  useEffect(() => {
    const handleVisibility = (visible: boolean) => {
      if (!visible) {
        isPlayingRef.current = false;
        animRef.current?.pause();
        try {
          (lottie as any).freeze?.();
        } catch {}
      } else {
        try {
          (lottie as any).unfreeze?.();
        } catch {}
        if (isIntersectingRef.current && animRef.current) {
          if (loop && autoplay) {
            isPlayingRef.current = true;
            animRef.current.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            animRef.current.goToAndPlay(0, true);
          } else if (isPlayingRef.current) {
            animRef.current.play();
          } else {
            animRef.current.goToAndStop(0, true);
          }
        }
      }
    };

    return appVisibility.subscribe(handleVisibility);
  }, [loop, autoplay]);

  useEffect(() => {
    if (isPlaying === undefined || !animRef.current) return;
    if (isPlaying) {
      isPlayingRef.current = true;
      animRef.current.goToAndPlay(0, true);
    } else {
      isPlayingRef.current = false;
      animRef.current.goToAndStop(0, true);
    }
  }, [isPlaying]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (animRef.current) {
      isPlayingRef.current = true;
      animRef.current.goToAndPlay(0, true);
    }
  };

  const handleMouseEnter = () => {
    if (playOnHover && animRef.current) {
      isPlayingRef.current = true;
      animRef.current.goToAndPlay(0, true);
    }
  };

  const handleMouseLeave = () => {
    if (playOnHover && animRef.current) {
      isPlayingRef.current = false;
      animRef.current.goToAndStop(0, true);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          opacity: isReady ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
