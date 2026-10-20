import type { ParticipantInfo } from '../../services/livekitService';

export type CallType = 'audio' | 'video';
export type CallDirection = 'incoming' | 'outgoing';
export type CallState = 'idle' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallEndedStatus = 'missed' | 'rejected' | 'busy' | 'failed' | 'completed' | 'encryption_failed' | null;

export interface IncomingCall {
  from: string;
  chatId: string;
  callType: CallType;
  roomName: string;
  timestamp: number;
  verificationSalt?: string;
}

export interface ActiveCall {
  chatId: string;
  roomName: string;
  direction: CallDirection;
  callType: CallType;
  startTime: number;
  participants: ParticipantInfo[];
  isMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  endedStatus: CallEndedStatus;
  verificationSecret?: string;
  verificationSalt?: string;
  verificationEmojis?: string[];
  token?: string;
  url?: string;
  chatType?: 'group' | 'private' | 'channel';
}

export interface CallStore {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  callState: CallState;
  isMicEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isScreenPickerOpen: boolean;
  remoteScreenShareTrack: any | null;
  remoteScreenShareIdentity: string | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  duration: number;
  myNickname: string | null;
  statusMessage: string;
  isEnding: boolean;
  isMinimized: boolean;
  processedRoomNames: string[];
  setIncomingCall: (call: IncomingCall | null) => void;
  addProcessedRoomName: (roomName: string) => void;
  setMinimized: (minimized: boolean) => void;
  startCall: (chatId: string, callType: CallType, myNickname: string) => Promise<void>;
  initiateCall: () => Promise<void>;
  answerCall: (myNickname: string) => Promise<void>;
  rejectCall: (silent?: boolean) => void;
  endCall: (forceClose?: boolean, remotesOverride?: number) => void;
  handleBusy: (roomName?: string) => void;
  handleReject: (roomName?: string) => void;
  handleAccept: (roomName?: string) => Promise<void>;
  handleConnected: (connectedAt?: number, roomName?: string) => void;
  handleCancel: (roomName?: string) => void;
  handleHangup: (roomName?: string) => void;
  toggleMic: () => Promise<void>;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  toggleVideo: (explicitVal?: boolean) => Promise<void>;
  openScreenPicker: () => void;
  closeScreenPicker: () => void;
  startScreenShareWithOptions: (options: { sourceId?: string; audio: boolean }) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  updateParticipants: (participants: ParticipantInfo[]) => void;
  updateConnectionQuality: (quality: 'excellent' | 'good' | 'poor' | 'unknown') => void;
  peerVolume: number;
  micVolume: number;
  setPeerVolume: (volume: number) => void;
  setMicVolume: (volume: number) => void;
  isBusy: () => boolean;
  reset: () => void;
}
