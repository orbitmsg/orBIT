import React, { memo } from 'react';

interface MD3CircularSpinnerProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge' | number;
  color?: string;
  trackColor?: string;
  className?: string;
}

export const MD3CircularSpinner: React.FC<MD3CircularSpinnerProps> = memo(({
  size = 'medium',
  color = 'var(--accent-color, #7C3AED)',
  trackColor = 'var(--border-color, rgba(255,255,255,0.05))',
  className = '',
}) => {
  const sizes: Record<string, { width: number; height: number; viewBox: string; cx: number; cy: number; r: number; strokeWidth: number }> = {
    small: { width: 24, height: 24, viewBox: '0 0 24 24', cx: 12, cy: 12, r: 9, strokeWidth: 3 },
    medium: { width: 40, height: 40, viewBox: '0 0 40 40', cx: 20, cy: 20, r: 16, strokeWidth: 3.5 },
    large: { width: 64, height: 64, viewBox: '0 0 64 64', cx: 32, cy: 32, r: 26, strokeWidth: 4 },
    xlarge: { width: 80, height: 80, viewBox: '0 0 80 80', cx: 40, cy: 40, r: 35, strokeWidth: 4 },
  };

  const config = typeof size === 'number'
    ? {
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        cx: size / 2,
        cy: size / 2,
        r: Math.round(size / 2 - 5),
        strokeWidth: Math.max(3, Math.round(size * 0.05)),
      }
    : (sizes[size] || sizes.medium);

  const { width, height, viewBox, cx, cy, r, strokeWidth } = config;

  return (
    <>
      <svg
        className={`spinner ${className}`}
        width={width}
        height={height}
        viewBox={viewBox}
        style={{
          animation: 'rotate 1.4s linear infinite',
          transformOrigin: 'center',
          contain: 'strict',
        }}
      >
        <circle
          className="spinner-track"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          className="spinner-arc"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray="80 200"
          strokeDashoffset="0"
          style={{
            animation: 'dash 1.4s ease-in-out infinite',
            transformOrigin: 'center',
          }}
        />
      </svg>
      <style>{`
        @keyframes rotate {
          to { transform: rotate(360deg); }
        }
        @keyframes dash {
          0%   { stroke-dasharray: 1 200; stroke-dashoffset: 0; }
          50%  { stroke-dasharray: 100 200; stroke-dashoffset: -30; }
          100% { stroke-dasharray: 100 200; stroke-dashoffset: -130; }
        }
      `}</style>
    </>
  );
});
