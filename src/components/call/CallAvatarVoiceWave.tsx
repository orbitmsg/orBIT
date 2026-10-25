import React, { useEffect, useRef } from 'react';
import { liveKitService } from '../../services/livekitService';
import { groupLiveKitService } from '../../services/groupLiveKitService';
import { useAppVisibility } from '../../utils/appVisibility';

interface CallAvatarVoiceWaveProps {
  isCallActive: boolean;
  isGroup?: boolean;
}

export const CallAvatarVoiceWave: React.FC<CallAvatarVoiceWaveProps> = ({
  isCallActive,
  isGroup = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smoothedVolumeRef = useRef(0.04);
  const isAppVisible = useAppVisibility();

  useEffect(() => {
    if (!isCallActive) {
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
    const svc = isGroup ? groupLiveKitService : liveKitService;

    const setupRemoteAnalyser = () => {
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
          audioCtx.resume().catch(() => {});
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
        analyser.smoothingTimeConstant = 0.3;
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

    const interval = setInterval(() => {
      if (!analyserRef.current && !isCancelled) {
        setupRemoteAnalyser();
      }
    }, 800);

    return () => {
      isCancelled = true;
      clearInterval(interval);
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
  }, [isCallActive, isGroup]);

  useEffect(() => {
    if (!isCallActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number | null = null;
    const freqData = new Uint8Array(32);
    const BAR_COUNT = 19;
    const BAR_WIDTH = 3.5;
    const GAP = 3.5;
    const TOTAL_WIDTH = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * GAP;

    canvas.width = Math.ceil(TOTAL_WIDTH);
    canvas.height = 24;

    const render = () => {
      if (!isAppVisible) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      let targetVol = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        const avg = sum / freqData.length;
        if (avg > 8) {
          targetVol = Math.min(1, (avg - 8) / 32);
        }
      }

      if (targetVol > smoothedVolumeRef.current) {
        smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.12;
      } else {
        smoothedVolumeRef.current += (targetVol - smoothedVolumeRef.current) * 0.05;
      }

      const vol = smoothedVolumeRef.current;
      const centerIdx = Math.floor(BAR_COUNT / 2);

      for (let i = 0; i < BAR_COUNT; i++) {
        const distFromCenter = Math.abs(i - centerIdx) / centerIdx;
        const bellCurve = Math.cos(distFromCenter * (Math.PI / 2));
        const freqIdx = Math.min(freqData.length - 1, Math.round((i / BAR_COUNT) * 16));
        const rawFreq = freqData[freqIdx] / 255;
        const dynamicH = Math.max(3, Math.min(h, 3 + (rawFreq * 0.7 + vol * 0.3) * bellCurve * (h - 3)));

        const x = i * (BAR_WIDTH + GAP);
        const y = (h - dynamicH) / 2;
        const radius = BAR_WIDTH / 2;

        ctx.fillStyle = `color-mix(in srgb, var(--accent-color, #7C3AED) ${Math.round(45 + vol * 55)}%, white)`;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, dynamicH, radius);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [isCallActive, isAppVisible]);

  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center select-none pointer-events-none mt-3.5 mb-1"
      style={{ height: '24px' }}
    >
      <canvas ref={canvasRef} style={{ width: '130px', height: '24px' }} />
    </div>
  );
};
