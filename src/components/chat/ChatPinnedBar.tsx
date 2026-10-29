import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { type Message, type Chat } from '../../store/useChatStore';
import { markdownToHtml, formatPreviewText, parseReplyChain } from '../../utils/messageUtils';

interface ChatPinnedBarProps {
  pinnedMessage: Message | null | undefined;
  activeChat?: Chat | null;
  isChannelOwner?: boolean;
  onScrollToPinned: () => void;
  onUnpin: () => void;
  onLinkClick?: (url: string) => void;
  topOffset?: number;
}

export const ChatPinnedBar: React.FC<ChatPinnedBarProps> = ({
  pinnedMessage,
  activeChat,
  isChannelOwner,
  onScrollToPinned,
  onUnpin,
  onLinkClick,
  topOffset,
}) => {
  const { t } = useTranslation();

  if (!pinnedMessage) return null;

  return (
    <div
      onClick={onScrollToPinned}
      className="flex-shrink-0 flex items-center justify-between cursor-pointer transition-colors select-none"
      style={{
        position: 'absolute',
        top: topOffset ? `${topOffset + 4}px` : '58px',
        left: '14px',
        right: '14px',
        zIndex: 19,
        backgroundColor: 'color-mix(in srgb, var(--surface-container) 70%, transparent)',
        borderRadius: '18px',
        border: 'none',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        padding: '6px 14px',
        gap: '12px',
        pointerEvents: 'auto',
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div style={{ width: '2px', height: '32px', backgroundColor: 'var(--accent-color)', borderRadius: '1px', flexShrink: 0 }} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-semibold truncate" style={{ color: 'var(--accent-color)', fontSize: '13px', lineHeight: '1.2' }}>
            {t('chatWindow.pinned_message')}
          </span>
          <span
            className="truncate mt-0.5"
            style={{ color: 'var(--text-main)', fontSize: '13px', lineHeight: '1.3' }}
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(
                formatPreviewText(
                  parseReplyChain(pinnedMessage.text || '').body.trim() || pinnedMessage.text,
                  t
                ),
                'var(--accent-color)'
              ).replace(/<br\s*\/?>/gi, ' ')
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName.toLowerCase() === 'a') {
                e.preventDefault();
                e.stopPropagation();
                const url = target.getAttribute('href');
                if (url && onLinkClick) onLinkClick(url);
              }
            }}
          />
        </div>
      </div>

      {(activeChat?.type !== 'channel' || isChannelOwner) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnpin();
          }}
          className="p-1.5 rounded-full text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors flex-shrink-0 cursor-pointer border-none bg-transparent"
          aria-label={t('common.unpin')}
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};
