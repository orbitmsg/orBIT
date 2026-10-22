import React from 'react';

type MessageStatusType = 'sent' | 'delivered' | 'read' | 'sending' | 'pending';

interface MessageStatusProps {
  status: MessageStatusType;
  className?: string;
  isOwn?: boolean;
  color?: string;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status, className = '', isOwn = false, color }) => {
  const statusStyle: React.CSSProperties = {
    display: 'inline-block',
    verticalAlign: 'middle',
    flexShrink: 0,
  };

  const checkColor = color || (isOwn ? 'rgba(255, 255, 255, 0.95)' : 'var(--text-dim, #808080)');
  const readColor = color || (isOwn ? '#ffffff' : 'var(--text-dim, #808080)');

  if (status === 'sending' || status === 'pending') {
    return (
      <svg
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        className={className}
        style={statusStyle}
        aria-hidden="true"
      >
        <circle cx="6" cy="6" r="4.5" stroke={checkColor} strokeWidth="1.2" />
        <path d="M6 3.5V6L7.5 7.5" stroke={checkColor} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === 'read') {
    return (
      <svg
        viewBox="0 0 16 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="11"
        className={className}
        style={statusStyle}
        aria-hidden="true"
      >
        <path
          d="M1.5 6.5L4.5 9.5L10.5 3.5M6 9.5L14.5 3.5"
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
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width="11"
      height="11"
      className={className}
      style={statusStyle}
      aria-hidden="true"
    >
      <path
        d="M1.5 6.5L4.5 9.5L10.5 3.5"
        stroke={checkColor}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};