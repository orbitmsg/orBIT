import React from 'react';
import type { Message } from '../../../store/useChatStore';

export interface MediaGridItem {
  id: string;
  messageId: string;
  url: string;
  name: string;
  mime?: string;
  time: number;
  type: 'photos' | 'videos' | 'gif';
  duration?: number;
  text?: string;
  sender?: string;
  key?: string;
}

export interface MediaGroup {
  messages: Message[];
  gridItems?: MediaGridItem[];
  count: number;
}

export type MediaType = 'photos' | 'videos' | 'files' | 'audio' | 'voice' | 'links' | 'gif';

export interface ProfileScreenProps {
  chatId: string;
  onClose: () => void;
  isMobileView?: boolean;
  onLinkClick?: (url: string) => void;
}

export const GravityGifBadgeIcon = ({ width = 16, height = 16, style, className, ...props }: React.SVGProps<SVGSVGElement> & { width?: number; height?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={style}
    {...props}
  >
    <rect
      x="1.25"
      y="2.5"
      width="13.5"
      height="11"
      rx="2.75"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <text
      x="8"
      y="10.15"
      fill="currentColor"
      fontSize="6.2"
      fontWeight="800"
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      textAnchor="middle"
      letterSpacing="0.4"
    >
      GIF
    </text>
  </svg>
);

export const formatTelegramDate = (timestamp: number, i18nLang: string) => {
  const d = new Date(timestamp);
  const monthsRu = ['янв', 'февр', 'мар', 'апр', 'мая', 'июня', 'июля', 'авг', 'сент', 'окт', 'нояб', 'дек'];
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const isRu = i18nLang.startsWith('ru') || i18nLang.startsWith('uk') || i18nLang.startsWith('be');
  const monthStr = isRu ? monthsRu[d.getMonth()] : monthsEn[d.getMonth()];
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const atStr = isRu ? 'в' : 'at';
  return `${d.getDate()} ${monthStr} ${atStr} ${hours}:${minutes}`;
};

export const formatPeriodHeader = (
  timestamp: number,
  i18nLang: string = 'ru'
): { key: string; title: string; orderScore: number } => {
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

  const isRu = i18nLang.startsWith('ru') || i18nLang.startsWith('be');
  const isUk = i18nLang.startsWith('uk');
  const isKk = i18nLang.startsWith('kk');

  const monthsRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthsUk = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const monthsKk = ['Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым', 'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'];
  const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const getMonthName = (m: number) => {
    if (isRu) return monthsRu[m];
    if (isUk) return monthsUk[m];
    if (isKk) return monthsKk[m];
    return monthsEn[m];
  };

  const getTodayLabel = () => {
    if (isRu) return 'Сегодня';
    if (isUk) return 'Сьогодні';
    if (isKk) return 'Бүгін';
    return 'Today';
  };

  const getYesterdayLabel = () => {
    if (isRu) return 'Вчера';
    if (isUk) return 'Вчора';
    if (isKk) return 'Кеше';
    return 'Yesterday';
  };

  if (isToday) {
    return {
      key: 'today',
      title: getTodayLabel(),
      orderScore: 9999999999999,
    };
  }

  if (isYesterday) {
    return {
      key: 'yesterday',
      title: getYesterdayLabel(),
      orderScore: 9999999999998,
    };
  }

  const monthName = getMonthName(d.getMonth());
  const year = d.getFullYear();
  const currentYear = now.getFullYear();

  const title = year === currentYear ? monthName : `${monthName} ${year}`;
  const key = `${year}-${String(d.getMonth()).padStart(2, '0')}`;
  const orderScore = year * 100 + d.getMonth();

  return {
    key,
    title,
    orderScore,
  };
};

export const formatAudioDuration = (seconds?: number) => {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const formatVideoDuration = (seconds?: number) => {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '00:00';
  const totalSecs = Math.round(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const isVoiceMessage = (msg: Message) => {
  if (msg.mediaType === 'voice') return true;
  if (
    msg.mime === 'audio/ogg' ||
    msg.mime === 'audio/opus' ||
    msg.mime?.startsWith('audio/ogg') ||
    msg.mime?.startsWith('audio/opus') ||
    msg.mime?.includes('ogg') ||
    msg.mime?.includes('opus')
  ) {
    return true;
  }
  if (
    msg.mediaName &&
    (/^voice_.*\.(ogg|opus|webm|mp3|wav|m4a)$/i.test(msg.mediaName) ||
      /\.ogg$/i.test(msg.mediaName) ||
      /\.opus$/i.test(msg.mediaName) ||
      /^voice_/i.test(msg.mediaName))
  ) {
    return true;
  }
  if (
    msg.text &&
    (/^\[Audio\]\s+voice_/i.test(msg.text) ||
      /^voice_\d+\.ogg/i.test(msg.text.trim()) ||
      /\.ogg(\?.*)?$/i.test(msg.text.trim()) ||
      /^\[Audio\]\s+\S+\.ogg/i.test(msg.text))
  ) {
    return true;
  }
  if (
    msg.mediaUrl &&
    (/voice_\d+\.(ogg|opus|webm)/i.test(msg.mediaUrl) ||
      /\.ogg(\?.*)?$/i.test(msg.mediaUrl) ||
      /\.opus(\?.*)?$/i.test(msg.mediaUrl))
  ) {
    return true;
  }
  return false;
};

export const isGifMessage = (msg: Message) => {
  if (isVoiceMessage(msg)) return false;
  if (msg.mediaType === 'gif') return true;
  if (msg.mime === 'image/gif') return true;
  if (msg.mediaName && /\.gif$/i.test(msg.mediaName)) return true;
  if (
    msg.mediaUrl &&
    (/\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
      msg.mediaUrl.includes('tenor.com') ||
      msg.mediaUrl.includes('giphy.com') ||
      msg.mediaUrl.includes('.giphy.') ||
      msg.mediaUrl.includes('c.tenor.com'))
  ) {
    return true;
  }
  if (
    msg.text &&
    (/^\[GIF\]/i.test(msg.text) ||
      /\.gif(\?.*)?$/i.test(msg.text.trim()) ||
      msg.text.includes('tenor.com') ||
      msg.text.includes('giphy.com'))
  ) {
    return true;
  }
  return false;
};

export const isStickerMessage = (msg: Message) => {
  if (msg.mediaType === 'sticker') return true;
  if (msg.text && /^\[Sticker\]/i.test(msg.text.trim())) return true;
  if (msg.mediaUrl && (msg.mediaUrl.includes('/stickers/') || msg.mediaUrl.includes('stickers/'))) return true;
  return false;
};

export const isPhotoMessage = (msg: Message) => {
  if (isVoiceMessage(msg) || isGifMessage(msg) || isStickerMessage(msg)) return false;
  if (msg.mediaType === 'photo') return true;
  if (msg.mime?.startsWith('image/') && msg.mime !== 'image/gif') return true;
  if (msg.text && /^\[Photo\]/i.test(msg.text)) return true;
  if (msg.mediaName && /\.(jpg|jpeg|png|webp|avif|bmp|heic|tiff)$/i.test(msg.mediaName)) return true;
  if (msg.mediaUrl && /\.(jpg|jpeg|png|webp|avif|bmp|heic|tiff)(\?.*)?$/i.test(msg.mediaUrl)) return true;
  return false;
};

export const isVideoMessage = (msg: Message) => {
  if (isVoiceMessage(msg) || isGifMessage(msg) || isPhotoMessage(msg)) return false;
  if (msg.mediaType === 'video') return true;
  if (msg.mime?.startsWith('video/')) return true;
  if (msg.text && /^\[Video\]/i.test(msg.text)) return true;
  if (msg.mediaName && /\.(mp4|mov|avi|mkv|m4v|3gp)$/i.test(msg.mediaName)) return true;
  if (msg.mediaName && /\.webm$/i.test(msg.mediaName) && !msg.mediaName.startsWith('voice_')) return true;
  if (msg.mediaUrl && /\.(mp4|mov|avi|mkv|m4v|3gp)(\?.*)?$/i.test(msg.mediaUrl)) return true;
  return false;
};

export const isAudioMessage = (msg: Message) => {
  if (isVoiceMessage(msg) || isGifMessage(msg) || isPhotoMessage(msg) || isVideoMessage(msg)) return false;
  if (msg.mediaType === 'audio') return true;
  if (msg.audioMetadata?.title || msg.audioMetadata?.artist) return true;
  if (msg.mime?.startsWith('audio/') && msg.mime !== 'audio/ogg' && msg.mime !== 'audio/opus') return true;
  if (msg.text && /^\[Audio\]/i.test(msg.text) && !msg.text.includes('voice_') && !msg.text.includes('.ogg')) return true;
  if (msg.mediaName && /\.(mp3|m4a|flac|wav|aac|wma|alac)$/i.test(msg.mediaName)) return true;
  if (msg.mediaUrl && /\.(mp3|m4a|flac|wav|aac|wma|alac)(\?.*)?$/i.test(msg.mediaUrl)) return true;
  return false;
};
