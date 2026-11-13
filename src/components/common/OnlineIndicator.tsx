export type OnlineIndicatorSize = 'xs' | 'sm' | 'md' | 'lg';

export interface OnlineIndicatorProps {
  online?: boolean;
  showOffline?: boolean;
  size?: OnlineIndicatorSize;
  ringColor?: string;
  className?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

const SIZE_MAP: Record<OnlineIndicatorSize, string> = {
  xs: '11px',
  sm: '12px',
  md: '14px',
  lg: '16px',
};

export const OnlineIndicator = ({
  online = false,
  showOffline = true,
  size = 'sm',
  ringColor,
  className = '',
  ariaLabel,
  style,
}: OnlineIndicatorProps) => {
  if (!online && !showOffline) {
    return null;
  }

  const dimension = SIZE_MAP[size];
  const cutoutColor = ringColor || 'var(--chat-list-bg, #121212)';
  const strokeColor = online
    ? 'var(--online-color, #23a55a)'
    : 'var(--offline-color, #80848e)';

  return (
    <span
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel || (online ? 'В сети' : 'Не в сети')}
      aria-hidden={ariaLabel ? undefined : true}
      className={`absolute bottom-0 right-0 rounded-full pointer-events-none shrink-0 ${className}`.trim()}
      style={{
        width: dimension,
        height: dimension,
        boxSizing: 'border-box',
        backgroundColor: cutoutColor,
        border: `2px solid ${strokeColor}`,
        boxShadow: `0 0 0 2px ${cutoutColor}`,
        transition: 'box-shadow 180ms ease, background-color 180ms ease, border-color 180ms ease',
        ...style,
      }}
    />
  );
};

export default OnlineIndicator;
