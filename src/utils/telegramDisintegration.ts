interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sway: number;
  size: number;
  delay: number;
  life: number;
  color: string;
}

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
  onComplete?: () => void
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

  const container = (bubbleEl.closest('.chat-list-scrollbar') as HTMLElement) || document.body;
  const containerRect = container.getBoundingClientRect();

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const offsetY = 65;
  const extraLeft = 35;
  const extraRight = 35;
  const extraBottom = 25;
  const totalCanvasWidth = width + extraLeft + extraRight;
  const totalCanvasHeight = height + offsetY + extraBottom;

  canvas.width = Math.round(totalCanvasWidth * dpr);
  canvas.height = Math.round(totalCanvasHeight * dpr);
  canvas.style.position = 'absolute';
  canvas.style.left = `${Math.round(bubbleRect.left - containerRect.left - extraLeft)}px`;
  canvas.style.top = `${Math.round(bubbleRect.top - containerRect.top + container.scrollTop - offsetY)}px`;
  canvas.style.width = `${totalCanvasWidth}px`;
  canvas.style.height = `${totalCanvasHeight}px`;
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '60';

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    onComplete?.();
    return () => {};
  }
  ctx.scale(dpr, dpr);

  container.appendChild(canvas);

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
  const STEP = 2.4;
  const particles: Particle[] = [];

  for (let y = 1; y < height; y += STEP) {
    for (let x = 1; x < width; x += STEP) {
      if (!isInsideRoundedRect(x, y, width, height, borderRadius)) {
        continue;
      }

      let isText = false;
      let particleColor = bgColor;
      for (let i = 0; i < childRects.length; i++) {
        const cr = childRects[i];
        if (x >= cr.left && x <= cr.right && y >= cr.top && y <= cr.bottom) {
          isText = true;
          particleColor = cr.color;
          break;
        }
      }

      if (!isText && Math.random() < 0.12) {
        continue;
      }

      const jx = (Math.random() - 0.5) * 1.5;
      const jy = (Math.random() - 0.5) * 1.5;
      const px = Math.max(0, Math.min(width, x + jx));
      const py = Math.max(0, Math.min(height, y + jy));

      const delay = Math.random() * 180 + (px / width) * 120;
      const life = 550 + Math.random() * 250;
      const vx = (Math.random() - 0.5) * (20 + Math.random() * 24);
      const vy = -(24 + Math.random() * 32);
      const sway = (Math.random() - 0.5) * 8;
      const size = 2.2 + Math.random() * 1.4;

      particles.push({
        x: px + extraLeft,
        y: py + offsetY,
        vx,
        vy,
        sway,
        size,
        delay,
        life,
        color: particleColor,
      });
    }
  }

  const MAX_PARTICLES = 1400;
  if (particles.length > MAX_PARTICLES) {
    const stride = particles.length / MAX_PARTICLES;
    const filtered: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      filtered.push(particles[Math.floor(i * stride)]);
    }
    particles.length = 0;
    particles.push(...filtered);
  }

  let isCleanedUp = false;
  let animId = 0;
  const startTime = performance.now();

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    cancelAnimationFrame(animId);
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    onComplete?.();
  };

  const frame = (now: number) => {
    const elapsed = now - startTime;
    if (elapsed >= 880) {
      cleanup();
      return;
    }

    ctx.clearRect(0, 0, totalCanvasWidth, totalCanvasHeight);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const particleElapsed = now - (startTime + p.delay);

      if (particleElapsed < 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size));
        continue;
      }

      if (particleElapsed >= p.life) {
        continue;
      }

      const progress = particleElapsed / p.life;
      const easeOut = 1 - Math.pow(1 - progress, 2.4);
      const sway = Math.sin(progress * Math.PI) * p.sway;
      const currX = p.x + p.vx * easeOut + sway;
      const currY = p.y + p.vy * easeOut;
      const alpha = Math.max(0, 1 - Math.pow(progress, 1.45));
      const currSize = Math.max(0.6, p.size * (1 - Math.pow(progress, 1.2) * 0.45));

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(
        Math.round(currX),
        Math.round(currY),
        Math.max(1, Math.round(currSize)),
        Math.max(1, Math.round(currSize))
      );
    }

    animId = requestAnimationFrame(frame);
  };

  animId = requestAnimationFrame(frame);

  return () => {
    cleanup();
  };
}
