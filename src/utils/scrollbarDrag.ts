export function handleScrollbarThumbMouseDown(
  e: React.MouseEvent<HTMLDivElement>,
  container: HTMLElement | null
) {
  if (!container) return;
  e.preventDefault();
  e.stopPropagation();

  const startY = e.clientY;
  const startScrollTop = container.scrollTop;
  const scrollableHeight = container.scrollHeight - container.clientHeight;
  const thumbEl = e.currentTarget;
  const trackEl = thumbEl.parentElement?.querySelector('.overlay-scroll-track') as HTMLElement | null;
  const measuredTrackHeight = trackEl ? trackEl.getBoundingClientRect().height : 0;
  const trackHeight = measuredTrackHeight > 0 ? measuredTrackHeight : Math.max(1, container.clientHeight - 36);
  const measuredThumbHeight = thumbEl.getBoundingClientRect().height;
  const thumbHeight = measuredThumbHeight > 0
    ? measuredThumbHeight
    : Math.max(24, container.scrollHeight > 0 ? (container.clientHeight / container.scrollHeight) * trackHeight : 24);
  const trackAvailable = trackHeight - thumbHeight;

  if (trackAvailable <= 0 || scrollableHeight <= 0) return;

  const ratio = scrollableHeight / trackAvailable;
  thumbEl.classList.add('is-dragging');

  const onMouseMove = (moveEvent: MouseEvent) => {
    moveEvent.preventDefault();
    const deltaY = moveEvent.clientY - startY;
    container.scrollTop = startScrollTop + deltaY * ratio;
  };

  const onMouseUp = () => {
    thumbEl.classList.remove('is-dragging');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

export function handleScrollbarTrackMouseDown(
  e: React.MouseEvent<HTMLDivElement>,
  container: HTMLElement | null
) {
  if (!container) return;
  e.preventDefault();
  e.stopPropagation();

  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.height <= 0) return;
  const clickY = e.clientY - rect.top;
  const percent = Math.min(1, Math.max(0, clickY / rect.height));
  container.scrollTop = percent * (container.scrollHeight - container.clientHeight);
}
