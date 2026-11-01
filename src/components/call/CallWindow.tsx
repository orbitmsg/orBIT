import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { liveKitService, type ParticipantInfo } from '../../services/livekitService';
import { groupLiveKitService } from '../../services/groupLiveKitService';
import { useTranslation } from 'react-i18next';
import { VideoOff, X, Maximize2, Minimize2 } from 'lucide-react';
import type { RemoteTrack } from 'livekit-client';
import { Avatar } from '../common/Avatar';
import { CallVerificationBadge } from './CallVerificationBadge';
import { ScreenSharePickerModal } from './ScreenSharePickerModal';
import { generateKeyPair, generateChatId, getDirectChatId } from '../../lib/crypto';
import { SignalStrengthIcon } from './SignalStrengthIcon';

import { GroupParticipantTile, ExpandedGroupParticipantTile } from './GroupParticipantTiles';
import { accentButtonStyle, rejectButtonStyle, neutralButtonStyle, StaticBackground } from './callButtonStyles';
import { CallDualStreamView } from './CallDualStreamView';
import { CallAvatarVoiceWave } from './CallAvatarVoiceWave';

export const CallWindow = () => {
  const { t } = useTranslation();
  const activeCall = useCallStore((state) => state.activeCall);
  const callState = useCallStore((state) => state.callState);
  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isConnected = callState === 'connected';
  const isEnded = callState === 'ended';
  const isMinimized = useCallStore((state) => state.isMinimized);
  const duration = useCallStore((state) => state.duration);
  const isMicEnabled = useCallStore((state) => state.isMicEnabled);
  const isVideoEnabled = useCallStore((state) => state.isVideoEnabled);
  const isScreenSharing = useCallStore((state) => state.isScreenSharing);
  const statusMessage = useCallStore((state) => state.statusMessage);
  const endCall = useCallStore((state) => state.endCall);
  const initiateCall = useCallStore((state) => state.initiateCall);
  const toggleMic = useCallStore((state) => state.toggleMic);
  const toggleVideo = useCallStore((state) => state.toggleVideo);
  const toggleScreenShare = useCallStore((state) => state.toggleScreenShare);
  const myNickname = useCallStore((state) => state.myNickname);
  const remoteScreenShareTrack = useCallStore((state) => state.remoteScreenShareTrack);
  const callAnimationsEnabled = useChatStore((state) => state.callAnimationsEnabled);

  const [isRemoteVideoActive, setIsRemoteVideoActive] = useState<boolean>(false);
  const [isLocalVideoActive, setIsLocalVideoActive] = useState<boolean>(false);
  const [isRemoteScreenShareActive, setIsRemoteScreenShareActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [expandedShare, setExpandedShare] = useState<'remote' | 'local' | null>(null);
  const [remoteConnectionQuality, setRemoteConnectionQuality] = useState<any>('excellent');

  useEffect(() => {
    const onQuality = (quality: any) => setRemoteConnectionQuality(quality);
    liveKitService.on('connectionQuality', onQuality);
    return () => {
      liveKitService.off('connectionQuality', onQuality);
    };
  }, []);

  useEffect(() => {
    if (expandedShare === 'remote' && !isRemoteVideoActive && !isRemoteScreenShareActive) {
      setExpandedShare(null);
    }
    if (expandedShare === 'local' && !isScreenSharing) {
      setExpandedShare(null);
    }
  }, [expandedShare, isRemoteVideoActive, isRemoteScreenShareActive, isScreenSharing]);
  useEffect(() => {
    const checkDevices = async () => {
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

    checkDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', checkDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', checkDevices);
    };
  }, []);

  const chat = useChatStore((state) =>
    activeCall ? state.chats.find((c) => c.id === activeCall.chatId) : null
  );
  const isGroupCall = chat?.type === 'group' || activeCall?.chatType === 'group' || Boolean(activeCall?.roomName?.startsWith('group-call-'));
  const otherName = chat?.name || activeCall?.chatId || '';
  const otherAvatar = chat?.avatarUrl || null;
  const [groupParticipants, setGroupParticipants] = useState<ParticipantInfo[]>([]);
  const [expandedGroupParticipant, setExpandedGroupParticipant] = useState<ParticipantInfo | null>(null);

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

  const handleOpenChat = useCallback((participant: ParticipantInfo) => {
    if (participant.isLocal) return;
    const memberInfo: any = chat?.members?.find(
      (m: any) =>
        (m.userCode && (m.userCode === participant.identity || participant.identity.includes(m.userCode))) ||
        (m.user_code && (m.user_code === participant.identity || participant.identity.includes(m.user_code))) ||
        (m.userId && (m.userId === participant.identity || participant.identity.includes(m.userId))) ||
        (m.user_id && (m.user_id === participant.identity || participant.identity.includes(m.user_id)))
    );
    const candidateCodes = new Set<string>();
    if (memberInfo?.userCode) candidateCodes.add(memberInfo.userCode);
    if (memberInfo?.user_code) candidateCodes.add(memberInfo.user_code);
    if (memberInfo?.userId) candidateCodes.add(memberInfo.userId);
    if (memberInfo?.user_id) candidateCodes.add(memberInfo.user_id);
    if (participant.identity) candidateCodes.add(participant.identity);

    const myCode = useChatStore.getState().myCode;
    const myUid = useAuthStore.getState().userId;
    const myIds = [myCode, myUid].filter((x): x is string => typeof x === 'string' && x.length > 0);
    myIds.forEach((id) => candidateCodes.delete(id));
    if (candidateCodes.size === 0) return;

    const targetAvatar = memberInfo?.avatarUrl || memberInfo?.avatar_url || (participant as any)?.avatarUrl || null;
    const candidates = Array.from(candidateCodes);
    const target36 = candidates.find((c) => c.length === 36);
    const targetCode = target36 || candidates.find((c) => c.length !== 64) || candidates[0];
    if (!targetCode) return;

    const directChatIds = new Set<string>();
    for (const myId of myIds) {
      for (const code of candidates) {
        directChatIds.add(getDirectChatId(myId, code));
      }
    }

    const chatStore = useChatStore.getState();
    const matchingChats = chatStore.chats.filter(
      (c) =>
        c.type === 'private' &&
        c.id !== 'notes' &&
        (directChatIds.has(c.id) ||
          (c.peerCode && candidateCodes.has(c.peerCode)) ||
          (c.originalPeerCode && candidateCodes.has(c.originalPeerCode)) ||
          ((c as any).userId && candidateCodes.has((c as any).userId)) ||
          (targetAvatar && c.avatarUrl && c.avatarUrl === targetAvatar))
    );
    const existing = matchingChats.find((c) => c.peerCode && c.peerCode.length === 36) || matchingChats[0];

    if (existing) {
      matchingChats.forEach((c) => {
        if (c.id !== existing.id && c.peerCode && c.peerCode.length === 64) {
          chatStore.deleteChat(c.id);
        }
      });
      chatStore.setActiveChat(existing.id);
    } else {
      const myKeys = generateKeyPair();
      const preferredMyId = myCode || myIds.find((id) => id.length === 36) || myIds[0];
      const newChatId = (preferredMyId && targetCode) ? getDirectChatId(preferredMyId, targetCode) : generateChatId();
      chatStore.addChat({
        id: newChatId,
        type: 'private',
        name: participant.name || memberInfo?.nickname || 'User',
        lastMsg: '',
        online: false,
        isChatInitiator: true,
        sharedSecret: myKeys.privateKey,
        avatarUrl: memberInfo?.avatarUrl || memberInfo?.avatar_url || undefined,
        peerCode: targetCode,
        originalPeerCode: targetCode,
      });
      chatStore.setActiveChat(newChatId);
    }
    useCallStore.getState().setMinimized(true);
    try {
      (window as any).orbita?.showWindow?.();
    } catch {}
  }, [chat?.members]);

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

  const allGroupParticipants = useMemo(() => {
    if (groupParticipants.length > 0) return groupParticipants;
    return [{
      identity: myNickname || 'local',
      name: myNickname || 'Вы',
      audioEnabled: isMicEnabled,
      videoEnabled: isVideoEnabled,
      screenShareEnabled: isScreenSharing,
      isSpeaking: false,
      isLocal: true,
    }];
  }, [groupParticipants, myNickname, isMicEnabled, isVideoEnabled, isScreenSharing]);

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

  const remoteAudioContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenShareRef = useRef<HTMLVideoElement>(null);
  const localScreenShareRef = useRef<HTMLVideoElement>(null);
  const callContainerRef = useRef<HTMLDivElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const attachedElements = useRef<Map<string, HTMLMediaElement>>(new Map());

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



  const hasLocalScreenShare = (isConnected || isConnecting) && isScreenSharing;
  const hasRemoteStream = isRemoteVideoActive || isRemoteScreenShareActive;
  const isDualStream = hasRemoteStream && hasLocalScreenShare;
  const hasAnyActiveStream = hasRemoteStream || hasLocalScreenShare;

  const currentRoomName = activeCall?.roomName;
  const prevRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentRoomName !== prevRoomRef.current) {
      prevRoomRef.current = currentRoomName || null;
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setIsRemoteScreenShareActive(false);
      setIsFullscreen(false);
      setExpandedShare(null);
      setLocalDuration(0);
    }
  }, [currentRoomName]);

  useEffect(() => {
    if (!isConnected && !isConnecting) {
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setIsRemoteScreenShareActive(false);
      setIsFullscreen(false);
      setExpandedShare(null);
    }
  }, [isConnected, isConnecting]);

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
    if (isRemoteScreenShareActive && remoteScreenShareRef.current) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) {
        track.attach(remoteScreenShareRef.current);
      }
    }
  }, [isRemoteScreenShareActive]);

  useEffect(() => {
    if (isRemoteVideoActive && remoteVideoRef.current) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) {
        track.attach(remoteVideoRef.current);
        if (bgVideoRef.current) {
          track.attach(bgVideoRef.current);
        }
      }
    }
  }, [isRemoteVideoActive]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      callContainerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          setIsRemoteScreenShareActive(true);
          if (remoteScreenShareRef.current) {
            track.attach(remoteScreenShareRef.current);
          }
        } else {
          setIsRemoteVideoActive(true);
          if (remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
          if (bgVideoRef.current) {
            track.attach(bgVideoRef.current);
          }
        }
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          if (remoteScreenShareRef.current) {
            track.detach(remoteScreenShareRef.current);
          }
          setIsRemoteScreenShareActive(false);
        } else {
          if (remoteVideoRef.current) {
            track.detach(remoteVideoRef.current);
          }
          if (bgVideoRef.current) {
            track.detach(bgVideoRef.current);
          }
          setIsRemoteVideoActive(false);
        }
      }
    };

    const handleTrackMuted = () => {
      const track = liveKitService.getRemoteVideoTrack();
      setIsRemoteVideoActive(!!(track && !track.isMuted));
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      setIsRemoteScreenShareActive(!!(sTrack && !sTrack.isMuted));
    };

    const handleTrackUnmuted = () => {
      const track = liveKitService.getRemoteVideoTrack();
      if (track && remoteVideoRef.current) {
        track.attach(remoteVideoRef.current);
        if (bgVideoRef.current) {
          track.attach(bgVideoRef.current);
        }
        setIsRemoteVideoActive(true);
      }
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack && remoteScreenShareRef.current) {
        sTrack.attach(remoteScreenShareRef.current);
        setIsRemoteScreenShareActive(true);
      }
    };

    liveKitService.on('trackSubscribed', handleTrackSubscribed);
    liveKitService.on('trackUnsubscribed', handleTrackUnsubscribed);
    liveKitService.on('trackMuted', handleTrackMuted);
    liveKitService.on('trackUnmuted', handleTrackUnmuted);

    return () => {
      liveKitService.off('trackSubscribed', handleTrackSubscribed);
      liveKitService.off('trackUnsubscribed', handleTrackUnsubscribed);
      liveKitService.off('trackMuted', handleTrackMuted);
      liveKitService.off('trackUnmuted', handleTrackUnmuted);
      attachedElements.current.forEach((el) => el.remove());
      attachedElements.current.clear();
      if (remoteVideoRef.current) {
        const track = liveKitService.getRemoteVideoTrack();
        if (track) {
          track.detach(remoteVideoRef.current);
          if (bgVideoRef.current) {
            track.detach(bgVideoRef.current);
          }
        }
      }
      if (remoteScreenShareRef.current) {
        const sTrack = liveKitService.getRemoteScreenShareTrack();
        if (sTrack) {
          sTrack.detach(remoteScreenShareRef.current);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setIsRemoteVideoActive(false);
      setIsRemoteScreenShareActive(false);
      return;
    }
    const sTrack = liveKitService.getRemoteScreenShareTrack();
    if (sTrack && !sTrack.isMuted && remoteScreenShareRef.current) {
      sTrack.attach(remoteScreenShareRef.current);
      setIsRemoteScreenShareActive(true);
    }
    const track = liveKitService.getRemoteVideoTrack();
    if (track && !track.isMuted && remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
      if (bgVideoRef.current && (!sTrack || sTrack.isMuted)) {
        track.attach(bgVideoRef.current);
      }
      setIsRemoteVideoActive(true);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!bgVideoRef.current) return;
    if (isRemoteScreenShareActive) {
      if (bgVideoRef.current.srcObject) {
        bgVideoRef.current.srcObject = null;
      }
    } else if (isRemoteVideoActive) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) {
        if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
        track.attach(bgVideoRef.current);
      }
    }
  }, [isRemoteScreenShareActive, isRemoteVideoActive]);

  useEffect(() => {
    if (remoteScreenShareTrack) {
      if (remoteScreenShareRef.current) remoteScreenShareTrack.attach(remoteScreenShareRef.current);
      if (bgVideoRef.current) bgVideoRef.current.srcObject = null;
      setIsRemoteScreenShareActive(true);
    } else {
      setIsRemoteScreenShareActive(false);
      if (bgVideoRef.current) {
        bgVideoRef.current.srcObject = null;
        const rTrack = liveKitService.getRemoteVideoTrack();
        if (rTrack && !rTrack.isMuted) rTrack.attach(bgVideoRef.current);
      }
    }
  }, [remoteScreenShareTrack]);

  useEffect(() => {
    if (!isConnected || !isScreenSharing) {
      if (localScreenShareRef.current) {
        const track = liveKitService.getScreenShareTrack();
        if (track) track.detach(localScreenShareRef.current);
      }
      return;
    }
    const track = liveKitService.getScreenShareTrack();
    if (track && localScreenShareRef.current) {
      track.attach(localScreenShareRef.current);
    }
    const onScreenChanged = (enabled: boolean, tr: any) => {
      if (enabled && tr && localScreenShareRef.current) {
        tr.attach(localScreenShareRef.current);
      } else if (!enabled && localScreenShareRef.current) {
        tr?.detach(localScreenShareRef.current);
      }
    };
    liveKitService.on('screenShareChanged', onScreenChanged);
    return () => {
      liveKitService.off('screenShareChanged', onScreenChanged);
      if (localScreenShareRef.current && track) {
        track.detach(localScreenShareRef.current);
      }
    };
  }, [isConnected, isScreenSharing]);

  useEffect(() => {
    if (isRemoteScreenShareActive && remoteScreenShareRef.current) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) track.attach(remoteScreenShareRef.current);
    }
    if (hasLocalScreenShare && localScreenShareRef.current) {
      const track = liveKitService.getScreenShareTrack();
      if (track) track.attach(localScreenShareRef.current);
    }
    if (isLocalVideoActive && localVideoRef.current) {
      const track = liveKitService.getLocalVideoTrack();
      if (track) track.attach(localVideoRef.current);
    }
    if (isRemoteVideoActive && remoteVideoRef.current) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) track.attach(remoteVideoRef.current);
    }
  }, [isRemoteScreenShareActive, hasLocalScreenShare, isLocalVideoActive, isRemoteVideoActive, isDualStream, expandedShare]);

  useEffect(() => {
    if (!isConnected) return;
    const attachLocal = () => {
      if (isVideoEnabled) {
        const track = liveKitService.getLocalVideoTrack();
        if (track && localVideoRef.current) {
          track.attach(localVideoRef.current);
          setIsLocalVideoActive(true);
        } else {
          setIsLocalVideoActive(false);
        }
      } else {
        const track = liveKitService.getLocalVideoTrack();
        if (track && localVideoRef.current) {
          track.detach(localVideoRef.current);
        }
        setIsLocalVideoActive(false);
      }
    };
    attachLocal();
    liveKitService.on('cameraChanged', attachLocal);
    return () => {
      liveKitService.off('cameraChanged', attachLocal);
      const track = liveKitService.getLocalVideoTrack();
      if (track && localVideoRef.current) {
        track.detach(localVideoRef.current);
      }
    };
  }, [isConnected, isVideoEnabled]);

  useEffect(() => {
    if (isConnected || isPreparing) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      if (isPreparing) {
        setIsLocalVideoActive(false);
      }
      return;
    }
    if (!isVideoEnabled) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      setIsLocalVideoActive(false);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: 'user' },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        setIsLocalVideoActive(true);
      })
      .catch(() => {
        setIsLocalVideoActive(false);
      });

    return () => {
      cancelled = true;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, [isConnected, isPreparing, isVideoEnabled]);

  if (!activeCall) return null;

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

  const handleCancel = () => {
    endCall();
  };

  const handleCall = () => {
    initiateCall();
  };

  if (callState === 'ringing' && activeCall.direction === 'incoming') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex flex-col justify-between overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-primary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          <StaticBackground />

          <div style={{ height: '30px' }} className="w-full flex-shrink-0" />

          <div ref={remoteAudioContainerRef} style={{ display: 'none' }} />
          <div className="flex flex-col items-center justify-center flex-1 relative z-10 p-6">
            <div className="w-[150px] h-[150px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
              <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '54px' }} />
            </div>
            <h2 className="mt-7 text-xl font-bold tracking-tight text-center" style={{ color: 'var(--text-main)' }}>
              {otherName}
            </h2>
            <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim)' }}>
              {activeCall.callType === 'video' ? t('call.incoming_video_call') : t('call.incoming_audio_call')}
            </p>
          </div>

          <div className="flex items-center justify-center gap-5 pb-5 pt-1 relative z-10">
            <button
              type="button"
              onClick={() => useCallStore.getState().rejectCall()}
              aria-label={t('call.reject')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-black">
                  <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
                </svg>
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.reject') || 'Отклонить'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => useCallStore.getState().answerCall(myNickname!)}
              aria-label={t('call.answer')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                {activeCall.callType === 'video' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="20" height="20" className="w-5 h-5 text-white">
                    <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-white">
                    <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
                  </svg>
                )}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.answer') || 'Принять'}
              </span>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div
      ref={callContainerRef}
      className="fixed inset-0 z-[400] flex flex-col justify-between overflow-hidden select-none"
      style={{
        display: isMinimized ? 'none' : 'flex',
        backgroundColor: 'var(--bg-primary)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {isRemoteVideoActive && !isRemoteScreenShareActive && !isMinimized && (
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

      <div style={{ height: '30px' }} className="w-full flex-shrink-0" />

      <div ref={remoteAudioContainerRef} style={{ display: 'none' }} />

      {isConnected && !isGroupCall && activeCall?.verificationEmojis && activeCall.verificationEmojis.length === 4 && (
        <div
          className="select-none flex items-stretch"
          style={{
            position: 'absolute',
            top: '55px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            gap: '10px',
          }}
        >
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
          className="select-none flex items-stretch"
          style={{
            position: 'absolute',
            top: '55px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
          }}
        >
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
              {chat?.name || t('call.group_call')}
            </div>
            <div className="text-[11px] font-medium text-white/75 leading-tight text-center mt-0.5 flex items-center justify-center gap-1.5">
              <span>{formatParticipantsCount(allGroupParticipants.length)}</span>
              <span className="text-white/40">·</span>
              <span className="font-mono text-white/60">{formatDuration(duration)}</span>
            </div>
          </div>
        </div>
      )}

      {!isGroupCall && isRemoteScreenShareActive && (
        <div className="absolute top-14 left-16 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg select-none">
          <span className="text-[12px] font-medium text-white/90">
            {t('call.screen_of', { name: otherName })}
          </span>
          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? t('call.exit_fullscreen') : t('call.fullscreen')}
            className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer ml-1"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      )}

      <AnimatePresence>
        {!isGroupCall && (isRemoteVideoActive || isRemoteScreenShareActive) && isLocalVideoActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            drag
            dragConstraints={{ top: 10, left: -600, right: 10, bottom: 400 }}
            dragElastic={0.05}
            className="absolute top-16 right-6 z-40 w-36 h-52 sm:w-44 sm:h-64 rounded-2xl overflow-hidden shadow-2xl border-0 bg-black/70 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
          >
            <video
              ref={attachLocalVideo}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none">
              {t('call.you') || 'Вы'}
            </div>
          </motion.div>
        )}
        {!isGroupCall && isVideoEnabled && !hasCamera && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-16 right-6 z-40 w-48 h-36 rounded-2xl shadow-2xl bg-black/80 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center border-0 select-none"
          >
            <VideoOff size={28} className="text-amber-400 mb-2" />
            <span className="text-[13px] font-medium text-white/90 leading-snug">
              {t('call.no_camera_available')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full px-4 min-h-0 overflow-hidden">
        {isGroupCall ? (
          expandedGroupParticipant ? (
            <div className="fixed inset-0 z-40 bg-black flex items-center justify-center p-3 sm:p-5 select-none">
              <div className="relative w-full h-full flex items-center justify-center">
                <ExpandedGroupParticipantTile
                  participant={expandedGroupParticipant}
                  chatMembers={chat?.members}
                  isLocalVideoActive={isLocalVideoActive}
                  isScreenSharing={isScreenSharing}
                  isMicEnabled={isMicEnabled}
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
                    chatMembers={chat?.members}
                    isLocalVideoActive={isLocalVideoActive}
                    isScreenSharing={isScreenSharing}
                    isMicEnabled={isMicEnabled}
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
            <div className="relative w-[150px] h-[150px] flex items-center justify-center select-none">
              {isConnected && (
                <div
                  className="absolute inset-0 rounded-full animate-ping opacity-20 pointer-events-none"
                  style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                />
              )}
              <div className="w-[150px] h-[150px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-xl pointer-events-none border-2 border-white/10 relative z-10">
                <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '54px' }} />
              </div>
            </div>

            {callAnimationsEnabled && isConnected && (
              <CallAvatarVoiceWave
                isCallActive={isConnected}
                isGroup={isGroupCall}
              />
            )}

            <h2 className={`${callAnimationsEnabled && isConnected ? 'mt-2' : 'mt-7'} text-2xl font-bold tracking-tight text-center px-4`} style={{ color: 'var(--text-main)' }}>
              {otherName}
            </h2>

            {isPreparing ? (
              <p className="mt-1.5 text-sm text-center max-w-sm px-4" style={{ color: 'var(--text-dim)' }}>
                {t('call.video_call_hint')}
              </p>
            ) : isConnected ? (
              <p className="mt-1.5 text-sm tabular-nums text-center" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                {formatDuration(localDuration > 0 ? localDuration : duration)}
              </p>
            ) : statusMessage ? (
              <p className="mt-1.5 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                {statusMessage}
              </p>
            ) : null}
          </>
        )}
          </>
        )}
      </div>

      <div className={`${(expandedShare && hasAnyActiveStream) ? 'fixed bottom-0 inset-x-0 z-50 pb-6 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent' : 'pb-5 pt-1 relative z-30'} flex flex-col items-center gap-3 select-none transition-all duration-300`}>
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
              {t('call.sharing_your_screen')}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-5">
        {isPreparing ? (
          <>
            <button
              type="button"
              onClick={() => toggleVideo()}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0"
                style={isVideoEnabled ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="20" height="20" className="w-5 h-5 text-white">
                    <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="20" height="20" className="w-5 h-5 text-white">
                    <path fill="currentColor" fillRule="evenodd" d="M10.961 12.365a2 2 0 0 0 .522-1.103l3.11 1.382A1 1 0 0 0 16 11.731V4.269a1 1 0 0 0-1.406-.913l-3.111 1.382A2 2 0 0 0 9.5 3H4.272zm-10.114-9A2 2 0 0 0 0 5v6a2 2 0 0 0 2 2h5.728zm9.746 11.925l-10-14l.814-.58l10 14z" />
                  </svg>
                )}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.cancel')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0" style={rejectButtonStyle}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-white">
                  <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
                </svg>
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.cancel')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCall}
              aria-label={t('call.call')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0"
                style={accentButtonStyle}
              >
                {isVideoEnabled ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-white">
                    <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-white">
                    <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
                  </svg>
                )}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.call')}
              </span>
            </button>
          </>
        ) : (isRinging || isConnecting || isConnected) ? (
          <>
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95 flex-shrink-0"
                style={neutralButtonStyle(isMicEnabled)}
              >
                {isMicEnabled ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                    <g fill="currentColor">
                      <path d="M13 5a1 1 0 0 1 1 1a6 6 0 0 1-5.005 5.915Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 2 0a4 4 0 1 0 8 0a1 1 0 0 1 1-1" />
                      <path d="M8 1a3 3 0 0 1 3 3v2a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3" />
                    </g>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                    <path fill="currentColor" d="M4.113 6.945a4 4 0 0 0 2.94 2.94L9.069 11.9l-.073.015Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 .382-.786zM8 1a3 3 0 0 1 3 3v2c0 .978-.47 1.843-1.195 2.39l.712.713A3.99 3.99 0 0 0 12 6a1 1 0 0 1 2 0a5.97 5.97 0 0 1-2.065 4.52l2.772 2.773a1 1 0 1 1-1.414 1.414l-12-12a1 1 0 1 1 1.414-1.414l2.318 2.318A3 3 0 0 1 8 1" />
                  </svg>
                )}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {isMicEnabled ? t('call.mic') : t('call.mic_off')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggleVideo()}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95 flex-shrink-0"
                style={neutralButtonStyle(isVideoEnabled)}
              >
                {isVideoEnabled ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                    <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                    <path fill="currentColor" fillRule="evenodd" d="M10.961 12.365a2 2 0 0 0 .522-1.103l3.11 1.382A1 1 0 0 0 16 11.731V4.269a1 1 0 0 0-1.406-.913l-3.111 1.382A2 2 0 0 0 9.5 3H4.272zm-10.114-9A2 2 0 0 0 0 5v6a2 2 0 0 0 2 2h5.728zm9.746 11.925l-10-14l.814-.58l10 14z" />
                  </svg>
                )}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              </span>
            </button>

            {isConnected && (
              <button
                type="button"
                onClick={toggleScreenShare}
                aria-label={t('call.screen_share')}
                className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95 flex-shrink-0"
                  style={neutralButtonStyle(hasLocalScreenShare)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -3 24 24" width="28" height="28" className="w-7 h-7 text-current">
                    <path fill="currentColor" d="M3 2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm0-2h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3m4 16h6a1 1 0 0 1 0 2H7a1 1 0 0 1 0-2" />
                  </svg>
                </div>
                <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                  {t('call.screen_share')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.hang_up')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0" style={rejectButtonStyle}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-white">
                  <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
                </svg>
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.hang_up')}
              </span>
            </button>
          </>
        ) : isEnded ? (
          <button
            type="button"
            onClick={handleCancel}
            aria-label={t('call.close')}
            className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0" style={rejectButtonStyle}>
              <X size={28} color="#ffffff" />
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.close')}
            </span>
          </button>
        ) : null}
        </div>
      </div>

      <ScreenSharePickerModal />
    </div>
  );
};
