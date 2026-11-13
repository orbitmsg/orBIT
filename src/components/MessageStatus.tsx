import React from 'react';
import { useTranslation } from 'react-i18next';

type MessageStatusType = 'sent' | 'delivered' | 'read' | 'sending' | 'pending' | 'failed' | 'error';

interface MessageStatusProps {
  status: MessageStatusType;
  className?: string;
  isOwn?: boolean;
  color?: string;
  onRetry?: () => void;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status, className = '', isOwn = false, color, onRetry }) => {
  const { t } = useTranslation();
  const statusStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'middle',
    flexShrink: 0,
  };

  const checkColor = color || (isOwn ? 'rgba(255, 255, 255, 0.95)' : 'var(--text-dim, #808080)');
  const readColor = color || (isOwn ? '#ffffff' : 'var(--text-dim, #808080)');

  if (status === 'failed' || status === 'error') {
    return (
      <span
        onClick={(e) => {
          if (onRetry) {
            e.stopPropagation();
            onRetry();
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onRetry ? 'pointer' : 'default',
          flexShrink: 0,
        }}
        aria-label={t('common.not_delivered', 'Не доставлено')}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          className={className}
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="7" stroke="#ff4d4f" strokeWidth="1.5" fill="rgba(255, 77, 79, 0.2)" />
          <path d="M8 4.5V8.5" stroke="#ff4d4f" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.25" r="0.75" fill="#ff4d4f" />
        </svg>
      </span>
    );
  }

  if (status === 'sending' || status === 'pending') {
    return (
      <svg
        viewBox="0 -2 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        aria-label={t('common.sending', 'Отправка...')}
        className={className}
        style={statusStyle}
      >
        <circle cx="4.75" cy="6" r="3.75" fill="none" stroke={checkColor} strokeWidth="1.2" />
        <path d="M4.75 3.8V6H6.3" fill="none" stroke={checkColor} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'read') {
    return (
      <svg
        viewBox="0 -2 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="16"
        className={className}
        style={statusStyle}
        aria-hidden="true"
      >
        <path
          d="m1 6l2.5 2.5l5-5m-2 5l5-5"
          stroke={readColor}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 -2 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      className={className}
      style={statusStyle}
      aria-hidden="true"
    >
      <path
        d="m1 6l2.5 2.5l5-5"
        stroke={checkColor}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};