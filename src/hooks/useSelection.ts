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
    setSelectedIds(new Set(limited));
    setIsSelectionMode(limited.length > 0);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
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
