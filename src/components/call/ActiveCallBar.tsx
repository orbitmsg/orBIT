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
  const smoothedVolumeRef = useRef(0.04);
  const timeRef = useRef(0);
  const accentRgbRef = useRef<[number, number, number]>([92, 84, 229]);
  const broadcastVolRef = useRef(0);
  const broadcastSpeakingRef = useRef(false);
  const lastBroadcastTimeRef = useRef(0);

  useEffect(() => {
    if (!isCallActive) return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('orbita-call-channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'CALL_REMOTE_AUDIO' && event.data.payload) {
          broadcastVolRef.current = Number(event.data.payload.volume) || 0;
          broadcastSpeakingRef.current = Boolean(event.data.payload.isSpeaking);
          lastBroadcastTimeRef.current = Date.now();
        }
      };
    } catch {}

    const unsubAction = (window as any).orbita?.onCallAction?.((action: any) => {
      if (action?.type === 'remoteAudio' && action.payload) {
        broadcastVolRef.current = Number(action.payload.volume) || 0;
        broadcastSpeakingRef.current = Boolean(action.payload.isSpeaking);
        lastBroadcastTimeRef.current = Date.now();
      }
    });

    return () => {
      if (bc) {
        try { bc.close(); } catch {}
      }
      if (typeof unsubAction === 'function') {
        try { unsubAction(); } catch {}
      }
    };
  }, [isCallActive]);

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
    if (!isCallActive || !callAnimationsEnabled) {
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
      streamRef.current = null;
      return;
    }

    let isCancelled = false;
    const isGroup = activeCall?.chatType === 'group';
    const svc = isGroup ? groupLiveKitService : liveKitService;

    const setupRemoteAnalyser = async () => {
      try {
        const remoteTrack = svc.getRemoteAudioTrack();
        const mediaTrack = remoteTrack?.mediaStreamTrack;
        if (!mediaTrack || mediaTrack.readyState === 'ended' || isCancelled) {
          return;
        }

        if (streamRef.current && streamRef.current.getAudioTracks()[0] === mediaTrack && analyserRef.current) {
          return;
        }

        const stream = new MediaStream([mediaTrack]);
        streamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtx();
        }
        const audioCtx = audioContextRef.current;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        if (mediaSourceRef.current) {
          try { mediaSourceRef.current.disconnect(); } catch {}
        }
        if (analyserRef.current) {
          try { analyserRef.current.disconnect(); } catch {}
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

    setupRemoteAnalyser();

    const onTrackSubscribed = () => {
      setupRemoteAnalyser();
    };

    svc.on('trackSubscribed', onTrackSubscribed);
    svc.on('participantsChanged', onTrackSubscribed);

    const checkInterval = setInterval(() => {
      if (!analyserRef.current && !isCancelled) {
        setupRemoteAnalyser();
      }
    }, 800);

    return () => {
      isCancelled = true;
      clearInterval(checkInterval);
      try { svc.off('trackSubscribed', onTrackSubscribed); } catch {}
      try { svc.off('participantsChanged', onTrackSubscribed); } catch {}
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
      streamRef.current = null;
    };
  }, [isCallActive, callAnimationsEnabled, activeCall?.chatType]);

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
        canvas.height = 24;
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
      wavePhase: number,
      colorRgb: [number, number, number],
      alpha: number
    ) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      const step = 4;
      for (let x = 0; x <= width; x += step) {
        const s1 = Math.sin(x * f1 + wavePhase);
        const s2 = Math.sin(x * f2 - wavePhase * 0.75 + 1.3);
        const norm = (s1 * 0.68 + s2 * 0.32 + 1) * 0.5;
        const elevation = Math.min(22, norm * amplitude);
        const y = baseline - elevation;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();

      const [r, g, b] = colorRgb;
      const grad = ctx.createLinearGradient(0, Math.max(0, baseline - 22), 0, height);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.70})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      ctx.fillStyle = grad;
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

      if (Date.now() - lastBroadcastTimeRef.current > 300) {
        broadcastVolRef.current = 0;
        broadcastSpeakingRef.current = false;
      }

      let localAnalyserVol = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(timeData);
        let maxDev = 0;
        for (let i = 0; i < timeData.length; i++) {
          const dev = Math.abs(timeData[i] - 128);
          if (dev > maxDev) maxDev = dev;
        }
        const timeVol = maxDev > 4 ? Math.min(1, (maxDev - 4) / 32) : 0;

        analyserRef.current.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        const avg = sum / freqData.length;
        const freqVol = avg > 4 ? Math.min(1, (avg - 4) / 28) : 0;

        localAnalyserVol = Math.max(timeVol, freqVol);
      }

      const remoteAudioVol = Math.max(broadcastVolRef.current, localAnalyserVol);
      const remoteSpeaking = broadcastSpeakingRef.current || !!activeCall?.participants?.some((p: any) => !p.isLocal && p.isSpeaking);
      const fallbackVol = remoteSpeaking ? 0.70 + Math.sin(timeRef.current * 6) * 0.25 : 0;
      const rawVol = Math.max(remoteAudioVol, fallbackVol);
      const targetVol = rawVol > 0.04 ? rawVol : 0;

      if (targetVol > smoothedVolumeRef.current) {
        smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.20;
      } else {
        smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.08;
      }

      timeRef.current += 0.022 + smoothedVolumeRef.current * 0.040;

      const phase = timeRef.current;
      const vol = smoothedVolumeRef.current;
      const baseline = 24;

      drawWaveLayer(ctx, width, height, baseline, 4 + vol * 13, 0.009, 0.018, phase * 0.7, accentRgbRef.current, 0.28);
      drawWaveLayer(ctx, width, height, baseline, 6 + vol * 15, 0.013, 0.025, phase * 0.95 + 1.8, accentRgbRef.current, 0.45);
      drawWaveLayer(ctx, width, height, baseline, 8 + vol * 17, 0.016, 0.030, phase * 1.2 + 3.6, accentRgbRef.current, 0.65);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, [isCallActive, callAnimationsEnabled, isAppVisible, activeCall]);

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
            height: '24px',
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
