import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

interface ChatScrollToBottomButtonProps {
  show: boolean;
  unreadCount: number;
  isMobileView?: boolean;
  bottomOffset?: number;
  onClick: () => void;
}

export const ChatScrollToBottomButton: React.FC<ChatScrollToBottomButtonProps> = ({
  show,
  unreadCount,
  isMobileView = false,
  bottomOffset,
  onClick,
}) => {
  const { t } = useTranslation();

  return (
    <button
      className={`scroll-btn ${show ? 'visible' : ''}`}
      onClick={onClick}
      aria-label={t('chatWindow.scroll_down', 'Прокрутить вниз')}
      style={{
        position: 'absolute',
        right: isMobileView ? '12px' : '20px',
        bottom: bottomOffset ? `${bottomOffset}px` : '68px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        backgroundColor: 'color-mix(in srgb, var(--surface-container) 70%, transparent)',
        color: 'var(--text-main)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        border: 'none',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        outline: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
      }}
    >
      {unreadCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '-4px',
            right: unreadCount >= 10 ? '-5px' : '-2px',
            backgroundColor: 'var(--accent-color, #7C3AED)',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 600,
            minWidth: '18px',
            height: '18px',
            borderRadius: unreadCount >= 10 ? '9999px' : '50%',
            padding: unreadCount >= 10 ? '0 6px' : '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            lineHeight: 1,
            zIndex: 35,
            whiteSpace: 'nowrap',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
      <ChevronDown size={24} strokeWidth={2.4} style={{ color: 'var(--text-main)' }} />
    </button>
  );
};
