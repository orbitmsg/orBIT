export type OnlineIndicatorSize = 'xs' | 'sm' | 'md' | 'lg';

export interface OnlineIndicatorProps {
  online?: boolean;
  showOffline?: boolean;
  size?: OnlineIndicatorSize;
  ringColor?: string;
  color?: string;
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
  showOffline = false,
  size = 'sm',
  ringColor,
  color,
  className = '',
  ariaLabel,
  style,
}: OnlineIndicatorProps) => {
  if (!online && !showOffline) {
    return null;
  }

  const dimension = SIZE_MAP[size];
  const cutoutColor = ringColor || 'var(--chat-list-bg, #121212)';
  const fillColor = online
    ? (color || 'var(--online-color, #917bbd)')
    : 'var(--offline-color, #80848e)';

  return (
    <span
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel || (online ? 'В сети' : 'Не в сети')}
      aria-hidden={ariaLabel ? undefined : true}
      className={`online-status-indicator absolute bottom-0 right-0 rounded-full pointer-events-none shrink-0 ${className}`.trim()}
      style={{
        width: dimension,
        height: dimension,
        boxSizing: 'border-box',
        backgroundColor: fillColor,
        border: `2px solid ${cutoutColor}`,
        transition: 'background-color 180ms ease, border-color 180ms ease',
        ...style,
      }}
    />
  );
};

export default OnlineIndicator;
