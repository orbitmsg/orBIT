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
      </defs>

      {withBackground && (
        <rect width="1000" height="1000" fill="#0B0B0E" />
      )}

      <g>
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
          fill="#FFFFFF"
        />

        <rect
          x="690"
          y="270"
          width="85"
          height="85"
          fill="#FFFFFF"
        />

        <rect
          x="775"
          y="185"
          width="85"
          height="85"
          fill="#FFFFFF"
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
