import React, { memo } from 'react';
import type { Message, ChatTypingUser } from '../../../store/useChatStore';
import { resolveStickerUrl } from '../../../lib/stickers-and-gifs';

export const MAX_FILE_MB = 10;

export const getOptimalMessageBatchSize = (): number => {
  if (typeof window === 'undefined') return 35;
  const height = window.innerHeight || 800;
  const width = window.innerWidth || 1200;

  if (width < 768 || height < 650) {
    return 30;
  }
  if (height < 900) {
    return 40;
  }
  if (height < 1200) {
    return 50;
  }
  return 60;
};

export const MessageRowWrapper = memo(
  ({ index, msg, renderFn }: { index: number; msg: Message; renderFn: (i: number, m: Message) => React.ReactNode }) =>
    renderFn(index, msg) as React.ReactElement,
  (prev, next) =>
    prev.index === next.index &&
    prev.msg.id === next.msg.id &&
    prev.msg.status === next.msg.status &&
    prev.msg.text === next.msg.text &&
    prev.msg.reactions === next.msg.reactions &&
    prev.msg.time === next.msg.time &&
    prev.msg.mediaUrl === next.msg.mediaUrl &&
    prev.msg.mediaType === next.msg.mediaType &&
    prev.msg.uploading === next.msg.uploading &&
    prev.renderFn === next.renderFn
);
MessageRowWrapper.displayName = 'MessageRowWrapper';

export const MessageList = memo(
  ({
    messages,
    startIndex,
    renderFn,
  }: {
    messages: Message[];
    startIndex: number;
    renderFn: (i: number, m: Message) => React.ReactNode;
  }) => {
    const virtualTopHeight = startIndex > 0 ? startIndex * 46 : 0;
    return (
      <>
        {virtualTopHeight > 0 ? (
          <div style={{ height: `${virtualTopHeight}px`, flexShrink: 0 }} />
        ) : (
          <div style={{ flex: '1 1 auto', minHeight: '8px' }} />
        )}
        {messages.map((msg, idx) => (
          <MessageRowWrapper
            key={msg.id || `msg_${msg.time}_${startIndex + idx}`}
            index={startIndex + idx}
            msg={msg}
            renderFn={renderFn}
          />
        ))}
      </>
    );
  },
  (prev, next) =>
    prev.messages === next.messages &&
    prev.startIndex === next.startIndex
);
MessageList.displayName = 'MessageList';

export const EMPTY_ARRAY: Message[] = [];
export const EMPTY_TYPING_USERS: ChatTypingUser[] = [];

export interface ParsedMediaResult {
  type: 'image' | 'video' | 'audio' | 'music' | 'voice' | 'file' | 'call' | 'sticker' | 'gif' | null;
  url: string | null;
  fileName?: string;
  mime?: string;
  size?: number;
}

export const parseMedia = (msg: Message): ParsedMediaResult => {
  if (msg.mediaType === 'call') {
    return { type: 'call', url: null, fileName: msg.mediaName };
  }

  if (msg.mediaItems && msg.mediaItems.length > 0) {
    const first = msg.mediaItems[0];
    const type = first.type === 'video' ? 'video' : first.type === 'audio' ? 'music' : first.type === 'file' ? 'file' : 'image';
    return { type, url: first.url, fileName: first.name, mime: first.mime };
  }

  const isVoice =
    msg.mediaType === 'voice' ||
    (msg.mime && (msg.mime.includes('ogg') || msg.mime.includes('opus'))) ||
    (msg.mediaName && (/^voice_/i.test(msg.mediaName) || /\.ogg$/i.test(msg.mediaName) || /\.opus$/i.test(msg.mediaName))) ||
    (msg.text && (/^\[Audio\]\s+voice_/i.test(msg.text) || /^voice_\d+\.ogg/i.test(msg.text.trim()) || /\.ogg(\?.*)?$/i.test(msg.text.trim()) || /^\[Audio\]\s+\S+\.ogg/i.test(msg.text))) ||
    (msg.mediaUrl && (/voice_\d+\.(ogg|opus|webm)/i.test(msg.mediaUrl) || /\.ogg(\?.*)?$/i.test(msg.mediaUrl) || /\.opus(\?.*)?$/i.test(msg.mediaUrl)));

  if (isVoice) {
    const url = msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || null;
    const fileName = msg.mediaName || msg.text?.match(/voice_\S+/)?.[0] || 'voice.ogg';
    return { type: 'voice', url, fileName, mime: msg.mime || (fileName.endsWith('.webm') ? 'audio/webm' : 'audio/ogg') };
  }

  if (msg.mediaType && (msg.mediaUrl || msg.uploading)) {
    if (msg.mediaType === 'photo') return { type: 'image', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };
    if (msg.mediaType === 'video') return { type: 'video', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };
    if (msg.mediaType === 'audio') return { type: 'music', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'audio/mpeg' };
    if (msg.mediaType === 'file') return { type: 'file', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'application/octet-stream', size: msg.fileSize || (msg as any).size || (msg as any).file_size };
    if (msg.mediaType === ('sticker' as any)) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || null), fileName: msg.mediaName, mime: msg.mime || (msg.mediaUrl?.endsWith('.tgs') ? 'application/x-tgsticker' : 'image/webp') };
    if (msg.mediaType === 'gif') return { type: 'gif', url: msg.mediaUrl || null, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
  }

  const text = msg.text || '';
  const stickerMatch = text.match(/^\[Sticker\]\s*(\S+.*)$/i);
  if (stickerMatch) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || stickerMatch[1].trim()), fileName: msg.mediaName, mime: msg.mime || (stickerMatch[1].trim().endsWith('.tgs') ? 'application/x-tgsticker' : 'image/webp') };
  const stickerMatchGeneric = text.match(/^\[Sticker\]/i);
  if (stickerMatchGeneric) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || null), fileName: msg.mediaName, mime: msg.mime || 'image/webp' };

  const gifMatch = text.match(/^\[GIF\]\s*(.+)$/i);
  if (gifMatch) return { type: 'gif', url: gifMatch[1].trim(), fileName: msg.mediaName || 'animation.mp4', mime: 'video/mp4' };

  const isGifMsg =
    (msg.mime === 'image/gif' && !msg.text?.startsWith('[Photo]')) ||
    (msg.mediaName && /\.gif$/i.test(msg.mediaName) && !msg.text?.startsWith('[Photo]')) ||
    (msg.mediaUrl && (msg.mediaUrl.includes('giphy.com') || msg.mediaUrl.includes('tenor.com')));

  if (isGifMsg) {
    const url = msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || null;
    return { type: 'gif', url, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
  }

  const imageMatch = text.match(/^\[Photo\]\s*(\S+.*)$/i);
  if (imageMatch) return { type: 'image', url: msg.mediaUrl || imageMatch[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };
  const imageMatchGeneric = text.match(/^\[Photo\]/i);
  if (imageMatchGeneric) return { type: 'image', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };

  const videoMatch = text.match(/^\[Video\]\s*(\S+.*)$/i);
  if (videoMatch) return { type: 'video', url: msg.mediaUrl || videoMatch[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };
  const videoMatchGeneric = text.match(/^\[Video\]/i);
  if (videoMatchGeneric) return { type: 'video', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };

  const voiceMatch = text.match(/^\[Audio\]\s+(voice_\S+)\s+(https?:\/\/\S+)\s*$/i);
  if (voiceMatch) return { type: 'voice', url: voiceMatch[2], fileName: voiceMatch[1], mime: msg.mime || (voiceMatch[1].endsWith('.webm') ? 'audio/webm' : 'audio/ogg') };
  const audioMatch = text.match(/^\[Audio\]\s+(.*?)\s+(https?:\/\/\S+)\s*$/i);
  if (audioMatch && !audioMatch[1].match(/^voice_/i) && !audioMatch[1].endsWith('.ogg')) return { type: 'music', url: audioMatch[2], fileName: audioMatch[1], mime: msg.mime || 'audio/mpeg' };
  const audioMatchSingle = text.match(/^\[Audio\]\s+(\S+.*)$/i);
  if (audioMatchSingle) return { type: 'music', url: msg.mediaUrl || audioMatchSingle[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'audio/mpeg' };

  const fileMatch = text.match(/^\[File\]\s+(.*?)\s+(https?:\/\/\S+)\s*$/i);
  if (fileMatch) return { type: 'file', url: fileMatch[2], fileName: fileMatch[1], mime: msg.mime || 'application/octet-stream' };
  const fileMatchSingle = text.match(/^\[File\]\s+(\S+.*)$/i);
  if (fileMatchSingle) return { type: 'file', url: msg.mediaUrl || fileMatchSingle[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'application/octet-stream' };

  return { type: null, url: null };
};

export function generateEphemeralKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < 32; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function deriveFileKey(sharedSecret: string): Promise<CryptoKey> {
  const cleanHex = sharedSecret.trim().toLowerCase();
  const len = Math.floor(cleanHex.length / 2);
  const raw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('orbita-file-key'), info: new TextEncoder().encode('file-encryption') },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFile(file: ArrayBuffer, keyHex: string): Promise<Blob> {
  if (typeof window !== 'undefined' && (window as any).orbita?.rustEncryptFile) {
    try {
      const encrypted = await (window as any).orbita.rustEncryptFile(file, keyHex);
      if (encrypted) {
        return new Blob([encrypted as unknown as BlobPart], { type: 'application/octet-stream' });
      }
    } catch (e) {
      console.warn('[ChatWindow] Rust encryptFile fallback:', e);
    }
  }
  const cleanHex = keyHex.trim().toLowerCase();
  const len = Math.floor(cleanHex.length / 2);
  const raw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  let key: CryptoKey;
  if (raw.length === 32) {
    try {
      key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
    } catch {
      key = await deriveFileKey(keyHex);
    }
  } else {
    key = await deriveFileKey(keyHex);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, file);
  const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.byteLength);
  return new Blob([result as unknown as BlobPart], { type: 'application/octet-stream' });
}

export const decryptedUrlCache = new Map<string, string>();

export interface AudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover?: string | null;
}

export interface ChatScrollState {
  scrollTop: number;
  scrollHeight: number;
  atBottom: boolean;
  timestamp: number;
}

export const chatScrollRegistry = new Map<string, ChatScrollState>();

export const saveChatScroll = (chatId: string, el: HTMLElement) => {
  if (!chatId || !el) return;
  const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
  chatScrollRegistry.set(chatId, {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    atBottom: isBottom,
    timestamp: Date.now(),
  });
};

export const restoreChatScroll = (chatId: string, el: HTMLElement): boolean => {
  if (!chatId || !el) return false;
  const saved = chatScrollRegistry.get(chatId);
  if (!saved) return false;
  if (saved.atBottom) {
    el.scrollTop = el.scrollHeight;
    return true;
  }
  const diff = el.scrollHeight - saved.scrollHeight;
  const targetTop = Math.max(0, saved.scrollTop + (diff > 0 ? diff : 0));
  el.scrollTop = targetTop;
  return true;
};

export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

export const isSameDay = (d1: number, d2: number): boolean => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

