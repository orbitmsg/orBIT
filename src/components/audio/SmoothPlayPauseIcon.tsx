import React from 'react';

interface SmoothPlayPauseIconProps {
  isPlaying: boolean;
  size?: number;
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const SmoothPlayPauseIcon: React.FC<SmoothPlayPauseIconProps> = ({
  isPlaying,
  size = 22,
  fill = '#ffffff',
  className = '',
  style,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        overflow: 'visible',
        display: 'block',
        pointerEvents: 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      <path
        fill={fill}
        d="M133 440a35.37 35.37 0 0 1-17.5-4.67c-12-6.8-19.46-20-19.46-34.33V111c0-14.37 7.46-27.53 19.46-34.33a35.13 35.13 0 0 1 35.77.45l247.85 148.36a36 36 0 0 1 0 61l-247.89 148.4A35.5 35.5 0 0 1 133 440"
        style={{
          transformOrigin: '256px 256px',
          transform: isPlaying ? 'scale(0.5) rotate(90deg)' : 'scale(1) rotate(0deg)',
          opacity: isPlaying ? 0 : 1,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
        }}
      />
      <g
        fill={fill}
        style={{
          transformOrigin: '256px 256px',
          transform: isPlaying ? 'scale(1) rotate(0deg)' : 'scale(0.5) rotate(-90deg)',
          opacity: isPlaying ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
        }}
      >
        <rect x="120" y="72" width="96" height="368" rx="36" ry="36" />
        <rect x="296" y="72" width="96" height="368" rx="36" ry="36" />
      </g>
    </svg>
  );
};
