import { useChatStore } from '../../../store/useChatStore';

export function resolveProfileId(chat: any, chatId: string): string {
  if (!chat) return '';
  if (chat.type === 'channel') return chat.id;
  if (chatId === 'notes') return '';
  const candidates = [
    chat.userCode,
    chat.user_code,
    chat.peerCode,
    chat.originalPeerCode,
    chat.userId,
    (chat.name && chat.name.length === 36 ? chat.name : undefined),
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);
  const code36 = candidates.find((c) => c.length === 36);
  if (code36) return code36;

  for (const code of candidates) {
    const users = Object.values(useChatStore.getState().usersById || {});
    const user = users.find((u: any) => u.id === code || u.userId === code || u.user_code === code || u.userCode === code);
    if (user) {
      const uCode = (user as any).userCode || (user as any).user_code || (user.id?.length === 36 ? user.id : null);
      if (uCode && uCode.length === 36) return uCode;
    }
    for (const c of useChatStore.getState().chats) {
      if (c.members) {
        const m = c.members.find((mb: any) => mb.userId === code || mb.user_id === code || mb.userCode === code || mb.user_code === code);
        const mCode = (m?.userCode && m.userCode.length === 36 ? m.userCode : null) || ((m as any)?.user_code && (m as any).user_code.length === 36 ? (m as any).user_code : null);
        if (mCode) return mCode;
      }
    }
  }

  if (chat.avatarUrl) {
    const otherChat = useChatStore.getState().chats.find(
      (c) => c.type === 'private' && c.id !== chat.id && c.avatarUrl === chat.avatarUrl && c.peerCode && c.peerCode.length === 36
    );
    if (otherChat?.peerCode) return otherChat.peerCode;
  }

  const fallbackCandidate = candidates.find((c) => c.length !== 64);
  return fallbackCandidate || '';
}
