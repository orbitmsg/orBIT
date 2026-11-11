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
}

interface CachedFoldItem {
  el: HTMLElement;
  top: number;
  bottom: number;
  height: number;
}

const DEFAULT_FOLD_ZONE = 46;
const DEFAULT_MAX_ANGLE = 14;
const DEFAULT_MIN_SCALE = 0.92;
const DEFAULT_MIN_OPACITY = 0.65;
const DEFAULT_PERSPECTIVE = 720;
const DEFAULT_DEPTH = 0;
const DEFAULT_EXPONENT = 1.3;
const TALL_ITEM_RATIO = 2.2;
const TALL_FOLD_RATIO = 1.6;
const MIN_ACTIVE_PROGRESS = 0.005;

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

function measureContentTopInContainer(
  el: HTMLElement,
  container: HTMLElement,
  containerClientTop: number
): number | null {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) {
      return null;
    }
    if (parent === container) {
      return top;
    }
    if (!container.contains(parent)) {
      const containerOffset = getOffsetTopToAncestor(container, parent);
      if (!containerOffset.reached) {
        return null;
      }
      return top - containerOffset.top - containerClientTop;
    }
    top += parent.clientTop;
    node = parent;
  }
  return node === container ? top : null;
}

function findFirstVisibleIndex(items: CachedFoldItem[], minBottom: number): number {
  let low = 0;
  let high = items.length - 1;
  let result = items.length;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (items[mid].bottom > minBottom) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return result;
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
      let dirty = true;
      let cachedScrollHeight = -1;
      let cachedItems: CachedFoldItem[] = [];
      let cachedElSet = new Set<HTMLElement>();
      let activeElements = new Set<HTMLElement>();
      const appliedStates = new WeakMap<HTMLElement, AppliedFoldState>();

      const resetAll = () => {
        activeElements.forEach((el) => {
          clearElementFoldStyles(el);
          appliedStates.delete(el);
        });
        activeElements.clear();
        if (container.isConnected) {
          container.querySelectorAll<HTMLElement>(itemSelector).forEach((el) => {
            if (el.style.transform || el.style.opacity) {
              clearElementFoldStyles(el);
            }
          });
        }
      };

      const rebuildCache = () => {
        dirty = false;
        cachedScrollHeight = container.scrollHeight;
        const containerClientTop = container.clientTop;
        const elements = container.querySelectorAll<HTMLElement>(itemSelector);
        const nextItems: CachedFoldItem[] = [];
        const nextElSet = new Set<HTMLElement>();

        elements.forEach((el) => {
          const height = el.offsetHeight;
          if (height <= 0) {
            return;
          }
          const top = measureContentTopInContainer(el, container, containerClientTop);
          if (top === null) {
            return;
          }
          nextItems.push({ el, top, bottom: top + height, height });
          nextElSet.add(el);
        });

        let needsSort = false;
        for (let i = 1; i < nextItems.length; i += 1) {
          if (nextItems[i].top < nextItems[i - 1].top) {
            needsSort = true;
            break;
          }
        }
        if (needsSort) {
          nextItems.sort((a, b) => a.top - b.top);
        }

        cachedItems = nextItems;
        cachedElSet = nextElSet;

        activeElements.forEach((el) => {
          if (!nextElSet.has(el)) {
            if (el.isConnected) {
              clearElementFoldStyles(el);
            }
            appliedStates.delete(el);
            activeElements.delete(el);
          }
        });
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

        const scrollHeight = container.scrollHeight;
        if (dirty || scrollHeight !== cachedScrollHeight) {
          rebuildCache();
        }

        if (cachedItems.length === 0) {
          if (activeElements.size > 0) {
            resetAll();
          }
          return;
        }

        const scrollTop = container.scrollTop;
        const effectiveFoldZone = Math.min(foldZone, clientHeight * 0.34);
        const safeTop = effectiveFoldZone;
        const safeBottom = clientHeight - effectiveFoldZone;
        const edgeRamp = Math.min(20, Math.max(10, effectiveFoldZone * 0.38));

        const bottomScrollRemaining = Math.max(0, scrollHeight - clientHeight - scrollTop);
        const topScrollStrength = clamp((scrollTop <= 0.5 ? 0 : scrollTop - 0.5) / edgeRamp, 0, 1);
        const bottomScrollStrength = clamp(
          (bottomScrollRemaining <= 0.5 ? 0 : bottomScrollRemaining - 0.5) / edgeRamp,
          0,
          1
        );

        const nextActive = new Set<HTMLElement>();
        const startIndex = findFirstVisibleIndex(cachedItems, scrollTop);

        for (let i = startIndex; i < cachedItems.length; i += 1) {
          const item = cachedItems[i];
          const localTop = item.top - scrollTop;
          if (localTop >= clientHeight) {
            break;
          }
          const localBottom = item.bottom - scrollTop;
          if (localTop >= safeTop && localBottom <= safeBottom) {
            continue;
          }

          let topProgress = 0;
          if (localTop < safeTop && localBottom > 0) {
            const topFactor = Math.max(
              topScrollStrength,
              clamp((0 - localTop) / 12, 0, 1)
            );
            topProgress =
              computeEdgeProgress(localBottom, item.height, effectiveFoldZone, exponent) * topFactor;
          }

          let bottomProgress = 0;
          if (localBottom > safeBottom && localTop < clientHeight) {
            const bottomFactor = Math.max(
              bottomScrollStrength,
              clamp((localBottom - clientHeight) / 12, 0, 1)
            );
            bottomProgress =
              computeEdgeProgress(clientHeight - localTop, item.height, effectiveFoldZone, exponent) *
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
            continue;
          }

          const angle = progress * maxAngle;
          const signedAngle = winnerEdge === 'top' ? angle : -angle;
          const scale = 1 - progress * (1 - minScale);
          const opacityValue = 1 - progress * (1 - minOpacity);

          const origin = winnerEdge === 'top' ? 'center bottom' : 'center top';
          const zPart = depth > 0 ? ` translateZ(${(-(progress * depth)).toFixed(1)}px)` : '';
          const transform = `perspective(${perspective}px)${zPart} rotateX(${signedAngle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
          const opacity = minOpacity < 1 ? opacityValue.toFixed(2) : '';

          const el = item.el;
          nextActive.add(el);
          const prev = appliedStates.get(el);
          if (
            !prev ||
            prev.origin !== origin ||
            prev.transform !== transform ||
            prev.opacity !== opacity
          ) {
            if (el.style.transformOrigin !== origin) {
              el.style.transformOrigin = origin;
            }
            if (el.style.transform !== transform) {
              el.style.transform = transform;
            }
            if (el.style.opacity !== opacity) {
              el.style.opacity = opacity;
            }
            appliedStates.set(el, { origin, transform, opacity });
          }
        }

        activeElements.forEach((el) => {
          if (!nextActive.has(el)) {
            clearElementFoldStyles(el);
            appliedStates.delete(el);
          }
        });
        activeElements = nextActive;
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
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => {
              dirty = true;
              scheduleUpdate();
            })
          : null;
      if (resizeObserver) {
        resizeObserver.observe(container);
        if (container.firstElementChild instanceof HTMLElement) {
          resizeObserver.observe(container.firstElementChild);
        }
      }

      const isVirtuosoContainer = container.hasAttribute('data-virtuoso-scroller');
      const mutationObserver =
        typeof MutationObserver !== 'undefined'
          ? new MutationObserver((records) => {
              let layoutChanged = false;
              for (let i = 0; i < records.length; i += 1) {
                const record = records[i];
                if (record.type === 'childList') {
                  layoutChanged = true;
                  break;
                }
                if (
                  isVirtuosoContainer &&
                  record.type === 'attributes' &&
                  record.target instanceof HTMLElement &&
                  !cachedElSet.has(record.target)
                ) {
                  layoutChanged = true;
                  break;
                }
              }
              if (layoutChanged) {
                dirty = true;
                scheduleUpdate();
              }
            })
          : null;
      if (mutationObserver) {
        mutationObserver.observe(
          container,
          isVirtuosoContainer
            ? { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] }
            : { childList: true, subtree: true }
        );
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
