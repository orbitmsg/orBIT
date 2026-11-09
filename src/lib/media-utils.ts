import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { mediaManager } from '../services/mediaManager';

export async function deriveFileKey(sharedSecret: string): Promise<CryptoKey> {
  const cleanHex = sharedSecret.trim().toLowerCase();
  const len = Math.floor(cleanHex.length / 2);
  const raw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('orbita-file-key'),
      info: new TextEncoder().encode('file-encryption'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function decryptFile(encryptedData: ArrayBuffer, keyHex: string): Promise<ArrayBuffer> {
  if (window.orbita?.rustDecryptFile) {
    try {
      const decrypted = await window.orbita.rustDecryptFile(encryptedData, keyHex);
      if (decrypted) {
        return (decrypted.buffer as ArrayBuffer).slice(
          decrypted.byteOffset,
          decrypted.byteOffset + decrypted.byteLength
        );
      }
    } catch (e) {
      console.warn('[media-utils] Rust decryptFile fallback:', e);
    }
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
    const key = await deriveFileKey(keyHex);
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    return encryptedData;
  }
}

export function getOrbitaMediaUrl(
  url: string | null,
  sharedSecret?: string,
  chatId?: string,
  messageId?: string,
  fileName?: string,
  mime?: string
): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*/i, '').trim();
  if (!clean || clean === 'undefined' || clean === 'null' || clean.startsWith('undefined') || clean.startsWith('null')) {
    return null;
  }
  if (clean.startsWith('blob:') || clean.startsWith('data:') || clean.startsWith('orbita-media:')) {
    return clean;
  }

  const cached = mediaManager.getCachedMedia(clean, sharedSecret || '');
  if (cached?.blobUrl) {
    return cached.blobUrl;
  }

  const isElectron = typeof window !== 'undefined' && (Boolean((window as any).__ELECTRON_RENDERER__) || Boolean((window as any).orbita?.getDesktopSources));
  if (isElectron) {
    const params = new URLSearchParams();
    params.set('url', clean);
    if (sharedSecret) params.set('secret', sharedSecret);
    if (chatId) params.set('chatId', chatId);
    if (messageId) params.set('messageId', messageId);
    if (fileName) params.set('filename', fileName);
    if (mime) params.set('mime', mime);
    return `orbita-media://media?${params.toString()}`;
  }

  return null;
}

export function useDecryptedMedia(
  url: string | null,
  sharedSecret: string | undefined,
  hintFileName?: string,
  forcedMime?: string,
  chatId?: string,
  messageId?: string,
  autoLoad: boolean = true
): { blobUrl: string | null; blob: Blob | null; load: () => Promise<void>; cancel: () => void; isLoading: boolean; progress: number; isUnavailable: boolean } {
  const cleanUrl = useMemo(() => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*/i, '').trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed.startsWith('undefined') || trimmed.startsWith('null')) {
      return null;
    }
    return trimmed;
  }, [url]);

  const cachedUrl = useMemo(() => {
    if (!cleanUrl) return null;
    if (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:')) return cleanUrl;
    return mediaManager.getCachedMedia(cleanUrl, sharedSecret || '')?.blobUrl || null;
  }, [cleanUrl, sharedSecret]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(() => {
    return cleanUrl ? mediaManager.isMediaUnavailable(cleanUrl) : false;
  });

  const initialBlobUrl = useMemo(() => {
    if (cachedUrl) return cachedUrl;
    if (cleanUrl && (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:'))) {
      return cleanUrl;
    }
    return null;
  }, [cachedUrl, cleanUrl]);

  const [blobUrl, setBlobUrl] = useState<string | null>(initialBlobUrl);
  const [blob, setBlob] = useState<Blob | null>(() => {
    if (!cleanUrl) return null;
    return mediaManager.getCachedMedia(cleanUrl, sharedSecret || '')?.blob || null;
  });

  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const progressAnimRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cleanUrl) return;
    const unsubscribe = mediaManager.subscribeProgress(cleanUrl, sharedSecret || '', (loaded, total) => {
      if (total > 0) {
        const target = Math.min(1, Math.max(0, loaded / total));
        targetProgressRef.current = target;
        if (!progressAnimRef.current) {
          const tick = () => {
            const cur = currentProgressRef.current;
            const tgt = targetProgressRef.current;
            if (cur < tgt) {
              const step = Math.max(0.02, (tgt - cur) * 0.25);
              const next = Math.min(tgt, cur + step);
              currentProgressRef.current = next;
              setProgress(next);
              if (next < tgt) {
                progressAnimRef.current = requestAnimationFrame(tick);
                return;
              }
            }
            progressAnimRef.current = null;
          };
          progressAnimRef.current = requestAnimationFrame(tick);
        }
      }
    });
    return () => {
      unsubscribe();
      if (progressAnimRef.current) {
        cancelAnimationFrame(progressAnimRef.current);
        progressAnimRef.current = null;
      }
    };
  }, [cleanUrl, sharedSecret]);

  const isExecutingRef = useRef(false);

  const loadMedia = useCallback(async () => {
    if (!cleanUrl) {
      setBlobUrl(null);
      setBlob(null);
      setIsLoading(false);
      setProgress(0);
      return;
    }

    if (cachedUrl) {
      setIsUnavailable(false);
      setBlobUrl(cachedUrl);
      const cached = mediaManager.getCachedMedia(cleanUrl, sharedSecret || '');
      if (cached?.blob) setBlob(cached.blob);
      setIsLoading(false);
      setProgress(1);
      return;
    }

    if (isExecutingRef.current) return;
    if (cleanUrl) {
      mediaManager.clearMediaUnavailable(cleanUrl);
    }
    setIsUnavailable(false);
    isExecutingRef.current = true;
    setIsLoading(true);
    setProgress(0);

    console.log('[useDecryptedMedia] loadMedia starting for:', { cleanUrl, hintFileName, forcedMime, chatId, messageId });

    try {
      const media = await mediaManager.getMedia(cleanUrl, sharedSecret || '', hintFileName, chatId, messageId, forcedMime);
      setIsUnavailable(false);
      setBlobUrl(media.blobUrl);
      setBlob(media.blob || null);
      setIsLoading(false);
      setProgress(1);
      console.log('[useDecryptedMedia] loadMedia success:', { cleanUrl, blobUrl: media.blobUrl, size: media.blob?.size, mime: media.mimeType });
    } catch (err) {
      setIsUnavailable(true);
      setBlobUrl(null);
      setBlob(null);
      setIsLoading(false);
      setProgress(0);
      console.error('[useDecryptedMedia] loadMedia failed:', { cleanUrl, err });
    } finally {
      isExecutingRef.current = false;
      setIsLoading(false);
    }
  }, [cleanUrl, cachedUrl, sharedSecret, hintFileName, forcedMime, chatId, messageId]);

  useEffect(() => {
    if (!cleanUrl) {
      setBlobUrl(null);
      setBlob(null);
      setIsLoading(false);
      setProgress(0);
      return;
    }

    if (cachedUrl) {
      setBlobUrl(cachedUrl);
      const cached = mediaManager.getCachedMedia(cleanUrl, sharedSecret || '');
      if (cached?.blob) setBlob(cached.blob);
      setIsLoading(false);
      setProgress(1);
      return;
    }

    if (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:')) {
      setBlobUrl(cleanUrl);
      setIsLoading(false);
      setProgress(1);
      return;
    }

    let isMounted = true;
    mediaManager.isMediaSavedLocally(cleanUrl).then((isSaved) => {
      if (!isMounted) return;
      if (isSaved) {
        loadMedia();
      } else if (autoLoad) {
        loadMedia();
      } else {
        setBlobUrl(null);
        setBlob(null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [cleanUrl, cachedUrl, autoLoad, loadMedia]);

  const cancel = useCallback(() => {
    if (cleanUrl) {
      mediaManager.abortDownload(cleanUrl, sharedSecret);
    }
    isExecutingRef.current = false;
    setIsLoading(false);
    setProgress(0);
  }, [cleanUrl, sharedSecret]);

  return {
    blobUrl,
    blob,
    load: loadMedia,
    cancel,
    isLoading,
    progress,
    isUnavailable: isUnavailable || (cleanUrl ? mediaManager.isMediaUnavailable(cleanUrl) : false),
  };
}

export function calculateMediaDisplaySize(
  origW?: number,
  origH?: number,
  maxW: number = 440,
  maxH: number = 400,
  minW: number = 140,
  minH: number = 100
): { width: number; height: number; aspectRatio: number } {
  const w = Number(origW) || 0;
  const h = Number(origH) || 0;

  if (w <= 0 || h <= 0) {
    return { width: Math.min(360, maxW), height: Math.min(260, maxH), aspectRatio: 360 / 260 };
  }

  const rawAspect = w / h;
  const clampedAspect = Math.max(0.45, Math.min(2.4, rawAspect));

  let displayW: number;
  let displayH: number;

  if (clampedAspect >= 1) {
    displayW = Math.min(w, maxW);
    displayH = Math.round(displayW / clampedAspect);
    if (displayH > maxH) {
      displayH = maxH;
      displayW = Math.round(displayH * clampedAspect);
    }
  } else {
    displayH = Math.min(h, maxH);
    displayW = Math.round(displayH * clampedAspect);
    if (displayW > maxW) {
      displayW = maxW;
      displayH = Math.round(displayW / clampedAspect);
    }
  }

  if (displayW < minW) {
    displayW = minW;
    displayH = Math.round(displayW / clampedAspect);
  }
  if (displayH < minH) {
    displayH = minH;
    displayW = Math.round(displayH * clampedAspect);
  }

  if (displayW > maxW) {
    displayW = maxW;
    displayH = Math.round(displayW / clampedAspect);
  }
  if (displayH > maxH) {
    displayH = maxH;
    displayW = Math.round(displayH * clampedAspect);
  }

  return {
    width: Math.round(displayW),
    height: Math.round(displayH),
    aspectRatio: clampedAspect,
  };
}
