import { getPusher, CLIENT_SESSION_ID } from '../utils/pusher';
import { ablyService } from './ablyService';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export interface PresencePayload {
  type: 'presence';
  isOnline: boolean;
  timestamp: number;
}

interface P2PSignalPayload {
  type: 'p2p-signal';
  subType: 'offer' | 'answer' | 'candidate';
  senderId: string;
  sessionId: string;
  data: any;
}

class P2PDataService {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private messageListeners = new Map<string, Set<(data: any) => void>>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private connectingChats = new Set<string>();

  public onMessage(chatId: string, callback: (data: any) => void): () => void {
    if (!this.messageListeners.has(chatId)) {
      this.messageListeners.set(chatId, new Set());
    }
    this.messageListeners.get(chatId)!.add(callback);
    return () => {
      this.messageListeners.get(chatId)?.delete(callback);
    };
  }

  public isP2pReady(chatId: string): boolean {
    const dc = this.dataChannels.get(chatId);
    return Boolean(dc && dc.readyState === 'open');
  }

  public send(chatId: string, payload: any): boolean {
    const dc = this.dataChannels.get(chatId);
    if (!dc || dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private sendSignal(chatId: string, signal: P2PSignalPayload): void {
    const pusher = getPusher();
    const ch = pusher.channel(`private-chat-${chatId}`) || pusher.subscribe(`private-chat-${chatId}`);
    const doTrigger = () => {
      try {
        ch.trigger('client-message', signal);
      } catch {}
    };
    if (ch.subscribed) doTrigger();
    else ch.bind('pusher:subscription_succeeded', function onSub() {
      ch.unbind('pusher:subscription_succeeded', onSub);
      doTrigger();
    });
    if (signal.subType !== 'candidate') {
      ablyService.sendMessage(chatId, signal).catch(() => {});
    }
  }

  public async initiate(chatId: string): Promise<void> {
    if (!chatId || this.isP2pReady(chatId) || this.connectingChats.has(chatId)) return;
    this.connectingChats.add(chatId);

    try {
      this.close(chatId);
      const myId = useAuthStore.getState().userId || useChatStore.getState().myCode || CLIENT_SESSION_ID;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      this.peerConnections.set(chatId, pc);

      const dc = pc.createDataChannel('orbita-data', { ordered: true });
      this.setupDataChannel(chatId, dc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(chatId, {
            type: 'p2p-signal',
            subType: 'candidate',
            senderId: myId,
            sessionId: CLIENT_SESSION_ID,
            data: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          const wasOpen = this.isP2pReady(chatId);
          this.close(chatId);
          if (wasOpen) {
            const resolvedChatId = useChatStore.getState().chats.find((c) => c.id === chatId || c.peerCode === chatId)?.id || chatId;
            useChatStore.getState().updateChat(resolvedChatId, {
              online: false,
              lastSeen: Date.now(),
            });
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal(chatId, {
        type: 'p2p-signal',
        subType: 'offer',
        senderId: myId,
        sessionId: CLIENT_SESSION_ID,
        data: offer,
      });
    } catch {
      this.close(chatId);
    } finally {
      this.connectingChats.delete(chatId);
    }
  }

  public async handleSignal(chatId: string, signal: P2PSignalPayload): Promise<void> {
    if (!signal || signal.sessionId === CLIENT_SESSION_ID) return;
    const myId = useAuthStore.getState().userId;
    const myCode = useChatStore.getState().myCode;
    if (signal.senderId && ((myId && signal.senderId === myId) || (myCode && signal.senderId === myCode))) {
      return;
    }

    if (signal.subType === 'offer') {
      try {
        this.close(chatId);
        const myIdentifier = myId || myCode || CLIENT_SESSION_ID;
        const pc = new RTCPeerConnection(ICE_SERVERS);
        this.peerConnections.set(chatId, pc);

        pc.ondatachannel = (event) => {
          this.setupDataChannel(chatId, event.channel);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignal(chatId, {
              type: 'p2p-signal',
              subType: 'candidate',
              senderId: myIdentifier,
              sessionId: CLIENT_SESSION_ID,
              data: event.candidate.toJSON(),
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            const wasOpen = this.isP2pReady(chatId);
            this.close(chatId);
            if (wasOpen) {
              const resolvedChatId = useChatStore.getState().chats.find((c) => c.id === chatId || c.peerCode === chatId)?.id || chatId;
              useChatStore.getState().updateChat(resolvedChatId, {
                online: false,
                lastSeen: Date.now(),
              });
            }
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signal.data));

        const pending = this.pendingCandidates.get(chatId) || [];
        for (const c of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {}
        }
        this.pendingCandidates.delete(chatId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.sendSignal(chatId, {
          type: 'p2p-signal',
          subType: 'answer',
          senderId: myIdentifier,
          sessionId: CLIENT_SESSION_ID,
          data: answer,
        });
      } catch {
        this.close(chatId);
      }
      return;
    }

    if (signal.subType === 'answer') {
      const pc = this.peerConnections.get(chatId);
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
        const pending = this.pendingCandidates.get(chatId) || [];
        for (const c of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {}
        }
        this.pendingCandidates.delete(chatId);
      } catch {}
      return;
    }

    if (signal.subType === 'candidate') {
      const pc = this.peerConnections.get(chatId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.data));
        } catch {}
      } else {
        const list = this.pendingCandidates.get(chatId) || [];
        list.push(signal.data);
        this.pendingCandidates.set(chatId, list);
      }
    }
  }

  private setupDataChannel(chatId: string, dc: RTCDataChannel): void {
    this.dataChannels.set(chatId, dc);

    dc.onopen = () => {
      const isOnline = !useChatStore.getState().ghostModeEnabled;
      const payload: PresencePayload = {
        type: 'presence',
        isOnline: Boolean(isOnline),
        timestamp: Date.now(),
      };
      this.send(chatId, payload);
      const resolvedChatId = useChatStore.getState().chats.find((c) => c.id === chatId || c.peerCode === chatId)?.id || chatId;
      useChatStore.getState().updateChat(resolvedChatId, {
        online: true,
        lastSeen: Date.now(),
      });
    };

    dc.onmessage = (event) => {
      try {
        const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (parsed && parsed.type === 'presence') {
          if (typeof parsed.isOnline === 'boolean') {
            const validTimestamp = (typeof parsed.timestamp === 'number' && Number.isFinite(parsed.timestamp) && parsed.timestamp > 0)
              ? parsed.timestamp
              : Date.now();
            const resolvedChatId = useChatStore.getState().chats.find((c) => c.id === chatId || c.peerCode === chatId)?.id || chatId;
            useChatStore.getState().updateChat(resolvedChatId, {
              online: parsed.isOnline,
              lastSeen: validTimestamp,
            });
          }
        }
        const listeners = this.messageListeners.get(chatId);
        if (listeners) {
          for (const cb of listeners) {
            try {
              cb(parsed);
            } catch {}
          }
        }
      } catch {}
    };

    dc.onclose = () => {
      this.dataChannels.delete(chatId);
      const resolvedChatId = useChatStore.getState().chats.find((c) => c.id === chatId || c.peerCode === chatId)?.id || chatId;
      useChatStore.getState().updateChat(resolvedChatId, {
        online: false,
        lastSeen: Date.now(),
      });
    };

    dc.onerror = () => {
      this.dataChannels.delete(chatId);
      const resolvedChatId = useChatStore.getState().chats.find((c) => c.id === chatId || c.peerCode === chatId)?.id || chatId;
      useChatStore.getState().updateChat(resolvedChatId, {
        online: false,
        lastSeen: Date.now(),
      });
    };
  }

  public broadcastPresence(isOnline: boolean): void {
    const payload: PresencePayload = {
      type: 'presence',
      isOnline: Boolean(isOnline),
      timestamp: Date.now(),
    };
    for (const dc of this.dataChannels.values()) {
      if (dc && dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(payload));
        } catch {}
      }
    }
  }

  public sendPresence(chatId: string, isOnline: boolean): boolean {
    const payload: PresencePayload = {
      type: 'presence',
      isOnline: Boolean(isOnline),
      timestamp: Date.now(),
    };
    return this.send(chatId, payload);
  }

  public close(chatId: string): void {
    const dc = this.dataChannels.get(chatId);
    if (dc) {
      try { dc.close(); } catch {}
      this.dataChannels.delete(chatId);
    }
    const pc = this.peerConnections.get(chatId);
    if (pc) {
      try { pc.close(); } catch {}
      this.peerConnections.delete(chatId);
    }
    this.pendingCandidates.delete(chatId);
    this.connectingChats.delete(chatId);
  }
}

export const p2pDataService = new P2PDataService();
