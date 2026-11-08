export const sqliteStorage = {
  async get(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageGet) {
      try {
        const val = await (window as any).orbita.storageGet(key);
        if (val !== null && val !== undefined) return val;
      } catch {}
    }
    return null;
  },

  async set(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageSet) {
      try {
        await (window as any).orbita.storageSet(key, value);
      } catch {}
    }
  },

  async remove(key: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageRemove) {
      try {
        await (window as any).orbita.storageRemove(key);
      } catch {}
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
    try {
      await this.set(key, JSON.stringify(data));
    } catch {}
  },
};
