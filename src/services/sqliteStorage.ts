export const sqliteStorage = {
  async get(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageGet) {
      try {
        const val = await (window as any).orbita.storageGet(key);
        if (val !== null && val !== undefined) return val;
      } catch (err) {
        console.error(`[sqliteStorage] Failed to get "${key}":`, err);
      }
    }
    return null;
  },

  async set(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageSet) {
      const res = await (window as any).orbita.storageSet(key, value);
      if (res && typeof res === 'object' && res.ok === false) {
        throw new Error(res.locked ? 'Storage is locked' : (res.error || 'Storage write failed'));
      }
    }
  },

  async remove(key: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).orbita?.storageRemove) {
      await (window as any).orbita.storageRemove(key);
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
