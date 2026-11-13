import React, { useId } from 'react';

interface OrbitIconProps {
  size?: number | string;
  className?: string;
  withBackground?: boolean;
  monochrome?: boolean;
  color?: string;
}

export const OrbitIcon: React.FC<OrbitIconProps> = ({
  size = 32,
  className = '',
  withBackground = false,
  monochrome = false,
  color,
}) => {
  const uid = useId().replace(/:/g, '');
  const finalColor = color || (monochrome ? '#ffffff' : undefined);

  if (finalColor) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="100 100 800 800"
        width={size}
        height={size}
        className={`shrink-0 select-none ${className}`}
        aria-hidden="true"
      >
        <path
          d="M 678.5 239.0 A 340 340 0 1 0 816.0 376.5 L 780.7 411.8 A 290 290 0 1 1 643.2 274.3 Z"
          fill={finalColor}
        />
        <path
          d="M 603.7 313.8 A 240 240 0 1 0 741.2 451.3 L 705.2 487.3 A 190 190 0 1 1 567.7 349.8 Z"
          fill={finalColor}
        />
        <rect x="605" y="355" width="85" height="85" fill={finalColor} />
        <rect x="690" y="270" width="85" height="85" fill={finalColor} />
        <rect x="775" y="185" width="85" height="85" fill={finalColor} />
      </svg>
    );
  }

  const ringFill = `ringFill-${uid}`;
  const ringStroke = `ringStroke-${uid}`;
  const sq1Grad = `sq1Grad-${uid}`;
  const sq2Grad = `sq2Grad-${uid}`;
  const sq3Grad = `sq3Grad-${uid}`;
  const ambientGlow = `ambientGlow-${uid}`;
  const topPixelGlow = `topPixelGlow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={withBackground ? '0 0 1000 1000' : '100 100 800 800'}
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={ringFill} x1="75%" y1="15%" x2="20%" y2="85%">
          <stop offset="0%" stopColor="#6B67F8" />
          <stop offset="50%" stopColor="#514AE6" />
          <stop offset="100%" stopColor="#3C33C4" />
        </linearGradient>

        <linearGradient id={ringStroke} x1="80%" y1="10%" x2="20%" y2="90%">
          <stop offset="0%" stopColor="#9A98FF" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#6C67F5" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#554EE0" stopOpacity="0.7" />
        </linearGradient>

        <linearGradient id={sq1Grad} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4A43DB" />
          <stop offset="100%" stopColor="#5B55EE" />
        </linearGradient>

        <linearGradient id={sq2Grad} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5B55EE" />
          <stop offset="100%" stopColor="#7673FF" />
        </linearGradient>

        <radialGradient id={sq3Grad} cx="50%" cy="50%" r="55%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="28%" stopColor="#E5E6FF" />
          <stop offset="65%" stopColor="#8C8AFF" />
          <stop offset="100%" stopColor="#6864F7" />
        </radialGradient>

        <filter id={ambientGlow} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur" />
          <feComponentTransfer in="blur" result="dimBlur">
            <feFuncA type="linear" slope="0.45" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="dimBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={topPixelGlow} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="28" result="blur2" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="55" result="blur3" />
          <feMerge>
            <feMergeNode in="blur3" />
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {withBackground && (
        <>
          <rect width="1000" height="1000" fill="#0B0B0E" />
          <circle cx="535" cy="525" r="340" fill="#4E46E5" opacity="0.14" filter={`url(#${ambientGlow})`} />
        </>
      )}

      <g filter={`url(#${ambientGlow})`}>
        <path
          d="M 678.5 239.0 A 340 340 0 1 0 816.0 376.5 L 780.7 411.8 A 290 290 0 1 1 643.2 274.3 Z"
          fill={`url(#${ringFill})`}
          stroke={`url(#${ringStroke})`}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        <path
          d="M 603.7 313.8 A 240 240 0 1 0 741.2 451.3 L 705.2 487.3 A 190 190 0 1 1 567.7 349.8 Z"
          fill={`url(#${ringFill})`}
          stroke={`url(#${ringStroke})`}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        <rect
          x="605"
          y="355"
          width="85"
          height="85"
          fill={`url(#sq1Grad)`}
          stroke="#726DFF"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />

        <rect
          x="690"
          y="270"
          width="85"
          height="85"
          fill={`url(#sq2Grad)`}
          stroke="#8E8AFF"
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
      </g>

      <g filter={`url(#${topPixelGlow})`}>
        <rect
          x="775"
          y="185"
          width="85"
          height="85"
          fill={`url(#sq3Grad)`}
          stroke="#D0D0FF"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
};

interface OrbitWordmarkProps {
  fontSize?: number | string;
  className?: string;
}

export const OrbitWordmark: React.FC<OrbitWordmarkProps> = ({
  fontSize = '24px',
  className = '',
}) => {
  return (
    <span
      className={`font-bold tracking-tight inline-flex items-baseline select-none ${className}`}
      style={{ fontSize, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      <span className="text-white font-normal">or</span>
      <span className="font-extrabold" style={{ color: '#5865F2' }}>
        BIT
      </span>
    </span>
  );
};

interface OrbitLogoProps {
  iconSize?: number;
  fontSize?: number | string;
  gap?: number | string;
  className?: string;
}

export const OrbitLogo: React.FC<OrbitLogoProps> = ({
  iconSize = 34,
  fontSize = '22px',
  gap = '10px',
  className = '',
}) => {
  return (
    <div className={`inline-flex items-center select-none ${className}`} style={{ gap }}>
      <OrbitIcon size={iconSize} />
      <OrbitWordmark fontSize={fontSize} />
    </div>
  );
};
