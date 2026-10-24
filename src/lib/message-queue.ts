import { useChatStore } from '../store/useChatStore';

interface QueuedMessage {
  id: string;
  chatId: string;
  text: string;
  sender: string;
  time: number;
  retries: number;
  maxRetries: number;
  lastRetryTime: number;
  status: 'pending' | 'delivered' | 'failed';
  targetChatIds: string[];
  mediaPayload?: { type: string; url: string; name?: string; mime?: string };
}

interface MessageAck {
  messageId: string;
  chatId: string;
  receivedBy: string;
  timestamp: number;
}

class MessageQueue {
  private queue: Map<string, QueuedMessage> = new Map();
  private pendingAcks: Map<string, { resolve: () => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private RETRY_INTERVAL_MS = 1000; 
  private MAX_RETRIES = 15; 
  private CLEANUP_INTERVAL_MS = 60_000;
  private deliveredMessages: Set<string> = new Set();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.restoreQueue();
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        for (const msg of this.queue.values()) {
          if (msg.status === 'pending') {
            msg.retries = 0;
          }
        }
      });
    }
  }

  private persistQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      const items: QueuedMessage[] = [];
      for (const msg of this.queue.values()) {
        if (msg.status === 'pending') {
          items.push(msg);
        }
      }
      localStorage.setItem('orbita_offline_msg_queue_v1', JSON.stringify(items));
    } catch {}
  }

  private restoreQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('orbita_offline_msg_queue_v1');
      if (raw) {
        const items: QueuedMessage[] = JSON.parse(raw);
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && item.id && item.status === 'pending') {
              this.queue.set(item.id, item);
            }
          }
        }
      }
    } catch {}
  }

  async sendMessage(
    chatId: string,
    text: string,
    sender: string,
    sendFn: (targetChatId: string, messageData: any) => Promise<void>,
    additionalTargetIds: string[] = [],
    mediaPayload?: { type: string; url: string; name?: string; mime?: string }
  ): Promise<void> {
    const messageId = `${sender}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const targetIds = [chatId, ...additionalTargetIds];

    const queuedMsg: QueuedMessage = {
      id: messageId,
      chatId,
      text,
      sender,
      time: Date.now(),
      retries: 0,
      maxRetries: this.MAX_RETRIES,
      lastRetryTime: 0,
      status: 'pending',
      targetChatIds: targetIds,
      mediaPayload,
    };

    this.queue.set(messageId, queuedMsg);
    this.persistQueue();

    await this.attemptDelivery(messageId, sendFn);

    if (queuedMsg.status === 'pending') {
      this.startRetries(messageId, sendFn);
    }
  }

  private async attemptDelivery(
    messageId: string,
    sendFn: (targetChatId: string, messageData: any) => Promise<void>
  ): Promise<void> {
    const msg = this.queue.get(messageId);
    if (!msg || msg.status !== 'pending' || msg.retries >= msg.maxRetries) return;

    msg.lastRetryTime = Date.now();
    msg.retries++;

    const messageData = {
      id: msg.id,
      sender: msg.sender,
      text: msg.text,
      time: msg.time,
      type: 'message',
      requireAck: true,
      ...(msg.mediaPayload ? { 
        mediaType: msg.mediaPayload.type, 
        mediaUrl: msg.mediaPayload.url, 
        mediaName: msg.mediaPayload.name,
        mime: msg.mediaPayload.mime
      } : {})
    };

    try {
      for (const targetId of msg.targetChatIds) {
        await sendFn(targetId, messageData);
      }
    } catch (error) {
      console.error(`Failed to push message ${messageId} to network:`, error);
    }
  }

  private scheduleNextRetry(
    messageId: string,
    sendFn: (targetChatId: string, messageData: any) => Promise<void>,
    delay: number
  ): void {
    if (this.retryTimers.has(messageId)) {
      clearTimeout(this.retryTimers.get(messageId)!);
      this.retryTimers.delete(messageId);
    }

    const timer = setTimeout(async () => {
      this.retryTimers.delete(messageId);
      const msg = this.queue.get(messageId);
      if (!msg || msg.status !== 'pending') return;

      if (msg.retries >= msg.maxRetries) {
        msg.status = 'failed';
        this.persistQueue();
        useChatStore.getState().updateMessageStatus(msg.chatId, msg.id, 'failed');
        return;
      }

      await this.attemptDelivery(messageId, sendFn);

      if (msg.status === 'pending') {
        const baseDelay = Math.min(this.RETRY_INTERVAL_MS * Math.pow(1.5, Math.min(msg.retries, 6)), 30000);
        const jitter = Math.floor(Math.random() * 500);
        const nextDelay = baseDelay + jitter;
        this.scheduleNextRetry(messageId, sendFn, nextDelay);
      }
    }, delay);

    this.retryTimers.set(messageId, timer);
  }

  private startRetries(
    messageId: string,
    sendFn: (targetChatId: string, messageData: any) => Promise<void>
  ): void {
    this.scheduleNextRetry(messageId, sendFn, this.RETRY_INTERVAL_MS);
  }

  handleIncomingMessage(messageData: any): { isDuplicate: boolean; shouldAck: boolean } {
    const msgId = messageData.id;
    
    if (this.deliveredMessages.has(msgId)) {
      return { isDuplicate: true, shouldAck: true };
    }

    this.deliveredMessages.add(msgId);
    return { isDuplicate: false, shouldAck: messageData.requireAck === true };
  }

  async sendAcknowledgment(
    messageId: string,
    chatId: string,
    receiver: string,
    sendFn: (targetChatId: string, data: any) => Promise<void>
  ): Promise<void> {
    const ack: MessageAck = {
      messageId,
      chatId,
      receivedBy: receiver,
      timestamp: Date.now(),
    };

    try {
      await sendFn(chatId, {
        type: 'message-ack',
        ...ack,
      });
    } catch (error) {
      console.error(`Failed to send ack for message ${messageId}:`, error);
    }
  }

  handleAcknowledgment(ackData: MessageAck): void {
    const msg = this.queue.get(ackData.messageId);
    if (msg) {
      msg.status = 'delivered';
      if (this.retryTimers.has(ackData.messageId)) {
        clearTimeout(this.retryTimers.get(ackData.messageId)!);
        this.retryTimers.delete(ackData.messageId);
      }
      this.persistQueue();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const MAX_AGE_MS = 5 * 60 * 1000;
    
    for (const [msgId, msg] of this.queue) {
      if (msg.status === 'delivered' || msg.status === 'failed' || now - msg.time > MAX_AGE_MS) {
        if (this.retryTimers.has(msgId)) {
          clearTimeout(this.retryTimers.get(msgId)!);
          this.retryTimers.delete(msgId);
        }
        this.queue.delete(msgId);
      }
    }
    this.persistQueue();

    if (this.deliveredMessages.size > 1000) {
      const entries = Array.from(this.deliveredMessages).slice(-500);
      this.deliveredMessages = new Set(entries);
    }
  }

  getStats(): { pending: number; delivered: number; failed: number; total: number } {
    let pending = 0, delivered = 0, failed = 0;
    
    for (const msg of this.queue.values()) {
      if (msg.status === 'pending') pending++;
      else if (msg.status === 'delivered') delivered++;
      else if (msg.status === 'failed') failed++;
    }

    return {
      pending,
      delivered,
      failed,
      total: this.queue.size,
    };
  }

  destroy(): void {
    this.queue.clear();
    this.pendingAcks.forEach((val) => clearTimeout(val.timeout));
    this.pendingAcks.clear();
    this.retryTimers.forEach((val) => clearTimeout(val));
    this.retryTimers.clear();
    this.deliveredMessages.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const messageQueue = new MessageQueue();