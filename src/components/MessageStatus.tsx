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
    transform: 'translateY(-2.5px)',
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
        width="13"
        height="13"
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