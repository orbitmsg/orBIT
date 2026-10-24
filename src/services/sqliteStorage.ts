export const sqliteStorage = {
  async get(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageGet) {
      try {
        const val = await (window as any).orbita.storageGet(key);
        if (val !== null && val !== undefined) return val;
      } catch {}
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const legacyVal = localStorage.getItem(key);
        if (legacyVal !== null) {
          if (typeof window !== 'undefined' && (window as any).orbita?.storageSet) {
            await (window as any).orbita.storageSet(key, legacyVal);
          }
          localStorage.removeItem(key);
          return legacyVal;
        }
      } catch {}
    }
    return null;
  },

  async set(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageSet) {
      try {
        await (window as any).orbita.storageSet(key, value);
        if (typeof localStorage !== 'undefined') {
          try { localStorage.removeItem(key); } catch {}
        }
        return;
      } catch {}
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(key, value); } catch {}
    }
  },

  async remove(key: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageRemove) {
      try {
        await (window as any).orbita.storageRemove(key);
      } catch {}
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(key); } catch {}
    }
  },

  async getJson<T>(key: string, fallback: T): Promise<T> {
    const raw = await this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  async setJson<T>(key: string, data: T): Promise<void> {
    await this.set(key, JSON.stringify(data));
  },
};
