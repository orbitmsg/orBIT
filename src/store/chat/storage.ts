import { StateStorage } from 'zustand/middleware';

export const lastSavedValues: Record<string, string> = {};

let checkHydrated: () => boolean = () => true;
export const setHydratedChecker = (fn: () => boolean) => {
  checkHydrated = fn;
};

const SYSTEM_CHAT_IDS = new Set(['notes', 'system_support', 'system_orbitos', 'system_notifications']);

export const countRealChats = (jsonStrOrObj: any): number => {
  try {
    const data = typeof jsonStrOrObj === 'string' ? JSON.parse(jsonStrOrObj) : jsonStrOrObj;
    const s = data?.state || data;
    const chats = s?.chats;
    if (!Array.isArray(chats)) return 0;
    return chats.filter((c: any) => c && c.id && !SYSTEM_CHAT_IDS.has(c.id)).length;
  } catch {
    return 0;
  }
};

export const isBlankChatState = (jsonStr: string): boolean => {
  return countRealChats(jsonStr) === 0;
};

export const pickBestRatchetState = (a?: any, b?: any): any => {
  if (!a) return b;
  if (!b) return a;
  const progressA = (Number(a.sendIndex) || 0) + (Number(a.recvIndex) || 0) + Object.keys(a.skippedKeys || {}).length;
  const progressB = (Number(b.sendIndex) || 0) + (Number(b.recvIndex) || 0) + Object.keys(b.skippedKeys || {}).length;
  if (progressA !== progressB) {
    return progressA > progressB ? a : b;
  }
  if (a.theirDHPublic && !b.theirDHPublic) return a;
  if (b.theirDHPublic && !a.theirDHPublic) return b;
  return a;
};

export const flushStorageSet = () => {
  if (typeof window === 'undefined') return;
  const current = lastSavedValues['orbita-chat-storage'];
  if (current) {
    if ((window as any).orbita?.storageSet) {
      (window as any).orbita.storageSet('orbita-chat-storage', current).catch(() => {});
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushStorageSet);
  window.addEventListener('pagehide', flushStorageSet);
}

export const ipcStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    let val: string | null = null;
    if ((window as any).orbita?.storageGet) {
      try {
        val = await (window as any).orbita.storageGet(name);
      } catch {}
    }
    if (val !== null) lastSavedValues[name] = val;
    return val;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    if (!checkHydrated()) return;
    if (lastSavedValues[name] === value) return;

    const previousSaved = lastSavedValues[name];
    if (previousSaved && countRealChats(previousSaved) > 0 && countRealChats(value) === 0) {
      return;
    }

    lastSavedValues[name] = value;
    if ((window as any).orbita?.storageSet) {
      try {
        await (window as any).orbita.storageSet(name, value);
      } catch {}
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    delete lastSavedValues[name];
    if ((window as any).orbita?.storageRemove) {
      await (window as any).orbita.storageRemove(name);
    }
  },
};
