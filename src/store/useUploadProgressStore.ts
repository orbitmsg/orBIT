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

export const useUploadProgressStore = create<UploadProgressState>((set) => ({
  progressByKey: {},
  setProgress: (key, uploadedBytes, totalBytes) => {
    const total = (typeof totalBytes === 'number' && totalBytes > 0) ? totalBytes : Math.max(uploadedBytes, 1);
    const fraction = Math.min(1, Math.max(0, uploadedBytes / total));
    const uploadedMb = uploadedBytes / (1024 * 1024);
    const totalMb = total / (1024 * 1024);
    set((state) => ({
      progressByKey: {
        ...state.progressByKey,
        [key]: {
          uploadedBytes,
          totalBytes: total,
          fraction,
          uploadedMb,
          totalMb,
        },
      },
    }));
  },
  clearProgress: (key) =>
    set((state) => {
      if (!(key in state.progressByKey)) return state;
      const copy = { ...state.progressByKey };
      delete copy[key];
      return { progressByKey: copy };
    }),
  clearAll: () => set({ progressByKey: {} }),
}));
