import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VideoOff, Maximize2, Minimize2 } from 'lucide-react';
import type { RemoteTrack } from 'livekit-client';
import { Avatar } from '../common/Avatar';
import { CallVerificationBadge } from './CallVerificationBadge';
import { TitleBar } from '../layout/TitleBar';
import { ScreenSharePickerModal } from './ScreenSharePickerModal';
import { liveKitService, type ParticipantInfo } from '../../services/livekitService';
import { groupLiveKitService } from '../../services/groupLiveKitService';
import { gatewayManager } from '../../services/gatewayManager';
import { callSoundService } from '../../services/callSoundService';
import { generateCallVerificationEmojis } from '../../lib/call-verification';
import { useChatStore, FONT_MAP, type FontFamily } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { SignalStrengthIcon } from './SignalStrengthIcon';

interface CallStatePayload {
  activeCall: {
    chatId: string;
    roomName: string;
    direction: 'incoming' | 'outgoing';
    callType: 'audio' | 'video';
    startTime: number;
    participants: any[];
    isMuted: boolean;
    verificationEmojis?: string[];
    otherName?: string;
    otherAvatar?: string | null;
    token?: string;
    url?: string;
    verificationSecret?: string;
    verificationSalt?: string;
    chatType?: 'private' | 'group' | 'channel' | 'bot';
    members?: any[];
  } | null;
  incomingCall: {
    from: string;
    chatId: string;
    callType: 'audio' | 'video';
    roomName: string;
    timestamp: number;
    otherName?: string;
    otherAvatar?: string | null;
  } | null;
  callState: 'idle' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';
  isMicEnabled: boolean;
  isVideoEnabled?: boolean;
  isScreenSharing?: boolean;
  duration: number;
  statusMessage: string;
  myNickname: string | null;
  myAvatar?: string | null;
  knownAvatars?: Record<string, string>;
  peerVolume?: number;
  micVolume?: number;
  noiseSuppressionMode?: 'krisp' | 'standard' | 'none';
}

import { GroupParticipantTile, ExpandedGroupParticipantTile } from './GroupParticipantTiles';
import { CallDualStreamView } from './CallDualStreamView';
import { CallWindowControls } from './CallWindowControls';

export const CallWindowView = () => {
  const { t } = useTranslation();
  const [callData, setCallData] = useState<CallStatePayload | null>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const nameParam = searchParams.get('name');
      if (nameParam) {
        const direction = (searchParams.get('direction') as any) || 'outgoing';
        const callType = (searchParams.get('type') as any) || 'audio';
        const chatId = searchParams.get('chatId') || '';
        const stateParam = (searchParams.get('state') as any) || 'preparing';
        const avatarParam = searchParams.get('avatar') || null;
        const chatType = (searchParams.get('chatType') as any) || (searchParams.get('roomName')?.startsWith('group-call-') ? 'group' : 'private');
        const roomName = searchParams.get('roomName') || (chatType === 'group' ? `group-call-${chatId}` : '');
        const verificationSecret = searchParams.get('secret') || undefined;
        const verificationSalt = searchParams.get('salt') || undefined;

        return {
          activeCall: {
            chatId,
            roomName,
            direction,
            callType,
            startTime: 0,
            participants: [],
            isMuted: false,
            otherName: nameParam,
            otherAvatar: avatarParam,
            chatType,
            verificationSecret,
            verificationSalt,
          },
          incomingCall: direction === 'incoming' ? {
            from: nameParam,
            chatId,
            callType,
            roomName: '',
            timestamp: Date.now(),
            otherName: nameParam,
            otherAvatar: avatarParam,
          } : null,
          callState: stateParam,
          isMicEnabled: true,
          duration: 0,
          statusMessage: '',
          myNickname: searchParams.get('myNickname') || useAuthStore.getState().nickname || null,
        };
      }
      const saved = sessionStorage.getItem('orbita_active_call_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.callState && parsed.callState !== 'idle' && parsed.callState !== 'ended') {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState<boolean>(false);
  const [isRemoteVideoActive, setIsRemoteVideoActive] = useState<boolean>(false);
  const [isRemoteScreenShareActive, setIsRemoteScreenShareActive] = useState<boolean>(false);
  const [isLocalScreenShareActive, setIsLocalScreenShareActive] = useState<boolean>(false);
  const [isLocalVideoActive, setIsLocalVideoActive] = useState<boolean>(false);
  const [expandedShare, setExpandedShare] = useState<'remote' | 'local' | null>(null);
  const [remoteConnectionQuality, setRemoteConnectionQuality] = useState<any>('excellent');

  const handleToggleMicRef = useRef<(() => Promise<void>) | null>(null);
  const handleHangupRef = useRef<((action: 'cancelCall' | 'endCall' | 'rejectCall') => Promise<void>) | null>(null);
  const micEnabledRef = useRef(true);

  useEffect(() => {
    const applyVars = (vars: Record<string, string>) => {
      const root = document.documentElement;
      Object.entries(vars).forEach(([key, val]) => {
        root.style.setProperty(key, val as string);
      });
    };

    const applyFont = (fontName: string) => {
      const fontVal = FONT_MAP[fontName as FontFamily] || FONT_MAP['system'];
      document.documentElement.style.setProperty('--main-font', fontVal);
      document.body.style.setProperty('--main-font', fontVal);
    };

    let initialFont = 'system';
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const fp = searchParams.get('font');
      if (fp) {
        initialFont = fp;
      } else {
        const currentFont = useChatStore.getState().fontFamily;
        if (currentFont) initialFont = currentFont;
      }
    } catch {}
    applyFont(initialFont);

    const bg = 'color-mix(in srgb, var(--accent-color, #7C3AED) 8%, var(--bg-primary, #14111d))';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    const orbita = (window as any).orbita;

    if (orbita?.getCurrentFont) {
      orbita.getCurrentFont().then((font: string) => {
        if (font) applyFont(font);
      }).catch(() => {});
    }

    const unsubFontChanged = orbita?.onFontChanged?.((font: string) => {
      if (font) applyFont(font);
    });

    if (orbita?.getCurrentTheme) {
      orbita.getCurrentTheme().then((themeData: any) => {
        if (themeData?.themeVars) {
          applyVars(themeData.themeVars);
        }
      }).catch(() => {});
    }

    const resetCallStateAndDisconnect = () => {
      setCallData(null);
      setIsLocalScreenShareActive(false);
      setIsRemoteScreenShareActive(false);
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setExpandedShare(null);
      setIsScreenPickerOpen(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteScreenShareRef.current) remoteScreenShareRef.current.srcObject = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (localScreenShareRef.current) localScreenShareRef.current.srcObject = null;
      if (bgVideoRef.current) bgVideoRef.current.srcObject = null;
      liveKitService.disconnect().catch(() => {});
      groupLiveKitService.disconnect().catch(() => {});
    };

    if (orbita?.getCallState) {
      orbita.getCallState().then((state: CallStatePayload | null) => {
        if (state && state.callState !== 'idle' && state.callState !== 'ended') {
          setCallData(state);
        } else {
          resetCallStateAndDisconnect();
        }
      }).catch(() => {});
    }

    const unsubState = orbita?.onCallState?.((state: CallStatePayload | null) => {
      if (state && state.callState !== 'idle' && state.callState !== 'ended') {
        setCallData(state);
      } else {
        resetCallStateAndDisconnect();
      }
    });

    const unsubCallAction = orbita?.onCallAction?.((action: any) => {
      const isGrp = callData?.activeCall?.chatType === 'group' ||
        Boolean(callData?.activeCall?.roomName?.startsWith('group-call-')) ||
        new URLSearchParams(window.location.search).get('chatType') === 'group';
      const svc = isGrp ? groupLiveKitService : liveKitService;
      if (action?.type === 'toggleMic') {
        const target = typeof action?.payload === 'boolean' ? action.payload : !micEnabledRef.current;
        micEnabledRef.current = target;
        setCallData((prev) => (prev ? { ...prev, isMicEnabled: target } : prev));
        if (target) {
          svc.enableMicrophone().catch(() => {});
        } else {
          svc.disableMicrophone().catch(() => {});
        }
      } else if (action?.type === 'setMicEnabled') {
        const target = !!action.payload;
        micEnabledRef.current = target;
        setCallData((prev) => (prev ? { ...prev, isMicEnabled: target } : prev));
        if (target) {
          svc.enableMicrophone().catch(() => {});
        } else {
          svc.disableMicrophone().catch(() => {});
        }
      } else if (action?.type === 'endCall' || action?.type === 'cancelCall') {
        handleHangupRef.current?.('endCall');
      }
    });

    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel('orbita-call-channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'CALL_STATE_UPDATE') {
          const payload = event.data.payload;
          if (payload && payload.callState !== 'idle' && payload.callState !== 'ended') {
            setCallData(payload);
          } else {
            resetCallStateAndDisconnect();
          }
        } else if (event.data?.type === 'CALL_ACTION') {
          const isGrp = callData?.activeCall?.chatType === 'group' ||
            Boolean(callData?.activeCall?.roomName?.startsWith('group-call-')) ||
            new URLSearchParams(window.location.search).get('chatType') === 'group';
          const svc = isGrp ? groupLiveKitService : liveKitService;
          if (event.data.action === 'toggleMic') {
            const target = typeof event.data?.payload === 'boolean' ? event.data.payload : !micEnabledRef.current;
            micEnabledRef.current = target;
            setCallData((prev) => (prev ? { ...prev, isMicEnabled: target } : prev));
            if (target) {
              svc.enableMicrophone().catch(() => {});
            } else {
              svc.disableMicrophone().catch(() => {});
            }
          } else if (event.data.action === 'setMicEnabled') {
            const target = !!event.data.payload;
            micEnabledRef.current = target;
            setCallData((prev) => (prev ? { ...prev, isMicEnabled: target } : prev));
            if (target) {
              svc.enableMicrophone().catch(() => {});
            } else {
              svc.disableMicrophone().catch(() => {});
            }
          } else if (event.data.action === 'endCall' || event.data.action === 'cancelCall') {
            handleHangupRef.current?.('endCall');
          }
        }
      };
    } catch {}

    const handleFocusSync = () => {
      if (orbita?.getCallState) {
        orbita.getCallState().then((state: CallStatePayload | null) => {
          if (state && state.callState !== 'idle' && state.callState !== 'ended') {
            setCallData(state);
          } else {
            resetCallStateAndDisconnect();
          }
        }).catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);

    const unsubThemeChanged = orbita?.onThemeChanged?.((data: any) => {
      if (data?.themeVars) {
        applyVars(data.themeVars);
      }
    });

    return () => {
      unsubFontChanged?.();
      unsubThemeChanged?.();
      unsubState?.();
      unsubCallAction?.();
      broadcastChannel?.close();
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
    };
  }, []);

  const sendAction = (type: string, payload?: any) => {
    const orbita = (window as any).orbita;
    if (orbita?.sendCallAction) {
      orbita.sendCallAction({ type, payload });
      return;
    }
    try {
      const bc = new BroadcastChannel('orbita-call-channel');
      bc.postMessage({ type: 'CALL_ACTION', action: type, payload });
      setTimeout(() => {
        try { bc.close(); } catch {}
      }, 500);
    } catch {}
  };

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenShareRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenShareRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  const attachRemoteScreenShare = useCallback((el: HTMLVideoElement | null) => {
    remoteScreenShareRef.current = el;
    if (el) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachLocalScreenShare = useCallback((el: HTMLVideoElement | null) => {
    localScreenShareRef.current = el;
    if (el) {
      const track = liveKitService.getScreenShareTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachLocalVideo = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) {
      const track = liveKitService.getLocalVideoTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachBgVideo = useCallback((el: HTMLVideoElement | null) => {
    bgVideoRef.current = el;
    if (el) {
      const rTrack = liveKitService.getRemoteVideoTrack();
      if (rTrack && !rTrack.isMuted) {
        rTrack.attach(el);
      }
    }
  }, []);

  useEffect(() => {
    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setHasCamera(false);
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasCamera(videoInputs.length > 0);
      } catch {
        setHasCamera(false);
      }
    };

    checkCameraAvailability();
    navigator.mediaDevices?.addEventListener?.('devicechange', checkCameraAvailability);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', checkCameraAvailability);
    };
  }, []);

  const activeCall = callData?.activeCall;
  const incomingCall = callData?.incomingCall;
  const callState = callData?.callState || 'idle';
  const isConnected = callState === 'connected';
  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isEnded = callState === 'ended';

  const isMicEnabled = callData?.isMicEnabled ?? true;
  micEnabledRef.current = isMicEnabled;
  const isVideoEnabled = callData?.isVideoEnabled ?? (activeCall?.callType === 'video');
  const isScreenSharing = (isConnected || isConnecting) && (callData?.isScreenSharing ?? false);
  const hasLocalScreenShare = (isConnected || isConnecting) && (isLocalScreenShareActive || isScreenSharing);
  const hasRemoteStream = isRemoteScreenShareActive || isRemoteVideoActive;
  const isDualStream = hasRemoteStream && hasLocalScreenShare;
  const hasAnyActiveStream = hasRemoteStream || hasLocalScreenShare;
  const duration = callData?.duration ?? 0;
  const statusMessage = callData?.statusMessage ?? '';

  useEffect(() => {
    if (expandedShare === 'remote' && !isRemoteVideoActive && !isRemoteScreenShareActive) {
      setExpandedShare(null);
    }
    if (expandedShare === 'local' && !isScreenSharing) {
      setExpandedShare(null);
    }
  }, [expandedShare, isRemoteVideoActive, isRemoteScreenShareActive, isScreenSharing]);

  const isIncoming = !!incomingCall || (activeCall?.direction === 'incoming' && callState === 'ringing');
  const otherName = activeCall?.otherName || incomingCall?.otherName || incomingCall?.from || activeCall?.chatId || '';
  const otherAvatar = activeCall?.otherAvatar || incomingCall?.otherAvatar || null;

  const isGroupCall = Boolean(
    callData?.activeCall
      ? (callData.activeCall.chatType === 'group' || callData.activeCall.roomName?.startsWith('group-call-'))
      : (callData?.incomingCall ? false : new URLSearchParams(window.location.search).get('chatType') === 'group')
  );

  const [groupParticipants, setGroupParticipants] = useState<ParticipantInfo[]>([]);
  const [expandedGroupParticipant, setExpandedGroupParticipant] = useState<ParticipantInfo | null>(null);

  const handleOpenChat = useCallback((participant: ParticipantInfo) => {
    if (participant.isLocal) return;
    const memberInfo = callData?.activeCall?.members?.find(
      (m: any) =>
        (m.userCode && (m.userCode === participant.identity || participant.identity.includes(m.userCode))) ||
        (m.user_code && (m.user_code === participant.identity || participant.identity.includes(m.user_code))) ||
        (m.userId && (m.userId === participant.identity || participant.identity.includes(m.userId))) ||
        (m.user_id && (m.user_id === participant.identity || participant.identity.includes(m.user_id)))
    );
    const candidateCodes = [
      memberInfo?.userCode,
      memberInfo?.user_code,
      memberInfo?.userId,
      memberInfo?.user_id,
      participant.identity,
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);
    const target36 = candidateCodes.find((c) => c.length === 36);
    const targetCode = target36 || candidateCodes[0] || participant.identity;
    const targetName = participant.name || memberInfo?.nickname || participant.identity;
    const targetAvatar = memberInfo?.avatarUrl || memberInfo?.avatar_url || null;

    sendAction('openChat', {
      peerCode: targetCode,
      name: targetName,
      avatarUrl: targetAvatar,
    });
    try {
      (window as any).orbita?.showWindow?.();
    } catch {}
    try {
      const bc = new BroadcastChannel('orbita-call-channel');
      bc.postMessage({
        type: 'CALL_ACTION',
        action: 'openChat',
        payload: {
          peerCode: targetCode,
          name: targetName,
          avatarUrl: targetAvatar,
        },
      });
      setTimeout(() => { try { bc.close(); } catch {} }, 500);
    } catch {}
  }, [callData?.activeCall?.members]);

  useEffect(() => {
    if (!isConnected || !isGroupCall) return;
    const updateList = () => {
      setGroupParticipants(groupLiveKitService.getParticipants());
    };
    updateList();
    groupLiveKitService.on('participantsChanged', updateList);
    groupLiveKitService.on('activeSpeakersChanged', updateList);
    groupLiveKitService.on('trackSubscribed', updateList);
    groupLiveKitService.on('trackUnsubscribed', updateList);
    groupLiveKitService.on('trackMuted', updateList);
    groupLiveKitService.on('trackUnmuted', updateList);
    groupLiveKitService.on('cameraChanged', updateList);
    groupLiveKitService.on('screenShareChanged', updateList);
    groupLiveKitService.on('remoteScreenShareChanged', updateList);
    return () => {
      groupLiveKitService.off('participantsChanged', updateList);
      groupLiveKitService.off('activeSpeakersChanged', updateList);
      groupLiveKitService.off('trackSubscribed', updateList);
      groupLiveKitService.off('trackUnsubscribed', updateList);
      groupLiveKitService.off('trackMuted', updateList);
      groupLiveKitService.off('trackUnmuted', updateList);
      groupLiveKitService.off('cameraChanged', updateList);
      groupLiveKitService.off('screenShareChanged', updateList);
      groupLiveKitService.off('remoteScreenShareChanged', updateList);
    };
  }, [isConnected, isGroupCall]);

  useEffect(() => {
    if (!isConnected) return;
    const svc = isGroupCall ? groupLiveKitService : liveKitService;
    let isCancelled = false;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let mediaSource: MediaStreamAudioSourceNode | null = null;
    let currentTrack: MediaStreamTrack | null = null;
    const timeData = new Uint8Array(64);
    const freqData = new Uint8Array(32);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('orbita-call-channel');
    } catch {}

    const setupAudio = () => {
      try {
        const rTrack = svc.getRemoteAudioTrack();
        const mTrack = rTrack?.mediaStreamTrack;
        if (!mTrack || mTrack.readyState === 'ended' || isCancelled) return;
        if (currentTrack === mTrack && analyser) return;
        currentTrack = mTrack;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioCtx();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        if (mediaSource) {
          try { mediaSource.disconnect(); } catch {}
        }
        if (analyser) {
          try { analyser.disconnect(); } catch {}
        }
        const stream = new MediaStream([mTrack]);
        mediaSource = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.2;
        mediaSource.connect(analyser);
      } catch {}
    };

    setupAudio();
    svc.on('trackSubscribed', setupAudio);

    const interval = setInterval(() => {
      if (isCancelled) return;
      if (!analyser) {
        setupAudio();
      }
      let vol = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(timeData);
        let maxDev = 0;
        for (let i = 0; i < timeData.length; i++) {
          const dev = Math.abs(timeData[i] - 128);
          if (dev > maxDev) maxDev = dev;
        }
        const timeVol = Math.min(1, maxDev / 120);
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        const avg = sum / freqData.length;
        const freqVol = Math.min(1, avg / 100);
        vol = Math.max(timeVol, freqVol);
      }

      const participants = svc.getParticipants() || [];
      const pLevels = participants
        .filter((p: any) => !p.isLocal)
        .map((p: any) => (typeof p.audioLevel === 'number' ? p.audioLevel : 0));
      const maxPLevel = pLevels.length > 0 ? Math.max(0, ...pLevels) : 0;
      vol = Math.max(vol, maxPLevel);

      const remoteSpeaking = participants.some((p: any) => !p.isLocal && p.isSpeaking);
      const isSpeaking = remoteSpeaking || vol > 0.15;

      const payload = { volume: vol, isSpeaking };
      if (channel) {
        try {
          channel.postMessage({ type: 'CALL_REMOTE_AUDIO', payload });
        } catch {}
      }
      try {
        (window as any).orbita?.sendCallAction?.({ type: 'remoteAudio', payload });
      } catch {}
    }, 40);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      try { svc.off('trackSubscribed', setupAudio); } catch {}
      if (mediaSource) {
        try { mediaSource.disconnect(); } catch {}
      }
      if (analyser) {
        try { analyser.disconnect(); } catch {}
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      if (channel) {
        try { channel.close(); } catch {}
      }
    };
  }, [isConnected, isGroupCall]);

  useEffect(() => {
    const onQuality = (quality: any) => {
      setRemoteConnectionQuality(quality);
    };
    liveKitService.on('connectionQuality', onQuality);
    return () => {
      liveKitService.off('connectionQuality', onQuality);
    };
  }, []);

  const allGroupParticipants = useMemo(() => {
    if (groupParticipants.length > 0) return groupParticipants;
    return [{
      identity: callData?.myNickname || 'local',
      name: callData?.myNickname || otherName || 'Вы',
      audioEnabled: isMicEnabled,
      videoEnabled: isVideoEnabled,
      screenShareEnabled: isLocalScreenShareActive,
      isSpeaking: false,
      isLocal: true,
    }];
  }, [groupParticipants, callData?.myNickname, otherName, isMicEnabled, isVideoEnabled, isLocalScreenShareActive]);

  const formatParticipantsCount = useCallback((count: number) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 19) {
      return t('call.participants_other', { count, defaultValue: `${count} участников` });
    }
    if (mod10 === 1) {
      return t('call.participants_1', { count, defaultValue: `${count} участник` });
    }
    if (mod10 >= 2 && mod10 <= 4) {
      return t('call.participants_2_4', { count, defaultValue: `${count} участника` });
    }
    return t('call.participants_other', { count, defaultValue: `${count} участников` });
  }, [t]);

  useEffect(() => {
    if (expandedGroupParticipant) {
      const current = allGroupParticipants.find((p) => p.identity === expandedGroupParticipant.identity);
      if (!current) {
        setExpandedGroupParticipant(null);
      } else if (current !== expandedGroupParticipant) {
        setExpandedGroupParticipant(current);
      }
    }
  }, [allGroupParticipants, expandedGroupParticipant]);

  const connectTimeRef = useRef<number>(0);
  useEffect(() => {
    if (isConnected) {
      connectTimeRef.current = Date.now();
    }
  }, [isConnected]);

  const lastSoundTimesRef = useRef<Record<string, number>>({});
  const playMediaSound = useCallback((type: 'screen' | 'camera' | 'mic', enabled: boolean, identity?: string) => {
    if (!isConnected) return;
    if (enabled && (type === 'mic' || type === 'camera') && Date.now() - connectTimeRef.current < 2000) {
      return;
    }
    const key = `${type}_${enabled}_${identity || 'local'}`;
    const now = Date.now();
    if (lastSoundTimesRef.current[key] && now - lastSoundTimesRef.current[key] < 800) {
      return;
    }
    lastSoundTimesRef.current[key] = now;
    if (type === 'mic') {
      callSoundService.play(enabled ? 'unmute' : 'mute');
    } else {
      callSoundService.play(enabled ? 'stream_started' : 'stream_is_over');
    }
  }, [isConnected]);

  const playMediaSoundRef = useRef(playMediaSound);
  useEffect(() => {
    playMediaSoundRef.current = playMediaSound;
  }, [playMediaSound]);

  const currentRoomName = activeCall?.roomName;
  const prevRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentRoomName !== prevRoomRef.current) {
      prevRoomRef.current = currentRoomName || null;
      setIsLocalScreenShareActive(false);
      setIsRemoteScreenShareActive(false);
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setExpandedShare(null);
      setIsScreenPickerOpen(false);
      setLocalDuration(0);
      try {
        void liveKitService.stopScreenShare();
      } catch {}
    }
  }, [currentRoomName]);

  useEffect(() => {
    if (!isConnected && !isConnecting) {
      setIsLocalScreenShareActive(false);
      setIsRemoteScreenShareActive(false);
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setExpandedShare(null);
      setIsScreenPickerOpen(false);
      try {
        void liveKitService.stopScreenShare();
      } catch {}
    }
  }, [isConnected, isConnecting]);

  const handleHangupOrCancel = async (action: 'cancelCall' | 'endCall' | 'rejectCall') => {
    const svc = isGroupCall ? groupLiveKitService : liveKitService;
    try {
      await svc.stopScreenShare();
    } catch {}
    const remainingRemotes = svc.remoteParticipants.length;
    try {
      await liveKitService.disconnect();
    } catch {}
    try {
      await groupLiveKitService.disconnect();
    } catch {}
    setIsLocalScreenShareActive(false);
    setIsRemoteScreenShareActive(false);
    setIsRemoteVideoActive(false);
    setIsLocalVideoActive(false);
    setExpandedShare(null);
    setIsScreenPickerOpen(false);
    setLocalDuration(0);
    setCallData(null);
    sendAction(action, { remainingRemotes });
    if (action === 'cancelCall' || action === 'rejectCall') {
      try { (window as any).orbita?.closeCallWindow?.(); } catch {}
    }
  };

  const [localDuration, setLocalDuration] = useState<number>(0);

  useEffect(() => {
    if (!isConnected) {
      setLocalDuration(duration);
      return;
    }
    const start = activeCall?.startTime && activeCall.startTime > 0 ? activeCall.startTime : Date.now();
    const tick = () => {
      setLocalDuration(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isConnected, activeCall?.startTime, duration]);

  useEffect(() => {
    if (!activeCall) return;
    const isShouldConnect = callState === 'connected' || callState === 'connecting' || (callState === 'ringing' && activeCall.direction === 'outgoing');
    if (!isShouldConnect) return;
    const isGrp = activeCall.chatType === 'group' || activeCall.roomName?.startsWith('group-call-');
    const svc = isGrp ? groupLiveKitService : liveKitService;
    if (svc.isConnected || svc.isCurrentlyConnecting) {
      if (svc.isConnected && (isGrp || svc.remoteParticipants.length > 0)) {
        sendAction('activateConnected');
      }
      return;
    }

    let cancelled = false;
    const doConnect = async () => {
      try {
        if (svc.isConnected || svc.isCurrentlyConnecting) return;
        const roomName = activeCall.roomName;
        const myNick = callData?.myNickname || useAuthStore.getState().nickname || 'User';
        const sessionKey = activeCall.verificationSecret
          ? (activeCall.verificationSalt ? `${activeCall.verificationSecret}:${activeCall.verificationSalt}` : activeCall.verificationSecret)
          : undefined;

        let token = activeCall.token;
        let url = activeCall.url;
        if (!token || !url) {
          const myUserId = useAuthStore.getState().userId || null;
          const uniqueTag = myUserId || Math.random().toString(36).slice(2, 8);
          const endpoint = '/token';
          const sessionNonce = Math.random().toString(36).slice(2, 6);
          const identity = `${myNick}_${uniqueTag}_${sessionNonce}`;
          const res = await gatewayManager.fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: roomName, identity, name: myNick }),
          });
          if (res.ok) {
            const data = await res.json();
            token = data.token;
            url = data.url;
          }
        }
        if (!url || url.includes('fewfregfrtgtr') || !url.startsWith('wss://')) {
          url = 'wss://orbita-qd7zok2r.livekit.cloud';
        }
        if (cancelled || !token || !url) return;
        if (svc.isConnected || svc.isCurrentlyConnecting) return;
        if (micEnabledRef.current) {
          void svc.enableMicrophone();
        }
        await svc.connect(roomName, token, url, sessionKey);
        if (micEnabledRef.current) {
          await svc.enableMicrophone();
        } else {
          await svc.disableMicrophone();
        }
        if (isVideoEnabled) {
          await svc.enableCamera();
        }
        if (isGrp || svc.remoteParticipants.length > 0) {
          sendAction('activateConnected');
        }
      } catch {}
    };

    doConnect();

    return () => {
      cancelled = true;
    };
  }, [activeCall?.roomName, activeCall?.token]);

  useEffect(() => {
    if (activeCall && !activeCall.verificationEmojis && activeCall.verificationSecret && activeCall.verificationSalt) {
      generateCallVerificationEmojis(activeCall.verificationSecret + activeCall.verificationSalt)
        .then((emojis) => {
          if (emojis && emojis.length === 4) {
            setCallData((prev) => prev?.activeCall ? {
              ...prev,
              activeCall: { ...prev.activeCall, verificationEmojis: emojis }
            } : prev);
          }
        })
        .catch(() => {});
    }
  }, [activeCall?.verificationSecret, activeCall?.verificationSalt, activeCall?.verificationEmojis]);

  useEffect(() => {
    if (isRemoteScreenShareActive && remoteScreenShareRef.current) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) {
        track.attach(remoteScreenShareRef.current);
      }
    }
    if (hasLocalScreenShare && localScreenShareRef.current) {
      const track = liveKitService.getScreenShareTrack();
      if (track) {
        track.attach(localScreenShareRef.current);
      }
    }
    if (isLocalVideoActive && localVideoRef.current) {
      const track = liveKitService.getLocalVideoTrack();
      if (track) {
        track.attach(localVideoRef.current);
      }
    }
    if (isRemoteVideoActive && remoteVideoRef.current) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) {
        track.attach(remoteVideoRef.current);
      }
    }
  }, [isRemoteScreenShareActive, hasLocalScreenShare, isLocalVideoActive, isRemoteVideoActive, isDualStream, expandedShare]);

  useEffect(() => {
    if (!bgVideoRef.current) return;
    if (isRemoteScreenShareActive) {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack) sTrack.attach(bgVideoRef.current);
    } else if (isRemoteVideoActive) {
      const rTrack = liveKitService.getRemoteVideoTrack();
      if (rTrack) rTrack.attach(bgVideoRef.current);
    }
  }, [isRemoteScreenShareActive, isRemoteVideoActive]);

  useEffect(() => {
    if (!isConnected) {
      setIsRemoteVideoActive(false);
      setIsRemoteScreenShareActive(false);
      return;
    }
    const sTrack = liveKitService.getRemoteScreenShareTrack();
    if (sTrack && !sTrack.isMuted) {
      setIsRemoteScreenShareActive(true);
      if (remoteScreenShareRef.current) sTrack.attach(remoteScreenShareRef.current);
      if (bgVideoRef.current) sTrack.attach(bgVideoRef.current);
    }
    const rTrack = liveKitService.getRemoteVideoTrack();
    if (rTrack && !rTrack.isMuted) {
      setIsRemoteVideoActive(true);
      if (remoteVideoRef.current) rTrack.attach(remoteVideoRef.current);
      if (bgVideoRef.current && (!sTrack || sTrack.isMuted)) rTrack.attach(bgVideoRef.current);
    }
  }, [isConnected]);

  useEffect(() => {
    const handleTrackSubscribed = (track: RemoteTrack) => {
      sendAction('activateConnected');
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          setIsRemoteScreenShareActive(true);
          if (remoteScreenShareRef.current) {
            track.attach(remoteScreenShareRef.current);
          }
          if (bgVideoRef.current) {
            track.attach(bgVideoRef.current);
          }
        } else {
          setIsRemoteVideoActive(true);
          if (remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
          if (bgVideoRef.current && !liveKitService.getRemoteScreenShareTrack()) {
            track.attach(bgVideoRef.current);
          }
        }
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          setIsRemoteScreenShareActive(false);
          if (remoteScreenShareRef.current) {
            track.detach(remoteScreenShareRef.current);
          }
          if (bgVideoRef.current) {
            track.detach(bgVideoRef.current);
            const rTrack = liveKitService.getRemoteVideoTrack();
            if (rTrack && !rTrack.isMuted) {
              rTrack.attach(bgVideoRef.current);
            }
          }
        } else {
          setIsRemoteVideoActive(false);
          if (remoteVideoRef.current) {
            track.detach(remoteVideoRef.current);
          }
          if (bgVideoRef.current && !liveKitService.getRemoteScreenShareTrack()) {
            track.detach(bgVideoRef.current);
          }
        }
      }
    };

    const handleCameraChanged = (enabled: boolean, track: any) => {
      setIsLocalVideoActive(enabled);
      if (enabled) {
        const tr = track || liveKitService.getLocalVideoTrack();
        if (tr && localVideoRef.current) {
          tr.attach(localVideoRef.current);
        }
      }
      playMediaSoundRef.current('camera', enabled, 'local');
    };

    const handleRemoteCameraChanged = (enabled: boolean, _track?: any, identity?: string) => {
      playMediaSoundRef.current('camera', enabled, identity);
    };

    const handleScreenShareChanged = (enabled: boolean, track: any) => {
      setIsLocalScreenShareActive(enabled);
      if (enabled && track && localScreenShareRef.current) {
        track.attach(localScreenShareRef.current);
      }
      sendAction('syncMediaState', { isScreenSharing: enabled });
      playMediaSoundRef.current('screen', enabled, 'local');
    };

    const handleRemoteScreenShareChanged = (active: boolean, track: any, identity?: string) => {
      setIsRemoteScreenShareActive(active);
      if (active && track) {
        if (remoteScreenShareRef.current) track.attach(remoteScreenShareRef.current);
        if (bgVideoRef.current) track.attach(bgVideoRef.current);
      } else if (!active && bgVideoRef.current) {
        const rTrack = liveKitService.getRemoteVideoTrack();
        if (rTrack && !rTrack.isMuted) rTrack.attach(bgVideoRef.current);
      }
      playMediaSoundRef.current('screen', active, identity);
    };

    const handleConnected = () => {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack && !sTrack.isMuted) {
        setIsRemoteScreenShareActive(true);
        if (remoteScreenShareRef.current) sTrack.attach(remoteScreenShareRef.current);
        if (bgVideoRef.current) sTrack.attach(bgVideoRef.current);
      }
      const rTrack = liveKitService.getRemoteVideoTrack();
      if (rTrack && !rTrack.isMuted) {
        setIsRemoteVideoActive(true);
        if (remoteVideoRef.current) rTrack.attach(remoteVideoRef.current);
        if (bgVideoRef.current && (!sTrack || sTrack.isMuted)) rTrack.attach(bgVideoRef.current);
      }
      if (micEnabledRef.current) {
        const svc = isGroupCall ? groupLiveKitService : liveKitService;
        svc.enableMicrophone().catch(() => {});
      }
      if (liveKitService.remoteParticipants.length > 0) {
        sendAction('activateConnected');
      }
    };

    const handleParticipantJoined = () => {
      sendAction('activateConnected');
    };

    const handleMicChanged = (enabled: boolean) => {
      micEnabledRef.current = enabled;
      setCallData((prev) => (prev ? { ...prev, isMicEnabled: enabled } : prev));
      sendAction('toggleMic', enabled);
      playMediaSoundRef.current('mic', enabled, 'local');
    };

    const handleRemoteMicChanged = (enabled: boolean, identity?: string) => {
      playMediaSoundRef.current('mic', enabled, identity);
    };

    liveKitService.on('trackSubscribed', handleTrackSubscribed);
    liveKitService.on('trackUnsubscribed', handleTrackUnsubscribed);
    liveKitService.on('cameraChanged', handleCameraChanged);
    liveKitService.on('remoteCameraChanged', handleRemoteCameraChanged);
    liveKitService.on('screenShareChanged', handleScreenShareChanged);
    liveKitService.on('remoteScreenShareChanged', handleRemoteScreenShareChanged);
    liveKitService.on('connected', handleConnected);
    liveKitService.on('participantJoined', handleParticipantJoined);
    liveKitService.on('micChanged', handleMicChanged);
    liveKitService.on('remoteMicChanged', handleRemoteMicChanged);

    groupLiveKitService.on('trackSubscribed', handleTrackSubscribed);
    groupLiveKitService.on('trackUnsubscribed', handleTrackUnsubscribed);
    groupLiveKitService.on('cameraChanged', handleCameraChanged);
    groupLiveKitService.on('remoteCameraChanged', handleRemoteCameraChanged);
    groupLiveKitService.on('screenShareChanged', handleScreenShareChanged);
    groupLiveKitService.on('remoteScreenShareChanged', handleRemoteScreenShareChanged);
    groupLiveKitService.on('connected', handleConnected);
    groupLiveKitService.on('participantJoined', handleParticipantJoined);
    groupLiveKitService.on('micChanged', handleMicChanged);
    groupLiveKitService.on('remoteMicChanged', handleRemoteMicChanged);

    if (liveKitService.isConnected || groupLiveKitService.isConnected) {
      handleConnected();
    }

    return () => {
      liveKitService.off('trackSubscribed', handleTrackSubscribed);
      liveKitService.off('trackUnsubscribed', handleTrackUnsubscribed);
      liveKitService.off('cameraChanged', handleCameraChanged);
      liveKitService.off('remoteCameraChanged', handleRemoteCameraChanged);
      liveKitService.off('screenShareChanged', handleScreenShareChanged);
      liveKitService.off('remoteScreenShareChanged', handleRemoteScreenShareChanged);
      liveKitService.off('connected', handleConnected);
      liveKitService.off('participantJoined', handleParticipantJoined);
      liveKitService.off('micChanged', handleMicChanged);
      liveKitService.off('remoteMicChanged', handleRemoteMicChanged);

      groupLiveKitService.off('trackSubscribed', handleTrackSubscribed);
      groupLiveKitService.off('trackUnsubscribed', handleTrackUnsubscribed);
      groupLiveKitService.off('cameraChanged', handleCameraChanged);
      groupLiveKitService.off('remoteCameraChanged', handleRemoteCameraChanged);
      groupLiveKitService.off('screenShareChanged', handleScreenShareChanged);
      groupLiveKitService.off('remoteScreenShareChanged', handleRemoteScreenShareChanged);
      groupLiveKitService.off('connected', handleConnected);
      groupLiveKitService.off('participantJoined', handleParticipantJoined);
      groupLiveKitService.off('micChanged', handleMicChanged);
      groupLiveKitService.off('remoteMicChanged', handleRemoteMicChanged);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (remoteVideoRef.current) {
        try { liveKitService.getRemoteVideoTrack()?.detach(remoteVideoRef.current); } catch {}
      }
      if (remoteScreenShareRef.current) {
        try { liveKitService.getRemoteScreenShareTrack()?.detach(remoteScreenShareRef.current); } catch {}
      }
      if (localVideoRef.current) {
        try { liveKitService.getLocalVideoTrack()?.detach(localVideoRef.current); } catch {}
      }
      if (localScreenShareRef.current) {
        try { liveKitService.getScreenShareTrack()?.detach(localScreenShareRef.current); } catch {}
      }
      liveKitService.disconnect().catch(() => {});
      groupLiveKitService.disconnect().catch(() => {});
    };
  }, []);

  const handleToggleMic = async () => {
    const next = !isMicEnabled;
    micEnabledRef.current = next;
    setCallData((prev) => (prev ? { ...prev, isMicEnabled: next } : prev));
    const svc = isGroupCall ? groupLiveKitService : liveKitService;
    if (next) {
      await svc.enableMicrophone();
    } else {
      await svc.disableMicrophone();
    }
    sendAction('toggleMic', next);
  };

  handleToggleMicRef.current = handleToggleMic;
  handleHangupRef.current = handleHangupOrCancel;

  const prevMicRef = useRef(isMicEnabled);
  useEffect(() => {
    const svc = isGroupCall ? groupLiveKitService : liveKitService;
    if (prevMicRef.current !== isMicEnabled && svc.isConnected) {
      prevMicRef.current = isMicEnabled;
      if (isMicEnabled) {
        svc.enableMicrophone().catch(() => {});
      } else {
        svc.disableMicrophone().catch(() => {});
      }
    }
  }, [isMicEnabled, isGroupCall]);

  const handleToggleVideo = async () => {
    const next = !isVideoEnabled;
    setCallData((prev) => (prev ? { ...prev, isVideoEnabled: next } : prev));
    const svc = isGroupCall ? groupLiveKitService : liveKitService;
    if (next) {
      await svc.enableCamera();
    } else {
      await svc.disableCamera();
    }
    sendAction('toggleVideo', next);
  };

  const handleToggleScreenShare = async () => {
    const svc = isGroupCall ? groupLiveKitService : liveKitService;
    if (hasLocalScreenShare) {
      await svc.stopScreenShare();
      setIsLocalScreenShareActive(false);
      setCallData((prev) => (prev ? { ...prev, isScreenSharing: false } : prev));
      sendAction('stopScreenShare');
      sendAction('syncMediaState', { isScreenSharing: false });
    } else {
      setIsScreenPickerOpen(true);
    }
  };

  const formatDuration = (seconds: number) => {
    const totalSecs = Math.max(0, Math.floor(seconds));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isRemoteVideoActive && !isRemoteScreenShareActive && bgVideoRef.current) {
      const rTrack = liveKitService.getRemoteVideoTrack();
      if (rTrack && !rTrack.isMuted) {
        rTrack.attach(bgVideoRef.current);
      }
    } else if (bgVideoRef.current && bgVideoRef.current.srcObject) {
      bgVideoRef.current.srcObject = null;
    }
  }, [isRemoteVideoActive, isRemoteScreenShareActive]);

  if (!callData || callData.callState === 'idle' || callData.callState === 'ended') {
    return (
      <div
        className="fixed inset-0 w-full h-full overflow-hidden select-none"
        style={{
          backgroundColor: 'var(--bg-primary, #14111d)',
          userSelect: 'none',
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 w-full h-full flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-main, #ffffff)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ['--title-bar-bg' as any]: 'transparent',
      }}
    >
      {isRemoteVideoActive && !isRemoteScreenShareActive && (
        <div
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
          style={{ contain: 'strict' }}
        >
          <video
            ref={attachBgVideo}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover pointer-events-none"
            style={{
              filter: 'blur(16px)',
              transform: 'scale(1.05) translate3d(0, 0, 0)',
              willChange: 'transform',
              opacity: 0.3,
              backfaceVisibility: 'hidden',
            }}
          />
          <div className="absolute inset-0 bg-black/45 pointer-events-none" />
        </div>
      )}

      <div className="relative z-50">
        <TitleBar hideTitle />
      </div>

      <div className="flex items-center justify-center flex-shrink-0 relative z-30 py-1">
        {isConnected && !isGroupCall && activeCall?.verificationEmojis && activeCall.verificationEmojis.length === 4 && (
          <div className="flex items-stretch" style={{ gap: '10px' }}>
            <CallVerificationBadge emojis={activeCall.verificationEmojis} />
            <div
              className="inline-flex items-center justify-center px-3 rounded-full shadow-md"
              style={{
                backgroundColor: 'var(--surface-muted, rgba(255, 255, 255, 0.08))',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <SignalStrengthIcon level={remoteConnectionQuality} size={17} />
            </div>
          </div>
        )}
        {isConnected && isGroupCall && (
          <div
            className="relative inline-flex flex-col items-center justify-center select-none px-4 py-1.5 rounded-full shadow-md"
            style={{
              backgroundColor: 'var(--surface-muted, rgba(255, 255, 255, 0.08))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 9999,
              minHeight: 46,
              minWidth: 140,
            }}
          >
            <div className="text-xs font-semibold text-white/90 truncate max-w-[200px] leading-tight text-center">
              {(useChatStore.getState().chats || []).find((c) => c.id === activeCall?.chatId)?.name || otherName || t('call.group_call')}
            </div>
            <div className="text-[11px] font-medium text-white/75 leading-tight text-center mt-0.5 flex items-center justify-center gap-1.5">
              <span>{formatParticipantsCount(allGroupParticipants.length)}</span>
              <span className="text-white/40">·</span>
              <span className="font-mono text-white/60">{formatDuration(localDuration > 0 ? localDuration : duration)}</span>
            </div>
          </div>
        )}
      </div>

      {!isGroupCall && isLocalVideoActive && (
        <div className="absolute top-12 right-5 z-40 w-32 h-44 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl bg-black/70 border-0 select-none">
          <video
            ref={attachLocalVideo}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-semibold text-white/90">
            {t('call.you')}
          </div>
        </div>
      )}

      {isVideoEnabled && !hasCamera && (
        <div className="absolute top-12 right-5 z-40 w-44 h-32 rounded-2xl shadow-2xl bg-black/80 backdrop-blur-md p-3 flex flex-col items-center justify-center text-center border-0 select-none">
          <VideoOff size={24} className="text-amber-400 mb-1.5" />
          <span className="text-[12px] font-medium text-white/90 leading-snug">
            {t('call.no_camera_available')}
          </span>
        </div>
      )}

      <div className="flex flex-col items-center justify-center flex-1 py-2 z-10 w-full relative min-h-0 overflow-hidden">
        {isGroupCall ? (
          expandedGroupParticipant ? (
            <div className="fixed inset-0 z-40 bg-black flex items-center justify-center p-3 sm:p-5 select-none">
              <div className="relative w-full h-full flex items-center justify-center">
                <ExpandedGroupParticipantTile
                  participant={expandedGroupParticipant}
                  chatMembers={callData?.activeCall?.members}
                  isLocalVideoActive={isLocalVideoActive}
                  isScreenSharing={isLocalScreenShareActive}
                  isMicEnabled={isMicEnabled}
                  myAvatar={callData?.myAvatar}
                  knownAvatars={callData?.knownAvatars}
                  onAvatarClick={handleOpenChat}
                />
                <button
                  type="button"
                  onClick={() => setExpandedGroupParticipant(null)}
                  aria-label={t('call.exit_fullscreen')}
                  className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
                >
                  <Minimize2 size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex-1 flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4 min-h-0 overflow-y-auto custom-scrollbar">
              <div className={`grid gap-3 sm:gap-4 w-full mx-auto items-center justify-center py-2 ${
                allGroupParticipants.length <= 1 ? 'grid-cols-1 max-w-xl' :
                allGroupParticipants.length <= 4 ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl' :
                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl'
              }`}>
                {allGroupParticipants.map((p) => (
                  <GroupParticipantTile
                    key={p.identity}
                    participant={p}
                    chatMembers={callData?.activeCall?.members}
                    isLocalVideoActive={isLocalVideoActive}
                    isScreenSharing={isLocalScreenShareActive}
                    isMicEnabled={isMicEnabled}
                    myAvatar={callData?.myAvatar}
                    knownAvatars={callData?.knownAvatars}
                    onTileClick={(part) => setExpandedGroupParticipant(part)}
                    onAvatarClick={handleOpenChat}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <>
            {isDualStream ? (
              <CallDualStreamView
                expandedShare={expandedShare}
                setExpandedShare={setExpandedShare}
                isRemoteScreenShareActive={isRemoteScreenShareActive}
                isRemoteVideoActive={isRemoteVideoActive}
                otherName={otherName}
                attachRemoteScreenShare={attachRemoteScreenShare}
                attachRemoteVideo={attachRemoteVideo}
                attachLocalScreenShare={attachLocalScreenShare}
              />
            ) : hasRemoteStream ? (
          <div
            onClick={() => setExpandedShare(expandedShare === 'remote' ? null : 'remote')}
            className={`relative z-20 cursor-pointer overflow-hidden transition-all duration-300 flex items-center justify-center bg-black ${
              expandedShare === 'remote'
                ? 'fixed inset-0 z-40 rounded-none w-full h-full max-w-none max-h-none p-3 sm:p-5'
                : 'w-[86%] max-w-[760px] aspect-video rounded-3xl max-h-[55vh]'
            }`}
            style={{
              borderRadius: expandedShare === 'remote' ? 0 : '24px',
            }}
          >
            <video
              ref={attachRemoteScreenShare}
              autoPlay
              playsInline
              muted
              className="w-full h-full max-w-full max-h-full object-contain"
              style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
            />
            <video
              ref={attachRemoteVideo}
              autoPlay
              playsInline
              muted
              className={`w-full h-full max-w-full max-h-full ${expandedShare === 'remote' ? 'object-contain' : 'object-cover'}`}
              style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedShare(expandedShare === 'remote' ? null : 'remote');
              }}
              aria-label={expandedShare === 'remote' ? t('call.exit_fullscreen') : t('call.fullscreen')}
              className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
            >
              {expandedShare === 'remote' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none">
              {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
            </div>
          </div>
        ) : hasLocalScreenShare ? (
          <div
            onClick={() => setExpandedShare(expandedShare === 'local' ? null : 'local')}
            className={`relative z-20 cursor-pointer overflow-hidden transition-all duration-300 flex items-center justify-center bg-black ${
              expandedShare === 'local'
                ? 'fixed inset-0 z-40 rounded-none w-full h-full max-w-none max-h-none p-3 sm:p-5'
                : 'w-[86%] max-w-[760px] aspect-video rounded-3xl max-h-[55vh]'
            }`}
            style={{
              borderRadius: expandedShare === 'local' ? 0 : '24px',
            }}
          >
            <video
              ref={attachLocalScreenShare}
              autoPlay
              playsInline
              muted
              className="w-full h-full max-w-full max-h-full object-contain"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedShare(expandedShare === 'local' ? null : 'local');
              }}
              aria-label={expandedShare === 'local' ? t('call.exit_fullscreen') : t('call.fullscreen')}
              className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
            >
              {expandedShare === 'local' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
              <span>{t('call.your_screen')}</span>
            </div>
          </div>
        ) : null}

        {hasAnyActiveStream && !expandedShare && (
          <div className="flex flex-col items-center mt-3 select-none">
            <h2 className="text-xl font-bold tracking-tight text-center truncate max-w-full text-white">
              {otherName}
            </h2>
            <p
              className="mt-0.5 text-sm tabular-nums font-semibold text-center"
              style={{ color: 'var(--accent-light, #a995ec)' }}
            >
              {formatDuration(localDuration > 0 ? localDuration : duration)}
            </p>
          </div>
        )}

        {!hasAnyActiveStream && (
          <>
            <div className="w-[150px] h-[150px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
              {otherName ? (
                <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '54px' }} />
              ) : (
                <div className="w-full h-full rounded-full bg-white/5 animate-pulse" />
              )}
            </div>

            <h2
              className="mt-7 text-xl font-bold tracking-tight text-center px-4 truncate max-w-full min-h-[28px]"
              style={{ color: 'var(--text-main, #ffffff)' }}
            >
              {otherName}
            </h2>

            {isIncoming ? (
              <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                {t('call.calling_you')}
              </p>
            ) : isPreparing ? (
              <p className="mt-1 text-sm text-center max-w-sm px-4" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                {t('call.video_call_hint')}
              </p>
            ) : isConnected ? (
              <p
                className="mt-1 text-sm tabular-nums font-semibold text-center"
                style={{ color: 'var(--accent-light, #a995ec)' }}
              >
                {formatDuration(localDuration > 0 ? localDuration : duration)}
              </p>
            ) : null}
             {statusMessage ? (
              <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                {statusMessage}
              </p>
            ) : null}
          </>
        )}
          </>
        )}
      </div>

      <div className={`${(expandedShare && hasAnyActiveStream) ? 'fixed bottom-0 inset-x-0 z-50 pb-6 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent' : 'pb-5 pt-1 relative z-20'} flex flex-col items-center gap-3 transition-all duration-300`}>
        {hasLocalScreenShare && (
          <div
            className="relative inline-flex items-center justify-center select-none px-4 py-1.5 rounded-full shadow-md"
            style={{
              backgroundColor: 'var(--surface-muted, rgba(255, 255, 255, 0.08))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <span className="text-[12px] font-medium text-white/90">
              {t('call.sharing_your_screen', 'Вы транслируете свой экран')}
            </span>
          </div>
        )}

        <CallWindowControls
          isIncoming={isIncoming}
          isPreparing={isPreparing}
          isRinging={isRinging}
          isConnecting={isConnecting}
          isConnected={isConnected}
          isEnded={isEnded}
          isMicEnabled={isMicEnabled}
          isVideoEnabled={isVideoEnabled}
          hasLocalScreenShare={hasLocalScreenShare}
          sendAction={sendAction}
          handleToggleMic={handleToggleMic}
          handleToggleVideo={handleToggleVideo}
          handleToggleScreenShare={handleToggleScreenShare}
          handleHangupOrCancel={handleHangupOrCancel}
        />
      </div>

      <ScreenSharePickerModal
        isOpen={isScreenPickerOpen}
        onClose={() => setIsScreenPickerOpen(false)}
        onStart={async (options) => {
          setIsScreenPickerOpen(false);
          const svc = isGroupCall ? groupLiveKitService : liveKitService;
          const success = await svc.startScreenShare(options);
          if (success) {
            setIsLocalScreenShareActive(true);
            setCallData((prev) => (prev ? { ...prev, isScreenSharing: true } : prev));
            sendAction('syncMediaState', { isScreenSharing: true });
          }
        }}
      />
    </div>
  );
};
