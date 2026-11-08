import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  renderer?: 'canvas' | 'svg';
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const MAX_CACHE_SIZE = 64;
const tgsCache = new Map<string, any>();
const pendingRequests = new Map<string, Promise<any>>();

export function clearTgsCache(): void {
  tgsCache.clear();
  pendingRequests.clear();
}

let hiddenCacheClearTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!hiddenCacheClearTimer) {
        hiddenCacheClearTimer = setTimeout(() => {
          hiddenCacheClearTimer = null;
          if (document.hidden) {
            clearTgsCache();
          }
        }, 180000);
      }
    } else {
      if (hiddenCacheClearTimer) {
        clearTimeout(hiddenCacheClearTimer);
        hiddenCacheClearTimer = null;
      }
    }
  });

  appVisibility.subscribe((visible) => {
    if (!visible) {
      try {
        (lottie as any).freeze?.();
      } catch {}
    } else {
      try {
        (lottie as any).unfreeze?.();
      } catch {}
    }
  });
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

const MAX_CONCURRENT_DECOMPRESSIONS = 6;
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
      { rootMargin: '0px', threshold: 0.01 }
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

interface PlaybackSubscriber {
  id: number;
  priority: number;
  onPlay: () => void;
  onPause: () => void;
}

class PlaybackCoordinator {
  private active = new Map<number, PlaybackSubscriber>();
  private waiting = new Map<number, PlaybackSubscriber>();
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
  }

  requestPlayback(subscriber: PlaybackSubscriber): void {
    const { id, priority, onPlay, onPause } = subscriber;

    if (this.active.has(id)) {
      this.active.set(id, subscriber);
      onPlay();
      return;
    }

    this.waiting.delete(id);

    if (this.active.size < this.maxConcurrent) {
      this.active.set(id, subscriber);
      onPlay();
      return;
    }

    if (priority > 1) {
      let lowestActive: PlaybackSubscriber | null = null;
      for (const item of this.active.values()) {
        if (!lowestActive || item.priority < lowestActive.priority) {
          lowestActive = item;
        }
      }

      if (lowestActive && lowestActive.priority < priority) {
        this.active.delete(lowestActive.id);
        lowestActive.onPause();
        this.waiting.set(lowestActive.id, lowestActive);

        this.active.set(id, subscriber);
        onPlay();
        return;
      }
    }

    this.waiting.set(id, subscriber);
    onPause();
  }

  releasePlayback(id: number): void {
    const wasActive = this.active.delete(id);
    this.waiting.delete(id);

    if (wasActive && this.active.size < this.maxConcurrent && this.waiting.size > 0) {
      let bestCandidate: PlaybackSubscriber | null = null;
      for (const item of this.waiting.values()) {
        if (!bestCandidate || item.priority > bestCandidate.priority) {
          bestCandidate = item;
        }
      }

      if (bestCandidate) {
        this.waiting.delete(bestCandidate.id);
        this.active.set(bestCandidate.id, bestCandidate);
        bestCandidate.onPlay();
      }
    }
  }

  clear(): void {
    this.active.forEach((s) => s.onPause());
    this.active.clear();
    this.waiting.clear();
  }
}

const playbackCoordinator = new PlaybackCoordinator(4);

function cleanupAnimation(
  anim: AnimationItem | null,
  container: HTMLDivElement | null
): void {
  if (anim) {
    try {
      anim.stop();
      anim.destroy();
    } catch {}
  }
  if (container) {
    try {
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((c) => {
        c.width = 0;
        c.height = 0;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 0, 0);
        }
      });
      container.innerHTML = '';
    } catch {}
  }
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
      } else if (
        !src.startsWith('http://') &&
        !src.startsWith('https://') &&
        !src.startsWith('data:') &&
        !src.startsWith('blob:')
      ) {
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
              if (
                (xhr.status === 200 || xhr.status === 0) &&
                xhr.response &&
                (xhr.response as ArrayBuffer).byteLength > 0
              ) {
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

let nextPlayerId = 1;

export const TgsPlayer: React.FC<TgsPlayerProps> = ({
  src,
  className = '',
  style,
  loop = true,
  autoplay = true,
  isPlaying,
  playOnHover = false,
  renderer = 'canvas',
  onClick,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const playerIdRef = useRef<number>(0);
  if (!playerIdRef.current) {
    playerIdRef.current = nextPlayerId++;
  }

  const isPlayingPropRef = useRef(isPlaying);
  isPlayingPropRef.current = isPlaying;

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  const loopRef = useRef(loop);
  loopRef.current = loop;

  const playOnHoverRef = useRef(playOnHover);
  playOnHoverRef.current = playOnHover;

  const isHoveredRef = useRef(false);
  const isIntersectingRef = useRef(false);
  const isReadyRef = useRef(false);
  const isPlaybackGrantedRef = useRef(false);
  const hasFinishedNonLoopRef = useRef(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelInitRef = useRef<(() => void) | null>(null);

  const [isInViewport, setIsInViewport] = useState(false);
  const [animData, setAnimData] = useState<any>(() => getFromCache(src));
  const [isReady, setIsReady] = useState(false);

  const updatePlayback = useCallback(() => {
    const anim = animRef.current;
    if (!anim || !isReadyRef.current) return;

    const isVisible =
      isIntersectingRef.current &&
      appVisibility.getIsVisible() &&
      !document.hidden;

    if (!isVisible) {
      playbackCoordinator.releasePlayback(playerIdRef.current);
      isPlaybackGrantedRef.current = false;
      anim.goToAndStop(0, true);
      return;
    }

    const explicitPlaying = isPlayingPropRef.current;
    const isHovered = isHoveredRef.current && playOnHoverRef.current;
    const wantsToPlay =
      explicitPlaying !== undefined
        ? explicitPlaying
        : isHovered || (autoplayRef.current && !hasFinishedNonLoopRef.current);

    if (!wantsToPlay) {
      playbackCoordinator.releasePlayback(playerIdRef.current);
      isPlaybackGrantedRef.current = false;
      anim.goToAndStop(0, true);
      return;
    }

    const priority = explicitPlaying === true || isHovered ? 2 : 1;

    playbackCoordinator.requestPlayback({
      id: playerIdRef.current,
      priority,
      onPlay: () => {
        isPlaybackGrantedRef.current = true;
        if (animRef.current) {
          if (loopRef.current) {
            animRef.current.play();
          } else {
            animRef.current.goToAndPlay(0, true);
          }
        }
      },
      onPause: () => {
        isPlaybackGrantedRef.current = false;
        if (animRef.current) {
          animRef.current.goToAndStop(0, true);
        }
      },
    });
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      isIntersectingRef.current = true;
      setIsInViewport(true);
      return;
    }

    const unobserve = observeElement(el, (isIntersecting) => {
      isIntersectingRef.current = isIntersecting;
      setIsInViewport(isIntersecting);

      if (isIntersecting) {
        if (unmountTimerRef.current) {
          clearTimeout(unmountTimerRef.current);
          unmountTimerRef.current = null;
        }
      } else {
        playbackCoordinator.releasePlayback(playerIdRef.current);
        isPlaybackGrantedRef.current = false;
        if (animRef.current) {
          animRef.current.goToAndStop(0, true);
        }

        if (unmountTimerRef.current) {
          clearTimeout(unmountTimerRef.current);
        }
        unmountTimerRef.current = setTimeout(() => {
          unmountTimerRef.current = null;
          if (!isIntersectingRef.current) {
            cleanupAnimation(animRef.current, containerRef.current);
            animRef.current = null;
            isReadyRef.current = false;
            setIsReady(false);
          }
        }, 1200);
      }
    });

    return () => {
      unobserve();
    };
  }, []);

  useEffect(() => {
    if (animRef.current) {
      playbackCoordinator.releasePlayback(playerIdRef.current);
      cleanupAnimation(animRef.current, containerRef.current);
      animRef.current = null;
      isReadyRef.current = false;
      setIsReady(false);
    }
  }, [src]);

  useEffect(() => {
    let isCurrent = true;
    hasFinishedNonLoopRef.current = false;

    const cached = getFromCache(src);
    if (cached) {
      setAnimData(cached);
      return;
    }

    if (!isInViewport) return;

    loadTgsAnimation(src)
      .then((data) => {
        if (isCurrent) {
          setAnimData(data);
        }
      })
      .catch((err) => {
        console.error('[TgsPlayer] load error:', src, err);
      });

    return () => {
      isCurrent = false;
    };
  }, [src, isInViewport]);

  useEffect(() => {
    if (!isInViewport || !animData) return;

    const container = containerRef.current;
    if (!container) return;

    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }

    if (animRef.current) {
      updatePlayback();
      return;
    }

    cancelInitRef.current = scheduleLottieInit(() => {
      cancelInitRef.current = null;
      if (!containerRef.current || !isIntersectingRef.current) return;

      try {
        cleanupAnimation(animRef.current, containerRef.current);

        const anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: renderer || 'canvas',
          loop,
          autoplay: false,
          animationData: animData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            clearCanvas: true,
            progressiveLoad: true,
            dpr:
              typeof window !== 'undefined'
                ? Math.min(window.devicePixelRatio || 1, 2)
                : 1,
          },
        });

        anim.setSubframe(false);

        const handleReady = () => {
          setIsReady(true);
          isReadyRef.current = true;
          updatePlayback();
        };

        anim.addEventListener('DOMLoaded', handleReady);
        anim.addEventListener('data_ready', handleReady);
        if ((anim as any).isLoaded) {
          handleReady();
        }

        setTimeout(() => {
          if (animRef.current && !isReadyRef.current) {
            handleReady();
          }
        }, 60);

        anim.addEventListener('complete', () => {
          if (!loopRef.current) {
            hasFinishedNonLoopRef.current = true;
            updatePlayback();
          }
        });

        animRef.current = anim;
        updatePlayback();
      } catch (e) {
        console.error('[TgsPlayer] render error:', e);
      }
    });

    return () => {
      if (cancelInitRef.current) {
        cancelInitRef.current();
        cancelInitRef.current = null;
      }
    };
  }, [animData, isInViewport, loop, renderer, updatePlayback]);

  useEffect(() => {
    updatePlayback();
  }, [isPlaying, autoplay, playOnHover, loop, updatePlayback]);

  useEffect(() => {
    const handleVisibility = (visible: boolean) => {
      if (!visible) {
        playbackCoordinator.releasePlayback(playerIdRef.current);
        isPlaybackGrantedRef.current = false;
        if (animRef.current) {
          animRef.current.pause();
        }
      } else {
        if (isIntersectingRef.current && animRef.current) {
          updatePlayback();
        }
      }
    };

    return appVisibility.subscribe(handleVisibility);
  }, [updatePlayback]);

  useEffect(() => {
    return () => {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      if (cancelInitRef.current) {
        cancelInitRef.current();
        cancelInitRef.current = null;
      }
      playbackCoordinator.releasePlayback(playerIdRef.current);
      cleanupAnimation(animRef.current, containerRef.current);
      animRef.current = null;
      isReadyRef.current = false;
      isPlaybackGrantedRef.current = false;
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      onClick(e);
    }
    hasFinishedNonLoopRef.current = false;
    if (animRef.current) {
      playbackCoordinator.requestPlayback({
        id: playerIdRef.current,
        priority: 2,
        onPlay: () => {
          isPlaybackGrantedRef.current = true;
          animRef.current?.goToAndPlay(0, true);
        },
        onPause: () => {
          isPlaybackGrantedRef.current = false;
          animRef.current?.goToAndStop(0, true);
        },
      });
    }
  };

  const handleMouseEnter = () => {
    if (playOnHover) {
      isHoveredRef.current = true;
      hasFinishedNonLoopRef.current = false;
      updatePlayback();
    }
  };

  const handleMouseLeave = () => {
    if (playOnHover) {
      isHoveredRef.current = false;
      updatePlayback();
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
          transition: 'opacity 0.15s ease-out',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
