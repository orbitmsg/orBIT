export type OnlineIndicatorSize = 'xs' | 'sm' | 'md' | 'lg';

export interface OnlineIndicatorProps {
  online?: boolean;
  showOffline?: boolean;
  size?: OnlineIndicatorSize;
  ringColor?: string;
  className?: string;
  ariaLabel?: string;
}

const SIZE_MAP: Record<OnlineIndicatorSize, string> = {
  xs: '10px',
  sm: '12px',
  md: '14px',
  lg: '16px',
};

export const OnlineIndicator = ({
  online = false,
  showOffline = false,
  size = 'sm',
  ringColor,
  className = '',
  ariaLabel,
}: OnlineIndicatorProps) => {
  if (!online && !showOffline) {
    return null;
  }

  const dimension = SIZE_MAP[size];
  const cutoutColor = ringColor || 'var(--bg-primary, #313338)';
  const offlineFillColor = ringColor || 'var(--bg-secondary, #2b2d31)';

  return (
    <span
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel || undefined}
      aria-hidden={ariaLabel ? undefined : true}
      className={`absolute bottom-0 right-0 rounded-full pointer-events-none shrink-0 ${className}`.trim()}
      style={{
        width: dimension,
        height: dimension,
        boxSizing: 'border-box',
        backgroundColor: online ? '#23a55a' : offlineFillColor,
        border: online ? '2px solid #23a55a' : '2px solid #80848e',
        boxShadow: `0 0 0 2.5px ${cutoutColor}`,
        transition: 'box-shadow 180ms ease, background-color 180ms ease, border-color 180ms ease',
      }}
    />
  );
};

export default OnlineIndicator;
