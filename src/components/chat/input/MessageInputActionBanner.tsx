import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Forward } from 'lucide-react';
import { CustomEditIcon, CustomReplyIcon } from '../ChatWindow';
import { ChannelMegaphoneIcon } from '../../common/ChannelMegaphoneIcon';
import { markdownToHtml, formatPreviewText } from '../../../utils/messageUtils';
import { Message } from '../../../store/useChatStore';

export const formatForwardPreview = (msg: Message, t: any): string => {
  if (msg.mediaType === 'sticker' || (msg.text && /^\[Sticker\]/i.test(msg.text.trim()))) {
    return t('chatWindow.sticker', 'Стикер');
  }
  if (msg.mediaType === 'voice' || (msg.text && /^\[Audio\]\s+voice_/i.test(msg.text.trim()))) {
    return t('chatWindow.voice_message', 'Голосовое сообщение');
  }
  if (msg.mediaType === 'audio') {
    const title = msg.audioMetadata?.title || msg.mediaName;
    const artist = msg.audioMetadata?.artist;
    if (artist && title) return `${artist} – ${title}`;
    if (title) return title;
    return t('chatWindow.audio', 'Аудиозапись');
  }
  if (msg.mediaType === 'photo' || (msg.text && /^\[Photo\]/i.test(msg.text.trim()))) {
    return t('chatWindow.photo', 'Фотография');
  }
  if (msg.mediaType === 'video' || (msg.text && /^\[Video\]/i.test(msg.text.trim()))) {
    return t('chatWindow.video', 'Видео');
  }
  if (msg.mediaType === 'file' || (msg.text && /^\[File\]/i.test(msg.text.trim()))) {
    return msg.mediaName || t('chatWindow.file', 'Файл');
  }
  if (msg.linkPreview || (msg.text && /^https?:\/\/[^\s]+$/i.test(msg.text.trim()))) {
    return t('chatWindow.link', 'Ссылка');
  }
  return msg.text || t('chatWindow.text', 'Текст');
};

interface MessageInputActionBannerProps {
  editingIndex: number | null;
  editingOriginalText?: string;
  editText: string;
  replyingTo: { index: number; sender: string; text: string; time: number } | null;
  forwardingMessages?: Message[] | null;
  anonymousForwardingEnabled?: boolean;
  isChannel?: boolean;
  onCancel: () => void;
}

export const MessageInputActionBanner: React.FC<MessageInputActionBannerProps> = ({
  editingIndex,
  editingOriginalText,
  editText,
  replyingTo,
  forwardingMessages,
  anonymousForwardingEnabled,
  isChannel,
  onCancel,
}) => {
  const { t } = useTranslation();
  const hasForward = Boolean(forwardingMessages && forwardingMessages.length > 0);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        width: '100%',
        backgroundColor: 'var(--surface-container, #33363f)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.28)',
        padding: '8px 14px',
        marginBottom: '8px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--accent-color)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {hasForward ? (
            <Forward size={18} />
          ) : editingIndex !== null ? (
            <CustomEditIcon size={18} />
          ) : (
            <CustomReplyIcon size={18} />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <div style={{ color: 'var(--accent-color)', fontSize: '13.5px', fontWeight: 600, lineHeight: 1.2 }}>
            {hasForward ? (
              anonymousForwardingEnabled ? (
                t('forward.names_hidden', 'Имена отправителей скрыты')
              ) : forwardingMessages && forwardingMessages.length === 1 ? (
                t('forward.forward_from_author', { sender: forwardingMessages[0].sender })
              ) : (
                t('forward.forward_count', { count: forwardingMessages?.length || 0 })
              )
            ) : editingIndex !== null ? (
              t('chatWindow.editing')
            ) : isChannel && replyingTo ? (
              (() => {
                const full = t('chatWindow.reply_to', { sender: '___ORBITA_SENDER___' });
                const parts = full.split('___ORBITA_SENDER___');
                return (
                  <span className="inline-flex items-center gap-1 min-w-0 truncate">
                    {parts[0] && <span>{parts[0]}</span>}
                    <ChannelMegaphoneIcon size={13} className="flex-shrink-0" />
                    <span className="truncate">{replyingTo.sender}</span>
                    {parts[1] && <span>{parts[1]}</span>}
                  </span>
                );
              })()
            ) : (
              t('chatWindow.reply_to', { sender: replyingTo?.sender || '' })
            )}
          </div>
          <div
            style={{
              color: 'var(--text-dim)',
              fontSize: '13px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.35,
              marginTop: '1px',
              maxHeight: '20px',
            }}
          >
            {hasForward && forwardingMessages ? (
              forwardingMessages.length === 1 ? (
                formatForwardPreview(forwardingMessages[0], t)
              ) : (
                t('forward.messages_count', { count: forwardingMessages.length })
              )
            ) : (
              <span
                dangerouslySetInnerHTML={{
                  __html: markdownToHtml(
                    formatPreviewText(
                      editingIndex !== null ? (editingOriginalText || editText) : (replyingTo?.text || ''),
                      t
                    ),
                    'inherit',
                    true
                  ).replace(/<br\s*\/?>/gi, ' '),
                }}
              />
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onCancel}
        aria-label="Отмена"
        style={{
          color: 'var(--text-dim)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-main)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-dim)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
};
