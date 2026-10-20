export interface MediaViewerItem {
  id: string;
  url: string;
  type: 'photo' | 'video' | 'gif' | 'image' | 'videos' | 'photos';
  directUrl?: string;
  chatId?: string;
  name?: string;
  mime?: string;
  sender?: string;
  time?: number;
  messageId?: string;
  messageIndex?: number;
  duration?: number;
  width?: number;
  height?: number;
  size?: number | string;
  caption?: string;
  isAlbum?: boolean;
  albumGroupId?: string;
  key?: string;
  sharedSecret?: string;
  thumbnail?: string;
  blurPreview?: string;
}

export interface TelegramMediaViewerProps {
  isOpen: boolean;
  items: MediaViewerItem[];
  initialIndex?: number;
  sharedSecret?: string;
  showCarouselAlways?: boolean;
  isWindowMode?: boolean;
  onClose: () => void;
  onGoToMessage?: (messageId: string) => void;
  onForwardMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAllMedia?: () => void;
}

export const formatTelegramDate = (timestamp: number, lang: string = 'ru') => {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const timeStr = d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return lang === 'ru' ? `сегодня в ${timeStr}` : `today at ${timeStr}`;
  }
  if (isYesterday) {
    return lang === 'ru' ? `вчера в ${timeStr}` : `yesterday at ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  return `${dateStr} в ${timeStr}`;
};

export const formatVideoTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${pad(remMins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};
