import Ably from 'ably';
import { Realtime, PresenceMessage } from 'ably';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore, type ChatAction } from '../store/useChatStore';
import { gatewayManager } from './gatewayManager';

type UserStatusCallback = (isOnline: boolean, lastSeen?: number) => void;
type TypingCallback = (userId: string, isTyping: boolean, nickname?: string, action?: ChatAction) => void;
type DeliveryCallback = (messageId: string, userId: string, status: 'delivered' | 'read', timestamp: number) => void;
type HandshakeCallback = { onRequest: (data: any) => void; onConfirm?: (data: any) => void; };

class AblyService {
  private client: Realtime | null = null;
  private userId: string | null = null;
  private presenceSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private typingSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private deliverySubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private handshakeSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private lastSeenTimers: Map<string, NodeJS.Timeout> = new Map();
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isConnected = false;
  private heartbeatTimer: any = null;

  private typingCallbacks: Map<string, Set<TypingCallback>> = new Map();
  private activeTypingUsers: Map<string, Map<string, { nickname: string; action: ChatAction; timer: any }>> = new Map();
  private typingSubscribersCount: Map<string, number> = new Map();
  private deliveryCallbacks: Map<string, Set<DeliveryCallback>> = new Map();
  private deliverySubscribersCount: Map<string, number> = new Map();
  private presenceCallbacks: Map<string, Set<UserStatusCallback>> = new Map();
  private presenceSubscribersCount: Map<string, number> = new Map();
  private handshakeCallbacks: Map<string, HandshakeCallback> = new Map();
  private chatMessageCallbacks: Map<string, Set<(data: any) => void>> = new Map();

  private chatMessageSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();

  private typingHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private deliveredHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private readHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private presenceHandlers: Map<string, (member: PresenceMessage) => void> = new Map();
  private handshakeReqHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private handshakeConfHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private chatMessageHandlers: Map<string, (message: Ably.Message) => void> = new Map();

  private readonly ABLY_KEYS: string[] = [];
  private activeKeyIndex = 0;
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  getConnectionState(): string {
    return this.client ? (this.client.connection as any).state : 'disconnected';
  }

  switchToNextServer(): Promise<void> {
    if (this.ABLY_KEYS.length <= 1) return Promise.resolve();
    this.activeKeyIndex = (this.activeKeyIndex + 1) % this.ABLY_KEYS.length;
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
    }
    this.isConnected = false;
    const nextKey = this.ABLY_KEYS[this.activeKeyIndex];
    console.log(`[Ably] Failover: switched to key index ${this.activeKeyIndex} (${nextKey ? nextKey.slice(0, 12) + '...' : ''})`);
    if (this.userId) {
      return this.connect(this.userId);
    }
    return Promise.resolve();
  }

  getActiveKey(): string {
    return this.ABLY_KEYS[this.activeKeyIndex] || '';
  }

  forceReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
      this.isConnected = false;
    }
    this.connectPromise = null;
    this.reconnectAttempt = 0;
    if (this.userId) {
      this.connect(this.userId).catch(() => {});
    }
  }

  reconnect(): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    if (this.client) {
      try {
        this.client.connection.connect();
      } catch (e) {
        console.warn('[Ably] Reconnect error:', e);
      }
    } else if (this.userId) {
      this.connect(this.userId).catch(() => {});
    }
  }

  connect(userId: string): Promise<void> {
    if (this.client && this.userId === userId && this.isConnected) {
      return Promise.resolve();
    }

    if (this.connectPromise && this.userId === userId) {
      return this.connectPromise;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.reject(new Error('Network offline'));
    }

    if (this.client && this.userId !== userId) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
      this.isConnected = false;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      try {
        const clientOptions: Ably.ClientOptions = {
          clientId: userId,
        };

        const activeKey = this.ABLY_KEYS[this.activeKeyIndex] || this.ABLY_KEYS[0];
        if (activeKey) {
          clientOptions.key = activeKey;
        } else {
          clientOptions.authCallback = async (_data, callback) => {
            try {
              const res = await gatewayManager.fetch(`/ably-auth?clientId=${encodeURIComponent(userId)}`, {
                method: 'GET',
              });
              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Ably auth failed (${res.status}): ${errText}`);
              }
              const tokenDetails = await res.json();
              callback(null, tokenDetails);
            } catch (err: any) {
              console.error('[Ably] Auth callback error:', err);
              callback(err, null as any);
            }
          };
        }

        this.client = new Ably.Realtime(clientOptions);
        this.userId = userId;

        let connectionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

        const onConnected = () => {
          if (connectionTimeoutTimer) {
            clearTimeout(connectionTimeoutTimer);
            connectionTimeoutTimer = null;
          }
          this.isConnected = true;
          this.reconnectAttempt = 0;
          this.connectPromise = null;
          this.setOnline(userId);
          this.reattachAllSubscriptions();
          console.log(`[Ably] Connected with key index ${this.activeKeyIndex} (${activeKey ? activeKey.slice(0, 12) + '...' : 'worker'})`);
          if (typeof window !== 'undefined') {
            (window as any).ablyService = this;
            (window as any).switchToNextAblyServer = () => this.switchToNextServer();
            (window as any).getActiveAblyServer = () => ({ index: this.activeKeyIndex, key: this.getActiveKey() });
          }
          resolve();
        };

        this.client.connection.once('connected', onConnected);

        this.client.connection.on('failed', (error) => {
          if (connectionTimeoutTimer) {
            clearTimeout(connectionTimeoutTimer);
            connectionTimeoutTimer = null;
          }
          console.error('[Ably] Connection failed with key index', this.activeKeyIndex, error);
          this.isConnected = false;
          this.connectPromise = null;

          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            reject(error);
            return;
          }

          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }

          this.reconnectAttempt++;
          const jitter = Math.floor(Math.random() * 500);
          const backoff = Math.min(1000 * Math.pow(1.5, Math.min(this.reconnectAttempt, 6)) + jitter, 30000);

          if (this.ABLY_KEYS.length > 1) {
            this.activeKeyIndex = (this.activeKeyIndex + 1) % this.ABLY_KEYS.length;
          }

          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.userId && (typeof navigator === 'undefined' || navigator.onLine)) {
              this.client = null;
              this.connect(this.userId).catch(() => {});
            }
          }, backoff);

          reject(error);
        });

        this.client.connection.on('disconnected', () => {
          this.isConnected = false;
        });

        this.client.connection.on('suspended', () => {
          this.isConnected = false;
        });

        this.client.connection.on('update', (stateChange) => {
          if (stateChange.current === 'connected') {
            this.isConnected = true;
            this.reconnectAttempt = 0;
            this.setOnline(userId);
            this.reattachAllSubscriptions();
          }
        });

        connectionTimeoutTimer = setTimeout(() => {
          if (!this.isConnected) {
            this.connectPromise = null;
            reject(new Error('Ably connection timeout'));
          }
        }, 10000);
      } catch (error) {
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  disconnect(): void {
    if (this.client) {
      this.presenceSubscriptions.forEach((channel) => {
        try {
          channel.presence.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.presenceSubscriptions.clear();

      this.typingSubscriptions.forEach((channel) => {
        try {
          channel.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.typingSubscriptions.clear();

      this.deliverySubscriptions.forEach((channel) => {
        try {
          channel.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.deliverySubscriptions.clear();

      this.chatMessageSubscriptions.forEach((channel) => {
        try {
          channel.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.chatMessageSubscriptions.clear();

      this.lastSeenTimers.forEach((timer) => clearTimeout(timer));
      this.lastSeenTimers.clear();

      this.typingTimeouts.forEach((timer) => clearTimeout(timer));
      this.typingTimeouts.clear();

      this.activeTypingUsers.forEach((map) => {
        map.forEach((entry) => clearTimeout(entry.timer));
        map.clear();
      });
      this.activeTypingUsers.clear();
      this.typingSubscribersCount.clear();

      this.typingCallbacks.clear();
      this.deliveryCallbacks.clear();
      this.presenceCallbacks.clear();
      this.typingHandlers.clear();
      this.deliveredHandlers.clear();
      this.readHandlers.clear();
      this.presenceHandlers.clear();
      this.chatMessageHandlers.clear();

      this.stopHeartbeat();
      this.client.close();
      this.client = null;
      this.userId = null;
      this.isConnected = false;
    }
  }

  private reattachAllSubscriptions(): void {
    if (!this.client) return;

    this.handshakeCallbacks.forEach((callbacks, code) => {
      this._attachHandshakeChannel(code, callbacks);
    });

    this.typingSubscribersCount.forEach((_count, chatId) => {
      this._attachTypingChannel(chatId);
    });

    this.deliverySubscribersCount.forEach((_count, chatId) => {
      this._attachDeliveryChannel(chatId);
    });

    this.presenceSubscribersCount.forEach((_count, userId) => {
      this._attachPresenceChannel(userId);
    });

    this.chatMessageCallbacks.forEach((_cbs, chatId) => {
      this._attachChatMessageChannel(chatId);
    });
  }

  private startHeartbeat(userId: string): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (!this.client || !this.isConnected || !this.userId) return;
      if (useChatStore.getState().ghostModeEnabled) return;
      const channel = this.client.channels.get(`presence:user:${userId}`);
      channel.presence.update({
        status: 'online',
        timestamp: Date.now(),
      }).catch(() => {});
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  setOnline(userId: string): void {
    if (useChatStore.getState().ghostModeEnabled) {
      return;
    }
    if (!this.client || !this.isConnected) {
      return;
    }

    const channel = this.client.channels.get(`presence:user:${userId}`);
    channel.presence.enter({
      status: 'online',
      timestamp: Date.now(),
    }).catch((err) => {
      console.error('[Ably] Failed to enter presence:', err);
    });
    this.startHeartbeat(userId);
  }

  setOffline(userId: string): void {
    this.stopHeartbeat();
    if (!this.client || !this.isConnected) {
      return;
    }

    const channel = this.client.channels.get(`presence:user:${userId}`);
    channel.presence.leave({
      status: 'offline',
      timestamp: Date.now(),
    }).catch((err) => {
      console.error('[Ably] Failed to leave presence:', err);
    });
  }

  subscribeToUserPresence(userId: string, callback: UserStatusCallback): () => void {
    if (!userId || typeof userId !== 'string' || userId === 'undefined' || userId === 'null' || !userId.trim()) {
      return () => {};
    }
    const cleanId = userId.trim();
    let set = this.presenceCallbacks.get(cleanId);
    if (!set) {
      set = new Set();
      this.presenceCallbacks.set(cleanId, set);
    }
    set.add(callback);

    const count = this.presenceSubscribersCount.get(cleanId) || 0;
    this.presenceSubscribersCount.set(cleanId, count + 1);

    if (this.client && this.isConnected && !this.presenceSubscriptions.has(cleanId)) {
      this._attachPresenceChannel(cleanId);
    }

    return () => {
      const callbacks = this.presenceCallbacks.get(cleanId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.presenceCallbacks.delete(cleanId);
        }
      }

      const currentCount = this.presenceSubscribersCount.get(cleanId) || 1;
      if (currentCount <= 1) {
        this.presenceSubscribersCount.delete(cleanId);
        const channel = this.presenceSubscriptions.get(cleanId);
        const handler = this.presenceHandlers.get(cleanId);
        if (channel && handler) {
          try {
            channel.presence.unsubscribe(handler);
          } catch {}
        }
        this.presenceSubscriptions.delete(cleanId);
        this.presenceHandlers.delete(cleanId);
      } else {
        this.presenceSubscribersCount.set(cleanId, currentCount - 1);
      }
    };
  }

  private _attachPresenceChannel(userId: string): void {
    if (!this.client) return;

    const channel = this.client.channels.get(`presence:user:${userId}`);
    this.presenceSubscriptions.set(userId, channel);

    channel.presence.get((err, members) => {
      if (err) {
        console.error('[Ably] Failed to get presence:', err);
        return;
      }

      const now = Date.now();
      const activeMember = (members || []).find((m) => {
        const matchesUser = Boolean(
          (m.clientId && m.clientId === userId) ||
          (m.data && typeof m.data === 'object' && (m.data as any).userId === userId)
        );
        if (!matchesUser) return false;

        const isStatusOnline = m.data && typeof m.data === 'object' && 'status' in m.data
          ? (m.data as any).status === 'online'
          : true;
        const isFresh = m.data && typeof m.data === 'object' && 'timestamp' in m.data
          ? (now - Number((m.data as any).timestamp)) < 90000
          : false;

        return isStatusOnline && isFresh;
      });

      const isOnline = !!activeMember;
      let lastSeen: number | undefined;

      if (!isOnline) {
        const sorted = (members || [])
          .filter((m) => Boolean(
            (m.clientId && m.clientId === userId) ||
            (m.data && typeof m.data === 'object' && (m.data as any).userId === userId)
          ))
          .sort((a, b) => {
            const aTs = a.data && typeof a.data === 'object' && 'timestamp' in a.data ? Number((a.data as any).timestamp) : 0;
            const bTs = b.data && typeof b.data === 'object' && 'timestamp' in b.data ? Number((b.data as any).timestamp) : 0;
            return bTs - aTs;
          });

        if (sorted.length > 0) {
          const d = sorted[0].data;
          if (d && typeof d === 'object' && 'timestamp' in d) {
            lastSeen = Number((d as any).timestamp);
          }
        }
      } else {
        const d = activeMember.data;
        lastSeen = d && typeof d === 'object' && 'timestamp' in d ? Number((d as any).timestamp) : now;
      }

      const cbs = this.presenceCallbacks.get(userId);
      if (cbs) {
        cbs.forEach((cb) => cb(isOnline, lastSeen));
      }
    });

    const presenceHandler = (member: PresenceMessage) => {
      const memberId = member.clientId || (member.data && typeof member.data === 'object' ? (member.data as any).userId : null);
      if (!memberId || memberId !== userId) {
        return;
      }
      const action = member.action;
      const cbs = this.presenceCallbacks.get(userId);
      if (!cbs || cbs.size === 0) return;

      if (action === 'enter' || action === 'present' || action === 'update') {
        const isStatusOnline = member.data ? (typeof member.data === 'object' && 'status' in member.data ? member.data.status === 'online' : true) : true;
        const hasTimestamp = Boolean(member.data && typeof member.data === 'object' && 'timestamp' in member.data);
        const timestamp = hasTimestamp ? Number((member.data as any).timestamp) : 0;
        const isFresh = hasTimestamp && (Date.now() - timestamp) < 90000;
        const isOnline = isStatusOnline && isFresh;
        cbs.forEach((cb) => cb(isOnline, hasTimestamp ? timestamp : undefined));
      } else if (action === 'leave' || action === 'absent') {
        const timestamp = member.data && typeof member.data === 'object' && 'timestamp' in member.data ? Number((member.data as any).timestamp) : undefined;
        cbs.forEach((cb) => cb(false, timestamp));
      }
    };

    const oldHandler = this.presenceHandlers.get(userId);
    if (oldHandler) {
      try {
        channel.presence.unsubscribe(oldHandler);
      } catch {}
    }

    this.presenceHandlers.set(userId, presenceHandler);
    channel.presence.subscribe(presenceHandler);
  }

  updateLastSeen(userId: string, timestamp: number): void {
    if (!this.client || !this.isConnected) {
      return;
    }

    const channel = this.client.channels.get(`lastseen:user:${userId}`);
    channel.publish('update', { userId, timestamp }).catch((err) => {
      console.error('[Ably] Failed to update last seen:', err);
    });
  }

  handleIncomingTyping(chatId: string, userId: string, isTyping: boolean, nickname?: string, action: ChatAction = 'typing'): void {
    if (!chatId || !userId) return;
    const cleanChatId = chatId.trim();
    if (!useChatStore.getState().typingIndicatorsEnabled) return;

    const myUid = useAuthStore.getState().userId;
    const myC = useChatStore.getState().myCode;
    const myNick = useAuthStore.getState().nickname;

    const isSelf = Boolean(
      (myUid && userId === myUid) ||
      (myC && userId === myC) ||
      (myNick && (userId === myNick || nickname === myNick))
    );
    if (isSelf) return;

    let chatMap = this.activeTypingUsers.get(cleanChatId);
    if (!chatMap) {
      chatMap = new Map();
      this.activeTypingUsers.set(cleanChatId, chatMap);
    }

    const existing = chatMap.get(userId);
    if (existing) {
      clearTimeout(existing.timer);
      chatMap.delete(userId);
    }

    if (isTyping) {
      const chat = useChatStore.getState().chats.find((c) => c.id === cleanChatId);
      const resolvedNick = nickname ||
        chat?.members?.find((m: any) =>
          (m.userCode && m.userCode === userId) ||
          (m.user_code && m.user_code === userId) ||
          (m.userId && m.userId === userId) ||
          (m.user_id && m.user_id === userId)
        )?.nickname || chat?.name || userId;

      const timer = setTimeout(() => {
        const currentMap = this.activeTypingUsers.get(cleanChatId);
        if (currentMap) {
          currentMap.delete(userId);
          useChatStore.getState().setChatTyping(
            cleanChatId,
            Array.from(currentMap.values()).map((v) => ({ nickname: v.nickname, action: v.action }))
          );
        }
      }, 7500);

      chatMap.set(userId, { nickname: resolvedNick, action, timer });
    }

    const currentUsers = Array.from(chatMap.values()).map((v) => ({ nickname: v.nickname, action: v.action }));
    useChatStore.getState().setChatTyping(cleanChatId, currentUsers);
  }

  sendTyping(chatId: string, isTyping: boolean, nickname?: string, action: ChatAction = 'typing'): void {
    if (!chatId || chatId === 'notes') return;
    const cleanChatId = chatId.trim();

    const state = useChatStore.getState();
    if (!state.typingIndicatorsEnabled || state.ghostModeEnabled) return;

    const myUid = useAuthStore.getState().userId;
    const myC = state.myCode;
    const myNick = nickname || useAuthStore.getState().nickname || '';
    const senderId = this.userId || myUid || myC || myNick || 'me';

    if (this.client && this.isConnected) {
      const channel = this.client.channels.get(`chat:${cleanChatId}`);
      channel.publish('typing', {
        userId: senderId,
        nickname: myNick,
        isTyping,
        action,
      }).catch(() => {});
    }
  }

  subscribeToTyping(chatId: string, callback?: TypingCallback): () => void {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) {
      return () => {};
    }
    const cleanId = chatId.trim();
    if (callback) {
      let set = this.typingCallbacks.get(cleanId);
      if (!set) {
        set = new Set();
        this.typingCallbacks.set(cleanId, set);
      }
      set.add(callback);
    }

    const currentCount = this.typingSubscribersCount.get(cleanId) || 0;
    this.typingSubscribersCount.set(cleanId, currentCount + 1);

    if (this.client && this.isConnected && !this.typingSubscriptions.has(cleanId)) {
      this._attachTypingChannel(cleanId);
    }

    return () => {
      if (callback) {
        const callbacks = this.typingCallbacks.get(cleanId);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.typingCallbacks.delete(cleanId);
          }
        }
      }
      const count = this.typingSubscribersCount.get(cleanId) || 1;
      if (count <= 1) {
        this.typingSubscribersCount.delete(cleanId);
        const channel = this.typingSubscriptions.get(cleanId);
        const handler = this.typingHandlers.get(cleanId);
        if (channel && handler) {
          channel.unsubscribe('typing', handler);
        }
        this.typingSubscriptions.delete(cleanId);
        this.typingHandlers.delete(cleanId);
      } else {
        this.typingSubscribersCount.set(cleanId, count - 1);
      }
    };
  }

  private _attachTypingChannel(chatId: string): void {
    if (!this.client || !chatId) return;

    const channel = this.client.channels.get(`chat:${chatId}`);
    this.typingSubscriptions.set(chatId, channel);

    const handler = (message: Ably.Message) => {
      if (message.data && message.data.userId && message.data.isTyping !== undefined) {
        const action: ChatAction = message.data.action || 'typing';
        this.handleIncomingTyping(chatId, message.data.userId, message.data.isTyping, message.data.nickname, action);
      }
    };

    const oldHandler = this.typingHandlers.get(chatId);
    if (oldHandler) channel.unsubscribe('typing', oldHandler);

    this.typingHandlers.set(chatId, handler);
    channel.subscribe('typing', handler);
  }

  markMessageDelivered(chatId: string, messageId: string): void {
    if (!messageId) return;
    this.markMessagesDelivered(chatId, [messageId]);
  }

  markMessagesDelivered(chatId: string, messageIds: string[]): void {
    if (!this.client || !this.isConnected || !this.userId || !chatId || !messageIds || messageIds.length === 0) {
      return;
    }

    const state = useChatStore.getState();
    if (!state.readReceiptsEnabled || state.ghostModeEnabled) {
      return;
    }

    const channel = this.client.channels.get(`chat:${chatId}`);
    channel.publish('delivered', {
      messageId: messageIds[messageIds.length - 1],
      messageIds,
      userId: this.userId,
      timestamp: Date.now(),
    }).catch(() => {});
  }

  markMessageRead(chatId: string, messageId: string): void {
    if (!messageId) return;
    this.markMessagesRead(chatId, [messageId]);
  }

  markMessagesRead(chatId: string, messageIds: string[]): void {
    if (!this.client || !this.isConnected || !this.userId || !chatId || !messageIds || messageIds.length === 0) {
      return;
    }

    const state = useChatStore.getState();
    if (!state.readReceiptsEnabled || state.ghostModeEnabled) {
      return;
    }

    const channel = this.client.channels.get(`chat:${chatId}`);
    channel.publish('read', {
      messageId: messageIds[messageIds.length - 1],
      messageIds,
      userId: this.userId,
      timestamp: Date.now(),
    }).catch(() => {});
  }

  subscribeToDeliveryUpdates(chatId: string, callback: DeliveryCallback): () => void {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) {
      return () => {};
    }
    const cleanId = chatId.trim();
    let set = this.deliveryCallbacks.get(cleanId);
    if (!set) {
      set = new Set();
      this.deliveryCallbacks.set(cleanId, set);
    }
    set.add(callback);

    const count = this.deliverySubscribersCount.get(cleanId) || 0;
    this.deliverySubscribersCount.set(cleanId, count + 1);

    if (this.client && this.isConnected && !this.deliverySubscriptions.has(cleanId)) {
      this._attachDeliveryChannel(cleanId);
    }

    return () => {
      const callbacks = this.deliveryCallbacks.get(cleanId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.deliveryCallbacks.delete(cleanId);
        }
      }

      const currentCount = this.deliverySubscribersCount.get(cleanId) || 1;
      if (currentCount <= 1) {
        this.deliverySubscribersCount.delete(cleanId);
        const channel = this.deliverySubscriptions.get(cleanId);
        const deliveredHandler = this.deliveredHandlers.get(cleanId);
        const readHandler = this.readHandlers.get(cleanId);

        if (channel) {
          if (deliveredHandler) channel.unsubscribe('delivered', deliveredHandler);
          if (readHandler) channel.unsubscribe('read', readHandler);
        }

        this.deliverySubscriptions.delete(cleanId);
        this.deliveredHandlers.delete(cleanId);
        this.readHandlers.delete(cleanId);
      } else {
        this.deliverySubscribersCount.set(cleanId, currentCount - 1);
      }
    };
  }

  private _attachDeliveryChannel(chatId: string): void {
    if (!this.client) return;

    const channel = this.client.channels.get(`chat:${chatId}`);
    this.deliverySubscriptions.set(chatId, channel);

    const deliveredHandler = (message: Ably.Message) => {
      if (message.data && message.data.userId) {
        const cbs = this.deliveryCallbacks.get(chatId);
        if (cbs) {
          const ids: string[] = Array.isArray(message.data.messageIds)
            ? message.data.messageIds
            : message.data.messageId
            ? [message.data.messageId]
            : [];
          for (const id of ids) {
            cbs.forEach((cb) =>
              cb(id, message.data.userId, 'delivered', message.data.timestamp || Date.now())
            );
          }
        }
      }
    };

    const readHandler = (message: Ably.Message) => {
      if (message.data && message.data.userId) {
        const cbs = this.deliveryCallbacks.get(chatId);
        if (cbs) {
          const ids: string[] = Array.isArray(message.data.messageIds)
            ? message.data.messageIds
            : message.data.messageId
            ? [message.data.messageId]
            : [];
          for (const id of ids) {
            cbs.forEach((cb) =>
              cb(id, message.data.userId, 'read', message.data.timestamp || Date.now())
            );
          }
        }
      }
    };

    const oldDelivered = this.deliveredHandlers.get(chatId);
    const oldRead = this.readHandlers.get(chatId);
    if (oldDelivered) channel.unsubscribe('delivered', oldDelivered);
    if (oldRead) channel.unsubscribe('read', oldRead);

    this.deliveredHandlers.set(chatId, deliveredHandler);
    this.readHandlers.set(chatId, readHandler);

    channel.subscribe('delivered', deliveredHandler);
    channel.subscribe('read', readHandler);
  }

  private _attachHandshakeChannel(code: string, callbacks: HandshakeCallback): void {
    if (!this.client) return;
    const channel = this.client.channels.get(`handshake:${code}`);
    this.handshakeSubscriptions.set(code, channel);

    const reqHandler = (msg: Ably.Message) => {
      if (msg.data) callbacks.onRequest(msg.data);
    };

    const confirmHandler = (msg: Ably.Message) => {
      if (msg.data && callbacks.onConfirm) callbacks.onConfirm(msg.data);
    };

    const oldReq = this.handshakeReqHandlers.get(code);
    const oldConf = this.handshakeConfHandlers.get(code);
    if (oldReq) channel.unsubscribe('request-identity', oldReq);
    if (oldConf) channel.unsubscribe('identity-confirmed', oldConf);

    this.handshakeReqHandlers.set(code, reqHandler);
    this.handshakeConfHandlers.set(code, confirmHandler);

    channel.subscribe('request-identity', reqHandler);
    channel.subscribe('identity-confirmed', confirmHandler);
  }

  subscribeToHandshake(myCode: string, onRequest: (data: any) => void, onConfirm?: (data: any) => void): () => void {
    if (!myCode || typeof myCode !== 'string' || myCode === 'undefined' || myCode === 'null' || !myCode.trim()) {
      return () => {};
    }
    const cleanCode = myCode.trim();
    this.handshakeCallbacks.set(cleanCode, { onRequest, onConfirm });

    if (this.client && this.isConnected) {
      this._attachHandshakeChannel(cleanCode, { onRequest, onConfirm });
    }

    return () => {
      this.handshakeCallbacks.delete(cleanCode);
      const channel = this.handshakeSubscriptions.get(cleanCode);
      if (channel) {
        const reqHandler = this.handshakeReqHandlers.get(cleanCode);
        const confHandler = this.handshakeConfHandlers.get(cleanCode);
        if (reqHandler) channel.unsubscribe('request-identity', reqHandler);
        if (confHandler) channel.unsubscribe('identity-confirmed', confHandler);
        this.handshakeSubscriptions.delete(cleanCode);
        this.handshakeReqHandlers.delete(cleanCode);
        this.handshakeConfHandlers.delete(cleanCode);
      }
    };
  }

  async sendHandshakeRequest(friendCode: string, data: any): Promise<void> {
    if (!this.client || !friendCode || typeof friendCode !== 'string' || friendCode === 'undefined' || friendCode === 'null' || !friendCode.trim()) return;
    const cleanCode = friendCode.trim();
    const channel = this.client.channels.get(`handshake:${cleanCode}`);
    await channel.publish('request-identity', data);
  }

  async sendHandshakeConfirm(senderCode: string, data: any): Promise<void> {
    if (!this.client || !senderCode || typeof senderCode !== 'string' || senderCode === 'undefined' || senderCode === 'null' || !senderCode.trim()) return;
    const cleanCode = senderCode.trim();
    const channel = this.client.channels.get(`handshake:${cleanCode}`);
    await channel.publish('identity-confirmed', data);
  }

  private _attachChatMessageChannel(chatId: string): void {
    if (!this.client || !chatId) return;
    const channel = this.client.channels.get(`chat:${chatId}`);
    this.chatMessageSubscriptions.set(chatId, channel);

    const handler = (msg: Ably.Message) => {
      if (msg.data) {
        const cbs = this.chatMessageCallbacks.get(chatId);
        if (cbs) {
          cbs.forEach((cb) => {
            try { cb(msg.data); } catch (e) { console.error('[Ably] Callback error:', e); }
          });
        }
      }
    };

    const oldHandler = this.chatMessageHandlers.get(chatId);
    if (oldHandler) {
      try { channel.unsubscribe('client-message', oldHandler); } catch {}
    }

    this.chatMessageHandlers.set(chatId, handler);
    channel.subscribe('client-message', handler);
  }

  async sendMessage(chatId: string, payload: any): Promise<void> {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) return;
    const cleanId = chatId.trim();
    if (!this.client || !this.isConnected) {
      if (this.userId) {
        try { await this.connect(this.userId); } catch {}
      }
    }
    if (!this.client) return;
    const channel = this.client.channels.get(`chat:${cleanId}`);
    await channel.publish('client-message', payload);
  }

  subscribeToChatMessages(chatId: string, onMessage: (data: any) => void): () => void {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) return () => {};
    const cleanId = chatId.trim();
    if (!this.chatMessageCallbacks.has(cleanId)) {
      this.chatMessageCallbacks.set(cleanId, new Set());
    }
    this.chatMessageCallbacks.get(cleanId)!.add(onMessage);

    if (this.client && this.isConnected) {
      this._attachChatMessageChannel(cleanId);
    }

    return () => {
      const cbs = this.chatMessageCallbacks.get(cleanId);
      if (cbs) {
        cbs.delete(onMessage);
        if (cbs.size === 0) {
          this.chatMessageCallbacks.delete(cleanId);
          const channel = this.chatMessageSubscriptions.get(cleanId);
          const handler = this.chatMessageHandlers.get(cleanId);
          if (channel && handler) {
            try { channel.unsubscribe('client-message', handler); } catch {}
          }
          this.chatMessageSubscriptions.delete(cleanId);
          this.chatMessageHandlers.delete(cleanId);
        }
      }
    };
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  getCurrentUserId(): string | null {
    return this.userId;
  }
}

export const ablyService = new AblyService();

if (typeof window !== 'undefined') {
  (window as any).ablyService = ablyService;
  (window as any).switchToNextAblyServer = () => ablyService.switchToNextServer();
  (window as any).getActiveAblyServer = () => ({ index: (ablyService as any).activeKeyIndex, key: ablyService.getActiveKey() });
}