import { StateStorage } from 'zustand/middleware';

export const lastSavedValues: Record<string, string> = {};

let checkHydrated: () => boolean = () => true;
export const setHydratedChecker = (fn: () => boolean) => {
  checkHydrated = fn;
};

export const flushStorageSet = () => {
  if (typeof window === 'undefined') return;
  const current = lastSavedValues['orbita-chat-storage'];
  if (current && (window as any).orbita?.storageSet) {
    (window as any).orbita.storageSet('orbita-chat-storage', current).catch(() => {});
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushStorageSet);
  window.addEventListener('pagehide', flushStorageSet);
}

export const isBlankChatState = (jsonStr: string): boolean => {
  try {
    const data = JSON.parse(jsonStr);
    const s = data?.state || data;
    const chats = s?.chats || [];
    const realChats = chats.filter((c: any) => c && c.id !== 'notes');
    if (realChats.length > 0) return false;
    return chats.length === 0;
  } catch {
    return false;
  }
};

export const ipcStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    let val: string | null = null;
    if ((window as any).orbita?.storageGet) {
      try {
        val = await (window as any).orbita.storageGet(name);
      } catch {}
    }
    const localVal = typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
    if (!val || (isBlankChatState(val) && localVal && !isBlankChatState(localVal))) {
      if (localVal) {
        val = localVal;
        if ((window as any).orbita?.storageSet) {
          (window as any).orbita.storageSet(name, val).catch(() => {});
        }
        try { localStorage.removeItem(name); } catch {}
      }
    }
    if (val !== null) lastSavedValues[name] = val;
    return val;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;

    if (!checkHydrated()) {
      return;
    }

    if (lastSavedValues[name] === value) {
      return;
    }

    const previousSaved = lastSavedValues[name];
    if (previousSaved && isBlankChatState(value) && !isBlankChatState(previousSaved)) {
      return;
    }

    lastSavedValues[name] = value;

    if ((window as any).orbita?.storageSet) {
      try {
        await (window as any).orbita.storageSet(name, value);
        if (typeof localStorage !== 'undefined') {
          try { localStorage.removeItem(name); } catch {}
        }
      } catch {}
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    delete lastSavedValues[name];
    if ((window as any).orbita?.storageRemove) {
      await (window as any).orbita.storageRemove(name);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(name); } catch {}
    }
  },
};

if (typeof window !== 'undefined' && (window as any).orbita?.storageMigrate) {
  (window as any).orbita.storageMigrate().catch((err: any) => {
    console.error('[Migration] Failed to migrate from localStorage:', err);
  });
}
