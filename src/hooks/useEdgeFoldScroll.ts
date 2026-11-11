import { useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface UseEdgeFoldScrollOptions {
  itemSelector: string;
  foldZone?: number;
  maxAngle?: number;
  minScale?: number;
  minOpacity?: number;
  perspective?: number;
  enabled?: boolean;
  deps?: ReadonlyArray<unknown>;
}

type FoldEdge = 'top' | 'bottom';

interface AppliedFoldState {
  edge: FoldEdge;
  origin: string;
  transform: string;
  opacity: string;
}

interface PendingFoldWrite {
  el: HTMLElement;
  next: AppliedFoldState | null;
}

const DEFAULT_FOLD_ZONE = 64;
const DEFAULT_MAX_ANGLE = 24;
const DEFAULT_MIN_SCALE = 0.9;
const DEFAULT_MIN_OPACITY = 0.45;
const DEFAULT_PERSPECTIVE = 720;
const TALL_ITEM_RATIO = 2.2;
const TALL_FOLD_RATIO = 1.6;
const PROGRESS_EXPONENT = 1.45;
const MIN_ACTIVE_PROGRESS = 0.002;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeEdgeProgress(remaining: number, itemHeight: number, foldZone: number): number {
  const isTall = itemHeight > foldZone * TALL_ITEM_RATIO;
  const activeSpan = isTall ? foldZone * TALL_FOLD_RATIO : foldZone + itemHeight;
  if (activeSpan <= 0 || remaining >= activeSpan) {
    return 0;
  }
  const raw = clamp((activeSpan - remaining) / activeSpan, 0, 1);
  const eased = Math.pow(raw, PROGRESS_EXPONENT);
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
}

function resolveUntransformedBounds(
  el: HTMLElement,
  rect: DOMRect,
  prevEdge: FoldEdge | undefined,
  naturalHeights: WeakMap<HTMLElement, number>
): { top: number; bottom: number; height: number } {
  if (!prevEdge) {
    if (rect.height > 0) {
      naturalHeights.set(el, rect.height);
    }
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  }

  const layoutHeight = el.offsetHeight;
  const cachedHeight = naturalHeights.get(el);
  const height =
    cachedHeight !== undefined && Math.abs(layoutHeight - cachedHeight) <= 1
      ? cachedHeight
      : layoutHeight || rect.height;

  if (prevEdge === 'top') {
    return { top: rect.bottom - height, bottom: rect.bottom, height };
  }
  return { top: rect.top, bottom: rect.top + height, height };
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
    enabled = true,
    deps,
  } = options;

  const foldZone = Math.max(1, rawFoldZone);
  const maxAngle = clamp(rawMaxAngle, 0, 85);
  const minScale = clamp(rawMinScale, 0.1, 1);
  const minOpacity = clamp(rawMinOpacity, 0, 1);
  const perspective = Math.max(100, rawPerspective);

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
      const activeEdges = new WeakMap<HTMLElement, FoldEdge>();
      const naturalHeights = new WeakMap<HTMLElement, number>();
      const appliedStates = new WeakMap<HTMLElement, AppliedFoldState>();

      const resetAll = () => {
        styledElements.forEach((el) => {
          clearElementFoldStyles(el);
          activeEdges.delete(el);
          appliedStates.delete(el);
        });
        styledElements.clear();
        if (container.isConnected) {
          container.querySelectorAll<HTMLElement>(itemSelector).forEach((el) => {
            if (el.style.transform || el.style.opacity) {
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

        const containerRect = container.getBoundingClientRect();
        if (containerRect.height <= 0 || containerRect.width <= 0) {
          resetAll();
          return;
        }

        const effectiveFoldZone = Math.min(foldZone, containerRect.height * 0.35);
        const safeTop = containerRect.top + effectiveFoldZone;
        const safeBottom = containerRect.bottom - effectiveFoldZone;
        const edgeRamp = Math.max(16, effectiveFoldZone * 0.5);

        const scrollTop = container.scrollTop;
        const bottomScrollRemaining = Math.max(
          0,
          container.scrollHeight - container.clientHeight - scrollTop
        );
        const topScrollStrength = clamp((scrollTop <= 1 ? 0 : scrollTop - 1) / edgeRamp, 0, 1);
        const bottomScrollStrength = clamp(
          (bottomScrollRemaining <= 1 ? 0 : bottomScrollRemaining - 1) / edgeRamp,
          0,
          1
        );

        const elements = container.querySelectorAll<HTMLElement>(itemSelector);
        const seen = new Set<HTMLElement>();
        const writes: PendingFoldWrite[] = [];

        elements.forEach((el) => {
          seen.add(el);
          const rect = el.getBoundingClientRect();
          const { top, bottom, height } = resolveUntransformedBounds(
            el,
            rect,
            activeEdges.get(el),
            naturalHeights
          );

          if (height <= 0 || bottom <= containerRect.top || top >= containerRect.bottom) {
            writes.push({ el, next: null });
            return;
          }

          if (top >= safeTop && bottom <= safeBottom) {
            writes.push({ el, next: null });
            return;
          }

          let topProgress = 0;
          if (top < safeTop && bottom > containerRect.top) {
            const topFactor = Math.max(
              topScrollStrength,
              clamp((containerRect.top - top) / 16, 0, 1)
            );
            topProgress = computeEdgeProgress(bottom - containerRect.top, height, effectiveFoldZone) * topFactor;
          }

          let bottomProgress = 0;
          if (bottom > safeBottom && top < containerRect.bottom) {
            const bottomFactor = Math.max(
              bottomScrollStrength,
              clamp((bottom - containerRect.bottom) / 16, 0, 1)
            );
            bottomProgress =
              computeEdgeProgress(containerRect.bottom - top, height, effectiveFoldZone) * bottomFactor;
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
            writes.push({ el, next: null });
            return;
          }

          const angle = progress * maxAngle;
          const signedAngle = winnerEdge === 'top' ? angle : -angle;
          const scale = 1 - progress * (1 - minScale);
          const opacityValue = 1 - progress * (1 - minOpacity);

          const origin = winnerEdge === 'top' ? 'center bottom' : 'center top';
          const transform = `perspective(${perspective}px) rotateX(${signedAngle.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
          const opacity = minOpacity < 1 ? opacityValue.toFixed(3) : '';

          writes.push({
            el,
            next: {
              edge: winnerEdge,
              origin,
              transform,
              opacity,
            },
          });
        });

        for (const item of writes) {
          const { el, next } = item;
          if (!next) {
            if (styledElements.has(el) || el.style.transform !== '' || el.style.opacity !== '') {
              clearElementFoldStyles(el);
            }
            styledElements.delete(el);
            activeEdges.delete(el);
            appliedStates.delete(el);
            continue;
          }

          const prev = appliedStates.get(el);
          if (
            !prev ||
            prev.origin !== next.origin ||
            prev.transform !== next.transform ||
            prev.opacity !== next.opacity
          ) {
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
          activeEdges.set(el, next.edge);
        }

        styledElements.forEach((el) => {
          if (!seen.has(el)) {
            if (el.isConnected) {
              clearElementFoldStyles(el);
            }
            styledElements.delete(el);
            activeEdges.delete(el);
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

      container.addEventListener('scroll', scheduleUpdate, { passive: true });

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

      scheduleUpdate();

      cleanupFnRef.current = () => {
        disposed = true;
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        container.removeEventListener('scroll', scheduleUpdate);
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
