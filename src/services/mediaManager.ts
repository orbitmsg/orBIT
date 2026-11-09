import { getVercelBaseUrl } from './gatewayManager';

const normalizeMediaUrl = (raw: string): string => {
  if (!raw) return '';
  return raw.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*/i, '').trim();
};

class IndexedDBMediaStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private static readonly DB_VERSION = 3;
  private static readonly DB_NAME = 'orbita_media_v3';

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(IndexedDBMediaStorage.DB_NAME, IndexedDBMediaStorage.DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: 'url' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async get(url: string): Promise<{ data: string; mime: string } | null> {
    try {
      const db = await this.getDB();
      const cleanUrl = normalizeMediaUrl(url);
      return new Promise((resolve) => {
        const tx = db.transaction('media', 'readonly');
        const store = tx.objectStore('media');
        const req = store.get(url);
        req.onsuccess = () => {
          if (req.result) {
            resolve({ data: req.result.data, mime: req.result.mime });
          } else if (cleanUrl && cleanUrl !== url) {
            const reqClean = store.get(cleanUrl);
            reqClean.onsuccess = () => resolve(reqClean.result ? { data: reqClean.result.data, mime: reqClean.result.mime } : null);
            reqClean.onerror = () => resolve(null);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async save(url: string, data: string, mime: string, chatId?: string, messageId?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('media', 'readwrite');
      const store = tx.objectStore('media');
      const now = Date.now();
      store.put({ url, data, mime, chatId, messageId, savedAt: now });
      const cleanUrl = normalizeMediaUrl(url);
      if (cleanUrl && cleanUrl !== url) {
        store.put({ url: cleanUrl, data, mime, chatId, messageId, savedAt: now });
      }
    } catch {}
  }
}

export const idbMediaStorage = new IndexedDBMediaStorage();

export interface DecryptedMedia {
  id: string;
  blobUrl: string;
  blob?: Blob;
  imageBitmap: ImageBitmap | null;
  mimeType: string;
  size: number;
  lastAccessed: number;
  chatId?: string;
  messageId?: string;
}

interface QueuedItem {
  url: string;
  originalUrl?: string;
  sharedSecret: string;
  fileName?: string;
  chatId: string;
  messageId: string;
  forcedMime?: string;
  resolve: (media: DecryptedMedia) => void;
  reject: (err: any) => void;
}

class MediaManager {
  private memoryCache = new Map<string, DecryptedMedia>();
  public locallySavedUrls = new Set<string>();
  private totalMemorySize = 0;
  private maxMemorySize = 128 * 1024 * 1024;
  private maxItemCount = 60;
  private singleItemMaxSize = 50 * 1024 * 1024;

  constructor() {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.trimToLimits(5, 4 * 1024 * 1024);
        }
      });
      setInterval(() => {
        this.evictOlderThan(120000);
      }, 60000);
    }
  }

  private pendingRequests = new Map<string, Promise<DecryptedMedia>>();
  private downloadQueue: QueuedItem[] = [];
  private activeDownloads = 0;
  private maxConcurrentDownloads = 3;
  private processing = false;
  private fetchAbortControllers = new Map<string, AbortController>();
  private progressListeners = new Map<string, Set<(loaded: number, total: number) => void>>();
  private pendingPurgeUrls = new Set<string>();
  private unavailableMediaUrls = new Set<string>();

  private cacheHits = 0;
  private cacheMisses = 0;

  subscribeProgress(url: string, sharedSecret: string, callback: (loaded: number, total: number) => void): () => void {
    const key = `${normalizeMediaUrl(url)}::${sharedSecret || 'public'}`;
    let set = this.progressListeners.get(key);
    if (!set) {
      set = new Set();
      this.progressListeners.set(key, set);
    }
    set.add(callback);
    return () => {
      const s = this.progressListeners.get(key);
      if (s) {
        s.delete(callback);
        if (s.size === 0) this.progressListeners.delete(key);
      }
    };
  }

  notifyProgress(cacheKey: string, loaded: number, total: number) {
    const listeners = this.progressListeners.get(cacheKey);
    if (listeners && listeners.size > 0) {
      listeners.forEach((cb) => {
        try { cb(loaded, total); } catch {}
      });
    }
  }

  setDirectDecryptedMedia(
    url: string,
    sharedSecret: string,
    blob: Blob,
    mimeType: string,
    chatId?: string,
    messageId?: string
  ): DecryptedMedia {
    const cleanUrl = normalizeMediaUrl(url);
    const normSecret = (sharedSecret || '').trim().toLowerCase();
    const cacheKey = `${cleanUrl}::${normSecret || 'public'}`;
    const blobUrl = URL.createObjectURL(blob);
    const media: DecryptedMedia = {
      id: cacheKey,
      blobUrl,
      blob,
      imageBitmap: null,
      mimeType: mimeType || blob.type || 'application/octet-stream',
      size: blob.size,
      lastAccessed: Date.now(),
      chatId,
      messageId,
    };
    this.addToMemoryCache(cacheKey, media);
    if (url && url !== cleanUrl) {
      this.addToMemoryCache(`${url}::${normSecret || 'public'}`, media);
    }

    const saveTargets = new Set<string>();
    if (cleanUrl) saveTargets.add(cleanUrl);
    if (url) saveTargets.add(url);

    for (const target of saveTargets) {
      this.locallySavedUrls.add(target);
    }

    blob.arrayBuffer().then((ab) => {
      const u8 = new Uint8Array(ab);
      const b64 = this.arrayBufferToBase64(ab);
      const mime = mimeType || blob.type || 'application/octet-stream';
      for (const target of saveTargets) {
        if (typeof window !== 'undefined' && (window as any).orbita?.mediaSave) {
          (window as any).orbita.mediaSave(target, u8, mime, chatId, messageId).catch(() => {});
        } else {
          idbMediaStorage.save(target, b64, mime, chatId, messageId).catch(() => {});
        }
      }
    }).catch(() => {});

    return media;
  }

  getCachedUrl(url: string | null | undefined, sharedSecret?: string): string | null {
    if (!url || typeof url !== 'string') return null;
    const cached = this.getCachedMedia(url, sharedSecret || '');
    return cached?.blobUrl || null;
  }

  getCachedMedia(url: string | null | undefined, sharedSecret: string): DecryptedMedia | undefined {
    if (!url || typeof url !== 'string' || !url.trim()) return undefined;
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) return undefined;
    const normSecret = (sharedSecret || '').trim().toLowerCase();
    const cacheKey = `${cleanUrl}::${normSecret || 'public'}`;
    let cached = this.memoryCache.get(cacheKey);
    if (!cached && url !== cleanUrl) {
      cached = this.memoryCache.get(`${url}::${normSecret || 'public'}`);
    }
    if (!cached) {
      for (const [key, val] of this.memoryCache) {
        if (key.startsWith(`${cleanUrl}::`) || key.startsWith(`${url}::`)) {
          cached = val;
          break;
        }
      }
    }
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached;
    }
    return undefined;
  }

  async getMedia(
    url: string,
    sharedSecret: string,
    fileName?: string,
    chatId?: string,
    messageId?: string,
    forcedMime?: string
  ): Promise<DecryptedMedia> {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid media URL');
    }
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) {
      throw new Error('Invalid media URL after normalization');
    }
    const normSecret = (sharedSecret || '').trim().toLowerCase();
    const cacheKey = `${cleanUrl}::${normSecret || 'public'}`;

    const cached = this.memoryCache.get(cacheKey) || (url !== cleanUrl ? this.memoryCache.get(`${url}::${normSecret || 'public'}`) : undefined);
    if (cached) {
      cached.lastAccessed = Date.now();
      this.cacheHits++;
      return cached;
    }

    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    const promise: Promise<DecryptedMedia> = this.createLoadPromise(cacheKey, cleanUrl, sharedSecret, fileName, chatId, messageId, forcedMime, url);
    this.pendingRequests.set(cacheKey, promise);
    return promise;
  }

  private createLoadPromise(
    cacheKey: string,
    url: string,
    sharedSecret: string,
    fileName?: string,
    chatId?: string,
    messageId?: string,
    forcedMime?: string,
    originalUrl?: string
  ): Promise<DecryptedMedia> {
    return new Promise<DecryptedMedia>((resolve, reject) => {
      const item: QueuedItem = {
        url,
        originalUrl,
        sharedSecret,
        fileName,
        chatId: chatId || '',
        messageId: messageId || '',
        forcedMime,
        resolve,
        reject,
      };
      this.downloadQueue.push(item);
      this.processQueue();
    }).finally(() => {
      this.pendingRequests.delete(cacheKey);
    });
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.downloadQueue.length > 0 && this.activeDownloads < this.maxConcurrentDownloads) {
      const item = this.downloadQueue.shift()!;
      this.activeDownloads++;
      this.processItem(item).finally(() => {
        this.activeDownloads--;
        this.processing = false;
        this.processQueue();
      });
    }
    this.processing = false;
  }

  private async processItem(item: QueuedItem) {
    const cacheKey = `${item.url}::${item.sharedSecret || 'public'}`;
    try {
      const media = await this.fetchAndDecrypt(item.url, item.sharedSecret, item.fileName, item.chatId, item.messageId, item.forcedMime, item.originalUrl);
      this.addToMemoryCache(cacheKey, media);
      if (item.originalUrl && item.originalUrl !== item.url) {
        this.addToMemoryCache(`${item.originalUrl}::${item.sharedSecret || 'public'}`, media);
      }
      item.resolve(media);
    } catch (err) {
      item.reject(err);
    }
  }

  public isMediaUnavailable(url: string): boolean {
    const clean = normalizeMediaUrl(url);
    return this.unavailableMediaUrls.has(clean);
  }

  public markMediaUnavailable(url: string): void {
    const clean = normalizeMediaUrl(url);
    if (clean) this.unavailableMediaUrls.add(clean);
  }

  public clearMediaUnavailable(url: string): void {
    const clean = normalizeMediaUrl(url);
    if (clean) this.unavailableMediaUrls.delete(clean);
  }

  public abortDownload(url: string, _sharedSecret?: string): void {
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) return;
    for (const [key, controller] of this.fetchAbortControllers.entries()) {
      if (key.startsWith(cleanUrl) || key.includes(cleanUrl)) {
        try { controller.abort(); } catch {}
        this.fetchAbortControllers.delete(key);
      }
    }
    this.downloadQueue = this.downloadQueue.filter((item) => {
      if (item.url === cleanUrl) {
        try { item.reject(new Error('Download cancelled by user')); } catch {}
        return false;
      }
      return true;
    });
    for (const [key] of this.pendingRequests.entries()) {
      if (key.startsWith(cleanUrl) || key.includes(cleanUrl)) {
        this.pendingRequests.delete(key);
      }
    }
  }

  public isMediaSavedLocallySync(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('blob:') || url.startsWith('data:')) return true;
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) return false;
    if (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:')) return true;
    if (this.locallySavedUrls.has(cleanUrl) || this.locallySavedUrls.has(url)) return true;
    for (const [key] of this.memoryCache) {
      if (key.startsWith(cleanUrl) || key.startsWith(url)) return true;
    }
    return false;
  }

  public async isMediaSavedLocally(url: string): Promise<boolean> {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('blob:') || url.startsWith('data:')) return true;
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) return false;
    if (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:')) return true;
    if (this.locallySavedUrls.has(cleanUrl) || this.locallySavedUrls.has(url)) return true;
    for (const [key] of this.memoryCache) {
      if (key.startsWith(cleanUrl) || key.startsWith(url)) {
        this.locallySavedUrls.add(cleanUrl);
        this.locallySavedUrls.add(url);
        return true;
      }
    }
    try {
      const checkTargets = [cleanUrl];
      if (url && url !== cleanUrl) checkTargets.push(url);

      for (const target of checkTargets) {
        if (typeof window !== 'undefined' && window.orbita?.mediaGet) {
          const diskCache = await window.orbita.mediaGet(target);
          if (diskCache && diskCache.data) {
            this.locallySavedUrls.add(cleanUrl);
            this.locallySavedUrls.add(url);
            return true;
          }
        } else {
          const idb = await idbMediaStorage.get(target);
          if (idb && idb.data) {
            this.locallySavedUrls.add(cleanUrl);
            this.locallySavedUrls.add(url);
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  public async purgeServerMedia(urls: string[] | string): Promise<void> {
    const list = Array.isArray(urls) ? urls : [urls];
    for (const rawUrl of list) {
      if (!rawUrl || typeof rawUrl !== 'string') continue;
      const cleanUrl = normalizeMediaUrl(rawUrl);
      if (!cleanUrl || !cleanUrl.includes('cloudinary.com')) continue;
      const isSaved = await this.isMediaSavedLocally(cleanUrl);
      if (!isSaved) {
        this.pendingPurgeUrls.add(cleanUrl);
        continue;
      }
      await this.executeServerDelete(cleanUrl);
    }
  }

  public async executeServerDelete(cleanUrl: string): Promise<void> {
    try {
      const match = cleanUrl.match(/\/v\d+\/([^\.\?]+)/) || cleanUrl.match(/\/([^\/\?]+)\.[a-zA-Z0-9]+$/);
      const publicId = match ? match[1] : null;
      if (publicId) {
        if (typeof window !== 'undefined' && window.orbita?.destroyCloudinaryMedia) {
          window.orbita.destroyCloudinaryMedia(publicId).catch(() => {});
        } else {
          const workerUrl = getVercelBaseUrl();
          const rTypes = ['image', 'video', 'raw'];
          for (const rt of rTypes) {
            fetch(`${workerUrl}/cloudinary/destroy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ public_id: publicId, resourceType: rt }),
            }).catch(() => {});
          }
        }
      }
    } catch {}
  }

  private async fetchAndDecrypt(
    url: string,
    sharedSecret: string,
    fileName?: string,
    chatId?: string,
    messageId?: string,
    forcedMime?: string,
    originalUrl?: string
  ): Promise<DecryptedMedia> {
    const normSecret = (sharedSecret || '').trim().toLowerCase();
    const cacheKey = `${url}::${normSecret || 'public'}`;
    const cleanUrl = normalizeMediaUrl(url);
    const lookupUrls = [cleanUrl];
    if (url && url !== cleanUrl) lookupUrls.push(url);
    if (originalUrl && !lookupUrls.includes(originalUrl)) lookupUrls.push(originalUrl);

    let diskCache: { data: string | Uint8Array | ArrayBuffer | null; mime: string | null } | null = null;
    for (const lookupKey of lookupUrls) {
      if (window.orbita?.mediaGet) {
        diskCache = await window.orbita.mediaGet(lookupKey);
      } else {
        diskCache = await idbMediaStorage.get(lookupKey);
      }
      if (diskCache && diskCache.data) {
        break;
      }
    }

    let decryptedData: ArrayBuffer;
    let mime: string;

    const saveTargets = new Set<string>();
    if (cleanUrl) saveTargets.add(cleanUrl);
    if (url) saveTargets.add(url);
    if (originalUrl) saveTargets.add(originalUrl);

    if (diskCache && diskCache.data) {
      for (const target of saveTargets) {
        this.locallySavedUrls.add(target);
      }
      let rawBytes: ArrayBuffer;
      if (diskCache.data instanceof Uint8Array) {
        rawBytes = diskCache.data.buffer.slice(diskCache.data.byteOffset, diskCache.data.byteOffset + diskCache.data.byteLength) as ArrayBuffer;
      } else if (diskCache.data instanceof ArrayBuffer) {
        rawBytes = diskCache.data;
      } else if (typeof diskCache.data === 'string') {
        const bin = atob(diskCache.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        rawBytes = bytes.buffer as ArrayBuffer;
      } else {
        const raw = diskCache.data as any;
        rawBytes = (raw.buffer || raw) as ArrayBuffer;
      }

      const cachedMime = diskCache.mime || '';
      const isPlaintext = this.isPlaintextMedia(new Uint8Array(rawBytes.slice(0, 16)));
      console.log('[MediaManager] Disk cache data:', { byteLength: rawBytes.byteLength, cachedMime, isPlaintext });

      if (isPlaintext) {
        decryptedData = rawBytes;
        mime = this.detectMime(new Uint8Array(rawBytes.slice(0, 16)), fileName);
        if (mime === 'application/octet-stream' && cachedMime && cachedMime !== 'application/octet-stream') {
          mime = cachedMime;
        }
      } else if (sharedSecret && sharedSecret.trim()) {
        try {
          decryptedData = await this.decryptFile(rawBytes, sharedSecret);
          mime = this.detectMime(new Uint8Array(decryptedData.slice(0, 16)), fileName);
          for (const target of saveTargets) {
            this.locallySavedUrls.add(target);
            if (window.orbita?.mediaSave) {
              window.orbita.mediaSave(target, new Uint8Array(decryptedData), mime, chatId || '', messageId || '').catch(() => {});
            } else {
              const b64 = this.arrayBufferToBase64(decryptedData);
              idbMediaStorage.save(target, b64, mime, chatId, messageId).catch(() => {});
            }
          }
        } catch (decErr) {
          console.warn('[MediaManager] Decrypting disk cached file failed, falling back:', decErr);
          decryptedData = rawBytes;
          mime = cachedMime || 'application/octet-stream';
        }
      } else {
        decryptedData = rawBytes;
        mime = cachedMime || this.detectMime(new Uint8Array(rawBytes.slice(0, 16)), fileName);
      }
    } else {
      const isLocalPath = /^[a-zA-Z]:[\\/]|^file:\/\/|^\//i.test(url);
      if (isLocalPath) {
        let filePath = url.startsWith('file://') ? decodeURI(url.replace(/^file:\/\/\/?/, '')) : url;
        if (/^[a-zA-Z]:/.test(filePath) === false && /^\/[a-zA-Z]:/.test(filePath)) {
          filePath = filePath.substring(1);
        }
        let localBytes: ArrayBuffer | null = null;
        if (typeof window !== 'undefined' && window.orbita?.rustReadFileFast) {
          try {
            const u8 = await window.orbita.rustReadFileFast(filePath);
            if (u8) localBytes = (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
          } catch {}
        }
        if (!localBytes && typeof window !== 'undefined' && (window.orbita as any)?.readFileAsArrayBuffer) {
          try {
            localBytes = await (window.orbita as any).readFileAsArrayBuffer(filePath);
          } catch {}
        }
        if (!localBytes && typeof window !== 'undefined' && window.orbita?.readFileAsDataURL) {
          try {
            const durl = await window.orbita.readFileAsDataURL(filePath);
            if (durl) {
              const b64 = durl.includes(',') ? durl.split(',')[1] : durl;
              const bin = atob(b64);
              const u8 = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
              localBytes = u8.buffer as ArrayBuffer;
            }
          } catch {}
        }
        if (localBytes) {
          let dec = localBytes;
          const isPlain = this.isPlaintextMedia(new Uint8Array(localBytes.slice(0, 16)));
          if (!isPlain && sharedSecret && sharedSecret.trim()) {
            try {
              dec = await this.decryptFile(localBytes, sharedSecret);
            } catch {}
          }
          const detectedMime = forcedMime || this.detectMime(new Uint8Array(dec.slice(0, 16)), fileName);
          const blob = new Blob([dec], { type: detectedMime });
          return this.setDirectDecryptedMedia(url, sharedSecret, blob, detectedMime, chatId, messageId);
        }
      }

      console.log('[MediaManager] Disk cache MISS. Fetching from network:', url);
      let response = await fetch(url, { signal: this.getAbortSignal(cacheKey) });
      if (!response.ok && response.status === 404) {
        const candidates = [];
        const strippedExt = url.replace(/\.[a-zA-Z0-9]+$/, '');
        if (url.includes('/image/upload/')) {
          candidates.push(url.replace('/image/upload/', '/raw/upload/'));
          candidates.push(strippedExt.replace('/image/upload/', '/raw/upload/'));
          candidates.push(strippedExt);
          candidates.push(url.replace('/image/upload/', '/video/upload/'));
        } else if (url.includes('/raw/upload/')) {
          candidates.push(url.replace('/raw/upload/', '/image/upload/'));
          candidates.push(strippedExt.replace('/raw/upload/', '/image/upload/'));
          candidates.push(strippedExt);
          candidates.push(`${url}.jpg`);
          candidates.push(`${url}.png`);
        } else if (url.includes('/video/upload/')) {
          candidates.push(url.replace('/video/upload/', '/raw/upload/'));
          candidates.push(strippedExt.replace('/video/upload/', '/raw/upload/'));
        }
        for (const altUrl of candidates) {
          if (altUrl === url) continue;
          try {
            const altRes = await fetch(altUrl, { signal: this.getAbortSignal(cacheKey) });
            if (altRes.ok) {
              response = altRes;
              break;
            }
          } catch {}
        }
      }
      if (!response.ok) {
        console.error('[MediaManager] Network fetch failed with status:', response.status, url);
        throw new Error(`Media fetch failed with status ${response.status}`);
      }
      let encryptedBuffer: ArrayBuffer;
      const contentLengthHeader = response.headers.get('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            this.notifyProgress(cacheKey, receivedBytes, totalBytes > 0 ? totalBytes : receivedBytes);
          }
        }
        const combined = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        encryptedBuffer = combined.buffer;
      } else {
        encryptedBuffer = await response.arrayBuffer();
        this.notifyProgress(cacheKey, encryptedBuffer.byteLength, encryptedBuffer.byteLength);
      }
      console.log('[MediaManager] Network fetch completed, total bytes:', encryptedBuffer.byteLength);

      const isAlreadyPlaintext = this.isPlaintextMedia(new Uint8Array(encryptedBuffer.slice(0, 16)));
      if (!isAlreadyPlaintext) {
        if (!sharedSecret || !sharedSecret.trim()) {
          throw new Error('Media key missing for encrypted file');
        }
        try {
          decryptedData = await this.decryptFile(encryptedBuffer, sharedSecret);
        } catch (err) {
          throw new Error('Media decryption failed');
        }
      } else {
        decryptedData = encryptedBuffer;
      }

      mime = this.detectMime(new Uint8Array(decryptedData.slice(0, 16)), fileName);

      for (const target of saveTargets) {
        this.locallySavedUrls.add(target);
        if (window.orbita?.mediaSave) {
          try {
            await window.orbita.mediaSave(target, new Uint8Array(decryptedData), mime, chatId || '', messageId || '');
          } catch (_) {}
        } else {
          const b64 = this.arrayBufferToBase64(decryptedData);
          await idbMediaStorage.save(target, b64, mime, chatId, messageId);
        }
      }

      const cleanUrl = normalizeMediaUrl(url);
      if (this.pendingPurgeUrls.has(cleanUrl)) {
        this.pendingPurgeUrls.delete(cleanUrl);
        this.executeServerDelete(cleanUrl).catch(() => {});
      }
    }

    if ((!mime || mime === 'application/octet-stream') && forcedMime) {
      mime = forcedMime;
    }
    const isVideoHint = Boolean(
      (fileName && /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(fileName)) ||
      (/\.(mp4|mov|avi|webm|mkv|m4v)(\?.*)?$/i.test(url)) ||
      (forcedMime && forcedMime.startsWith('video/'))
    );
    if (isVideoHint && (!mime || mime === 'application/octet-stream')) {
      mime = (forcedMime && forcedMime.startsWith('video/')) ? forcedMime : 'video/mp4';
    }

    const blob = new Blob([decryptedData], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    console.log('[MediaManager] Created blobUrl:', { url, blobUrl, mime, size: blob.size });

    return {
      id: url,
      blobUrl,
      blob,
      imageBitmap: null,
      mimeType: mime,
      size: blob.size,
      lastAccessed: Date.now(),
      chatId,
      messageId,
    };
  }

  private async decryptFile(encryptedData: ArrayBuffer, keyHex: string): Promise<ArrayBuffer> {
    if (window.orbita?.rustDecryptFile) {
      try {
        const decrypted = await window.orbita.rustDecryptFile(encryptedData, keyHex);
        if (decrypted) {
          return (decrypted.buffer as ArrayBuffer).slice(
            decrypted.byteOffset,
            decrypted.byteOffset + decrypted.byteLength
          );
        }
      } catch {}
    }
    if (encryptedData.byteLength < 28) return encryptedData;
    const iv = new Uint8Array(encryptedData.slice(0, 12));
    const data = encryptedData.slice(12);

    const cleanHex = keyHex.trim().toLowerCase();
    const len = Math.floor(cleanHex.length / 2);
    const raw = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
    }

    if (raw.length === 32) {
      try {
        const directKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
        return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, directKey, data);
      } catch {}
    }

    try {
      const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new TextEncoder().encode('orbita-file-key'),
          info: new TextEncoder().encode('file-encryption'),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, data);
    } catch {
      throw new Error('Media decryption failed');
    }
  }

  private isPlaintextMedia(bytes: Uint8Array): boolean {
    if (!bytes || bytes.length < 2) return false;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return true;
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
    if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
    if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
    if (bytes.length >= 8) {
      const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
      if (box === 'ftyp' || box === 'moov' || box === 'mdat' || box === 'wide' || box === 'free' || box === 'skip') {
        return true;
      }
    }
    if (bytes[0] === 0x1a && bytes[1] === 0x45) return true;
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true;
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
    if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return true;
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;
    return false;
  }

  private isDangerousExecutable(bytes: Uint8Array): boolean {
    if (!bytes || bytes.length < 2) return false;
    if (bytes[0] === 0x4D && bytes[1] === 0x5A) return true;
    if (bytes.length >= 4 && bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) return true;
    if (bytes[0] === 0x23 && bytes[1] === 0x21) return true;
    return false;
  }

  private detectMime(bytes: Uint8Array, fileName?: string): string {
    if (this.isDangerousExecutable(bytes)) {
      return 'application/octet-stream';
    }
    let mime = 'application/octet-stream';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) mime = 'image/jpeg';
    else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) mime = 'image/png';
    else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) mime = 'image/gif';
    else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        mime = 'image/webp';
      } else if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
        mime = 'audio/wav';
      } else {
        mime = 'image/webp';
      }
    }
    else if (bytes.length >= 8 && (
      (bytes[4] === 0x66 && bytes[5] === 0x74) ||
      (bytes[4] === 0x6d && bytes[5] === 0x6f && bytes[6] === 0x6f && bytes[7] === 0x76) ||
      (bytes[4] === 0x6d && bytes[5] === 0x64 && bytes[6] === 0x61 && bytes[7] === 0x74) ||
      (bytes[4] === 0x77 && bytes[5] === 0x69 && bytes[6] === 0x64 && bytes[7] === 0x65)
    )) {
      const isAudio = fileName ? fileName.toLowerCase().endsWith('.m4a') : false;
      mime = isAudio ? 'audio/mp4' : 'video/mp4';
    }
    else if (bytes[0] === 0x1A && bytes[1] === 0x45) {
      const isVoice = Boolean(
        fileName && (
          fileName.toLowerCase().includes('voice') ||
          fileName.toLowerCase().endsWith('.weba') ||
          fileName.toLowerCase().endsWith('.webm') ||
          fileName.toLowerCase().endsWith('.ogg')
        )
      );
      mime = isVoice ? 'audio/webm' : 'video/webm';
    }
    else if (bytes[0] === 0x25 && bytes[1] === 0x50) mime = 'application/pdf';
    else if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) mime = 'audio/mpeg';
    else if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) mime = 'audio/mpeg';
    else if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) mime = 'audio/flac';
    else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) mime = 'audio/ogg';

    if (mime === 'application/octet-stream' && fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const imageExts: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        avif: 'image/avif',
        bmp: 'image/bmp',
      };
      const audioExts: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        flac: 'audio/flac',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
        m4a: 'audio/mp4',
        opus: 'audio/ogg',
        wma: 'audio/x-ms-wma',
        weba: 'audio/webm',
        webm: 'audio/webm',
      };
      const videoExts: Record<string, string> = {
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        mkv: 'video/x-matroska',
        m4v: 'video/x-m4v',
      };
      const fileExts: Record<string, string> = {
        pdf: 'application/pdf',
        zip: 'application/zip',
        rar: 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain',
        json: 'application/json',
      };
      if (ext && imageExts[ext]) mime = imageExts[ext];
      else if (ext && videoExts[ext]) mime = videoExts[ext];
      else if (ext && audioExts[ext]) mime = audioExts[ext];
      else if (ext && fileExts[ext]) mime = fileExts[ext];
    }
    return mime;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as any);
    }
    return btoa(binary);
  }

  private getAbortSignal(cacheKey: string): AbortSignal {
    const controller = new AbortController();
    this.fetchAbortControllers.set(cacheKey, controller);
    return controller.signal;
  }

  public addToMemoryCache(key: string, media: DecryptedMedia) {
    const existing = this.memoryCache.get(key);
    if (existing) {
      if (existing.blobUrl && existing.blobUrl !== media.blobUrl && existing.blobUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(existing.blobUrl); } catch {}
      }
      existing.imageBitmap?.close();
      existing.blob = undefined;
      this.totalMemorySize -= existing.size;
      this.memoryCache.delete(key);
    }
    if (media.size > this.singleItemMaxSize) {
      return;
    }
    while (this.memoryCache.size > 0 && (this.totalMemorySize + media.size > this.maxMemorySize || this.memoryCache.size >= this.maxItemCount)) {
      this.evictLRU();
    }
    this.memoryCache.set(key, media);
    this.totalMemorySize += media.size;
  }

  private evictLRU() {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, media] of this.memoryCache) {
      if (media.lastAccessed < oldestTime) {
        oldestTime = media.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const media = this.memoryCache.get(oldestKey)!;
      if (media.blobUrl && media.blobUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(media.blobUrl);
        } catch {}
      }
      if (media.imageBitmap) {
        try {
          media.imageBitmap.close();
        } catch {}
        media.imageBitmap = null;
      }
      media.blob = undefined;
      this.totalMemorySize -= media.size;
      this.memoryCache.delete(oldestKey);
    }
  }

  public evictOlderThan(maxAgeMs: number) {
    const now = Date.now();
    for (const [key, media] of this.memoryCache) {
      if (now - media.lastAccessed > maxAgeMs) {
        if (media.blobUrl && media.blobUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(media.blobUrl);
          } catch {}
        }
        if (media.imageBitmap) {
          try {
            media.imageBitmap.close();
          } catch {}
          media.imageBitmap = null;
        }
        media.blob = undefined;
        this.totalMemorySize -= media.size;
        this.memoryCache.delete(key);
      }
    }
  }

  public trimToLimits(targetCount: number, targetSize: number) {
    while (this.memoryCache.size > 0 && (this.memoryCache.size > targetCount || this.totalMemorySize > targetSize)) {
      this.evictLRU();
    }
  }

  public async deleteByChatId(chatId: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const [key, media] of this.memoryCache) {
      if (media.chatId === chatId) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      const media = this.memoryCache.get(key)!;
      try {
        URL.revokeObjectURL(media.blobUrl);
      } catch {}
      media.imageBitmap?.close();
      this.totalMemorySize -= media.size;
      this.memoryCache.delete(key);
    }
    if (window.orbita?.mediaDeleteByChatId) {
      await window.orbita?.mediaDeleteByChatId(chatId);
    }
  }

  public clearMemoryCache() {
    for (const media of this.memoryCache.values()) {
      if (media.blobUrl && media.blobUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(media.blobUrl);
        } catch {}
      }
      if (media.imageBitmap) {
        try {
          media.imageBitmap.close();
        } catch {}
        media.imageBitmap = null;
      }
      media.blob = undefined;
    }
    this.memoryCache.clear();
    this.totalMemorySize = 0;
  }

  public getStats() {
    return {
      memory: {
        count: this.memoryCache.size,
        totalSize: this.totalMemorySize,
        maxSize: this.maxMemorySize,
      },
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      pendingRequests: this.pendingRequests.size,
      activeDownloads: this.activeDownloads,
      queueLength: this.downloadQueue.length,
    };
  }
}

export const mediaManager = new MediaManager();