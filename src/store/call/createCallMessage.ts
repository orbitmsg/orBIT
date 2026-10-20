import { useChatStore } from '../useChatStore';
import { useAuthStore } from '../useAuthStore';
import type { CallDirection, CallEndedStatus } from './types';

export async function createCallMessage(
  chatId: string,
  direction: CallDirection,
  duration: number,
  endedStatus: CallEndedStatus,
  activeChatType?: string
) {
  try {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!chat || chat.type === 'group' || chat.type === 'channel') return;
    if (activeChatType === 'group' || activeChatType === 'channel') return;
    const myNickname = useAuthStore.getState().nickname || 'YOU';
    const sender = direction === 'outgoing' ? myNickname : chat.name;
    const directionText = direction === 'outgoing' ? 'Исходящий' : 'Входящий';
    let messageText = `[Call] ${directionText}`;
    if (endedStatus === 'completed') {
      const safeDuration = Math.max(0, Math.floor(duration) || 0);
      const mins = Math.floor(safeDuration / 60);
      const secs = safeDuration % 60;
      messageText += `, ${mins}:${secs.toString().padStart(2, '0')}`;
    }
    const myCode = useChatStore.getState().myCode;
    const isOutgoing = direction === 'outgoing';
    const senderId = isOutgoing ? myCode : (chat.peerCode || chat.name);
    const isCompleted = endedStatus === 'completed';
    const initialStatus = isOutgoing
      ? (isCompleted ? 'read' : 'delivered')
      : undefined;
    const isRead = isOutgoing ? true : isCompleted;

    useChatStore.getState().addMessage(chatId, {
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      sender,
      isOutgoing,
      text: messageText,
      time: Date.now(),
      read: isRead,
      status: initialStatus,
      mediaType: 'call',
      mediaUrl: '',
      mediaName: endedStatus || 'completed',
    });
  } catch (err) {
    console.error('[CallStore] Failed to create call message:', err);
  }
}
