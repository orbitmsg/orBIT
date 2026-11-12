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
  size = 'sm',
  ringColor,
  className = '',
  ariaLabel,
}: OnlineIndicatorProps) => {
  if (!online) {
    return null;
  }

  const dimension = SIZE_MAP[size];
  const cutoutColor = ringColor || 'var(--bg-primary, #313338)';

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
        backgroundColor: 'var(--accent-color, #5865F2)',
        border: '2px solid var(--accent-color, #5865F2)',
        boxShadow: `0 0 0 2.5px ${cutoutColor}`,
        transition: 'box-shadow 180ms ease, background-color 180ms ease, border-color 180ms ease',
      }}
    />
  );
};

export default OnlineIndicator;
