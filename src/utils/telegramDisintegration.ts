function isInsideRoundedRect(x: number, y: number, w: number, h: number, r: number): boolean {
  if (x < 0 || x > w || y < 0 || y > h) return false;
  const radius = Math.min(r, w / 2, h / 2);
  if (x < radius && y < radius) {
    const dx = radius - x;
    const dy = radius - y;
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x > w - radius && y < radius) {
    const dx = x - (w - radius);
    const dy = radius - y;
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x < radius && y > h - radius) {
    const dx = radius - x;
    const dy = y - (h - radius);
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x > w - radius && y > h - radius) {
    const dx = x - (w - radius);
    const dy = y - (h - radius);
    return dx * dx + dy * dy <= radius * radius;
  }
  return true;
}

export function runTelegramDisintegration(
  bubbleEl: HTMLElement,
  onComplete?: () => void,
  maxParticlesCount: number = 320
): () => void {
  if (typeof window === 'undefined') {
    onComplete?.();
    return () => {};
  }

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onComplete?.();
    return () => {};
  }

  const bubbleRect = bubbleEl.getBoundingClientRect();
  const width = Math.ceil(bubbleRect.width);
  const height = Math.ceil(bubbleRect.height);

  if (width < 4 || height < 4) {
    onComplete?.();
    return () => {};
  }

  bubbleEl.style.opacity = '0';

  if (bubbleRect.bottom < 0 || bubbleRect.top > window.innerHeight) {
    onComplete?.();
    return () => {};
  }

  const computedStyle = window.getComputedStyle(bubbleEl);
  let bgColor = computedStyle.backgroundColor;
  if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
    bgColor = '#2c6bed';
  }
  const textColor = computedStyle.color || '#ffffff';

  const childRects: Array<{ left: number; top: number; right: number; bottom: number; color: string }> = [];
  const textElements = bubbleEl.querySelectorAll('p, span, a, svg, [data-message-text]');
  textElements.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const cs = window.getComputedStyle(el);
      childRects.push({
        left: r.left - bubbleRect.left,
        top: r.top - bubbleRect.top,
        right: r.right - bubbleRect.left,
        bottom: r.bottom - bubbleRect.top,
        color: cs.color || textColor,
      });
    }
  });

  const borderRadius = parseFloat(computedStyle.borderRadius) || 12;

  const container = document.createElement('div');
  container.className = 'orbita-disintegrate-container';
  container.style.left = `${Math.round(bubbleRect.left)}px`;
  container.style.top = `${Math.round(bubbleRect.top)}px`;
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  const totalArea = width * height;
  const targetCount = Math.min(maxParticlesCount, Math.max(40, Math.round(totalArea / 75)));
  const step = Math.max(3.2, Math.sqrt(totalArea / targetCount));

  let count = 0;
  let html = '';

  for (let y = 1; y < height && count < targetCount; y += step) {
    for (let x = 1; x < width && count < targetCount; x += step) {
      if (!isInsideRoundedRect(x, y, width, height, borderRadius)) {
        continue;
      }

      let pixelColor = bgColor;
      for (let i = 0; i < childRects.length; i++) {
        const cr = childRects[i];
        if (x >= cr.left && x <= cr.right && y >= cr.top && y <= cr.bottom) {
          pixelColor = cr.color;
          break;
        }
      }

      const jx = (Math.random() - 0.5) * (step * 0.8);
      const jy = (Math.random() - 0.5) * (step * 0.8);
      const px = Math.max(0, Math.min(width, x + jx));
      const py = Math.max(0, Math.min(height, y + jy));

      const delay = Math.round(Math.random() * 80 + (px / width) * 40);
      const life = Math.round(540 + Math.random() * 180);
      const vx = Math.round((Math.random() - 0.5) * 36);
      const vy = Math.round(-(24 + Math.random() * 32));
      const sway = Math.round((Math.random() - 0.5) * 14);
      const size = Math.max(1.5, Math.min(3.2, 1.8 + Math.random() * 1.2));

      html += `<span class="orbita-pixel" style="left:${Math.round(px)}px;top:${Math.round(py)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;background-color:${pixelColor};--tx:${vx}px;--ty:${vy}px;--sway:${sway}px;--delay:${delay}ms;--life:${life}ms"></span>`;
      count++;
    }
  }

  container.innerHTML = html;
  document.body.appendChild(container);

  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    onComplete?.();
  };

  const timer = setTimeout(cleanup, 780);

  return () => {
    clearTimeout(timer);
    cleanup();
  };
}
