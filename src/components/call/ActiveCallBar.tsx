import React, { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { useAppVisibility } from '../../utils/appVisibility';
import { liveKitService } from '../../services/livekitService';
import { groupLiveKitService } from '../../services/groupLiveKitService';

interface ActiveCallBarProps {
  className?: string;
  style?: React.CSSProperties;
}

export const ActiveCallBar: React.FC<ActiveCallBarProps> = ({ className = '', style }) => {
  const { t } = useTranslation();
  const activeCall = useCallStore((s) => s.activeCall);
  const callState = useCallStore((s) => s.callState);
  const isMicEnabled = useCallStore((s) => s.isMicEnabled);
  const setMicEnabled = useCallStore((s) => s.setMicEnabled);
  const endCall = useCallStore((s) => s.endCall);

  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chatColor = useChatStore((s) => s.chatColor);
  const callAnimationsEnabled = useChatStore((s) => s.callAnimationsEnabled);
  const isAppVisible = useAppVisibility();

  const isCallActive = !!activeCall && (callState === 'connected' || callState === 'connecting' || callState === 'ringing');

  const currentCallChat = activeCall ? chats.find((c) => c.id === activeCall.chatId) : null;
  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
  const currentCallName = currentCallChat?.name || (activeCall as any)?.otherName || activeChat?.name || '';
  const currentCallAvatar = currentCallChat?.avatarUrl || (activeCall as any)?.otherAvatar || (currentCallChat?.id === activeChatId ? activeChat?.avatarUrl : null);

  const baseColor = chatColor || 'var(--accent-color, #5c54e5)';
  const gradientBackground = useMemo(() => {
    if (chatColor && chatColor.startsWith('linear-gradient')) {
      return chatColor;
    }
    return `linear-gradient(90deg, color-mix(in srgb, ${baseColor} 75%, black) 0%, ${baseColor} 50%, color-mix(in srgb, ${baseColor} 80%, white) 100%)`;
  }, [chatColor, baseColor]);

  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isOwnStreamRef = useRef(false);
  const smoothedVolumeRef = useRef(0.04);
  const timeRef = useRef(0);
  const accentRgbRef = useRef<[number, number, number]>([92, 84, 229]);

  useEffect(() => {
    if (!barRef.current) return;
    if (chatColor) {
      if (chatColor.startsWith('#')) {
        const r = parseInt(chatColor.slice(1, 3), 16) || 92;
        const g = parseInt(chatColor.slice(3, 5), 16) || 84;
        const b = parseInt(chatColor.slice(5, 7), 16) || 229;
        accentRgbRef.current = [r, g, b];
        return;
      }
      const hexMatch = chatColor.match(/#[0-9a-fA-F]{6}/);
      if (hexMatch) {
        const hex = hexMatch[0];
        accentRgbRef.current = [
          parseInt(hex.slice(1, 3), 16) || 92,
          parseInt(hex.slice(3, 5), 16) || 84,
          parseInt(hex.slice(5, 7), 16) || 229,
        ];
        return;
      }
    }
    const computed = getComputedStyle(barRef.current);
    const col = computed.getPropertyValue('--accent-color').trim() || '#5c54e5';
    if (col.startsWith('#')) {
      const r = parseInt(col.slice(1, 3), 16) || 92;
      const g = parseInt(col.slice(3, 5), 16) || 84;
      const b = parseInt(col.slice(5, 7), 16) || 229;
      accentRgbRef.current = [r, g, b];
    } else if (col.startsWith('rgb')) {
      const parts = col.match(/\d+/g);
      if (parts && parts.length >= 3) {
        accentRgbRef.current = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
      }
    }
  }, [chatColor]);

  useEffect(() => {
    if (!isCallActive || !isMicEnabled || !callAnimationsEnabled) {
      if (isOwnStreamRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      }
      streamRef.current = null;
      isOwnStreamRef.current = false;
      if (mediaSourceRef.current) {
        try { mediaSourceRef.current.disconnect(); } catch {}
        mediaSourceRef.current = null;
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch {}
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      return;
    }

    let isCancelled = false;
    const setupMicAnalyser = async () => {
      try {
        let stream: MediaStream | null = null;
        const isGroup = activeCall?.chatType === 'group';
        const svc = isGroup ? groupLiveKitService : liveKitService;
        const localTrack = svc.getLocalAudioTrack();
        const mediaTrack = localTrack?.mediaStreamTrack;

        if (mediaTrack && mediaTrack.readyState !== 'ended') {
          stream = new MediaStream([mediaTrack]);
          isOwnStreamRef.current = false;
        } else if (navigator.mediaDevices?.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          isOwnStreamRef.current = true;
        }

        if (!stream || isCancelled) {
          if (stream && isOwnStreamRef.current) {
            stream.getTracks().forEach((t) => {
              try { t.stop(); } catch {}
            });
          }
          return;
        }

        streamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaStreamSource(stream);
        mediaSourceRef.current = source;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.2;
        analyserRef.current = analyser;

        source.connect(analyser);
      } catch {}
    };

    setupMicAnalyser();

    return () => {
      isCancelled = true;
      if (isOwnStreamRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      }
      streamRef.current = null;
      isOwnStreamRef.current = false;
      if (mediaSourceRef.current) {
        try { mediaSourceRef.current.disconnect(); } catch {}
        mediaSourceRef.current = null;
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch {}
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [isCallActive, isMicEnabled, callAnimationsEnabled, activeCall?.chatType]);

  useEffect(() => {
    if (!isCallActive || !callAnimationsEnabled) return;
    const canvas = canvasRef.current;
    const container = barRef.current;
    if (!canvas || !container) return;

    let animId: number | null = null;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        canvas.width = rect.width;
        canvas.height = 56;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const timeData = new Uint8Array(64);
    const freqData = new Uint8Array(32);

    const drawWaveLayer = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      baseline: number,
      amplitude: number,
      f1: number,
      f2: number,
      f3: number,
      wavePhase: number,
      colorRgb: [number, number, number],
      alpha: number,
      withHighlight = false,
      volValue = 0
    ) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      const step = 4;
      for (let x = 0; x <= width; x += step) {
        const s1 = Math.sin(x * f1 + wavePhase);
        const s2 = Math.sin(x * f2 - wavePhase * 1.35 + 1.4);
        const s3 = Math.cos(x * f3 + wavePhase * 0.75 + 2.8);
        const norm = (s1 * 0.54 + s2 * 0.32 + s3 * 0.14 + 1) * 0.5;
        const clamped = Math.max(0, Math.min(1, norm));
        const y = baseline - clamped * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();

      const [r, g, b] = colorRgb;
      const grad = ctx.createLinearGradient(0, baseline - amplitude, 0, height);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.15})`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.65})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      ctx.fillStyle = grad;
      ctx.fill();

      if (withHighlight) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += step) {
          const s1 = Math.sin(x * f1 + wavePhase);
          const s2 = Math.sin(x * f2 - wavePhase * 1.35 + 1.4);
          const s3 = Math.cos(x * f3 + wavePhase * 0.75 + 2.8);
          const norm = (s1 * 0.54 + s2 * 0.32 + s3 * 0.14 + 1) * 0.5;
          const clamped = Math.max(0, Math.min(1, norm));
          const y = baseline - clamped * amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.9, 0.55 + volValue * 0.35)})`;
        ctx.lineWidth = 1.8 + volValue * 0.8;
        ctx.stroke();
      }
    };

    const render = () => {
      if (!isAppVisible) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      let micVol = 0;
      if (analyserRef.current && isMicEnabled) {
        analyserRef.current.getByteTimeDomainData(timeData);
        let maxDev = 0;
        for (let i = 0; i < timeData.length; i++) {
          const dev = Math.abs(timeData[i] - 128);
          if (dev > maxDev) maxDev = dev;
        }
        const timeVol = maxDev > 2 ? Math.min(1, (maxDev - 2) / 32) : 0;

        analyserRef.current.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        const avg = sum / freqData.length;
        const freqVol = avg > 3 ? Math.min(1, (avg - 3) / 28) : 0;

        micVol = Math.max(timeVol, freqVol);
      }

      const remoteSpeaking = !!activeCall?.participants?.some((p: any) => !p.isLocal && p.isSpeaking);
      const remoteVol = remoteSpeaking ? 0.70 + Math.sin(timeRef.current * 7) * 0.25 : 0;
      const rawVol = Math.max(micVol, remoteVol);
      const targetVol = rawVol > 0.03 ? rawVol : 0;

      if (targetVol > smoothedVolumeRef.current) {
        smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.40;
      } else {
        smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.08;
      }

      timeRef.current += 0.024 + smoothedVolumeRef.current * 0.075;

      const phase = timeRef.current;
      const vol = smoothedVolumeRef.current;
      const baseline = 56;

      drawWaveLayer(ctx, width, height, baseline, 18 + vol * 26, 0.012, 0.024, 0.045, phase * 0.75, accentRgbRef.current, 0.20, false, vol);
      drawWaveLayer(ctx, width, height, baseline, 23 + vol * 26, 0.016, 0.032, 0.058, phase * 1.1 + 2.1, accentRgbRef.current, 0.35, false, vol);
      drawWaveLayer(ctx, width, height, baseline, 28 + vol * 24, 0.020, 0.038, 0.068, phase * 1.5 + 4.2, accentRgbRef.current, 0.52, true, vol);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, [isCallActive, callAnimationsEnabled, isAppVisible, isMicEnabled, activeCall]);

  if (!isCallActive) return null;

  return (
    <div
      ref={barRef}
      className={`active-call-header-bar w-full flex items-center justify-between select-none cursor-pointer relative flex-shrink-0 ${className}`}
      style={{
        height: '42px',
        background: gradientBackground,
        border: 'none',
        borderBottom: 'none',
        overflow: 'visible',
        transition: 'background 0.3s ease',
        ...style,
      }}
      onClick={() => {
        try {
          const orb = (window as any).orbita;
          orb?.openCallWindow?.() || orb?.focusCallWindow?.();
        } catch {}
      }}
    >
      {callAnimationsEnabled && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            width: '100%',
            height: '56px',
            pointerEvents: 'none',
            zIndex: 15,
          }}
        />
      )}

      <div className="flex items-center gap-2.5 z-10 pl-3 relative">
        <button
          type="button"
          aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
          onClick={(e) => {
            e.stopPropagation();
            const next = !isMicEnabled;
            setMicEnabled(next);
            try {
              (window as any).orbita?.sendCallAction?.({ type: 'toggleMic', payload: next });
              const bc = new BroadcastChannel('orbita-call-channel');
              bc.postMessage({ type: 'CALL_ACTION', action: 'toggleMic', payload: next });
              setTimeout(() => { try { bc.close(); } catch {} }, 300);
            } catch {}
          }}
          className="bg-transparent border-0 outline-none p-0 cursor-pointer flex items-center justify-center text-white transition-opacity hover:opacity-75 flex-shrink-0"
        >
          {isMicEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="21" height="21" className="w-[21px] h-[21px] text-white">
              <g fill="currentColor">
                <path d="M13 5a1 1 0 0 1 1 1a6 6 0 0 1-5.005 5.915Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 2 0a4 4 0 1 0 8 0a1 1 0 0 1 1-1" />
                <path d="M8 1a3 3 0 0 1 3 3v2a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3" />
              </g>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="21" height="21" className="w-[21px] h-[21px] text-white">
              <path fill="currentColor" d="M4.113 6.945a4 4 0 0 0 2.94 2.94L9.069 11.9l-.073.015Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 .382-.786zM8 1a3 3 0 0 1 3 3v2c0 .978-.47 1.843-1.195 2.39l.712.713A3.99 3.99 0 0 0 12 6a1 1 0 0 1 2 0a5.97 5.97 0 0 1-2.065 4.52l2.772 2.773a1 1 0 1 1-1.414 1.414l-12-12a1 1 0 1 1 1.414-1.414l2.318 2.318A3 3 0 0 1 8 1" />
            </svg>
          )}
        </button>
        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center">
          <Avatar
            src={currentCallAvatar}
            alt={currentCallName}
            className="w-7 h-7 object-cover"
            style={{ fontSize: '11px' }}
          />
        </div>
      </div>

      <div className="flex items-center ml-auto z-10 pr-4 relative">
        <button
          type="button"
          aria-label={t('call.hang_up')}
          onClick={(e) => {
            e.stopPropagation();
            endCall(false, 0);
            try {
              (window as any).orbita?.sendCallAction?.({ type: 'endCall', payload: { remainingRemotes: 0 } });
              (window as any).orbita?.closeCallWindow?.();
              const bc = new BroadcastChannel('orbita-call-channel');
              bc.postMessage({ type: 'CALL_ACTION', action: 'endCall', payload: { remainingRemotes: 0 } });
              setTimeout(() => { try { bc.close(); } catch {} }, 300);
            } catch {}
          }}
          className="w-9 h-9 bg-transparent border-0 outline-none p-0 cursor-pointer flex items-center justify-center text-white transition-all hover:scale-110 hover:text-red-400 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" className="w-[22px] h-[22px] text-white">
            <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
          </svg>
        </button>
      </div>
    </div>
  );
};
