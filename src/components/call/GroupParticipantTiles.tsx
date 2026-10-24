import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2 } from 'lucide-react';
import { Avatar, getAvatarGradient } from '../common/Avatar';
import { liveKitService, type ParticipantInfo } from '../../services/livekitService';
import { groupLiveKitService } from '../../services/groupLiveKitService';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { attachRustVoiceDetector } from '../../services/rustVoiceVadService';
import { SignalStrengthIcon } from './SignalStrengthIcon';

export interface GroupParticipantTileProps {
  participant: ParticipantInfo;
  chatMembers?: any[];
  isLocalVideoActive: boolean;
  isScreenSharing: boolean;
  isMicEnabled: boolean;
  myAvatar?: string | null;
  knownAvatars?: Record<string, string>;
  onTileClick?: (participant: ParticipantInfo) => void;
  onAvatarClick?: (participant: ParticipantInfo) => void;
}

export const GroupParticipantTile = React.memo(({
  participant,
  chatMembers,
  isLocalVideoActive,
  isScreenSharing,
  isMicEnabled,
  myAvatar,
  knownAvatars,
  onTileClick,
  onAvatarClick,
}: GroupParticipantTileProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isLocal = participant.isLocal;
  const hasScreenShare = isLocal ? isScreenSharing : !!participant.screenShareEnabled;
  const hasCamera = isLocal ? isLocalVideoActive : participant.videoEnabled;
  const hasStream = hasScreenShare || hasCamera;

  const memberInfo = chatMembers?.find((m: any) =>
    (m.userCode && (m.userCode === participant.identity || participant.identity.includes(m.userCode))) ||
    (m.user_code && (m.user_code === participant.identity || participant.identity.includes(m.user_code))) ||
    (m.userId && (m.userId === participant.identity || participant.identity.includes(m.userId))) ||
    (m.user_id && (m.user_id === participant.identity || participant.identity.includes(m.user_id)))
  );
  const myUid = useAuthStore.getState().userId;
  const myCode = useChatStore.getState().myCode;
  const chats = useChatStore.getState().chats || [];
  const usersById = useChatStore.getState().usersById || {};
  const fallbackChat = !isLocal ? chats.find((c) =>
    c.id !== 'notes' &&
    c.peerCode !== myCode &&
    c.peerCode !== myUid &&
    ((c.peerCode && (participant.identity.includes(c.peerCode) || c.peerCode === memberInfo?.userCode || c.peerCode === memberInfo?.user_id)) ||
      (c.originalPeerCode && (participant.identity.includes(c.originalPeerCode) || c.originalPeerCode === memberInfo?.userCode)))
  ) : null;
  const fallbackProfile = !isLocal ? Object.values(usersById).find((u: any) =>
    u.id !== myUid &&
    u.id !== myCode &&
    (u.id && (participant.identity.includes(u.id) || u.id === memberInfo?.userId || u.id === memberInfo?.user_id))
  ) : null;
  const avatarUrl = isLocal ? (
    myAvatar ||
    useAuthStore.getState().avatarUrl ||
    null
  ) : (
    participant.avatarUrl ||
    memberInfo?.avatarUrl ||
    memberInfo?.avatar_url ||
    (participant.identity ? knownAvatars?.[participant.identity] : null) ||
    fallbackChat?.avatarUrl ||
    (fallbackProfile as any)?.avatarUrl ||
    null
  );
  const displayName = participant.name || memberInfo?.nickname || fallbackChat?.name || (fallbackProfile as any)?.nickname || participant.identity;
  const isMuted = isLocal ? !isMicEnabled : !participant.audioEnabled;

  const [isSpeakingRealtime, setIsSpeakingRealtime] = useState(false);

  useEffect(() => {
    if (isMuted) {
      setIsSpeakingRealtime(false);
      return;
    }

    let cleanupDetector: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const setupDetector = () => {
      cleanupDetector?.();
      cleanupDetector = null;

      const aTrack = isLocal
        ? (groupLiveKitService.getLocalAudioTrack() || liveKitService.getLocalAudioTrack())
        : (groupLiveKitService.getRemoteAudioTrack(participant.identity) || liveKitService.getRemoteAudioTrack(participant.identity));
      const msTrack = aTrack?.mediaStreamTrack;

      if (msTrack && msTrack.readyState !== 'ended' && msTrack.enabled) {
        cleanupDetector = attachRustVoiceDetector(msTrack, setIsSpeakingRealtime, 0.028);
      } else {
        setIsSpeakingRealtime(false);
        if (isLocal && !isMuted) {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(setupDetector, 200);
        }
      }
    };

    setupDetector();

    groupLiveKitService.on('trackSubscribed', setupDetector);
    groupLiveKitService.on('trackUnsubscribed', setupDetector);
    groupLiveKitService.on('micChanged', setupDetector);
    groupLiveKitService.on('participantsChanged', setupDetector);
    groupLiveKitService.on('connected', setupDetector);
    liveKitService.on('trackSubscribed', setupDetector);
    liveKitService.on('trackUnsubscribed', setupDetector);
    liveKitService.on('micChanged', setupDetector);
    liveKitService.on('participantsChanged', setupDetector);
    liveKitService.on('connected', setupDetector);

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      cleanupDetector?.();
      groupLiveKitService.off('trackSubscribed', setupDetector);
      groupLiveKitService.off('trackUnsubscribed', setupDetector);
      groupLiveKitService.off('micChanged', setupDetector);
      groupLiveKitService.off('participantsChanged', setupDetector);
      groupLiveKitService.off('connected', setupDetector);
      liveKitService.off('trackSubscribed', setupDetector);
      liveKitService.off('trackUnsubscribed', setupDetector);
      liveKitService.off('micChanged', setupDetector);
      liveKitService.off('participantsChanged', setupDetector);
      liveKitService.off('connected', setupDetector);
    };
  }, [isLocal, participant.identity, isMuted, isMicEnabled, participant.audioEnabled]);

  const isSpeaking = !isMuted && (isSpeakingRealtime || (!isLocal && participant.isSpeaking));

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const attach = () => {
      if (hasScreenShare) {
        const sTrack = isLocal ? groupLiveKitService.getScreenShareTrack() : groupLiveKitService.getRemoteScreenShareTrack(participant.identity);
        if (sTrack) {
          sTrack.attach(el);
          try { el.play().catch(() => {}); } catch {}
          return;
        }
      }
      if (hasCamera) {
        const vTrack = isLocal ? groupLiveKitService.getLocalVideoTrack() : groupLiveKitService.getRemoteVideoTrack(participant.identity);
        if (vTrack) {
          vTrack.attach(el);
          try { el.play().catch(() => {}); } catch {}
          return;
        }
      }
    };
    attach();
    groupLiveKitService.on('trackSubscribed', attach);
    groupLiveKitService.on('trackUnsubscribed', attach);
    groupLiveKitService.on('cameraChanged', attach);
    groupLiveKitService.on('screenShareChanged', attach);
    groupLiveKitService.on('remoteScreenShareChanged', attach);
    return () => {
      groupLiveKitService.off('trackSubscribed', attach);
      groupLiveKitService.off('trackUnsubscribed', attach);
      groupLiveKitService.off('cameraChanged', attach);
      groupLiveKitService.off('screenShareChanged', attach);
      groupLiveKitService.off('remoteScreenShareChanged', attach);
      try {
        if (hasScreenShare) {
          const sTrack = isLocal ? groupLiveKitService.getScreenShareTrack() : groupLiveKitService.getRemoteScreenShareTrack(participant.identity);
          sTrack?.detach(el);
        } else if (hasCamera) {
          const vTrack = isLocal ? groupLiveKitService.getLocalVideoTrack() : groupLiveKitService.getRemoteVideoTrack(participant.identity);
          vTrack?.detach(el);
        }
      } catch {}
    };
  }, [hasScreenShare, hasCamera, isLocal, participant.identity]);

  return (
    <div
      onClick={() => {
        if (hasStream) {
          onTileClick?.(participant);
        }
      }}
      className={`relative flex items-center justify-center w-full min-h-[160px] max-h-[340px] aspect-video rounded-2xl overflow-hidden select-none group ${
        hasStream ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{
        backgroundColor: 'var(--chat-list-bg, #1e1e1e)',
        border: 'none',
        transition: 'none',
      }}
    >
      {hasStream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`w-full h-full ${hasScreenShare ? 'object-contain bg-black' : 'object-cover'} ${isLocal && hasCamera && !hasScreenShare ? '-scale-x-100' : ''}`}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTileClick?.(participant);
            }}
            aria-label={displayName}
            className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-lg bg-black/60 hover:bg-black/85 text-white/90 opacity-0 group-hover:opacity-100 transition-opacity border-0 cursor-pointer"
          >
            <Maximize2 size={15} />
          </button>
        </>
      ) : (
        <>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-md opacity-30 scale-110 pointer-events-none"
            />
          ) : (
            <div
              className="absolute inset-0 w-full h-full opacity-30 blur-md scale-105 pointer-events-none"
              style={{ background: getAvatarGradient(displayName) }}
            />
          )}
          <div className="absolute inset-0 bg-[#1e1e1e]/60 pointer-events-none" />
          <div
            onClick={(e) => {
              e.stopPropagation();
              onAvatarClick?.(participant);
            }}
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden shadow-xl flex items-center justify-center flex-shrink-0 border-0 transition-transform duration-200 z-10 ${
              !isLocal ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
            }`}
            role={!isLocal ? 'button' : undefined}
            aria-label={displayName}
          >
            <Avatar
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
              style={{ fontSize: '46px' }}
            />
          </div>
        </>
      )}
      <div className="absolute bottom-3 left-3 z-20 flex flex-col items-start gap-1 max-w-[85%] pointer-events-none">
        {isSpeaking && (
          <div
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-[9999px] bg-black/65 backdrop-blur-md text-[12.5px] font-semibold border-0 shadow-sm"
            style={{ color: 'var(--accent-color, #7C3AED)' }}
          >
            <span>{t('call.speaking')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-[9999px] bg-black/65 backdrop-blur-md text-xs font-semibold text-white/95 max-w-full border-0 shadow-sm">
          <SignalStrengthIcon level={(participant as any).connectionQuality || 4} size={13} />
          <span className="truncate">{displayName}</span>
          {isMuted && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="13" height="13" className="w-3.5 h-3.5 text-red-400 flex-shrink-0">
              <path fill="currentColor" d="M4.113 6.945a4 4 0 0 0 2.94 2.94L9.069 11.9l-.073.015Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 .382-.786zM8 1a3 3 0 0 1 3 3v2c0 .978-.47 1.843-1.195 2.39l.712.713A3.99 3.99 0 0 0 12 6a1 1 0 0 1 2 0a5.97 5.97 0 0 1-2.065 4.52l2.772 2.773a1 1 0 1 1-1.414 1.414l-12-12a1 1 0 1 1 1.414-1.414l2.318 2.318A3 3 0 0 1 8 1" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
});

export interface ExpandedGroupParticipantTileProps {
  participant: ParticipantInfo;
  chatMembers?: any[];
  isLocalVideoActive: boolean;
  isScreenSharing: boolean;
  isMicEnabled: boolean;
  myAvatar?: string | null;
  knownAvatars?: Record<string, string>;
  onAvatarClick?: (participant: ParticipantInfo) => void;
}

export const ExpandedGroupParticipantTile = React.memo(({
  participant,
  chatMembers,
  isLocalVideoActive,
  isScreenSharing,
  isMicEnabled,
  myAvatar,
  knownAvatars,
  onAvatarClick,
}: ExpandedGroupParticipantTileProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isLocal = participant.isLocal;
  const hasScreenShare = isLocal ? isScreenSharing : !!participant.screenShareEnabled;
  const hasCamera = isLocal ? isLocalVideoActive : participant.videoEnabled;
  const hasStream = hasScreenShare || hasCamera;

  const memberInfo = chatMembers?.find((m: any) =>
    (m.userCode && (m.userCode === participant.identity || participant.identity.includes(m.userCode))) ||
    (m.user_code && (m.user_code === participant.identity || participant.identity.includes(m.user_code))) ||
    (m.userId && (m.userId === participant.identity || participant.identity.includes(m.userId))) ||
    (m.user_id && (m.user_id === participant.identity || participant.identity.includes(m.user_id)))
  );
  const chats = useChatStore.getState().chats || [];
  const usersById = useChatStore.getState().usersById || {};
  const fallbackChat = !isLocal ? chats.find((c) =>
    (c.peerCode && (participant.identity.includes(c.peerCode) || c.peerCode === memberInfo?.userCode || c.peerCode === memberInfo?.user_id)) ||
    (c.originalPeerCode && (participant.identity.includes(c.originalPeerCode) || c.originalPeerCode === memberInfo?.userCode))
  ) : null;
  const fallbackProfile = !isLocal ? Object.values(usersById).find((u: any) =>
    (u.id && (participant.identity.includes(u.id) || u.id === memberInfo?.userId || u.id === memberInfo?.user_id))
  ) : null;
  const avatarUrl = isLocal ? (
    myAvatar ||
    useAuthStore.getState().avatarUrl ||
    null
  ) : (
    participant.avatarUrl ||
    memberInfo?.avatarUrl ||
    memberInfo?.avatar_url ||
    (participant.identity ? knownAvatars?.[participant.identity] : null) ||
    fallbackChat?.avatarUrl ||
    (fallbackProfile as any)?.avatarUrl ||
    null
  );
  const displayName = participant.name || memberInfo?.nickname || fallbackChat?.name || (fallbackProfile as any)?.nickname || participant.identity;
  const isMuted = isLocal ? !isMicEnabled : !participant.audioEnabled;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const attach = () => {
      if (hasScreenShare) {
        const sTrack = isLocal ? groupLiveKitService.getScreenShareTrack() : groupLiveKitService.getRemoteScreenShareTrack(participant.identity);
        if (sTrack) {
          sTrack.attach(el);
          try { el.play().catch(() => {}); } catch {}
          return;
        }
      }
      if (hasCamera) {
        const vTrack = isLocal ? groupLiveKitService.getLocalVideoTrack() : groupLiveKitService.getRemoteVideoTrack(participant.identity);
        if (vTrack) {
          vTrack.attach(el);
          try { el.play().catch(() => {}); } catch {}
          return;
        }
      }
    };
    attach();
    groupLiveKitService.on('trackSubscribed', attach);
    groupLiveKitService.on('trackUnsubscribed', attach);
    groupLiveKitService.on('cameraChanged', attach);
    groupLiveKitService.on('screenShareChanged', attach);
    groupLiveKitService.on('remoteScreenShareChanged', attach);
    return () => {
      groupLiveKitService.off('trackSubscribed', attach);
      groupLiveKitService.off('trackUnsubscribed', attach);
      groupLiveKitService.off('cameraChanged', attach);
      groupLiveKitService.off('screenShareChanged', attach);
      groupLiveKitService.off('remoteScreenShareChanged', attach);
      try {
        if (hasScreenShare) {
          const sTrack = isLocal ? groupLiveKitService.getScreenShareTrack() : groupLiveKitService.getRemoteScreenShareTrack(participant.identity);
          sTrack?.detach(el);
        } else if (hasCamera) {
          const vTrack = isLocal ? groupLiveKitService.getLocalVideoTrack() : groupLiveKitService.getRemoteVideoTrack(participant.identity);
          vTrack?.detach(el);
        }
      } catch {}
    };
  }, [hasScreenShare, hasCamera, isLocal, participant.identity]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden border-0">
      {hasStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full max-w-full max-h-full object-contain ${isLocal && hasCamera && !hasScreenShare ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-35 scale-125 pointer-events-none"
            />
          ) : (
            <div
              className="absolute inset-0 w-full h-full opacity-35 blur-2xl scale-110 pointer-events-none"
              style={{ background: getAvatarGradient(displayName) }}
            />
          )}
          <div className="absolute inset-0 bg-black/50 pointer-events-none" />
          <div
            onClick={(e) => {
              e.stopPropagation();
              onAvatarClick?.(participant);
            }}
            className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden shadow-2xl flex items-center justify-center flex-shrink-0 border-0 transition-transform duration-200 z-10 ${
              !isLocal ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
            }`}
            role={!isLocal ? 'button' : undefined}
            aria-label={displayName}
          >
            <Avatar
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 z-30 flex flex-col items-start gap-1 max-w-[85%] pointer-events-none">
        {participant.isSpeaking && (
          <div
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-[9999px] bg-black/65 backdrop-blur-md text-[12.5px] font-semibold border-0 shadow-sm"
            style={{ color: 'var(--accent-color, #7C3AED)' }}
          >
            <span>{t('call.speaking')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9999px] bg-black/65 backdrop-blur-md text-xs font-semibold text-white/95 max-w-full border-0 shadow-sm">
          <SignalStrengthIcon level={(participant as any).connectionQuality || 4} size={13} />
          <span className="truncate">{displayName}</span>
          {isMuted && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="13" height="13" className="w-3.5 h-3.5 text-red-400 flex-shrink-0">
              <path fill="currentColor" d="M4.113 6.945a4 4 0 0 0 2.94 2.94L9.069 11.9l-.073.015Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 .382-.786zM8 1a3 3 0 0 1 3 3v2c0 .978-.47 1.843-1.195 2.39l.712.713A3.99 3.99 0 0 0 12 6a1 1 0 0 1 2 0a5.97 5.97 0 0 1-2.065 4.52l2.772 2.773a1 1 0 1 1-1.414 1.414l-12-12a1 1 0 1 1 1.414-1.414l2.318 2.318A3 3 0 0 1 8 1" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
});
