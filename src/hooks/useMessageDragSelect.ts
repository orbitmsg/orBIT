import { useEffect, useRef } from 'react';
import type { Message } from '../store/useChatStore';

interface UseMessageDragSelectProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  messages: Message[];
  selection: {
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    enterSelectionMode: (id: string) => void;
    toggleSelection: (id: string) => void;
    selectRange: (ids: string[]) => void;
    exitSelectionMode: () => void;
    clearSelection: () => void;
    maxLimit?: number;
  };
  maxLimit?: number;
}

interface DragState {
  startX: number;
  startY: number;
  anchorId: string | null;
  isTextClick: boolean;
  isDragging: boolean;
  hasMoved: boolean;
}

export function useMessageDragSelect({
  containerRef,
  messages,
  selection,
  maxLimit = 200,
}: UseMessageDragSelectProps) {
  const dragStateRef = useRef<DragState | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const autoScrollRafRef = useRef<number>(0);
  const autoScrollSpeedRef = useRef<number>(0);

  const dragRafRef = useRef<number>(0);
  const latestMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastRangeRef = useRef<{ start: number; end: number } | null>(null);

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = 0;
    }
    autoScrollSpeedRef.current = 0;
  };

  const processDragTick = () => {
    dragRafRef.current = 0;
    const state = dragStateRef.current;
    const pos = latestMousePosRef.current;
    const container = containerRef.current;

    if (!state || !state.isDragging || !pos || !container) {
      return;
    }

    const msgs = messagesRef.current;
    if (msgs.length === 0) return;

    if (!state.anchorId) {
      const elAtStart = document.elementFromPoint(state.startX, state.startY);
      const rowAtStart = elAtStart ? (elAtStart.closest('[data-message-id]') as HTMLElement | null) : null;
      state.anchorId = rowAtStart ? rowAtStart.getAttribute('data-message-id') : null;
      if (!state.anchorId) {
        const firstVisible = container.querySelector<HTMLElement>('[data-message-id]');
        state.anchorId = firstVisible ? firstVisible.getAttribute('data-message-id') : msgs[0]?.id || null;
      }
    }

    let hoveredId: string | null = null;
    const directEl = document.elementFromPoint(pos.x, pos.y);
    const directRow = directEl ? (directEl.closest('[data-message-id]') as HTMLElement | null) : null;

    if (directRow) {
      hoveredId = directRow.getAttribute('data-message-id');
    } else {
      const containerRect = container.getBoundingClientRect();
      if (pos.y <= containerRect.top + 4) {
        const firstVisible = container.querySelector<HTMLElement>('[data-message-id]');
        hoveredId = firstVisible ? firstVisible.getAttribute('data-message-id') : msgs[0]?.id || null;
      } else if (pos.y >= containerRect.bottom - 4) {
        const allVisible = container.querySelectorAll<HTMLElement>('[data-message-id]');
        const lastVisible = allVisible.length > 0 ? allVisible[allVisible.length - 1] : null;
        hoveredId = lastVisible ? lastVisible.getAttribute('data-message-id') : msgs[msgs.length - 1]?.id || null;
      } else {
        const centerX = Math.round(containerRect.left + containerRect.width / 2);
        const centerEl = document.elementFromPoint(centerX, pos.y);
        const centerRow = centerEl ? (centerEl.closest('[data-message-id]') as HTMLElement | null) : null;
        if (centerRow) {
          hoveredId = centerRow.getAttribute('data-message-id');
        }
      }
    }

    if (state.anchorId && hoveredId) {
      const anchorIdx = msgs.findIndex((m) => m.id === state.anchorId);
      const hoverIdx = msgs.findIndex((m) => m.id === hoveredId);

      if (anchorIdx !== -1 && hoverIdx !== -1) {
        let start = Math.min(anchorIdx, hoverIdx);
        let end = Math.max(anchorIdx, hoverIdx);

        const limit = maxLimit || 200;
        if (end - start + 1 > limit) {
          if (hoverIdx > anchorIdx) {
            end = anchorIdx + limit - 1;
          } else {
            start = Math.max(0, anchorIdx - (limit - 1));
          }
        }

        if (!lastRangeRef.current || lastRangeRef.current.start !== start || lastRangeRef.current.end !== end) {
          lastRangeRef.current = { start, end };
          const rangeIds = msgs
            .slice(start, end + 1)
            .map((m) => m.id)
            .filter(Boolean) as string[];
          selectionRef.current.selectRange(rangeIds);
        }
      }
    }

    const rect = container.getBoundingClientRect();
    const topThreshold = rect.top + 60;
    const bottomThreshold = rect.bottom - 60;

    if (pos.y < topThreshold) {
      const speed = Math.min(22, (topThreshold - pos.y) * 0.35);
      startAutoScroll(-speed);
    } else if (pos.y > bottomThreshold) {
      const speed = Math.min(22, (pos.y - bottomThreshold) * 0.35);
      startAutoScroll(speed);
    } else {
      stopAutoScroll();
    }
  };

  const scheduleDragTick = () => {
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(processDragTick);
  };

  const startAutoScroll = (speed: number) => {
    autoScrollSpeedRef.current = speed;
    if (autoScrollRafRef.current) return;

    const scrollStep = () => {
      const container = containerRef.current;
      if (!container || autoScrollSpeedRef.current === 0) {
        autoScrollRafRef.current = 0;
        return;
      }
      container.scrollTop += autoScrollSpeedRef.current;
      scheduleDragTick();
      autoScrollRafRef.current = requestAnimationFrame(scrollStep);
    };
    autoScrollRafRef.current = requestAnimationFrame(scrollStep);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectionRef.current.isSelectionMode) {
        selectionRef.current.exitSelectionMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest(
          'button, a, input, textarea, video, audio, [data-interactive], .reaction-picker, .tgs-player, .overlay-scroll-track, .overlay-scrollbar-thumb, .scroll-btn'
        )
      ) {
        return;
      }

      const rowEl = target.closest('[data-message-id]') as HTMLElement | null;
      const clickedMsgId = rowEl ? rowEl.getAttribute('data-message-id') : null;

      const isTextEl = Boolean(
        target.closest('.selectable-message-text, [data-message-text], p, span') &&
          target.closest('[data-bubble="true"]')
      );

      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        anchorId: clickedMsgId,
        isTextClick: isTextEl,
        isDragging: false,
        hasMoved: false,
      };
      lastRangeRef.current = null;
      latestMousePosRef.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        latestMousePosRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };

        if (!state.isDragging) {
          const dx = Math.abs(moveEvent.clientX - state.startX);
          const dy = Math.abs(moveEvent.clientY - state.startY);

          if (selectionRef.current.isSelectionMode) {
            if (dx > 3 || dy > 3) {
              state.isDragging = true;
            }
          } else if (state.isTextClick) {
            if (dy > 9 && dy > dx * 0.8) {
              state.isDragging = true;
            }
          } else {
            if (dx > 4 || dy > 4) {
              state.isDragging = true;
            }
          }
        }

        if (state.isDragging) {
          state.hasMoved = true;
          window.getSelection()?.removeAllRanges();
          scheduleDragTick();
        }
      };

      const handleMouseUp = () => {
        stopAutoScroll();
        if (dragRafRef.current) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = 0;
        }

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        const state = dragStateRef.current;
        if (state?.hasMoved) {
          const blockClick = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
            window.removeEventListener('click', blockClick, true);
          };
          window.addEventListener('click', blockClick, true);
          setTimeout(() => {
            window.removeEventListener('click', blockClick, true);
          }, 60);
        } else if (selectionRef.current.isSelectionMode) {
          if (!state?.anchorId) {
            selectionRef.current.exitSelectionMode();
          }
        }

        dragStateRef.current = null;
        lastRangeRef.current = null;
        latestMousePosRef.current = null;
      };

      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp, { passive: true });
    };

    container.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      stopAutoScroll();
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = 0;
      }
    };
  }, [containerRef, maxLimit]);
}
