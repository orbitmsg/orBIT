import { useState, useCallback, useEffect, useMemo } from 'react';

const MAX_SELECT_LIMIT = 200;

export function useSelection() {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelectionMode = useCallback((messageId: string) => {
    setIsSelectionMode(true);
    setSelectedIds(new Set([messageId]));
  }, []);

  const toggleSelection = useCallback((messageId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        if (newSet.size >= MAX_SELECT_LIMIT) {
          return prev;
        }
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const selectRange = useCallback((ids: string[]) => {
    const limited = ids.slice(0, MAX_SELECT_LIMIT);
    setSelectedIds((prev) => {
      if (prev.size === limited.length) {
        let same = true;
        for (let i = 0; i < limited.length; i++) {
          if (!prev.has(limited[i])) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return new Set(limited);
    });
    setIsSelectionMode((prev) => {
      const next = limited.length > 0;
      return prev === next ? prev : next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  useEffect(() => {
    if (isSelectionMode && selectedIds.size === 0) {
      exitSelectionMode();
    }
  }, [isSelectionMode, selectedIds.size, exitSelectionMode]);

  return useMemo(
    () => ({
      isSelectionMode,
      selectedIds,
      enterSelectionMode,
      toggleSelection,
      selectRange,
      exitSelectionMode,
      clearSelection,
      maxLimit: MAX_SELECT_LIMIT,
    }),
    [isSelectionMode, selectedIds, enterSelectionMode, toggleSelection, selectRange, exitSelectionMode, clearSelection]
  );
}
