import React, { memo } from 'react';
import type { Message, ChatTypingUser } from '../../../store/useChatStore';
import { resolveStickerUrl } from '../../../lib/stickers-and-gifs';
import { getOrbitaMediaUrl } from '../../../lib/media-utils';
import type { MediaViewerItem } from '../TelegramMediaViewer';

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
  ({
    index,
    msg,
    isSelected,
    isSelectionMode,
    renderFn,
  }: {
    index: number;
    msg: Message;
    isSelected: boolean;
    isSelectionMode: boolean;
    renderFn: (i: number, m: Message, isSelected: boolean, isSelectionMode: boolean) => React.ReactNode;
  }) => renderFn(index, msg, isSelected, isSelectionMode) as React.ReactElement,
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
    prev.isSelected === next.isSelected &&
    prev.isSelectionMode === next.isSelectionMode
);
MessageRowWrapper.displayName = 'MessageRowWrapper';

export const MessageList = memo(
  ({
    messages,
    startIndex,
    selectedIds,
    isSelectionMode,
    renderFn,
  }: {
    messages: Message[];
    startIndex: number;
    selectedIds: Set<string>;
    isSelectionMode: boolean;
    renderFn: (i: number, m: Message, isSelected: boolean, isSelectionMode: boolean) => React.ReactNode;
  }) => {
    const virtualTopHeight = startIndex > 0 ? startIndex * 46 : 0;
    return (
      <>
        {virtualTopHeight > 0 ? (
          <div style={{ height: `${virtualTopHeight}px`, flexShrink: 0 }} />
        ) : (
          <div style={{ flex: '1 1 auto', minHeight: '8px' }} />
        )}
        {messages.map((msg, idx) => {
          const isSelected = isSelectionMode && Boolean(msg.id && selectedIds.has(msg.id));
          return (
            <MessageRowWrapper
              key={msg.id || `msg_${msg.time}_${startIndex + idx}`}
              index={startIndex + idx}
              msg={msg}
              isSelected={isSelected}
              isSelectionMode={isSelectionMode}
              renderFn={renderFn}
            />
          );
        })}
      </>
    );
  },
  (prev, next) =>
    prev.messages === next.messages &&
    prev.startIndex === next.startIndex &&
    prev.selectedIds === next.selectedIds &&
    prev.isSelectionMode === next.isSelectionMode
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
    if (msg.mediaType === 'photo' || (msg.mediaType as any) === 'image') return { type: 'image', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };
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

export const truncateText = (text: string, maxLen: number): string => text.length <= maxLen ? text : text.substring(0, maxLen) + '...';

export const isSameDay = (d1: number, d2: number): boolean => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

export const getChatDateLabel = (timestamp: number, lang = 'ru'): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const isRu = lang.startsWith('ru');

  if (msgDate === today) {
    return isRu ? 'Сегодня' : 'Today';
  }
  if (msgDate === yesterday) {
    return isRu ? 'Вчера' : 'Yesterday';
  }

  const isDifferentYear = date.getFullYear() !== now.getFullYear();

  if (isRu) {
    const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const wd = weekdays[date.getDay()];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const yr = isDifferentYear ? ` ${date.getFullYear()}` : '';
    return `${wd}, ${d} ${m}${yr}`;
  }

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const wd = weekdays[date.getDay()];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const yr = isDifferentYear ? ` ${date.getFullYear()}` : '';
  return `${wd}, ${d} ${m}${yr}`;
};

export const buildChatMediaViewerItems = (
  messages: Message[],
  sharedSecret?: string | null,
  activeChatId?: string | null
): MediaViewerItem[] => {
  const list: MediaViewerItem[] = [];
  messages.forEach((msg, msgIdx) => {
    const media = parseMedia(msg);
    if (msg.mediaItems && msg.mediaItems.length > 0) {
      const isAlbum = msg.mediaItems.length > 1;
      const albumGroupId = msg.id || `album_${msgIdx}`;
      msg.mediaItems.forEach((mi, miIdx) => {
        if (mi.type === 'photo' || mi.type === 'video' || mi.type === 'gif') {
          const effectiveSecret = (mi.key || msg.mediaKey || sharedSecret) || undefined;
          const directUrl = getOrbitaMediaUrl(mi.url, effectiveSecret, activeChatId || undefined, msg.id, mi.name || msg.mediaName) || undefined;
          const isMiGif = mi.type === 'gif' || mi.mime === 'image/gif' || /\.gif(\?.*)?$/i.test(mi.name || mi.url || '');
          list.push({
            id: `${msg.id || msgIdx}_${miIdx}`,
            url: mi.url,
            directUrl,
            chatId: activeChatId || undefined,
            type: isMiGif ? 'gif' : (mi.type === 'video' ? 'video' : 'photo'),
            name: mi.name || msg.mediaName,
            sender: msg.sender,
            time: msg.time,
            messageId: msg.id,
            messageIndex: msgIdx,
            duration: mi.duration,
            width: mi.width,
            height: mi.height,
            caption: msg.text,
            isAlbum: isAlbum,
            albumGroupId: isAlbum ? albumGroupId : undefined,
            key: mi.key || msg.mediaKey,
            sharedSecret: effectiveSecret,
            thumbnail: mi.thumbnail || (mi as any).preview || mi.blurPreview || msg.thumbnail || msg.blurPreview,
            blurPreview: mi.blurPreview || msg.blurPreview,
            isOwn: Boolean((msg as any).isOwn || (msg as any).outgoing),
          });
        }
      });
    } else if (media.type === 'image' || media.type === 'video' || media.type === 'gif') {
      const isGif = Boolean(
        media.type === 'gif' ||
        msg.mediaType === 'gif' ||
        (media.url && (/\.gif(\?.*)?$/i.test(media.url) || media.url.toLowerCase().includes('.gif'))) ||
        (msg.mediaUrl && (
          /\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
          msg.mediaUrl.toLowerCase().includes('.gif') ||
          msg.mediaUrl.includes('tenor.com') ||
          msg.mediaUrl.includes('giphy.com') ||
          msg.mediaUrl.includes('.giphy.') ||
          msg.mediaUrl.includes('c.tenor.com')
        )) ||
        (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
      );
      const effectiveSecret = (msg.mediaKey || sharedSecret) || undefined;
      const mediaUrl = media.url || msg.mediaUrl || '';
      const directUrl = getOrbitaMediaUrl(mediaUrl, effectiveSecret, activeChatId || undefined, msg.id, media.fileName || msg.mediaName, media.mime || msg.mime) || undefined;
      list.push({
        id: msg.id || `${msg.time}_${msgIdx}`,
        url: mediaUrl,
        directUrl,
        chatId: activeChatId || undefined,
        type: isGif ? 'gif' : (media.type === 'video' ? 'video' : 'photo'),
        name: media.fileName || msg.mediaName,
        sender: msg.sender,
        time: msg.time,
        messageId: msg.id,
        messageIndex: msgIdx,
        duration: msg.duration || msg.audioMetadata?.duration,
        width: msg.width,
        height: msg.height,
        caption: msg.text,
        isAlbum: false,
        key: msg.mediaKey,
        sharedSecret: effectiveSecret,
        thumbnail: (msg as any).preview || msg.thumbnail || msg.blurPreview,
        blurPreview: msg.blurPreview,
        isOwn: Boolean((msg as any).isOwn || (msg as any).outgoing),
      });
    }
  });
  return list;
};

export const resolveMediaViewerFallback = (
  url: string,
  messageId: string | undefined,
  messages: Message[],
  sharedSecret?: string | null,
  activeChatId?: string | null
): MediaViewerItem[] => {
  const targetMsg = messages.find((m) => m.id === messageId);
  const targetMedia = targetMsg ? parseMedia(targetMsg) : null;
  const isTargetGif = targetMedia?.type === 'gif' || /\.gif(\?.*)?$/i.test(url) || Boolean(url && (url.includes('tenor.com') || url.includes('giphy.com')));
  const isTargetVideo = !isTargetGif && (targetMedia?.type === 'video' || /\.(mp4|mov|avi|webm|mkv|m4v)(\?.*)?$/i.test(url) || Boolean(targetMsg?.mime?.startsWith('video/')));
  const fallbackType = isTargetGif ? ('gif' as const) : (isTargetVideo ? ('video' as const) : ('photo' as const));
  const effectiveSecret = (targetMsg?.mediaKey || sharedSecret) || undefined;
  return [{
    id: messageId || url,
    url,
    directUrl: getOrbitaMediaUrl(url, effectiveSecret, activeChatId || undefined, messageId, targetMedia?.fileName || targetMsg?.mediaName, targetMsg?.mime) || undefined,
    chatId: activeChatId || undefined,
    type: fallbackType,
    sender: targetMsg?.sender,
    isOwn: Boolean((targetMsg as any)?.isOwn || (targetMsg as any)?.outgoing),
    time: Date.now(),
    width: targetMsg?.width,
    height: targetMsg?.height,
    key: targetMsg?.mediaKey,
    sharedSecret: effectiveSecret,
    thumbnail: (targetMedia as any)?.thumbnail || (targetMsg as any)?.preview || targetMsg?.thumbnail || targetMsg?.blurPreview,
    blurPreview: targetMsg?.blurPreview,
  }];
};

export const mergeReactions = (
  existing?: Record<string, string[]>,
  incoming?: Record<string, string[]>
): Record<string, string[]> | undefined => {
  const hasExisting = existing && typeof existing === 'object' && Object.keys(existing).length > 0;
  const hasIncoming = incoming && typeof incoming === 'object' && Object.keys(incoming).length > 0;

  if (!hasExisting && !hasIncoming) return undefined;
  if (!hasIncoming) return existing;
  if (!hasExisting) return incoming;

  const result: Record<string, string[]> = { ...existing };
  for (const [emoji, users] of Object.entries(incoming!)) {
    if (Array.isArray(users) && users.length > 0) {
      const prev = result[emoji] || [];
      result[emoji] = Array.from(new Set([...prev, ...users]));
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};



