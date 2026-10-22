import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { CustomEditIcon, CustomReplyIcon } from '../ChatWindow';
import { ChannelMegaphoneIcon } from '../../common/ChannelMegaphoneIcon';
import { markdownToHtml, formatPreviewText } from '../../../utils/messageUtils';

interface MessageInputActionBannerProps {
  editingIndex: number | null;
  editingOriginalText?: string;
  editText: string;
  replyingTo: { index: number; sender: string; text: string; time: number } | null;
  isChannel?: boolean;
  onCancel: () => void;
}

export const MessageInputActionBanner: React.FC<MessageInputActionBannerProps> = ({
  editingIndex,
  editingOriginalText,
  editText,
  replyingTo,
  isChannel,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        width: '100%',
        paddingBottom: '8px',
        marginBottom: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--accent-color)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {editingIndex !== null ? <CustomEditIcon size={18} /> : <CustomReplyIcon size={18} />}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <div style={{ color: 'var(--accent-color)', fontSize: '13.5px', fontWeight: 600, lineHeight: 1.2 }}>
            {editingIndex !== null ? (
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
          transition: 'color 0.2s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; }}
      >
        <X size={18} />
      </button>
    </div>
  );
};
