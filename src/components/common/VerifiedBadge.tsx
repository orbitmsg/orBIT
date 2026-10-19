import React from 'react';

interface VerifiedBadgeProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  ariaLabel?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ 
  size = 18, 
  className = '',
  style = {},
  title,
  ariaLabel,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    aria-label={ariaLabel || title || 'Официальный аккаунт'}
    style={{
      display: 'inline-flex',
      flexShrink: 0,
      filter: 'drop-shadow(0 2px 5px rgba(90, 74, 244, 0.35))',
      verticalAlign: 'middle',
      cursor: 'pointer',
      ...style,
    }}
  >
    <path
      d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12z"
      fill="#5a4af4"
    />
    <path
      d="M10.09 16.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"
      fill="#ffffff"
    />
  </svg>
);
