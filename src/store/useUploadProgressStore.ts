import { create } from 'zustand';

export interface UploadProgressData {
  uploadedBytes: number;
  totalBytes: number;
  fraction: number;
  uploadedMb: number;
  totalMb: number;
}

interface UploadProgressState {
  progressByKey: Record<string, UploadProgressData>;
  setProgress: (key: string, uploadedBytes: number, totalBytes?: number) => void;
  clearProgress: (key: string) => void;
  clearAll: () => void;
}

const targets = new Map<string, { targetFraction: number; total: number; uploadedBytes: number }>();
let animTimer: any = null;

const startAnimator = (set: any, get: any) => {
  if (animTimer) return;
  animTimer = setInterval(() => {
    if (targets.size === 0) {
      clearInterval(animTimer);
      animTimer = null;
      return;
    }
    const state = get();
    let hasChanges = false;
    const nextProgress = { ...state.progressByKey };

    for (const [key, t] of targets.entries()) {
      const current = nextProgress[key];
      const curFraction = current ? current.fraction : 0;
      if (curFraction < t.targetFraction) {
        hasChanges = true;
        const step = Math.min(0.045, Math.max(0.015, (t.targetFraction - curFraction) * 0.18));
        const nextFraction = Math.min(t.targetFraction, curFraction + step);
        const curBytes = Math.floor(nextFraction * t.total);
        nextProgress[key] = {
          uploadedBytes: curBytes,
          totalBytes: t.total,
          fraction: nextFraction,
          uploadedMb: curBytes / (1024 * 1024),
          totalMb: t.total / (1024 * 1024),
        };
      } else if (curFraction >= 1) {
        targets.delete(key);
      }
    }

    if (hasChanges) {
      set({ progressByKey: nextProgress });
    }
  }, 24);
};

export const useUploadProgressStore = create<UploadProgressState>((set, get) => ({
  progressByKey: {},
  setProgress: (key, uploadedBytes, totalBytes) => {
    const total = (typeof totalBytes === 'number' && totalBytes > 0) ? totalBytes : Math.max(uploadedBytes, 1);
    const targetFraction = Math.min(1, Math.max(0, uploadedBytes / total));
    targets.set(key, { targetFraction, total, uploadedBytes });
    startAnimator(set, get);
  },
  clearProgress: (key) => {
    targets.delete(key);
    setTimeout(() => {
      set((state) => {
        if (!(key in state.progressByKey)) return state;
        const copy = { ...state.progressByKey };
        delete copy[key];
        return { progressByKey: copy };
      });
    }, 300);
  },
  clearAll: () => {
    targets.clear();
    set({ progressByKey: {} });
  },
}));
