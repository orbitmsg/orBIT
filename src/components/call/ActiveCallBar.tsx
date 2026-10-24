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
  const smoothedVolumeRef = useRef(0.08);
  const timeRef = useRef(0);
  const accentRgbRef = useRef<[number, number, number]>([92, 84, 229]);

  useEffect(() => {
    if (!barRef.current) return;
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
        const isGroup = activeCall?.chatType === 'group';
        const svc = isGroup ? groupLiveKitService : liveKitService;
        const localTrack = svc.getLocalAudioTrack();
        const mediaTrack = localTrack?.mediaStreamTrack;
        if (!mediaTrack || isCancelled) return;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        const stream = new MediaStream([mediaTrack]);
        const source = audioCtx.createMediaStreamSource(stream);
        mediaSourceRef.current = source;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.25;
        analyserRef.current = analyser;

        source.connect(analyser);
      } catch {}
    };

    setupMicAnalyser();

    return () => {
      isCancelled = true;
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
        canvas.height = 26;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const dataArray = new Uint8Array(32);

    const drawWave = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      amplitude: number,
      freq: number,
      phase: number,
      fillStyle: string
    ) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      const step = 8;
      for (let x = 0; x <= width; x += step) {
        const y = (height - 4) - amplitude * (Math.sin(x * freq + phase) * 0.72 + Math.sin(x * freq * 0.5 - phase * 0.75) * 0.28);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
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
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        micVol = Math.min(1, (sum / dataArray.length) / 70);
      }

      const remoteSpeaking = !!activeCall?.participants?.some((p: any) => !p.isLocal && p.isSpeaking);
      const remoteVol = remoteSpeaking ? 0.65 + Math.sin(timeRef.current * 7) * 0.25 : 0;
      const rawVol = Math.max(micVol, remoteVol);
      const targetVol = rawVol > 0.05 ? rawVol : 0.08;

      smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.14;
      timeRef.current += 0.035 + smoothedVolumeRef.current * 0.05;

      const phase = timeRef.current;
      const vol = smoothedVolumeRef.current;
      const [r, g, b] = accentRgbRef.current;

      drawWave(ctx, width, height, 4 + vol * 11, 0.009, phase * 0.85, `rgba(${r}, ${g}, ${b}, 0.28)`);
      drawWave(ctx, width, height, 5 + vol * 14, 0.015, phase * 1.25 + 2.1, `rgba(${r}, ${g}, ${b}, 0.45)`);
      drawWave(ctx, width, height, 6 + vol * 17, 0.021, phase * 1.65 + 4.2, `rgba(${r}, ${g}, ${b}, 0.70)`);

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
            top: '-20px',
            left: 0,
            width: '100%',
            height: '26px',
            pointerEvents: 'none',
            zIndex: 1,
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
