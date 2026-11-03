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
  isDragging: false | true;
  hasMoved: false | true;
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

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = 0;
    }
    autoScrollSpeedRef.current = 0;
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

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        const dx = Math.abs(moveEvent.clientX - state.startX);
        const dy = Math.abs(moveEvent.clientY - state.startY);

        if (!state.isDragging) {
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

          if (!state.anchorId) {
            const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-message-id]');
            if (rows && rows.length > 0) {
              let closestId: string | null = null;
              let minDiff = Infinity;
              rows.forEach((r) => {
                const rect = r.getBoundingClientRect();
                const midY = (rect.top + rect.bottom) / 2;
                const diff = Math.abs(state.startY - midY);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestId = r.getAttribute('data-message-id');
                }
              });
              state.anchorId = closestId;
            }
          }

          const hoveredEl = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          let hoveredRow = hoveredEl ? (hoveredEl.closest('[data-message-id]') as HTMLElement | null) : null;
          let hoveredId = hoveredRow ? hoveredRow.getAttribute('data-message-id') : null;

          if (!hoveredId) {
            const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-message-id]');
            if (rows && rows.length > 0) {
              let closestId: string | null = null;
              let minDiff = Infinity;
              rows.forEach((r) => {
                const rect = r.getBoundingClientRect();
                if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
                  closestId = r.getAttribute('data-message-id');
                  minDiff = 0;
                  return;
                }
                const midY = (rect.top + rect.bottom) / 2;
                const diff = Math.abs(moveEvent.clientY - midY);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestId = r.getAttribute('data-message-id');
                }
              });
              hoveredId = closestId;
            }
          }

          if (state.anchorId && hoveredId) {
            const msgs = messagesRef.current;
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

              const rangeIds = msgs
                .slice(start, end + 1)
                .map((m) => m.id)
                .filter(Boolean) as string[];

              selectionRef.current.selectRange(rangeIds);
            }
          }

          const c = containerRef.current;
          if (c) {
            const rect = c.getBoundingClientRect();
            const topThreshold = rect.top + 60;
            const bottomThreshold = rect.bottom - 60;

            if (moveEvent.clientY < topThreshold) {
              const speed = Math.min(22, (topThreshold - moveEvent.clientY) * 0.35);
              startAutoScroll(-speed);
            } else if (moveEvent.clientY > bottomThreshold) {
              const speed = Math.min(22, (moveEvent.clientY - bottomThreshold) * 0.35);
              startAutoScroll(speed);
            } else {
              stopAutoScroll();
            }
          }
        }
      };

      const handleMouseUp = () => {
        stopAutoScroll();
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
      };

      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp, { passive: true });
    };

    container.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      stopAutoScroll();
    };
  }, [containerRef, maxLimit]);
}
