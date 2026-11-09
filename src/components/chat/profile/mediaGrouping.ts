import { useChatStore, type Chat, type Message } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import {
  type MediaGroup,
  type MediaType,
  formatTelegramDate,
  isVoiceMessage,
  isGifMessage,
  isStickerMessage,
  isPhotoMessage,
  isVideoMessage,
  isAudioMessage,
} from './types';

export const computeMediaGroups = (
  chat: Chat | undefined,
  messages: Message[] | undefined,
  i18nLang: string
): Record<MediaType, MediaGroup> => {
  if (!chat || !messages) return {} as Record<MediaType, MediaGroup>;

  const groups: Record<MediaType, MediaGroup> = {
    photos: { messages: [], gridItems: [], count: 0 },
    videos: { messages: [], gridItems: [], count: 0 },
    files: { messages: [], gridItems: [], count: 0 },
    audio: { messages: [], gridItems: [], count: 0 },
    voice: { messages: [], gridItems: [], count: 0 },
    links: { messages: [], gridItems: [], count: 0 },
    gif: { messages: [], gridItems: [], count: 0 },
  };

  const myUserId = useAuthStore.getState().userId;
  const myNickname = useAuthStore.getState().nickname;
  const usersById = useChatStore.getState().usersById || {};

  for (const msg of messages) {
    const isOut = Boolean((msg as any).isOwn || (msg as any).outgoing || msg.isOutgoing);
    const senderId = msg.senderId || (isOut ? myUserId : undefined);
    const actualSender = (senderId ? (senderId === myUserId ? myNickname : usersById[senderId]?.nickname) : undefined) || msg.sender;
    if (isStickerMessage(msg)) {
      continue;
    }
    if (isVoiceMessage(msg)) {
      groups.voice.messages.push(msg);
      groups.voice.count++;
    } else if (isGifMessage(msg)) {
      groups.gif.messages.push(msg);
      groups.gif.gridItems?.push({
        id: msg.id || String(msg.time),
        messageId: msg.id || String(msg.time),
        url: msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || '',
        name: msg.mediaName || 'GIF',
        mime: msg.mime || 'image/gif',
        time: msg.time,
        type: 'gif',
        duration: msg.duration,
        text: msg.text,
        sender: actualSender,
        senderId,
        key: msg.mediaKey,
      });
      groups.gif.count++;
    } else if (msg.mediaItems && msg.mediaItems.length > 0) {
      msg.mediaItems.forEach((item, idx) => {
        const itemIsSticker =
          (item as any).type === 'sticker' ||
          (item.url && (item.url.includes('/stickers/') || item.url.includes('stickers/')));

        if (itemIsSticker) return;

        const itemIsVoice =
          (item as any).type === 'voice' ||
          item.mime === 'audio/ogg' ||
          item.mime?.includes('ogg') ||
          item.mime?.includes('opus') ||
          (item.name && (/^voice_/i.test(item.name) || /\.ogg$/i.test(item.name) || /\.opus$/i.test(item.name)));

        const itemIsAudio =
          !itemIsVoice &&
          ((item as any).type === 'audio' ||
            (item.mime && item.mime.startsWith('audio/')) ||
            (item.name && /\.(mp3|wav|flac|aac|m4a|wma|ape|alac)$/i.test(item.name)));

        const itemIsGif =
          !itemIsVoice &&
          !itemIsAudio &&
          (item.mime === 'image/gif' || item.name?.endsWith('.gif') || (item as any).type === 'gif');

        const itemIsVideo =
          !itemIsVoice &&
          !itemIsAudio &&
          !itemIsGif &&
          ((item as any).type === 'video' ||
            (item.mime && item.mime.startsWith('video/')) ||
            (item.name && /\.(mp4|mov|avi|mkv|m4v|3gp)$/i.test(item.name)) ||
            (item.name && /\.webm$/i.test(item.name) && !item.name.startsWith('voice_')));

        const itemIsPhoto =
          !itemIsVoice &&
          !itemIsAudio &&
          !itemIsGif &&
          !itemIsVideo &&
          !itemIsSticker &&
          ((item as any).type === 'photo' ||
            (item as any).type === 'image' ||
            (item.mime && item.mime.startsWith('image/')) ||
            (item.name && /\.(png|jpg|jpeg|webp|avif|bmp|heic)$/i.test(item.name)));

        if (itemIsVoice) {
          groups.voice.messages.push({
            ...msg,
            id: `${msg.id || msg.time}_${idx}`,
            mediaUrl: item.url,
            mediaName: item.name || `voice_${formatTelegramDate(msg.time, i18nLang)}`,
            mime: item.mime || 'audio/ogg',
            duration: item.duration,
            mediaKey: item.key || msg.mediaKey,
            mediaType: 'voice',
          });
          groups.voice.count++;
        } else if (itemIsAudio) {
          groups.audio.messages.push({
            ...msg,
            id: `${msg.id || msg.time}_${idx}`,
            mediaUrl: item.url,
            mediaName: item.name || 'Audio',
            mime: item.mime || 'audio/mpeg',
            duration: item.duration,
            mediaKey: item.key || msg.mediaKey,
            mediaType: 'audio',
            audioMetadata: (item as any).audioMetadata || {
              title: item.name?.replace(/\.[^.]+$/, '') || 'Audio',
              artist: '',
              duration: item.duration,
              cover: (item as any).cover || null,
            },
          });
          groups.audio.count++;
        } else if (itemIsGif) {
          groups.gif.messages.push(msg);
          groups.gif.gridItems?.push({
            id: `${msg.id || msg.time}_${idx}`,
            messageId: msg.id || String(msg.time),
            url: item.url,
            name: item.name || 'GIF',
            mime: item.mime || 'image/gif',
            time: msg.time,
            type: 'gif',
            duration: item.duration,
            text: msg.text,
            sender: actualSender,
        senderId,
            key: item.key || msg.mediaKey,
          });
          groups.gif.count++;
        } else if (itemIsVideo) {
          groups.videos.messages.push(msg);
          groups.videos.gridItems?.push({
            id: `${msg.id || msg.time}_${idx}`,
            messageId: msg.id || String(msg.time),
            url: item.url,
            name: item.name || 'Video',
            mime: item.mime || 'video/mp4',
            time: msg.time,
            type: 'videos',
            duration: item.duration,
            text: msg.text,
            sender: actualSender,
        senderId,
            key: item.key || msg.mediaKey,
          });
          groups.videos.count++;
        } else if (itemIsPhoto) {
          groups.photos.messages.push(msg);
          groups.photos.gridItems?.push({
            id: `${msg.id || msg.time}_${idx}`,
            messageId: msg.id || String(msg.time),
            url: item.url,
            name: item.name || 'Photo',
            mime: item.mime || 'image/jpeg',
            time: msg.time,
            type: 'photos',
            duration: item.duration,
            text: msg.text,
            sender: actualSender,
        senderId,
            key: item.key || msg.mediaKey,
          });
          groups.photos.count++;
        } else {
          groups.files.messages.push({
            ...msg,
            id: `${msg.id || msg.time}_${idx}`,
            mediaUrl: item.url,
            mediaName: item.name || 'File',
            mime: item.mime || 'application/octet-stream',
            duration: item.duration,
            mediaKey: item.key || msg.mediaKey,
            mediaType: 'file',
          });
          groups.files.count++;
        }
      });
    } else if (isPhotoMessage(msg)) {
      groups.photos.messages.push(msg);
      groups.photos.gridItems?.push({
        id: msg.id || String(msg.time),
        messageId: msg.id || String(msg.time),
        url: msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || '',
        name: msg.mediaName || 'Photo',
        mime: msg.mime || 'image/jpeg',
        time: msg.time,
        type: 'photos',
        duration: msg.duration,
        text: msg.text,
        sender: actualSender,
        senderId,
        key: msg.mediaKey,
      });
      groups.photos.count++;
    } else if (isVideoMessage(msg)) {
      groups.videos.messages.push(msg);
      groups.videos.gridItems?.push({
        id: msg.id || String(msg.time),
        messageId: msg.id || String(msg.time),
        url: msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || '',
        name: msg.mediaName || 'Video',
        mime: msg.mime || 'video/mp4',
        time: msg.time,
        type: 'videos',
        duration: msg.duration,
        text: msg.text,
        sender: actualSender,
        senderId,
        key: msg.mediaKey,
      });
      groups.videos.count++;
    } else if (isAudioMessage(msg)) {
      groups.audio.messages.push(msg);
      groups.audio.count++;
    } else if (msg.mediaType === 'file' || (msg.mediaType === null && msg.text?.startsWith('[File]'))) {
      groups.files.messages.push(msg);
      groups.files.count++;
    } else if (msg.text && !msg.mediaType) {
      const urlMatch = msg.text.match(/https?:\/\/[^\s]+/g);
      if (urlMatch) {
        groups.links.messages.push(msg);
        groups.links.count += urlMatch.length;
      }
    }
  }

  return groups;
};
