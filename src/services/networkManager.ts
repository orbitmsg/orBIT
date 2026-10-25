import { sqliteStorage } from './sqliteStorage';

export interface OutboxItem {
  id: string;
  chatId: string;
  text: string;
  sender: string;
  time: number;
  recipientTargets: string[];
  chatType: 'private' | 'group' | 'channel' | 'notes';
  mediaPayload?: any;
  sanitizedMediaItems?: any[];
  linkPreview?: any;
  forwardedFrom?: any;
  replyingTo?: any;
  retries: number;
  status: 'pending' | 'sending' | 'failed';
  createdAt: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class NetworkManager {
  private inFlightRequests = new Map<string, Promise<any>>();
  private memoryCache = new Map<string, CacheEntry<any>>();
  private outboxQueue: OutboxItem[] = [];
  private isDrainingOutbox = false;
  private outboxExecutor: ((item: OutboxItem) => Promise<boolean>) | null = null;
  private readonly OUTBOX_STORAGE_KEY = 'orbita_outbox_queue_v2';
  private readonly DEFAULT_TIMEOUT_MS = 10000;
  private readonly MAX_RETRIES = 5;

  constructor() {
    this.restoreOutbox();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.triggerOutboxDrain();
      });
    }
  }

  public deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const existing = this.inFlightRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = requestFn()
      .finally(() => {
        this.inFlightRequests.delete(key);
      });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  public getCached<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  public setCache<T>(key: string, data: T, ttlMs = 30000): void {
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public invalidateCache(prefix?: string): void {
    if (!prefix) {
      this.memoryCache.clear();
      return;
    }
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }

  public async safeFetch(
    url: string,
    init?: RequestInit,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    maxRetries = 2
  ): Promise<Response> {
    const isIdempotent = !init?.method || init.method.toUpperCase() === 'GET' || init.method.toUpperCase() === 'HEAD';
    const allowedRetries = isIdempotent ? maxRetries : 0;
    let attempt = 0;

    while (attempt <= allowedRetries) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), timeoutMs);

      const signal = init?.signal
        ? (AbortSignal as any).any
          ? (AbortSignal as any).any([init.signal, controller.signal])
          : controller.signal
        : controller.signal;

      try {
        const response = await fetch(url, {
          ...init,
          signal,
        });

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfterHeader = response.headers.get('Retry-After');
          let delayMs = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed) && parsed > 0) {
              delayMs = Math.min(parsed * 1000, 15000);
            }
          }

          if (attempt < allowedRetries) {
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
        }

        return response;
      } catch (err: any) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        if (attempt >= allowedRetries || err.name === 'AbortError' && init?.signal?.aborted) {
          throw err;
        }

        attempt++;
        const jitter = Math.floor(Math.random() * 300);
        const backoffMs = Math.min(500 * Math.pow(2, attempt) + jitter, 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error(`Fetch failed after ${allowedRetries} retries: ${url}`);
  }

  private async restoreOutbox(): Promise<void> {
    try {
      const raw = await sqliteStorage.get(this.OUTBOX_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.outboxQueue = parsed.filter(
            (item: OutboxItem) => item && item.id && item.status !== 'failed'
          );
        }
      }
    } catch {
      this.outboxQueue = [];
    }
  }

  private async persistOutbox(): Promise<void> {
    try {
      await sqliteStorage.set(this.OUTBOX_STORAGE_KEY, JSON.stringify(this.outboxQueue));
    } catch {}
  }

  public async enqueueOutbox(
    item: Omit<OutboxItem, 'id' | 'createdAt' | 'retries' | 'status'> & { id?: string }
  ): Promise<string> {
    const messageId = item.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const outboxItem: OutboxItem = {
      ...item,
      id: messageId,
      createdAt: Date.now(),
      retries: 0,
      status: 'pending',
    };

    const existingIdx = this.outboxQueue.findIndex((i) => i.id === messageId);
    if (existingIdx >= 0) {
      this.outboxQueue[existingIdx] = outboxItem;
    } else {
      this.outboxQueue.push(outboxItem);
    }

    await this.persistOutbox();
    this.triggerOutboxDrain();
    return messageId;
  }

  public async removeOutboxItem(id: string): Promise<void> {
    this.outboxQueue = this.outboxQueue.filter((item) => item.id !== id);
    await this.persistOutbox();
  }

  public registerOutboxExecutor(executor: (item: OutboxItem) => Promise<boolean>): () => void {
    this.outboxExecutor = executor;
    this.triggerOutboxDrain();
    return () => {
      if (this.outboxExecutor === executor) {
        this.outboxExecutor = null;
      }
    };
  }

  public triggerOutboxDrain(): void {
    if (this.isDrainingOutbox || !this.outboxExecutor) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.isDrainingOutbox = true;
    (async () => {
      try {
        const pendingItems = this.outboxQueue.filter((i) => i.status === 'pending');
        for (const item of pendingItems) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) break;
          if (!this.outboxExecutor) break;

          item.status = 'sending';
          item.retries++;

          try {
            const success = await this.outboxExecutor(item);
            if (success) {
              this.outboxQueue = this.outboxQueue.filter((i) => i.id !== item.id);
              await this.persistOutbox();
            } else {
              if (item.retries >= this.MAX_RETRIES) {
                item.status = 'failed';
              } else {
                item.status = 'pending';
              }
              await this.persistOutbox();
            }
          } catch {
            if (item.retries >= this.MAX_RETRIES) {
              item.status = 'failed';
            } else {
              item.status = 'pending';
            }
            await this.persistOutbox();
          }
        }
      } finally {
        this.isDrainingOutbox = false;
      }
    })().catch(() => {
      this.isDrainingOutbox = false;
    });
  }

  public getOutboxCount(): number {
    return this.outboxQueue.length;
  }
}

export const networkManager = new NetworkManager();
