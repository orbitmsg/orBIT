import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { DoubleRatchet } from '../lib/double-ratchet';
import { supabaseService } from './supabaseService';
import { getPusher } from '../utils/pusher';
import { ablyService } from './ablyService';

export async function sendEncryptedReadReceipt(chatId: string, messageIds: string[], lastTime?: number): Promise<void> {
  try {
    const state = useChatStore.getState();
    if (!state.readReceiptsEnabled || state.ghostModeEnabled || !chatId || chatId === 'notes') return;

    const chat = state.chats.find((c) => c.id === chatId);
    if (!chat || !chat.ratchetState || chat.type !== 'private') return;

    const myNickname = useAuthStore.getState().nickname || 'User';
    const myCode = state.myCode || '';

    const ratchet = DoubleRatchet.fromState(chat.ratchetState);
    if (!ratchet.canSend()) return;

    const receiptPayload = {
      type: 'receipt',
      receiptType: 'read',
      chatId,
      messageIds,
      time: lastTime || Date.now(),
      sender: myNickname,
      senderId: myCode,
    };

    const plaintext = JSON.stringify(receiptPayload);
    const { ciphertext, index, dhPublicKey } = await ratchet.encrypt(plaintext);

    state.updateChat(chatId, { ratchetState: ratchet.getState() });

    const myUserId = useAuthStore.getState().userId;
    const recipientTargets = Array.from(new Set([
      chat.peerCode,
      chat.name && chat.name.length === 36 ? chat.name : undefined,
    ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
    for (const recipientId of recipientTargets) {
      await supabaseService.sendOfflineMessage(
        chatId,
        myCode || myUserId || myNickname,
        recipientId,
        ciphertext,
        index,
        dhPublicKey
      ).catch(() => {});
    }
  } catch {}
}

class ReceiptQueue {
  private deliveredQueue = new Map<string, Set<string>>();
  private readQueue = new Map<string, Set<string>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  public queueDelivered(chatId: string, messageId: string): void {
    if (!chatId || !messageId) return;
    if (!this.deliveredQueue.has(chatId)) {
      this.deliveredQueue.set(chatId, new Set());
    }
    this.deliveredQueue.get(chatId)!.add(messageId);
    this.scheduleFlush();
  }

  public queueRead(chatId: string, messageId: string): void {
    if (!chatId || !messageId) return;
    if (!this.readQueue.has(chatId)) {
      this.readQueue.set(chatId, new Set());
    }
    this.readQueue.get(chatId)!.add(messageId);
    if (this.deliveredQueue.has(chatId)) {
      this.deliveredQueue.get(chatId)!.delete(messageId);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 300);
  }

  public flush(): void {
    const nickname = useAuthStore.getState().nickname || 'user';
    const now = Date.now();

    for (const [chatId, idSet] of this.deliveredQueue.entries()) {
      if (idSet.size === 0) continue;
      const messageIds = Array.from(idSet);
      idSet.clear();

      for (const mId of messageIds) {
        ablyService.markMessageDelivered(chatId, mId);
      }

      try {
        const pusher = getPusher();
        const ch = pusher.channel(`private-chat-${chatId}`) || pusher.subscribe(`private-chat-${chatId}`);
        const payload = {
          type: 'delivered',
          messageId: messageIds[messageIds.length - 1],
          messageIds,
          time: now,
          sender: nickname,
        };
        const trigger = () => {
          try {
            ch.trigger('client-message', payload);
          } catch {}
        };
        if (ch.subscribed) trigger();
        else ch.bind('pusher:subscription_succeeded', function onSub() {
          ch.unbind('pusher:subscription_succeeded', onSub);
          trigger();
        });
      } catch {}
    }

    for (const [chatId, idSet] of this.readQueue.entries()) {
      if (idSet.size === 0) continue;
      const messageIds = Array.from(idSet);
      idSet.clear();

      for (const mId of messageIds) {
        ablyService.markMessageRead(chatId, mId);
      }

      sendEncryptedReadReceipt(chatId, messageIds, now).catch(() => {});
      supabaseService.purgeServerMessages(chatId, messageIds);

      try {
        const pusher = getPusher();
        const ch = pusher.channel(`private-chat-${chatId}`) || pusher.subscribe(`private-chat-${chatId}`);
        const payload = {
          type: 'read',
          messageId: messageIds[messageIds.length - 1],
          messageIds,
          time: now,
          sender: nickname,
        };
        const trigger = () => {
          try {
            ch.trigger('client-message', payload);
          } catch {}
        };
        if (ch.subscribed) trigger();
        else ch.bind('pusher:subscription_succeeded', function onSub() {
          ch.unbind('pusher:subscription_succeeded', onSub);
          trigger();
        });
      } catch {}
    }
  }
}

export const receiptQueue = new ReceiptQueue();
