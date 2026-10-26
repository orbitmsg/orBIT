import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../../store/useChatStore';
import { SendIcon, MicIcon } from './MessageInputIcons';

interface MessageInputVoiceRecorderProps {
  recordingTime: number;
  recordingAmplitude?: number;
  isLocked: boolean;
  lockProgress: number;
  onCancel?: () => void;
  onStop: () => void;
}

const formatDurationWithTenths = (totalSeconds: number) => {
  const totalTenths = Math.floor(Math.max(0, totalSeconds) * 10);
  const m = Math.floor(totalTenths / 600);
  const s = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${tenths}`;
};

const getAccentRgb = (): [number, number, number] => {
  if (typeof document !== 'undefined') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    if (raw.startsWith('#')) {
      const clean = raw.replace('#', '').trim();
      if (clean.length === 6) {
        const n = parseInt(clean, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      if (clean.length === 3) {
        const r = parseInt(clean[0] + clean[0], 16);
        const g = parseInt(clean[1] + clean[1], 16);
        const b = parseInt(clean[2] + clean[2], 16);
        return [r, g, b];
      }
    }
    const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
  }
  return [92, 84, 229];
};

const drawCircularWaveLayer = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  layerRadius: number,
  waveHeight: number,
  k1: number,
  k2: number,
  wavePhase: number,
  colorRgb: [number, number, number],
  alpha: number
) => {
  const steps = 64;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const s1 = Math.sin(k1 * theta + wavePhase);
    const s2 = Math.sin(k2 * theta - wavePhase * 0.7 + 1.2);
    const norm = (s1 * 0.65 + s2 * 0.35);
    const elevation = norm * waveHeight;
    const r = layerRadius + elevation;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const [r, g, b] = colorRgb;
  const innerR = 16;
  const outerR = layerRadius + waveHeight + 12;
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${alpha * 0.72})`);
  grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${alpha * 0.22})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fill();
};

const renderCircularWaves = (
  canvas: HTMLCanvasElement,
  vol: number,
  phase: number
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const targetSize = Math.round(260 * dpr);
  if (canvas.width !== targetSize || canvas.height !== targetSize) {
    canvas.width = targetSize;
    canvas.height = targetSize;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 260, 260);

  const cx = 130;
  const cy = 130;
  const rgb = getAccentRgb();

  const r1 = 19 + vol * 12;
  const h1 = 1.5 + vol * 1.0;
  drawCircularWaveLayer(ctx, cx, cy, r1, h1, 1, 2, phase * 0.7, rgb, 0.75 + vol * 0.15);

  const r2 = 32 + vol * 26;
  const h2 = 2.2 + vol * 1.2;
  drawCircularWaveLayer(ctx, cx, cy, r2, h2, 2, 1, -phase * 0.8 + 1.2, rgb, 0.50 + vol * 0.20);

  const r3 = 48 + vol * 44;
  const h3 = 2.8 + vol * 1.5;
  drawCircularWaveLayer(ctx, cx, cy, r3, h3, 1, 2, phase * 0.6 + 2.4, rgb, 0.35 + vol * 0.18);
};

export const MessageInputVoiceRecorder: React.FC<MessageInputVoiceRecorderProps> = ({
  recordingTime,
  recordingAmplitude = 0,
  isLocked,
  lockProgress,
  onCancel,
  onStop,
}) => {
  const { t } = useTranslation();
  const chatElementAnimations = useChatStore((state) => state.chatElementAnimations);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wavePhaseRef = useRef(0);
  const smoothedVolRef = useRef(0.04);
  const ampRef = useRef(recordingAmplitude);

  useEffect(() => {
    ampRef.current = recordingAmplitude;
  }, [recordingAmplitude]);

  useEffect(() => {
    if (chatElementAnimations === false) {
      if (waveCanvasRef.current) {
        const ctx = waveCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, waveCanvasRef.current.width, waveCanvasRef.current.height);
      }
      return;
    }

    let animId: number | null = null;

    const render = () => {
      const canvas = waveCanvasRef.current;
      if (!canvas) return;

      const target = Math.max(0, Math.min(1, (ampRef.current || 0) / 100));
      smoothedVolRef.current += (target - smoothedVolRef.current) * 0.15;
      const vol = smoothedVolRef.current;

      wavePhaseRef.current += 0.025 + vol * 0.035;
      renderCircularWaves(canvas, vol, wavePhaseRef.current);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      if (waveCanvasRef.current) {
        const ctx = waveCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, waveCanvasRef.current.width, waveCanvasRef.current.height);
      }
    };
  }, [chatElementAnimations]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '34px',
        minHeight: '34px',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, height: '34px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            display: 'inline-block',
            animation: 'pulse 1s infinite',
          }}
        />
        <span
          style={{
            color: 'var(--text-main)',
            fontSize: '15px',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDurationWithTenths(recordingTime)}
        </span>
      </div>

      {!isLocked ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'var(--text-dim, #8e9aa8)',
            fontSize: '13.5px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: '34px',
          }}
        >
          {t('chatWindow.release_outside_to_cancel', 'Для отмены отпустите курсор вне поля')}
        </div>
      ) : (
        <button
          type="button"
          tabIndex={-1}
          onClick={onCancel}
          aria-label={t('chatWindow.cancel_recording', 'Отмена')}
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'none',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            color: 'var(--accent-color, #7C3AED)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 12px',
            borderRadius: '6px',
            transition: 'background-color 0.15s ease',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {t('chatWindow.cancel_recording', 'Отмена')}
        </button>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', width: '34px', height: '34px' }}>
        {!isLocked && (
          <div
            style={{
              position: 'absolute',
              bottom: '60px',
              right: '-4px',
              width: '42px',
              height: '88px',
              borderRadius: '9999px',
              backgroundColor: 'var(--surface-container-high, #27303c)',
              border: 'none',
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 0 10px 0',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            <svg
              width="22"
              height="26"
              viewBox="0 0 22 26"
              fill="none"
              style={{ overflow: 'visible' }}
            >
              <rect x="2.5" y="11" width="17" height="12" rx="3.5" fill="#8e9aa8" />
              <path
                d={`M6 11V6a5 5 0 0 1 10 0V${Math.max(5, 11 - lockProgress * 6.5)}`}
                stroke="#8e9aa8"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transformOrigin: '6px 11px',
                  transform: `translateY(-${lockProgress * 4}px) rotate(${lockProgress * -8}deg)`,
                  transition: 'all 0.05s ease-out',
                }}
              />
            </svg>
            <svg
              width="14"
              height="8"
              viewBox="0 0 14 8"
              fill="none"
              style={{ animation: 'orbitaChevronFloat 1.2s infinite ease-in-out' }}
            >
              <path
                d="M2 6.5L7 1.5L12 6.5"
                stroke="#606d7d"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        <div
          className="orbita-voice-btn-wrap"
          style={{
            transform: `translateY(${!isLocked ? -Math.min(lockProgress * 14, 10) : 0}px)`,
            transition: 'transform 0.05s ease-out',
            overflow: 'visible',
            width: '34px',
            height: '34px',
          }}
        >
          <canvas
            ref={waveCanvasRef}
            style={{
              position: 'absolute',
              top: '-113px',
              left: '-113px',
              width: '260px',
              height: '260px',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          <button
            type="button"
            tabIndex={-1}
            onClick={isLocked ? onStop : undefined}
            aria-label={
              isLocked
                ? t('chatWindow.send_voice_message', 'Отправить голосовое сообщение')
                : t('chatWindow.voice_message', 'Голосовое сообщение')
            }
            style={{
              position: 'relative',
              zIndex: 2,
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-color, #7C3AED)',
              color: '#ffffff',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isLocked ? 'pointer' : 'default',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {isLocked ? (
              <span style={{ display: 'inline-flex', transform: 'translate(1px, 1px) scale(0.85)' }}>
                <SendIcon />
              </span>
            ) : (
              <span style={{ display: 'inline-flex', transform: 'scale(0.85)' }}>
                <MicIcon />
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
