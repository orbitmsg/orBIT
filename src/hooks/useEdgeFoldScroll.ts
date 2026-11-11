import { useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface UseEdgeFoldScrollOptions {
  itemSelector: string;
  foldZone?: number;
  maxAngle?: number;
  minScale?: number;
  minOpacity?: number;
  perspective?: number;
  depth?: number;
  exponent?: number;
  enabled?: boolean;
  deps?: ReadonlyArray<unknown>;
}

type FoldEdge = 'top' | 'bottom';

interface AppliedFoldState {
  origin: string;
  transform: string;
  opacity: string;
  promoted: boolean;
}

interface PendingFoldWrite {
  el: HTMLElement;
  next: AppliedFoldState | null;
}

const DEFAULT_FOLD_ZONE = 64;
const DEFAULT_MAX_ANGLE = 28;
const DEFAULT_MIN_SCALE = 0.86;
const DEFAULT_MIN_OPACITY = 0.4;
const DEFAULT_PERSPECTIVE = 560;
const DEFAULT_DEPTH = 18;
const DEFAULT_EXPONENT = 1.22;
const TALL_ITEM_RATIO = 2.2;
const TALL_FOLD_RATIO = 1.6;
const MIN_ACTIVE_PROGRESS = 0.002;
const PRE_PROMOTE_MARGIN = 36;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeEdgeProgress(
  remaining: number,
  itemHeight: number,
  foldZone: number,
  exponent: number
): number {
  const isTall = itemHeight > foldZone * TALL_ITEM_RATIO;
  const activeSpan = isTall ? foldZone * TALL_FOLD_RATIO : foldZone + itemHeight;
  if (activeSpan <= 0 || remaining >= activeSpan) {
    return 0;
  }
  const raw = clamp((activeSpan - remaining) / activeSpan, 0, 1);
  const eased = Math.pow(raw, exponent);
  return eased <= MIN_ACTIVE_PROGRESS ? 0 : eased;
}

function clearElementFoldStyles(el: HTMLElement): void {
  if (el.style.transform !== '') {
    el.style.transform = '';
  }
  if (el.style.transformOrigin !== '') {
    el.style.transformOrigin = '';
  }
  if (el.style.opacity !== '') {
    el.style.opacity = '';
  }
  if (el.style.willChange !== '') {
    el.style.willChange = '';
  }
  if (el.style.backfaceVisibility !== '') {
    el.style.backfaceVisibility = '';
  }
}

function getOffsetTopToAncestor(
  el: HTMLElement,
  stopAt: HTMLElement | null
): { top: number; reached: boolean } {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stopAt) {
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) {
      return { top, reached: stopAt === null };
    }
    if (parent === stopAt) {
      return { top, reached: true };
    }
    top += parent.clientTop;
    node = parent;
  }
  return { top, reached: node === stopAt };
}

function measureLayoutBoundsInContainer(
  el: HTMLElement,
  container: HTMLElement,
  scrollTop: number,
  containerClientTop: number
): { top: number; bottom: number; height: number } | null {
  const height = el.offsetHeight;
  if (height <= 0) {
    return null;
  }

  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) {
      return null;
    }
    if (parent === container) {
      const localTop = top - scrollTop;
      return { top: localTop, bottom: localTop + height, height };
    }
    if (!container.contains(parent)) {
      const containerOffset = getOffsetTopToAncestor(container, parent);
      if (!containerOffset.reached) {
        return null;
      }
      const localTop = top - containerOffset.top - containerClientTop - scrollTop;
      return { top: localTop, bottom: localTop + height, height };
    }
    top += parent.clientTop;
    node = parent;
  }

  if (node === container) {
    const localTop = top - scrollTop;
    return { top: localTop, bottom: localTop + height, height };
  }
  return null;
}

export function useEdgeFoldScroll(
  scrollRef: React.RefObject<HTMLElement | null>,
  options: UseEdgeFoldScrollOptions
): void {
  const {
    itemSelector,
    foldZone: rawFoldZone = DEFAULT_FOLD_ZONE,
    maxAngle: rawMaxAngle = DEFAULT_MAX_ANGLE,
    minScale: rawMinScale = DEFAULT_MIN_SCALE,
    minOpacity: rawMinOpacity = DEFAULT_MIN_OPACITY,
    perspective: rawPerspective = DEFAULT_PERSPECTIVE,
    depth: rawDepth = DEFAULT_DEPTH,
    exponent: rawExponent = DEFAULT_EXPONENT,
    enabled = true,
    deps,
  } = options;

  const foldZone = Math.max(1, rawFoldZone);
  const maxAngle = clamp(rawMaxAngle, 0, 85);
  const minScale = clamp(rawMinScale, 0.1, 1);
  const minOpacity = clamp(rawMinOpacity, 0, 1);
  const perspective = Math.max(120, rawPerspective);
  const depth = Math.max(0, rawDepth);
  const exponent = clamp(rawExponent, 0.5, 3);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }
    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  const depsVersionRef = useRef(0);
  const prevDepsRef = useRef<ReadonlyArray<unknown> | undefined>(undefined);
  if (deps !== prevDepsRef.current) {
    const prev = prevDepsRef.current;
    let changed = !prev || !deps || prev.length !== deps.length;
    if (!changed && prev && deps) {
      for (let i = 0; i < deps.length; i += 1) {
        if (!Object.is(prev[i], deps[i])) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      depsVersionRef.current += 1;
    }
    prevDepsRef.current = deps;
  }
  const depsVersion = depsVersionRef.current;

  const isActive = enabled && !prefersReducedMotion;
  const attachedContainerRef = useRef<HTMLElement | null>(null);
  const attachFnRef = useRef<(() => void) | null>(null);
  const cleanupFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupFnRef.current?.();
    cleanupFnRef.current = null;
    attachedContainerRef.current = null;

    if (!isActive || !itemSelector) {
      attachFnRef.current = null;
      return;
    }

    const setup = () => {
      cleanupFnRef.current?.();
      cleanupFnRef.current = null;

      const container = scrollRef.current;
      attachedContainerRef.current = container;
      if (!container) {
        return;
      }

      let disposed = false;
      let rafId = 0;
      const styledElements = new Set<HTMLElement>();
      const appliedStates = new WeakMap<HTMLElement, AppliedFoldState>();

      const resetAll = () => {
        styledElements.forEach((el) => {
          clearElementFoldStyles(el);
          appliedStates.delete(el);
        });
        styledElements.clear();
        if (container.isConnected) {
          container.querySelectorAll<HTMLElement>(itemSelector).forEach((el) => {
            if (el.style.transform || el.style.opacity || el.style.willChange) {
              clearElementFoldStyles(el);
            }
          });
        }
      };

      const applyUpdates = () => {
        rafId = 0;
        if (disposed) {
          return;
        }

        const clientHeight = container.clientHeight;
        const clientWidth = container.clientWidth;
        if (clientHeight <= 0 || clientWidth <= 0) {
          resetAll();
          return;
        }

        const effectiveFoldZone = Math.min(foldZone, clientHeight * 0.38);
        const safeTop = effectiveFoldZone;
        const safeBottom = clientHeight - effectiveFoldZone;
        const edgeRamp = Math.min(20, Math.max(10, effectiveFoldZone * 0.35));

        const scrollTop = container.scrollTop;
        const containerClientTop = container.clientTop;
        const bottomScrollRemaining = Math.max(
          0,
          container.scrollHeight - clientHeight - scrollTop
        );
        const topScrollStrength = clamp((scrollTop <= 0.5 ? 0 : scrollTop - 0.5) / edgeRamp, 0, 1);
        const bottomScrollStrength = clamp(
          (bottomScrollRemaining <= 0.5 ? 0 : bottomScrollRemaining - 0.5) / edgeRamp,
          0,
          1
        );

        const elements = container.querySelectorAll<HTMLElement>(itemSelector);
        const seen = new Set<HTMLElement>();
        const writes: PendingFoldWrite[] = [];

        elements.forEach((el) => {
          seen.add(el);
          const bounds = measureLayoutBoundsInContainer(
            el,
            container,
            scrollTop,
            containerClientTop
          );

          if (!bounds) {
            writes.push({ el, next: null });
            return;
          }

          const { top, bottom, height } = bounds;
          if (bottom <= -PRE_PROMOTE_MARGIN || top >= clientHeight + PRE_PROMOTE_MARGIN) {
            writes.push({ el, next: null });
            return;
          }

          if (top >= safeTop && bottom <= safeBottom) {
            const nearZone =
              top < safeTop + PRE_PROMOTE_MARGIN || bottom > safeBottom - PRE_PROMOTE_MARGIN;
            writes.push({
              el,
              next: nearZone
                ? { origin: '', transform: '', opacity: '', promoted: true }
                : null,
            });
            return;
          }

          let topProgress = 0;
          if (top < safeTop && bottom > 0) {
            const topFactor = Math.max(
              topScrollStrength,
              clamp((0 - top) / 12, 0, 1)
            );
            topProgress =
              computeEdgeProgress(bottom, height, effectiveFoldZone, exponent) * topFactor;
          }

          let bottomProgress = 0;
          if (bottom > safeBottom && top < clientHeight) {
            const bottomFactor = Math.max(
              bottomScrollStrength,
              clamp((bottom - clientHeight) / 12, 0, 1)
            );
            bottomProgress =
              computeEdgeProgress(clientHeight - top, height, effectiveFoldZone, exponent) *
              bottomFactor;
          }

          let winnerEdge: FoldEdge | null = null;
          let progress = 0;
          if (topProgress >= bottomProgress && topProgress > MIN_ACTIVE_PROGRESS) {
            winnerEdge = 'top';
            progress = topProgress;
          } else if (bottomProgress > topProgress && bottomProgress > MIN_ACTIVE_PROGRESS) {
            winnerEdge = 'bottom';
            progress = bottomProgress;
          }

          if (!winnerEdge) {
            const insideViewport = bottom > 0 && top < clientHeight;
            writes.push({
              el,
              next: insideViewport
                ? { origin: '', transform: '', opacity: '', promoted: true }
                : null,
            });
            return;
          }

          const angle = progress * maxAngle;
          const signedAngle = winnerEdge === 'top' ? angle : -angle;
          const scale = 1 - progress * (1 - minScale);
          const zShift = progress * depth;
          const opacityValue = 1 - progress * (1 - minOpacity);

          const origin = winnerEdge === 'top' ? 'center bottom' : 'center top';
          const zPart = depth > 0 ? ` translateZ(${(-zShift).toFixed(2)}px)` : '';
          const transform = `perspective(${perspective}px)${zPart} rotateX(${signedAngle.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
          const opacity = minOpacity < 1 ? opacityValue.toFixed(3) : '';

          writes.push({
            el,
            next: {
              origin,
              transform,
              opacity,
              promoted: true,
            },
          });
        });

        for (const item of writes) {
          const { el, next } = item;
          if (!next) {
            if (styledElements.has(el) || el.style.transform !== '' || el.style.opacity !== '' || el.style.willChange !== '') {
              clearElementFoldStyles(el);
            }
            styledElements.delete(el);
            appliedStates.delete(el);
            continue;
          }

          const prev = appliedStates.get(el);
          if (
            !prev ||
            prev.promoted !== next.promoted ||
            prev.origin !== next.origin ||
            prev.transform !== next.transform ||
            prev.opacity !== next.opacity
          ) {
            const targetWillChange = next.promoted ? 'transform, opacity' : '';
            const targetBackface = next.promoted ? 'hidden' : '';
            if (el.style.willChange !== targetWillChange) {
              el.style.willChange = targetWillChange;
            }
            if (el.style.backfaceVisibility !== targetBackface) {
              el.style.backfaceVisibility = targetBackface;
            }
            if (el.style.transformOrigin !== next.origin) {
              el.style.transformOrigin = next.origin;
            }
            if (el.style.transform !== next.transform) {
              el.style.transform = next.transform;
            }
            if (el.style.opacity !== next.opacity) {
              el.style.opacity = next.opacity;
            }
            appliedStates.set(el, next);
          }
          styledElements.add(el);
        }

        styledElements.forEach((el) => {
          if (!seen.has(el)) {
            if (el.isConnected) {
              clearElementFoldStyles(el);
            }
            styledElements.delete(el);
            appliedStates.delete(el);
          }
        });
      };

      const scheduleUpdate = () => {
        if (disposed || rafId !== 0) {
          return;
        }
        rafId = requestAnimationFrame(applyUpdates);
      };

      const handleScroll = () => {
        if (disposed) {
          return;
        }
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        applyUpdates();
      };

      container.addEventListener('scroll', handleScroll, { passive: true });

      const resizeObserver =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;
      if (resizeObserver) {
        resizeObserver.observe(container);
        if (container.firstElementChild instanceof HTMLElement) {
          resizeObserver.observe(container.firstElementChild);
        }
      }

      const mutationObserver =
        typeof MutationObserver !== 'undefined' ? new MutationObserver(scheduleUpdate) : null;
      if (mutationObserver) {
        mutationObserver.observe(container, { childList: true, subtree: true });
      }

      applyUpdates();

      cleanupFnRef.current = () => {
        disposed = true;
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        container.removeEventListener('scroll', handleScroll);
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        resetAll();
      };
    };

    attachFnRef.current = setup;
    setup();

    return () => {
      attachFnRef.current = null;
      cleanupFnRef.current?.();
      cleanupFnRef.current = null;
      attachedContainerRef.current = null;
    };
  }, [
    scrollRef,
    itemSelector,
    foldZone,
    maxAngle,
    minScale,
    minOpacity,
    perspective,
    depth,
    exponent,
    isActive,
    depsVersion,
  ]);

  useEffect(() => {
    if (!isActive || !attachFnRef.current) {
      return;
    }
    if (attachedContainerRef.current !== scrollRef.current) {
      attachFnRef.current();
    }
  });
}
