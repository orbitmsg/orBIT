import React from 'react';
import i18n from 'i18next';
import type { Chat, Message } from '../../../store/useChatStore';

export const getLastMsgDisplay = (chat: Chat, lastMsg: Message | null, t: any, isOwn = false): React.ReactNode => {
  const accentStyle: React.CSSProperties = { color: 'var(--accent-color, #6366f1)' };

  if (!lastMsg) {
    if (chat.lastMsg === 'HISTORY_CLEARED') return t('common.history_cleared');
    if (!chat.lastMsg || chat.lastMsg === 'E2EE_SECURE_CHANNEL_READY') {
      return t('common.no_messages');
    }

    let rawFallback = chat.lastMsg.trim();
    let fallbackSenderPrefix = '';
    if (chat.type === 'group') {
      const colonIdx = rawFallback.indexOf(': ');
      if (colonIdx > 0 && colonIdx < 35 && !rawFallback.startsWith('[Call]')) {
        fallbackSenderPrefix = rawFallback.slice(0, colonIdx);
        rawFallback = rawFallback.slice(colonIdx + 2).trim();
      }
    }

    const renderFallback = (content: React.ReactNode, isAccent = false) => {
      if (!fallbackSenderPrefix) {
        return isAccent ? (
          <span className="truncate" style={accentStyle}>{content}</span>
        ) : (
          <span className="truncate">{content}</span>
        );
      }
      return (
        <span className="truncate">
          <span style={accentStyle}>{fallbackSenderPrefix}</span>
          <span>: </span>
          {isAccent ? <span style={accentStyle}>{content}</span> : content}
        </span>
      );
    };

    if (rawFallback.startsWith('[Call]') || /^(?:исходящий|входящий|пропущенный|отклонённый)\s+звонок/i.test(rawFallback)) {
      const isMissed = /missed|пропущен/i.test(rawFallback);
      const isRejected = /rejected|busy|отклон/i.test(rawFallback);
      const isOutgoing = /исходящ|outgoing/i.test(rawFallback);
      const text = isMissed ? t('call.missed_call') : (isRejected ? t('call.rejected_call') : (isOutgoing ? t('call.outgoing_call') : t('call.incoming_call')));
      return renderFallback(text, true);
    }

    if (/^\[(?:photo|image)\]$/i.test(rawFallback) || /^(?:фото|фотография|photo)$/i.test(rawFallback)) {
      return renderFallback(t('chatWindow.photo'), true);
    }

    if (/^\[video\]$/i.test(rawFallback) || /^(?:видео|видеозапись|video)$/i.test(rawFallback)) {
      return renderFallback(t('chatWindow.video'), true);
    }

    if (/^\[voice\]$/i.test(rawFallback) || /^\[audio\]\s+voice_\d+\.ogg/i.test(rawFallback) || /^voice_\d+\.ogg/i.test(rawFallback) || /^(?:голосовое\s+сообщение|голосовое|voice\s+message)$/i.test(rawFallback)) {
      return renderFallback(t('chatWindow.voice_message'), true);
    }

    if (/^\[sticker\]$/i.test(rawFallback) || /^(?:стикер|sticker)$/i.test(rawFallback) || rawFallback.includes('/stickers/') || rawFallback.includes('\\stickers\\') || rawFallback.includes('.stickers')) {
      return renderFallback(t('chatWindow.sticker'), true);
    }

    if (/^\[gif\]$/i.test(rawFallback) || /^gif$/i.test(rawFallback)) {
      return renderFallback('GIF', true);
    }

    if (/^\[mediagroup\]$/i.test(rawFallback) || /^(?:медиа|медиафайлы|media)$/i.test(rawFallback)) {
      return renderFallback(t('chatWindow.media_items', 'Медиа'), true);
    }

    if (/^\[audio\]/i.test(rawFallback)) {
      const match = rawFallback.match(/^\[audio\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
      const title = match ? match[1] : t('chatWindow.audio');
      return renderFallback(<>🎧 {title}</>, true);
    }

    if (/^\[(?:file|document)\]/i.test(rawFallback)) {
      const match = rawFallback.match(/^\[(?:file|document)\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
      const fileName = match ? match[1] : t('chatWindow.file');
      return renderFallback(fileName, true);
    }

    if (rawFallback.startsWith('🎧')) {
      return renderFallback(rawFallback, true);
    }

    const plain = rawFallback
      .replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n?/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\|\|(.*?)\|\|/g, '$1')
      .replace(/^>\s?(.*)$/gm, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    return renderFallback(plain || t('common.no_messages'));
  }

  if (lastMsg.mediaType === 'system' || lastMsg.sender === 'system' || (lastMsg as any).systemType) {
    return <span className="truncate">{lastMsg.text}</span>;
  }

  const senderMember = chat.members?.find((m) =>
    (m.userId && m.userId === lastMsg.senderId) ||
    ((m as any).userCode && (m as any).userCode === lastMsg.senderId) ||
    ((m as any).user_code && (m as any).user_code === lastMsg.senderId) ||
    ((m as any).user_id && (m as any).user_id === lastMsg.senderId)
  );
  const senderName = isOwn
    ? t('chatWindow.you', 'Вы')
    : (senderMember?.nickname || lastMsg.sender || '');

  const hasSenderPrefix = chat.type === 'group' && !lastMsg.text?.startsWith('[Call]') && !!senderName;

  const renderWithPrefix = (content: React.ReactNode, isAccent = false) => {
    if (!hasSenderPrefix) {
      return isAccent ? (
        <span className="truncate" style={accentStyle}>{content}</span>
      ) : (
        <span className="truncate">{content}</span>
      );
    }
    return (
      <span className="truncate">
        <span style={accentStyle}>{senderName}</span>
        <span>: </span>
        {isAccent ? <span style={accentStyle}>{content}</span> : content}
      </span>
    );
  };

  if (lastMsg.text?.startsWith('[Call]')) {
    const parts = lastMsg.text.split(', ');
    const directionPart = parts[0].replace(/^\[Call\]\s/, '');
    const isOutgoing = directionPart.includes('Исходящий');
    const status = lastMsg.mediaName || 'completed';
    const displayStatus = status === 'busy' ? 'rejected' : status;

    let text = '';
    if (displayStatus === 'missed') {
      text = t('call.missed_call');
    } else if (displayStatus === 'rejected') {
      text = t('call.rejected_call');
    } else if (displayStatus === 'completed') {
      text = isOutgoing ? t('call.outgoing_call') : t('call.incoming_call');
    } else {
      text = isOutgoing ? t('call.outgoing_call') : t('call.incoming_call');
    }
    return (
      <span className="truncate" style={accentStyle}>{text}</span>
    );
  }

  if (lastMsg?.mediaItems && lastMsg.mediaItems.length > 0) {
    if (lastMsg.text && lastMsg.text.trim()) {
      const cleanText = lastMsg.text.replace(/^↩\s.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ');
      return cleanText ? renderWithPrefix(cleanText) : null;
    }

    const items = lastMsg.mediaItems;
    const isRu = i18n.language?.startsWith('ru');
    const photoCount = items.filter(i => i.type === 'photo').length;
    const videoCount = items.filter(i => i.type === 'video').length;
    const audioCount = items.filter(i => i.type === 'audio').length;
    const fileCount = items.filter(i => i.type === 'file').length;

    if (photoCount > 0 && videoCount === 0 && audioCount === 0 && fileCount === 0) {
      const count = photoCount;
      let label = photoCount === 1 ? t('chatWindow.photo') : `${photoCount} ${t('chatWindow.photos', 'photos')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'фотографий';
        if (mod10 === 1 && mod100 !== 11) word = 'фотография';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'фотографии';
        label = count === 1 ? t('chatWindow.photo') : `${count} ${word}`;
      }
      return renderWithPrefix(label, true);
    }

    if (videoCount > 0 && photoCount === 0 && audioCount === 0 && fileCount === 0) {
      const count = videoCount;
      let label = videoCount === 1 ? t('chatWindow.video') : `${videoCount} ${t('chatWindow.videos', 'videos')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'видеозаписей';
        if (mod10 === 1 && mod100 !== 11) word = 'видеозапись';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'видеозаписи';
        label = count === 1 ? t('chatWindow.video') : `${count} ${word}`;
      }
      return renderWithPrefix(label, true);
    }

    if ((photoCount > 0 || videoCount > 0) && audioCount === 0 && fileCount === 0) {
      const count = photoCount + videoCount;
      let label = `${count} ${t('chatWindow.media_items', 'media files')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'медиафайлов';
        if (mod10 === 1 && mod100 !== 11) word = 'медиафайл';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'медиафайла';
        label = `${count} ${word}`;
      }
      return renderWithPrefix(label, true);
    }

    if (audioCount > 0 && photoCount === 0 && videoCount === 0 && fileCount === 0) {
      const count = audioCount;
      let label = audioCount === 1 ? t('chatWindow.audio') : `${audioCount} ${t('chatWindow.audio_files', 'audio files')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'аудиофайлов';
        if (mod10 === 1 && mod100 !== 11) word = 'аудиофайл';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'аудиофайла';
        label = count === 1 ? t('chatWindow.audio') : `${count} ${word}`;
      }
      return renderWithPrefix(<>🎧 {label}</>, true);
    }

    const totalFiles = items.length;
    let label = `${totalFiles} ${t('chatWindow.files', 'files')}`;
    if (isRu) {
      const mod10 = totalFiles % 10;
      const mod100 = totalFiles % 100;
      let word = 'файлов';
      if (mod10 === 1 && mod100 !== 11) word = 'файл';
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'файла';
      label = `${totalFiles} ${word}`;
    }
    return renderWithPrefix(label, true);
  }

  if (lastMsg?.mediaType) {
    if (lastMsg.text && /^\[GIF\]/i.test(lastMsg.text)) {
      return renderWithPrefix('GIF', true);
    }
    if (lastMsg.text && /^\[Sticker\]/i.test(lastMsg.text)) {
      return renderWithPrefix(t('chatWindow.sticker'), true);
    }

    switch (lastMsg.mediaType) {
      case 'photo':
        return renderWithPrefix(t('chatWindow.photo'), true);
      case 'video':
        return renderWithPrefix(t('chatWindow.video'), true);
      case 'voice':
        return renderWithPrefix(t('chatWindow.voice_message'), true);
      case 'audio': {
        const meta = lastMsg.audioMetadata;
        const title = (meta && meta.artist && meta.title) ? `${meta.artist} – ${meta.title}` : (lastMsg.mediaName || t('chatWindow.audio'));
        return renderWithPrefix(<>🎧 {title}</>, true);
      }
      case 'file':
        return renderWithPrefix(lastMsg.mediaName || t('chatWindow.file'), true);
      default:
        return renderWithPrefix(lastMsg.mediaName || t('chatWindow.file'), true);
    }
  }

  if (lastMsg?.text) {
    const text = lastMsg.text.replace(/\[emoji:[a-zA-Z0-9_]+\]/g, '').trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      return renderWithPrefix(text);
    }
    const cleanText = text.replace(/^↩\s.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ');
    if (/^\[Sticker\]/i.test(cleanText) || cleanText.includes('/stickers/') || cleanText.includes('\\stickers\\') || cleanText.includes('.stickers')) {
      return renderWithPrefix(t('chatWindow.sticker'), true);
    }
    if (/^\[GIF\]/i.test(cleanText)) {
      return renderWithPrefix('GIF', true);
    }
    if (/^\[(?:Photo|Image)\]/i.test(cleanText)) {
      return renderWithPrefix(t('chatWindow.photo'), true);
    }
    if (/^\[Video\]/i.test(cleanText)) {
      return renderWithPrefix(t('chatWindow.video'), true);
    }
    if (/^\[MediaGroup\]/i.test(cleanText)) {
      return renderWithPrefix(t('chatWindow.media_items', 'Медиа'), true);
    }
    if (/^\[Audio\]\s+voice_\d+\.ogg/i.test(cleanText) || /^voice_\d+\.ogg/i.test(cleanText)) {
      return renderWithPrefix(t('chatWindow.voice_message'), true);
    }
    if (/^\[Audio\]/i.test(cleanText)) {
      const match = cleanText.match(/^\[Audio\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
      const title = match ? match[1] : t('chatWindow.audio');
      return renderWithPrefix(<>🎧 {title}</>, true);
    }
    if (/^\[File\]/i.test(cleanText)) {
      const match = cleanText.match(/^\[File\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
      const fileName = match ? match[1] : t('chatWindow.file');
      return renderWithPrefix(fileName, true);
    }
    const plain = cleanText
      .replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n?/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\|\|(.*?)\|\|/g, '$1')
      .replace(/^>\s?(.*)$/gm, '$1')
      .replace(/\n+/g, ' ')
      .trim();
    return renderWithPrefix(plain || t('common.no_messages'));
  }

  return renderWithPrefix(t('common.no_messages'));
};
