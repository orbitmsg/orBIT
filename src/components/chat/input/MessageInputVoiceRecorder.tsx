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

const drawCircularWaveLayer = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  amplitude: number,
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
    const s2 = Math.sin(k2 * theta - wavePhase * 0.75 + 1.3);
    const norm = (s1 * 0.68 + s2 * 0.32 + 1) * 0.5;
    const elevation = Math.min(18, norm * amplitude);
    const r = baseR + elevation;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const [r, g, b] = colorRgb;
  const maxR = baseR + amplitude + 1;
  const grad = ctx.createRadialGradient(cx, cy, baseR * 0.8, cx, cy, maxR);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${alpha * 0.70})`);
  grad.addColorStop(0.9, `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fill();
};

const parseHexColor = (hex: string): [number, number, number] | null => {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  return null;
};

const renderCircularWaves = (
  canvas: HTMLCanvasElement,
  vol: number,
  phase: number
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const targetSize = Math.round(120 * dpr);
  if (canvas.width !== targetSize || canvas.height !== targetSize) {
    canvas.width = targetSize;
    canvas.height = targetSize;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 120, 120);

  const cx = 60;
  const cy = 60;
  const coreR = 22 + Math.sin(phase * 0.8) * 1.5 + vol * 13;
  const baseAmp = 7.5 + vol * 11.5;

  const r1 = coreR + Math.sin(phase * 0.7) * 1.4;
  const r2 = coreR + Math.sin(phase * 0.7 + 1.8) * 1.8;
  const r3 = coreR + Math.sin(phase * 0.7 + 3.6) * 2.2;

  let rgb: [number, number, number] = [124, 58, 237];
  if (typeof document !== 'undefined') {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    const parsed = parseHexColor(val);
    if (parsed) rgb = parsed;
  }
  const [r, g, b] = rgb;
  drawCircularWaveLayer(ctx, cx, cy, r1, baseAmp * 0.50, 3, 4, phase * 0.55, [r, g, b], 0.25 + vol * 0.15);
  drawCircularWaveLayer(ctx, cx, cy, r2, baseAmp * 0.78, 4, 5, -phase * 0.75 + 1.4, [Math.min(255, r + 20), Math.min(255, g + 20), Math.min(255, b + 20)], 0.40 + vol * 0.22);
  drawCircularWaveLayer(ctx, cx, cy, r3, baseAmp, 3, 5, phase, [Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40)], 0.65 + vol * 0.30);

  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.82 + vol * 0.15})`;
  ctx.fill();
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
      smoothedVolRef.current += (target - smoothedVolRef.current) * 0.18;
      const vol = smoothedVolRef.current;

      wavePhaseRef.current += 0.032 + vol * 0.038;
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
        height: '42px',
        minHeight: '42px',
        position: 'relative',
        overflow: 'visible',
        backgroundColor: 'color-mix(in srgb, var(--surface-container) 70%, transparent)',
        borderRadius: '21px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        border: 'none',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        padding: '0 2px 0 16px',
        pointerEvents: 'auto',
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
            position: 'relative',
            transform: `translateY(${!isLocked ? -Math.min(lockProgress * 14, 10) : 0}px)`,
            transition: 'transform 0.05s ease-out',
            overflow: 'visible',
            width: '42px',
            height: '42px',
          }}
        >
          <canvas
            ref={waveCanvasRef}
            style={{
              position: 'absolute',
              top: '-39px',
              left: '-39px',
              width: '120px',
              height: '120px',
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
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-color, #7C3AED)',
              color: '#ffffff',
              border: 'none',
              outline: 'none',
              boxShadow: '0 4px 16px rgba(124, 58, 237, 0.35)',
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
