import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { relayRouter } from './relayRouter';
import { getVercelBaseUrl } from './gatewayManager';
import { SUPPORT_AVATAR_URL } from './supportService';
import { networkManager } from './networkManager';

export type {
  OfflineMessageRecord,
  OfflineHandshakeRecord,
  ProfileUpdateRecord,
  UserDirectoryRecord,
  UserPublicKeysRecord,
  OneTimePreKeyRecord,
  PreKeyBundle,
} from './supabaseTypes';
import type {
  OfflineMessageRecord,
  OfflineHandshakeRecord,
  ProfileUpdateRecord,
  UserDirectoryRecord,
  PreKeyBundle,
} from './supabaseTypes';

class SupabaseService {
  private client: SupabaseClient | null = null;
  private failedRelays: Map<string, number> = new Map();
  private presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL || 'https://majmrtymawymomliowbz.supabase.co';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ham1ydHltYXd5bW9tbGlvd2J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODQ5NzgsImV4cCI6MjA5OTk2MDk3OH0.VFyDYZdgRPm-_L-GObvfkKrilnE1GP7MJ2CWDW7-nRU';

    if (url && anonKey) {
      this.client = createClient(url, anonKey);
    }
  }

  async sendOfflineMessage(
    chatId: string,
    senderId: string,
    recipientId: string,
    ciphertext: string,
    index: number,
    dhPublicKey: string,
    clientMsgId?: string,
    prevChainCount?: number
  ): Promise<void> {
    console.log('[Relay/Supabase] sendOfflineMessage called:', { chatId, senderId, recipientId, index, clientMsgId, prevChainCount });

    const primaryRelay = relayRouter.getRelayForRecipient(recipientId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    let lastError: any = null;

    for (const relay of allRelays) {
      try {
        const res = await networkManager.safeFetch(`${relay.url}/relay/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            senderId,
            recipientId,
            ciphertext,
            messageIndex: index,
            dhPublicKey,
            clientMsgId,
            prevChainCount,
          }),
        }, 8000, 0);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        console.log(`[Relay] Message dispatched to ${relay.name} (${relay.url})`);
        return;
      } catch (err) {
        console.warn(`[Relay] Failed on ${relay.name} (${relay.url}), trying next relay:`, err);
        lastError = err;
      }
    }

    if (this.client) {
      const row: any = {
        chat_id: chatId,
        sender_id: senderId,
        recipient_id: recipientId,
        ciphertext,
        message_index: index,
        dh_public_key: dhPublicKey,
        prev_chain_count: prevChainCount !== undefined ? prevChainCount : null,
      };
      if (clientMsgId) {
        row.id = clientMsgId;
      }
      const { error } = await this.client
        .from('messages')
        .insert(row);

      if (error) {
        console.error('[Supabase] Insert error:', error);
        throw new Error(`Failed to save offline message: ${error.message}`);
      }
      return;
    }

    throw lastError || new Error('All relays failed');
  }

  async saveNonMessage(
    chatId: string,
    senderId: string,
    recipientId: string,
    plaintext: string,
    messageId: string,
  ): Promise<void> {
    const allRelays = relayRouter.getNodes();
    let sentToRelay = false;

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/non-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: messageId,
            chatId,
            senderId,
            recipientId,
            ciphertext: plaintext,
          }),
        });
        if (res.ok) {
          sentToRelay = true;
          break;
        }
      } catch (err) {
        console.warn(`[Relay] Failed to save non-message on ${relay.url}:`, err);
      }
    }

    if (!sentToRelay && this.client) {
      const { error } = await this.client
        .from('non_messages')
        .insert({
          id: messageId,
          chat_id: chatId,
          sender_id: senderId,
          recipient_id: recipientId,
          ciphertext: plaintext,
          message_index: 0,
        });
      if (error) {
        console.error('[Supabase] saveNonMessage error:', error);
      }
    }
  }

  async getPendingNonMessagesBatch(recipientIds: string[]): Promise<OfflineMessageRecord[]> {
    if (!recipientIds || recipientIds.length === 0) return [];
    const allRelays = relayRouter.getNodes();
    const allNonMessages: OfflineMessageRecord[] = [];
    const seenIds = new Set<string>();
    const idsParam = recipientIds.map((id) => id.trim()).filter(Boolean).join(',');

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/non-messages?recipientIds=${encodeURIComponent(idsParam)}`);
        if (res.ok) {
          const data = (await res.json()) as { non_messages: OfflineMessageRecord[] };
          if (data?.non_messages && Array.isArray(data.non_messages)) {
            for (const rec of data.non_messages) {
              if (!seenIds.has(rec.id)) {
                seenIds.add(rec.id);
                allNonMessages.push(rec);
              }
            }
          }
        }
      } catch {}
    }

    if (allNonMessages.length > 0 || !this.client) {
      return allNonMessages;
    }

    if (this.client) {
      const { data, error } = await this.client
        .from('non_messages')
        .select('*')
        .in('recipient_id', recipientIds)
        .eq('delivered', false)
        .order('created_at', { ascending: true });

      if (!error && data) {
        for (const rec of data) {
          if (!seenIds.has(rec.id)) {
            seenIds.add(rec.id);
            allNonMessages.push(rec);
          }
        }
      }
    }

    return allNonMessages;
  }

  async getPendingNonMessages(recipientId: string): Promise<OfflineMessageRecord[]> {
    const allRelays = relayRouter.getNodes();
    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/non-messages?recipientId=${encodeURIComponent(recipientId)}`);
        if (res.ok) {
          const data = (await res.json()) as { non_messages: OfflineMessageRecord[] };
          if (data?.non_messages && Array.isArray(data.non_messages)) {
            return data.non_messages;
          }
        }
      } catch (err) {
        console.warn(`[Relay] Failed to get pending non-messages from ${relay.url}:`, err);
      }
    }

    if (!this.client) return [];
    const { data, error } = await this.client
      .from('non_messages')
      .select('*')
      .eq('recipient_id', recipientId)
      .eq('delivered', false)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[Supabase] getPendingNonMessages error:', error);
      return [];
    }
    return data || [];
  }

  async markNonMessageDelivered(messageId: string): Promise<void> {
    if (!messageId) return;
    const allRelays = relayRouter.getNodes();
    for (const relay of allRelays) {
      fetch(`${relay.url}/relay/non-message/delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      }).catch(() => {});
    }

    if (this.client) {
      await this.client
        .from('non_messages')
        .delete()
        .eq('id', messageId)
        .then(({ error }) => {
          if (error) console.error('[Supabase] markNonMessageDelivered error:', error);
        });
    }
  }

  async purgeServerMessages(chatId: string, messageIds: string[]): Promise<void> {
    if (!messageIds || messageIds.length === 0) return;
    const cleanIds = messageIds.filter(Boolean);
    if (cleanIds.length === 0) return;

    const relays = relayRouter.getNodes();
    await Promise.all(
      relays.map((relay) =>
        fetch(`${relay.url}/relay/delete-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageIds: cleanIds }),
        }).catch(() => {})
      )
    );

    if (this.client) {
      try {
        await this.client.from('messages').delete().in('id', cleanIds);
      } catch {}
      try {
        await this.client.from('non_messages').delete().in('id', cleanIds);
      } catch {}
    }
  }

  async deleteMessage(
    chatId: string,
    messageId: string,
    recipientId?: string,
    senderId?: string
  ): Promise<void> {
    if (!chatId || !messageId) return;

    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    for (const relay of allRelays) {
      try {
        await fetch(`${relay.url}/relay/delete-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageId, recipientId, senderId }),
        });
      } catch {}
    }

    if (this.client) {
      try {
        await this.client.from('non_messages').delete().eq('id', messageId);
      } catch {}
      try {
        await this.client.from('messages').delete().eq('id', messageId);
      } catch {}
      try {
        await this.client.from('non_messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
      } catch {}
      try {
        await this.client.from('messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
      } catch {}

      if (recipientId) {
        try {
          const deletePayload = JSON.stringify({
            type: 'delete-message',
            targetMessageId: messageId,
            chatId,
          });
          const deletionEventId = `del_${messageId}_${Date.now()}`;
          await this.client.from('messages').insert({
            id: deletionEventId,
            chat_id: chatId,
            sender_id: senderId || 'system',
            recipient_id: recipientId,
            ciphertext: deletePayload,
            dh_public_key: 'PRE_HANDSHAKE',
            message_index: 0,
            delivered: false,
          });
        } catch {}
      }
    }
  }

  async deleteChatData(chatId: string, recipientId?: string | string[], senderId?: string): Promise<void> {
    if (!chatId || chatId === 'notes') return;

    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    for (const relay of allRelays) {
      try {
        await fetch(`${relay.url}/relay/delete-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, recipientId, senderId }),
        });
      } catch {}
    }

    if (this.client) {
      try {
        await this.client.from('messages').delete().eq('chat_id', chatId);
      } catch {}
      try {
        await this.client.from('non_messages').delete().eq('chat_id', chatId);
      } catch {}
      try {
        await this.client.from('offline_handshakes').delete().eq('chat_id', chatId);
      } catch {}
      try {
        await this.client.from('reactions').delete().eq('chat_id', chatId);
      } catch {}

      if (recipientId) {
        const recipients = Array.isArray(recipientId) ? recipientId : [recipientId];
        for (const rId of recipients) {
          if (!rId) continue;
          try {
            const deletePayload = JSON.stringify({
              type: 'system',
              action: 'delete-chat',
              chatId,
            });
            const eventId = `sys_del_${chatId}_${rId}_${Date.now()}`;
            await this.client.from('non_messages').insert({
              id: eventId,
              chat_id: chatId,
              sender_id: senderId || 'system',
              recipient_id: rId,
              ciphertext: deletePayload,
              delivered: false,
            });
          } catch {}
        }
      }
    }
  }

  async clearChatHistory(chatId: string, recipientId?: string | string[], senderId?: string): Promise<void> {
    if (!chatId || chatId === 'notes') return;

    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    for (const relay of allRelays) {
      try {
        await fetch(`${relay.url}/relay/clear-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, recipientId, senderId }),
        });
      } catch {}
    }

    if (this.client) {
      try {
        await this.client.from('messages').delete().eq('chat_id', chatId);
      } catch {}
      try {
        await this.client.from('reactions').delete().eq('chat_id', chatId);
      } catch {}

      if (recipientId) {
        const recipients = Array.isArray(recipientId) ? recipientId : [recipientId];
        for (const rId of recipients) {
          if (!rId) continue;
          try {
            const clearPayload = JSON.stringify({
              type: 'system',
              action: 'clear-history',
              chatId,
            });
            const eventId = `sys_clr_${chatId}_${rId}_${Date.now()}`;
            await this.client.from('non_messages').insert({
              id: eventId,
              chat_id: chatId,
              sender_id: senderId || 'system',
              recipient_id: rId,
              ciphertext: clearPayload,
              delivered: false,
            });
          } catch {}
        }
      }
    }
  }

  async getPendingMessagesBatch(recipientIds: string[]): Promise<OfflineMessageRecord[]> {
    if (!recipientIds || recipientIds.length === 0) return [];
    const cleanIds = Array.from(new Set(recipientIds.map((id) => (id || '').trim()).filter(Boolean)));
    if (cleanIds.length === 0) return [];

    if (this.client) {
      try {
        let query = this.client
          .from('messages')
          .select('*')
          .eq('delivered', false)
          .order('created_at', { ascending: true })
          .order('message_index', { ascending: true });

        if (cleanIds.length === 1) {
          query = query.eq('recipient_id', cleanIds[0]);
        } else {
          query = query.in('recipient_id', cleanIds);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data;
        }
      } catch {}
    }

    const primaryRelay = relayRouter.getRelayForRecipient(cleanIds[0]);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    for (const relay of allRelays) {
      const lastFail = this.failedRelays.get(relay.url) || 0;
      if (Date.now() - lastFail < 10000) continue;

      try {
        const url = `${relay.url}/relay/messages?recipientIds=${encodeURIComponent(cleanIds.join(','))}`;
        const res = await networkManager.safeFetch(url, undefined, 6000, 1);
        if (res.ok) {
          const data = (await res.json()) as { messages: OfflineMessageRecord[] };
          if (Array.isArray(data.messages)) {
            return data.messages;
          }
        } else {
          this.failedRelays.set(relay.url, Date.now());
        }
      } catch {
        this.failedRelays.set(relay.url, Date.now());
      }
    }

    return [];
  }

  async getPendingMessages(recipientId: string): Promise<OfflineMessageRecord[]> {
    const activeRelays = relayRouter.getActiveRelaysForMe(recipientId);
    const allMessages: OfflineMessageRecord[] = [];
    const seenIds = new Set<string>();

    for (const relay of activeRelays) {
      const lastFail = this.failedRelays.get(relay.url) || 0;
      if (Date.now() - lastFail < 10000) continue;

      try {
        const res = await networkManager.safeFetch(`${relay.url}/relay/messages?recipientId=${encodeURIComponent(recipientId)}`, undefined, 8000, 1);
        if (res.ok) {
          const data = (await res.json()) as { messages: OfflineMessageRecord[] };
          for (const msg of data.messages || []) {
            if (!seenIds.has(msg.id)) {
              seenIds.add(msg.id);
              allMessages.push(msg);
            }
          }
        } else {
          this.failedRelays.set(relay.url, Date.now());
        }
      } catch (err) {
        this.failedRelays.set(relay.url, Date.now());
        console.warn(`[Relay] Failed to fetch pending messages from ${relay.url}:`, err);
      }
    }

    if (allMessages.length > 0 || !this.client) {
      return allMessages.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.message_index ?? 0) - (b.message_index ?? 0);
      });
    }

    if (this.client) {
      const { data, error } = await this.client
        .from('messages')
        .select('*')
        .eq('recipient_id', recipientId)
        .eq('delivered', false)
        .order('created_at', { ascending: true })
        .order('message_index', { ascending: true });

      if (error) {
        console.error('[Supabase] Failed to fetch pending messages:', error);
        return allMessages;
      }

      return data || [];
    }

    return allMessages;
  }

  async markMessageDelivered(messageId: string, recipientId?: string): Promise<void> {
    console.log('[Relay/Supabase] markMessageDelivered:', { messageId });

    const relays = recipientId ? relayRouter.getActiveRelaysForMe(recipientId) : relayRouter.getNodes();

    await Promise.all(
      relays.map((relay) =>
        fetch(`${relay.url}/relay/message/delivered`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId }),
        }).catch((err) => console.warn(`[Relay] Error delivering ack to ${relay.url}:`, err))
      )
    );

    if (this.client) {
      await this.client
        .from('messages')
        .update({
          delivered: true,
          expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
        })
        .eq('id', messageId)
        .eq('delivered', false)
        .maybeSingle()
        .then(({ error }) => {
          if (error) console.error('[Supabase] Direct fallback mark delivered error:', error);
        });
    }
  }

  async sendOfflineHandshake(
    chatId: string,
    recipientCode: string,
    senderNickname: string,
    senderPublicKey: string,
    senderAvatarUrl: string | null,
    senderCode: string,
    senderUsername?: string | null,
    senderBirthday?: string | null
  ): Promise<void> {
    console.log('[Relay/Supabase] sendOfflineHandshake called:', { chatId, recipientCode, senderNickname });

    const primaryRelay = relayRouter.getRelayForRecipient(recipientCode);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    let lastError: any = null;

    const relayPayload: Record<string, any> = {
      chatId,
      recipientCode,
      senderNickname,
      senderPublicKey,
      senderAvatarUrl,
      senderCode,
    };
    if (senderUsername !== undefined) relayPayload.senderUsername = senderUsername;
    if (senderBirthday !== undefined) relayPayload.senderBirthday = senderBirthday;

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/handshake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(relayPayload),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        console.log(`[Relay] Handshake dispatched to ${relay.name} (${relay.url})`);
        return;
      } catch (err) {
        console.warn(`[Relay] Handshake failed on ${relay.name} (${relay.url}), trying next relay:`, err);
        lastError = err;
      }
    }

    if (this.client) {
      const insertRow: Record<string, any> = {
        chat_id: chatId,
        recipient_code: recipientCode,
        sender_nickname: senderNickname,
        sender_public_key: senderPublicKey,
        sender_avatar_url: senderAvatarUrl,
        sender_code: senderCode,
      };
      if (senderUsername !== undefined) insertRow.sender_username = senderUsername;
      if (senderBirthday !== undefined) insertRow.sender_birthday = senderBirthday;

      let { error } = await this.client
        .from('handshakes')
        .insert(insertRow);

      if (error && (error.code === 'PGRST204' || error.message?.includes('sender_username') || error.message?.includes('sender_birthday'))) {
        delete insertRow.sender_username;
        delete insertRow.sender_birthday;
        const retryRes = await this.client
          .from('handshakes')
          .insert(insertRow);
        error = retryRes.error;
      }

      if (error) {
        console.error('[Supabase] Handshake insert error:', error);
        throw new Error(`Failed to save offline handshake: ${error.message}`);
      }
      return;
    }

    throw lastError || new Error('All relay nodes failed');
  }

  async getPendingHandshakesBatch(recipientCodes: string[]): Promise<OfflineHandshakeRecord[]> {
    if (!recipientCodes || recipientCodes.length === 0) return [];
    const nodes = relayRouter.getNodes();
    const allHandshakes: OfflineHandshakeRecord[] = [];
    const seenIds = new Set<string>();
    const codesParam = recipientCodes.map((c) => c.trim()).filter(Boolean).join(',');

    for (const relay of nodes) {
      const lastFail = this.failedRelays.get(relay.url) || 0;
      if (Date.now() - lastFail < 10000) continue;

      try {
        const res = await networkManager.safeFetch(`${relay.url}/relay/handshakes?recipientCodes=${encodeURIComponent(codesParam)}`, undefined, 8000, 1);
        if (res.ok) {
          const data = (await res.json()) as { handshakes: OfflineHandshakeRecord[] };
          for (const hs of data.handshakes || []) {
            if (!seenIds.has(hs.id)) {
              seenIds.add(hs.id);
              allHandshakes.push(hs);
            }
          }
        } else {
          this.failedRelays.set(relay.url, Date.now());
        }
      } catch (err) {
        this.failedRelays.set(relay.url, Date.now());
      }
    }

    if (allHandshakes.length > 0 || !this.client) {
      return allHandshakes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    if (this.client) {
      const { data, error } = await this.client
        .from('handshakes')
        .select('*')
        .in('recipient_code', recipientCodes)
        .eq('consumed', false)
        .order('created_at', { ascending: true });

      if (!error && data) {
        for (const hs of data) {
          if (!seenIds.has(hs.id)) {
            seenIds.add(hs.id);
            allHandshakes.push(hs);
          }
        }
      }
    }

    return allHandshakes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async getPendingHandshakes(recipientCode: string): Promise<OfflineHandshakeRecord[]> {
    const nodes = relayRouter.getNodes();
    const allHandshakes: OfflineHandshakeRecord[] = [];
    const seenIds = new Set<string>();

    for (const relay of nodes) {
      const lastFail = this.failedRelays.get(relay.url) || 0;
      if (Date.now() - lastFail < 10000) continue;

      try {
        const res = await networkManager.safeFetch(`${relay.url}/relay/handshakes?recipientCode=${encodeURIComponent(recipientCode)}`, undefined, 8000, 1);
        if (res.ok) {
          const data = (await res.json()) as { handshakes: OfflineHandshakeRecord[] };
          for (const hs of data.handshakes || []) {
            if (!seenIds.has(hs.id)) {
              seenIds.add(hs.id);
              allHandshakes.push(hs);
            }
          }
        } else {
          this.failedRelays.set(relay.url, Date.now());
        }
      } catch (err) {
        this.failedRelays.set(relay.url, Date.now());
        console.warn(`[Relay] Failed to fetch pending handshakes from ${relay.url}:`, err);
      }
    }

    if (allHandshakes.length > 0 || !this.client) {
      return allHandshakes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    if (this.client) {
      const { data, error } = await this.client
        .from('handshakes')
        .select('*')
        .eq('recipient_code', recipientCode)
        .eq('consumed', false)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Supabase] Failed to fetch pending handshakes:', error);
        return allHandshakes;
      }

      return data || [];
    }

    return allHandshakes;
  }

  async markHandshakeConsumed(handshakeId: string, _recipientCode?: string): Promise<void> {
    console.log('[Relay/Supabase] markHandshakeConsumed:', { handshakeId });

    const relays = relayRouter.getNodes();

    await Promise.all(
      relays.map((relay) =>
        fetch(`${relay.url}/relay/handshake/consumed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handshakeId }),
        }).catch((err) => console.warn(`[Relay] Error consuming handshake on ${relay.url}:`, err))
      )
    );

    if (this.client) {
      await this.client
        .from('handshakes')
        .delete()
        .eq('id', handshakeId)
        .then(({ error }) => {
          if (error) console.error('[Supabase] Direct delete handshake error:', error);
        });
    }
  }

  private normalizeUsername(username?: string | null): string | null | undefined {
    if (username === undefined) return undefined;
    if (username === null) return null;
    const cleaned = username.replace(/^@+/, '').trim().toLowerCase();
    return cleaned.length > 0 ? cleaned : null;
  }

  private stripMissingProfileColumns(payload: Record<string, any>, error: any): boolean {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (!msg && code !== 'PGRST204') return false;
    let stripped = false;
    for (const col of ['banner_url', 'birthday', 'username', 'hide_profile_id']) {
      if (Object.prototype.hasOwnProperty.call(payload, col) && (msg.includes(col) || (code === 'PGRST204' && col === 'banner_url'))) {
        delete payload[col];
        stripped = true;
      }
    }
    return stripped;
  }

  private coalesceProfileRecords(records: ProfileUpdateRecord[]): ProfileUpdateRecord | null {
    if (!records || records.length === 0) return null;
    const newest = records[0];
    const newestSender = newest.sender_code ? newest.sender_code.toLowerCase() : null;
    const ownerRecords = records.filter((r) => {
      if (!newestSender) {
        return !r.sender_code || (r.chat_id && newest.chat_id && r.chat_id.toLowerCase() === newest.chat_id.toLowerCase());
      }
      return !r.sender_code || r.sender_code.toLowerCase() === newestSender;
    });
    const pick = <K extends keyof ProfileUpdateRecord>(key: K): ProfileUpdateRecord[K] | null => {
      for (const r of ownerRecords) {
        const val = r[key];
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
      return null;
    };
    return {
      ...newest,
      nickname: pick('nickname'),
      avatar_url: pick('avatar_url'),
      banner_url: pick('banner_url'),
      username: pick('username'),
      bio: pick('bio'),
      birthday: pick('birthday'),
      sender_code: pick('sender_code'),
      numeric_id: pick('numeric_id'),
      hide_profile_id: ownerRecords.find((r) => r.hide_profile_id !== undefined && r.hide_profile_id !== null)?.hide_profile_id ?? null,
    };
  }

  private async fetchProfileCandidates(chatId: string, excludeCode?: string): Promise<ProfileUpdateRecord[]> {
    const nodes = relayRouter.getNodes();
    const queryParam = excludeCode ? `&excludeCode=${encodeURIComponent(excludeCode)}` : '';
    const ex = excludeCode ? excludeCode.toLowerCase() : null;
    const candidates: ProfileUpdateRecord[] = [];

    const relayResults = await Promise.allSettled(
      nodes.map(async (relay) => {
        const res = await networkManager.safeFetch(
          `${relay.url}/relay/profile?chatId=${encodeURIComponent(chatId)}${queryParam}`,
          undefined,
          7000,
          1
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { profile: ProfileUpdateRecord | null };
        return data?.profile ? this.parseProfileRow(data.profile) : null;
      })
    );

    for (const res of relayResults) {
      if (res.status === 'fulfilled' && res.value) {
        const p = res.value;
        if (ex && p.sender_code && p.sender_code.toLowerCase() === ex) continue;
        candidates.push(p);
      }
    }

    if (this.client) {
      const safeChatId = chatId.replace(/[,()]/g, '');
      const { data, error } = await this.client
        .from('profile_updates')
        .select('*')
        .or(`chat_id.eq.${safeChatId},sender_code.ilike.${safeChatId}`)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[Supabase] Failed to fetch latest profile update:', error);
      } else if (data && Array.isArray(data)) {
        for (const row of data) {
          const parsed = this.parseProfileRow(row);
          if (!parsed) continue;
          if (ex && parsed.sender_code && parsed.sender_code.toLowerCase() === ex) continue;
          candidates.push(parsed);
        }
      }
    }

    if (candidates.length === 0) return [];

    candidates.sort((a, b) => {
      const tA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tB - tA;
    });

    if (!ex) {
      const targetLower = chatId.toLowerCase();
      const directPublic = candidates.filter((c) =>
        (c.sender_code && c.sender_code.toLowerCase() === targetLower) ||
        (c.chat_id && c.chat_id.toLowerCase() === targetLower && !c.sender_code)
      );
      if (directPublic.length > 0) {
        return directPublic;
      }
    }

    return candidates;
  }

  async saveProfileUpdate(
    chatId: string,
    nickname: string | null,
    avatarUrl: string | null,
    senderCode?: string | null,
    bio?: string | null,
    username?: string | null,
    birthday?: string | null,
    bannerUrl?: string | null
  ): Promise<void> {
    if (!chatId || chatId === 'notes') return;

    let cleanUsername = this.normalizeUsername(username);
    let cleanBirthday = birthday !== undefined ? (birthday || null) : undefined;
    let cleanBannerUrl = bannerUrl !== undefined ? (bannerUrl || null) : undefined;
    let cleanBio = bio !== undefined ? (bio || null) : undefined;
    let cleanNickname: string | null | undefined = nickname !== undefined ? nickname : undefined;
    let cleanAvatarUrl: string | null | undefined = avatarUrl !== undefined ? avatarUrl : undefined;

    if (typeof cleanBio === 'string') {
      const bannerMatch = cleanBio.match(/<!--banner:(.*?)-->/);
      if (bannerMatch && cleanBannerUrl === undefined) {
        cleanBannerUrl = bannerMatch[1] || null;
      }
      cleanBio = cleanBio.replace(/<!--banner:.*?-->/g, '').trim() || null;
    }

    let existingSupabaseRows: any[] = [];
    let existingMerged: ProfileUpdateRecord | null = null;
    let previousUsername: string | null = null;

    if (this.client) {
      try {
        let queryBuilder = this.client
          .from('profile_updates')
          .select('*')
          .eq('chat_id', chatId);
        if (senderCode) {
          queryBuilder = queryBuilder.ilike('sender_code', senderCode);
        } else {
          queryBuilder = queryBuilder.is('sender_code', null);
        }
        const { data: rows } = await queryBuilder
          .order('updated_at', { ascending: false })
          .limit(10);

        if (rows && rows.length > 0) {
          existingSupabaseRows = rows;
        } else if (senderCode && chatId.toLowerCase() === senderCode.toLowerCase()) {
          const { data: legacyRows } = await this.client
            .from('profile_updates')
            .select('*')
            .eq('chat_id', chatId)
            .is('sender_code', null)
            .order('updated_at', { ascending: false })
            .limit(10);
          if (legacyRows && legacyRows.length > 0) {
            existingSupabaseRows = legacyRows;
          }
        }

        if (existingSupabaseRows.length > 0) {
          const parsedRows = existingSupabaseRows
            .map((r) => this.parseProfileRow(r))
            .filter((r): r is ProfileUpdateRecord => r !== null);
          existingMerged = this.coalesceProfileRecords(parsedRows);
          previousUsername = existingMerged?.username || null;
        }
      } catch {}
    }

    const needsExistingFallback =
      cleanUsername === undefined ||
      cleanBirthday === undefined ||
      cleanBannerUrl === undefined ||
      cleanBio === undefined ||
      cleanNickname === undefined ||
      cleanNickname === null ||
      cleanAvatarUrl === undefined;

    if (needsExistingFallback && !existingMerged) {
      try {
        const lookupTarget = senderCode || chatId;
        const candidates = await this.fetchProfileCandidates(lookupTarget);
        const filtered = senderCode
          ? candidates.filter((c) => !c.sender_code || c.sender_code.toLowerCase() === senderCode.toLowerCase())
          : candidates;
        if (filtered.length > 0) {
          existingMerged = this.coalesceProfileRecords(filtered);
          previousUsername = existingMerged?.username || null;
        }
      } catch {}
    }

    if (existingMerged) {
      if (cleanUsername === undefined) cleanUsername = existingMerged.username ?? null;
      if (cleanBirthday === undefined) cleanBirthday = existingMerged.birthday ?? null;
      if (cleanBannerUrl === undefined) cleanBannerUrl = existingMerged.banner_url ?? null;
      if (cleanBio === undefined) cleanBio = existingMerged.bio ?? null;
      if (cleanNickname === undefined || (cleanNickname === null && existingMerged.nickname)) {
        cleanNickname = existingMerged.nickname ?? null;
      }
      if (cleanAvatarUrl === undefined) cleanAvatarUrl = existingMerged.avatar_url ?? null;
    }

    if (cleanUsername) {
      try {
        const isAvailable = await this.isUsernameAvailable(cleanUsername, senderCode || chatId);
        if (!isAvailable) {
          throw new Error('USERNAME_TAKEN');
        }
      } catch (err: any) {
        if (err?.message === 'USERNAME_TAKEN') {
          throw err;
        }
      }
    }

    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    const relayBody: Record<string, any> = {
      chatId,
    };
    if (cleanNickname !== undefined) relayBody.nickname = cleanNickname;
    if (cleanAvatarUrl !== undefined) relayBody.avatarUrl = cleanAvatarUrl;
    if (cleanBannerUrl !== undefined) relayBody.bannerUrl = cleanBannerUrl;
    if (senderCode !== undefined) relayBody.senderCode = senderCode;
    if (cleanBio !== undefined) relayBody.bio = cleanBio;
    if (cleanUsername !== undefined) relayBody.username = cleanUsername;
    if (cleanBirthday !== undefined) relayBody.birthday = cleanBirthday;

    let relaySuccessCount = 0;
    let lastRelayError: any = null;

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(relayBody),
        });
        if (res.status === 409) {
          throw new Error('USERNAME_TAKEN');
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errData?.error || `HTTP ${res.status}`);
        }
        relaySuccessCount++;
      } catch (err: any) {
        if (err?.message === 'USERNAME_TAKEN') {
          throw err;
        }
        lastRelayError = err;
        console.warn(`[Relay] Failed to save profile update on ${relay.url}:`, err);
      }
    }

    let supaError: any = null;
    if (this.client) {
      let effectiveBio = cleanBio || null;
      if (cleanBannerUrl) {
        effectiveBio = effectiveBio ? `${effectiveBio}\n<!--banner:${cleanBannerUrl}-->` : `<!--banner:${cleanBannerUrl}-->`;
      }
      const writePayload: Record<string, any> = {
        chat_id: chatId,
        nickname: cleanNickname !== undefined ? cleanNickname : null,
        avatar_url: cleanAvatarUrl !== undefined ? cleanAvatarUrl : null,
        sender_code: senderCode || null,
        bio: effectiveBio,
        username: cleanUsername !== undefined ? cleanUsername : null,
        birthday: cleanBirthday !== undefined ? cleanBirthday : null,
        banner_url: cleanBannerUrl !== undefined ? cleanBannerUrl : null,
        updated_at: new Date().toISOString(),
      };

      if (existingSupabaseRows.length > 0 && existingSupabaseRows[0]?.id) {
        const targetId = existingSupabaseRows[0].id;
        const updateRes = await this.client
          .from('profile_updates')
          .update(writePayload)
          .eq('id', targetId);
        supaError = updateRes.error;

        if (supaError && this.stripMissingProfileColumns(writePayload, supaError)) {
          const retryRes = await this.client
            .from('profile_updates')
            .update(writePayload)
            .eq('id', targetId);
          supaError = retryRes.error;
        }

        if (!supaError && existingSupabaseRows.length > 1) {
          const duplicateIds = existingSupabaseRows.slice(1).map((r) => r.id).filter(Boolean);
          if (duplicateIds.length > 0) {
            await this.client.from('profile_updates').delete().in('id', duplicateIds);
          }
        }
      } else {
        const insertRes = await this.client
          .from('profile_updates')
          .insert(writePayload);
        supaError = insertRes.error;

        if (supaError && this.stripMissingProfileColumns(writePayload, supaError)) {
          const retryRes = await this.client
            .from('profile_updates')
            .insert(writePayload);
          supaError = retryRes.error;
        }
      }

      if (supaError) {
        if (relaySuccessCount === 0) {
          console.error('[Supabase] Failed to save profile update:', supaError);
          throw new Error(`Failed to save profile update: ${supaError.message}`);
        }
        console.warn('[Supabase] Direct profile update failed after relay save:', supaError);
      }
    } else if (relaySuccessCount === 0) {
      throw lastRelayError || new Error('Failed to save profile update on all relay nodes');
    }

    networkManager.invalidateCache(`profile_update:${chatId}:`);
    networkManager.invalidateCache(`public_profile:${chatId}`);
    if (senderCode) {
      networkManager.invalidateCache(`profile_update:${senderCode}:`);
      networkManager.invalidateCache(`public_profile:${senderCode}`);
    }
    if (cleanUsername) {
      networkManager.invalidateCache(`profile_username:${cleanUsername}`);
    }
    if (previousUsername && previousUsername !== cleanUsername) {
      networkManager.invalidateCache(`profile_username:${previousUsername}`);
    }
  }

  private parseProfileRow(row: any): ProfileUpdateRecord | null {
    if (!row) return null;
    let bannerUrl = row.banner_url || null;
    let bio = row.bio || null;
    if (bio && typeof bio === 'string') {
      const bannerMatch = bio.match(/<!--banner:(.*?)-->/);
      if (bannerMatch) {
        if (!bannerUrl) {
          bannerUrl = bannerMatch[1] || null;
        }
        bio = bio.replace(/<!--banner:.*?-->/g, '').trim() || null;
      }
    }
    const normalizedUsername = this.normalizeUsername(row.username);
    return {
      ...row,
      username: normalizedUsername === undefined ? null : normalizedUsername,
      banner_url: bannerUrl,
      bio,
    };
  }

  async getLatestProfileUpdate(chatId: string, excludeCode?: string): Promise<ProfileUpdateRecord | null> {
    if (!chatId || chatId === 'notes') return null;
    const cacheKey = `profile_update:${chatId}:${excludeCode || ''}`;
    const cached = networkManager.getCached<ProfileUpdateRecord>(cacheKey);
    if (cached) return cached;

    return networkManager.deduplicateRequest(cacheKey, async () => {
      const candidates = await this.fetchProfileCandidates(chatId, excludeCode);
      const coalesced = this.coalesceProfileRecords(candidates);
      if (coalesced) {
        networkManager.setCache(cacheKey, coalesced, 60000);
      }
      return coalesced;
    });
  }

  async getLatestProfileUpdatesForChats(chatIds: string[]): Promise<ProfileUpdateRecord[]> {
    if (chatIds.length === 0) return [];

    const updates = await Promise.all(chatIds.map((id) => this.getLatestProfileUpdate(id)));
    return updates.filter((u): u is ProfileUpdateRecord => u !== null);
  }

  async publishPublicProfile(
    userCode: string,
    nickname: string,
    avatarUrl: string | null,
    _publicKey?: string | null,
    bio?: string | null,
    username?: string | null,
    birthday?: string | null,
    bannerUrl?: string | null
  ): Promise<void> {
    if (!userCode || !nickname) return;
    try {
      await this.saveProfileUpdate(userCode, nickname, avatarUrl, userCode, bio, username, birthday, bannerUrl);
    } catch (e) {
      console.warn('[Directory] Failed to publish profile update:', e);
      throw e;
    }
  }

  async lookupPublicProfile(userCode: string): Promise<UserDirectoryRecord | null> {
    if (!userCode) return null;
    const cacheKey = `public_profile:${userCode}`;
    const cached = networkManager.getCached<UserDirectoryRecord>(cacheKey);
    if (cached) return cached;

    return networkManager.deduplicateRequest(cacheKey, async () => {
      try {
        const update = await this.getLatestProfileUpdate(userCode);
        if (update && (update.nickname || update.username || update.birthday || update.avatar_url || update.bio || update.banner_url)) {
          const profile: UserDirectoryRecord = {
            user_code: userCode,
            numeric_id: update.numeric_id || null,
            nickname: update.nickname || '',
            avatar_url: update.avatar_url,
            banner_url: update.banner_url,
            username: update.username,
            bio: update.bio,
            birthday: update.birthday,
            updated_at: update.updated_at,
          };
          networkManager.setCache(cacheKey, profile, 60000);
          return profile;
        }
      } catch (err) {
        console.warn('[Directory] Failed to lookup profile from relay:', err);
      }

      return null;
    });
  }

  async isUsernameAvailable(username: string, excludeCode?: string | null): Promise<boolean> {
    const cleanUsername = username ? username.replace(/^@+/, '').trim().toLowerCase() : '';
    if (!cleanUsername) return false;
    if (cleanUsername === 'support') return false;

    const nodes = relayRouter.getNodes();
    let hadSuccessfulCheck = false;

    for (const relay of nodes) {
      try {
        const param = excludeCode ? `&excludeCode=${encodeURIComponent(excludeCode)}` : '';
        const res = await fetch(`${relay.url}/relay/check-username?username=${encodeURIComponent(cleanUsername)}${param}`);
        if (res.ok) {
          const data = (await res.json()) as { available?: boolean };
          if (typeof data.available === 'boolean') {
            hadSuccessfulCheck = true;
            return data.available;
          }
        }
      } catch {}
    }

    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('profile_updates')
          .select('sender_code, chat_id')
          .ilike('username', cleanUsername);

        if (!error && data) {
          hadSuccessfulCheck = true;
          const ex = excludeCode ? excludeCode.toLowerCase() : null;
          const isTaken = data.some((row) => {
            if (!ex) return true;
            if (row.sender_code) return String(row.sender_code).toLowerCase() !== ex;
            if (row.chat_id) return String(row.chat_id).toLowerCase() !== ex;
            return true;
          });
          return !isTaken;
        }
      } catch {}
    }

    if (!hadSuccessfulCheck) {
      throw new Error('USERNAME_CHECK_FAILED');
    }

    return false;
  }

  async lookupProfileByUsername(username: string): Promise<UserDirectoryRecord | null> {
    if (!username) return null;
    const cleanUsername = username.replace(/^@+/, '').trim().toLowerCase();
    if (!cleanUsername) return null;
    const cacheKey = `profile_username:${cleanUsername}`;
    const cached = networkManager.getCached<UserDirectoryRecord>(cacheKey);
    if (cached) return cached;

    return networkManager.deduplicateRequest(cacheKey, async () => {
      const nodes = relayRouter.getNodes();
      for (const relay of nodes) {
        try {
          const res = await networkManager.safeFetch(`${relay.url}/relay/resolve-username?username=${encodeURIComponent(cleanUsername)}`, undefined, 7000, 1);
          if (res.ok) {
            const data = await res.json();
            if (data?.user) {
              const parsed = this.parseProfileRow(data.user);
              const profile: UserDirectoryRecord = {
                user_code: data.user.user_code || data.user.sender_code || data.user.chat_id,
                numeric_id: data.user.numeric_id || null,
                nickname: data.user.nickname || '',
                avatar_url: data.user.avatar_url,
                banner_url: parsed?.banner_url || data.user.banner_url || null,
                username: parsed?.username || data.user.username,
                bio: parsed?.bio || data.user.bio,
                birthday: data.user.birthday,
                updated_at: data.user.updated_at,
              };
              networkManager.setCache(cacheKey, profile, 60000);
              return profile;
            }
          }
        } catch {}
      }

      if (this.client) {
        try {
          const { data, error } = await this.client
            .from('profile_updates')
            .select('*')
            .ilike('username', cleanUsername)
            .order('updated_at', { ascending: false })
            .limit(10);

          if (!error && data && data.length > 0) {
            const parsedRows = data
              .map((r) => this.parseProfileRow(r))
              .filter((r): r is ProfileUpdateRecord => r !== null);
            const merged = this.coalesceProfileRecords(parsedRows);
            if (merged && (merged.nickname || merged.username || merged.birthday || merged.avatar_url || merged.bio || merged.banner_url)) {
              const profile: UserDirectoryRecord = {
                user_code: merged.sender_code || merged.chat_id,
                numeric_id: merged.numeric_id || null,
                nickname: merged.nickname || '',
                avatar_url: merged.avatar_url,
                banner_url: merged.banner_url || null,
                username: merged.username,
                bio: merged.bio,
                birthday: merged.birthday,
                updated_at: merged.updated_at,
              };
              networkManager.setCache(cacheKey, profile, 60000);
              return profile;
            }
          }
        } catch (err) {
          console.warn('[Directory] Failed to lookup profile by username from Supabase:', err);
        }
      }

      return null;
    });
  }

  async ensureSupportProfile(): Promise<void> {
    const supportCode = 'system_support';
    const supportUsername = 'support';
    const supportNickname = 'Техническая поддержка';
    const supportBio = 'Официальная служба технической поддержки мессенджера Orbita';
    const supportAvatar = SUPPORT_AVATAR_URL;

    const nodes = relayRouter.getNodes();
    for (const relay of nodes) {
      try {
        await fetch(`${relay.url}/relay/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: supportCode,
            senderCode: supportCode,
            nickname: supportNickname,
            username: supportUsername,
            bio: supportBio,
            avatarUrl: supportAvatar,
          }),
        });
      } catch {}
    }

    if (this.client) {
      try {
        const { data } = await this.client
          .from('profile_updates')
          .select('id, avatar_url')
          .eq('sender_code', supportCode)
          .maybeSingle();

        if (!data) {
          await this.client.from('profile_updates').insert({
            chat_id: supportCode,
            sender_code: supportCode,
            nickname: supportNickname,
            username: supportUsername,
            bio: supportBio,
            avatar_url: supportAvatar,
            updated_at: new Date().toISOString(),
          });
        } else if (data.avatar_url !== supportAvatar) {
          await this.client.from('profile_updates').update({
            avatar_url: supportAvatar,
            updated_at: new Date().toISOString(),
          }).eq('id', data.id);
        }
      } catch {}
    }
  }

  async searchPublicProfiles(query: string, limit: number = 20): Promise<UserDirectoryRecord[]> {
    if (!query) return [];
    const cleanQuery = query.replace(/^@+/, '').trim().toLowerCase();
    if (!cleanQuery) return [];

    const seen = new Set<string>();
    const results: UserDirectoryRecord[] = [];

    const nodes = relayRouter.getNodes();
    for (const relay of nodes) {
      try {
        const res = await fetch(`${relay.url}/relay/search-users?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.users) && data.users.length > 0) {
            for (const u of data.users) {
              const code = u.user_code;
              if (code && !seen.has(code)) {
                seen.add(code);
                const parsed = this.parseProfileRow(u);
                results.push({
                  ...u,
                  banner_url: parsed?.banner_url || u.banner_url || null,
                  bio: parsed?.bio || u.bio,
                });
              }
            }
          }
        }
      } catch {}
    }

    if (this.client) {
      try {
        const filter = `username.ilike.${cleanQuery}%,sender_code.eq.${cleanQuery}`;

        const { data, error } = await this.client
          .from('profile_updates')
          .select('*')
          .or(filter)
          .order('updated_at', { ascending: false })
          .limit(limit);

        if (!error && data && Array.isArray(data)) {
          for (const row of data) {
            const userCode = row.sender_code || row.chat_id;
            if (userCode && !seen.has(userCode)) {
              seen.add(userCode);
              const parsed = this.parseProfileRow(row);
              results.push({
                user_code: userCode,
                nickname: row.nickname || 'User',
                avatar_url: row.avatar_url,
                banner_url: parsed?.banner_url || row.banner_url || null,
                username: row.username,
                bio: parsed?.bio || row.bio,
                birthday: row.birthday,
                updated_at: row.updated_at,
                numeric_id: row.numeric_id || null,
                public_key: row.public_key || null,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Directory] Failed to search profiles in Supabase:', err);
      }
    }

    return results;
  }

  async getHandshakeRecordsForChat(chatId: string): Promise<OfflineHandshakeRecord[]> {
    if (!chatId || chatId === 'notes') return [];
    const nodes = relayRouter.getNodes();
    for (const relay of nodes) {
      try {
        const res = await fetch(`${relay.url}/relay/chat-handshakes?chatId=${encodeURIComponent(chatId)}`);
        if (res.ok) {
          const data = (await res.json()) as { handshakes: OfflineHandshakeRecord[] };
          if (data?.handshakes && data.handshakes.length > 0) return data.handshakes;
        }
      } catch (err) {
        console.warn(`[Relay] Failed to get handshakes for chat from ${relay.url}:`, err);
      }
    }
    if (this.client) {
      const { data, error } = await this.client
        .from('handshakes')
        .select('*')
        .eq('chat_id', chatId);
      if (!error && data) return data;
    }
    return [];
  }

  async saveReaction(
    chatId: string,
    recipientIdOrMessageIndex: string | number | undefined,
    messageId: string | undefined,
    emoji: string,
    userId: string,
    action: 'add' | 'remove',
    senderNickname?: string
  ): Promise<void> {
    if (!messageId) return;
    const resolvedRecipientId = typeof recipientIdOrMessageIndex === 'string' ? recipientIdOrMessageIndex : undefined;
    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];
    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/reaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageId, emoji, userId, action, recipientId: resolvedRecipientId }),
        });
        if (res.ok) return;
      } catch {}
    }

    if (this.client) {
      if (resolvedRecipientId) {
        try {
          const reactionPayload = JSON.stringify({
            type: 'reaction',
            messageId,
            emoji,
            sender: senderNickname || userId,
            senderId: userId,
            action,
            chatId,
          });
          const reactionEventId = `react_${messageId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          await this.client.from('messages').insert({
            id: reactionEventId,
            chat_id: chatId,
            sender_id: userId,
            recipient_id: resolvedRecipientId,
            ciphertext: reactionPayload,
            dh_public_key: 'PRE_HANDSHAKE',
            message_index: 0,
            delivered: false,
          });
        } catch {}
      }
      try {
        if (action === 'add') {
          await this.client.from('message_reactions').upsert({
            chat_id: chatId,
            message_id: messageId,
            emoji,
            user_id: userId,
          }, { onConflict: 'chat_id,message_id,emoji,user_id' });
        } else {
          await this.client.from('message_reactions').delete()
            .eq('chat_id', chatId)
            .eq('message_id', messageId)
            .eq('emoji', emoji)
            .eq('user_id', userId);
        }
      } catch {}
    }
  }

  async getReactionsForChat(chatId: string): Promise<Array<{ message_id: string | null; emoji: string; user_id: string }>> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('message_reactions')
        .select('message_id, emoji, user_id')
        .eq('chat_id', chatId);

      if (error) {
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }

  async deleteReaction(chatId: string, messageId: string, emoji?: string): Promise<void> {
    if (!chatId || !messageId) return;
    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];
    for (const relay of allRelays) {
      try {
        await fetch(`${relay.url}/relay/reaction/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageId, emoji }),
        });
        return;
      } catch {}
    }
  }

  async deleteReactionsForChat(chatId: string): Promise<void> {
    if (!chatId) return;
    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];
    for (const relay of allRelays) {
      try {
        await fetch(`${relay.url}/relay/reaction/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId }),
        });
        return;
      } catch {}
    }
  }

  async getDeveloperCodes(): Promise<string[]> {
    const allCodes = new Set<string>();

    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('developers')
          .select('code');

        if (!error && data && Array.isArray(data)) {
          data.forEach((row: any) => {
            if (row.code && typeof row.code === 'string') {
              allCodes.add(row.code.trim());
            }
          });
        }
      } catch (err) {
        console.warn('[Supabase] Direct getDeveloperCodes failed:', err);
      }
    }

    const primaryWorkerUrl = getVercelBaseUrl();
    const urlsToTry = [
      `${primaryWorkerUrl}/developers`,
      `${primaryWorkerUrl}/relay/developers`,
      'https://majmrtymawymomliowbz.supabase.co/functions/v1/gateway/developers',
    ];

    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          const list = json.developers || json.codes || json.data || [];
          if (Array.isArray(list)) {
            list.forEach((c: any) => {
              const codeStr = typeof c === 'string' ? c : c?.code;
              if (codeStr && typeof codeStr === 'string') {
                allCodes.add(codeStr.trim());
              }
            });
            break;
          }
        }
      } catch (e) {}
    }

    if (this.client && allCodes.size > 0) {
      try {
        const baseCodes = Array.from(allCodes);
        const { data: profs } = await this.client
          .from('profile_updates')
          .select('sender_code, username, nickname')
          .in('sender_code', baseCodes);

        if (profs && Array.isArray(profs)) {
          for (const p of profs) {
            if (p.username) {
              allCodes.add(p.username.trim());
              allCodes.add(p.username.trim().toLowerCase());
            }
            if (p.nickname) allCodes.add(p.nickname.trim());
          }
        }
      } catch {}
    }

    return Array.from(allCodes);
  }

  subscribeToDevelopers(onChange: (codes: string[]) => void): () => void {
    if (!this.client) return () => {};

    const channel = this.client
      .channel('realtime:developers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developers' },
        async () => {
          const codes = await this.getDeveloperCodes();
          onChange(codes);
        }
      )
      .subscribe();

    return () => {
      this.client?.removeChannel(channel);
    };
  }

  
  async uploadPublicKeys(
    userCode: string,
    identityKey: string,
    signedPreKey: string,
    preKeySignature: string,
    oneTimePreKeys: Array<{ keyId: number; publicKey: string }>,
    identitySigningKey?: string
  ): Promise<void> {
    if (!this.client || !userCode) return;

    try {
      const { error: keysError } = await this.client
        .from('user_public_keys')
        .upsert({
          user_code: userCode,
          identity_key: identityKey,
          signed_pre_key: signedPreKey,
          pre_key_signature: preKeySignature,
          identity_signing_key: identitySigningKey,
          updated_at: new Date().toISOString(),
        });
        
      if (keysError) {
        console.error('[Supabase] uploadPublicKeys error (main keys):', keysError);
        throw keysError;
      }

      if (oneTimePreKeys && oneTimePreKeys.length > 0) {
        const otpkRows = oneTimePreKeys.map(k => ({
          user_code: userCode,
          key_id: k.keyId,
          public_key: k.publicKey,
        }));
        
        const { error: otpkError } = await this.client
          .from('one_time_pre_keys')
          .insert(otpkRows);
          
        if (otpkError) {
          console.error('[Supabase] uploadPublicKeys error (one time keys):', otpkError);
        }
      }
    } catch (e) {
      console.error('[Supabase] Failed to upload public keys:', e);
      throw e;
    }
  }

  async fetchPreKeyBundle(userCode: string): Promise<PreKeyBundle | null> {
    if (!this.client || !userCode) return null;

    try {
      const { data: mainKeys, error: keysError } = await this.client
        .from('user_public_keys')
        .select('*')
        .eq('user_code', userCode)
        .maybeSingle();
        
      if (keysError || !mainKeys) {
        console.warn(`[Supabase] No main keys found for user: ${userCode}`);
        return null;
      }

      const bundle: PreKeyBundle = {
        identityKey: mainKeys.identity_key,
        signedPreKey: mainKeys.signed_pre_key,
        preKeySignature: mainKeys.pre_key_signature,
        identitySigningKey: mainKeys.identity_signing_key,
      };

      try {
        await this.client.rpc('consume_one_time_pre_key', {
          p_user_code: userCode,
        });

        
        const { data: firstKeyData } = await this.client
          .from('one_time_pre_keys')
          .select('*')
          .eq('user_code', userCode)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstKeyData) {
          bundle.oneTimePreKey = {
            id: firstKeyData.id,
            keyId: firstKeyData.key_id,
            publicKey: firstKeyData.public_key,
          };
          
          this.client.from('one_time_pre_keys').delete().eq('id', firstKeyData.id).then();
        }
      } catch (e) {
        console.warn('[Supabase] Failed to consume OTPK, continuing without it:', e);
      }

      return bundle;
    } catch (e) {
      console.error('[Supabase] fetchPreKeyBundle error:', e);
      return null;
    }
  }

  async setUserPresence(userCode: string, isOnline: boolean): Promise<void> {
    if (!userCode || !userCode.trim() || !this.client) return;
    const cleanCode = userCode.trim();
    const nowIso = new Date().toISOString();
    const presenceTag = `<!--presence:${isOnline ? '1' : '0'}:${Date.now()}-->`;

    try {
      const { data: existing } = await this.client
        .from('profile_updates')
        .select('id, bio')
        .or(`sender_code.eq.${cleanCode},chat_id.eq.${cleanCode}`)
        .limit(1);

      if (existing && existing.length > 0) {
        const row = existing[0];
        const rawBio = row.bio || '';
        const updatedBio = (rawBio.replace(/<!--presence:.*?-->/g, '').trim() + `\n${presenceTag}`).trim();
        await this.client
          .from('profile_updates')
          .update({
            bio: updatedBio,
            updated_at: nowIso,
          })
          .eq('id', row.id);
      } else {
        await this.client
          .from('profile_updates')
          .insert({
            chat_id: cleanCode,
            sender_code: cleanCode,
            bio: presenceTag,
            updated_at: nowIso,
          });
      }
    } catch {}
  }

  startPresenceHeartbeat(userCode: string): void {
    this.stopPresenceHeartbeat(userCode);
    if (!userCode || !userCode.trim()) return;
    this.setUserPresence(userCode, true);
    this.presenceHeartbeatTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      this.setUserPresence(userCode, true);
    }, 40000);
  }

  stopPresenceHeartbeat(userCode?: string): void {
    if (this.presenceHeartbeatTimer) {
      clearInterval(this.presenceHeartbeatTimer);
      this.presenceHeartbeatTimer = null;
    }
    if (userCode) {
      this.setUserPresence(userCode, false);
    }
  }

  async fetchPeersPresence(peerCodes: string[], excludeCodes?: string[]): Promise<Map<string, { isOnline: boolean; lastSeen: number }>> {
    const result = new Map<string, { isOnline: boolean; lastSeen: number }>();
    if (!peerCodes || peerCodes.length === 0 || !this.client) return result;
    const excludeSet = new Set((excludeCodes || []).map((c) => c?.trim()).filter(Boolean));
    const cleanCodes = Array.from(new Set(
      peerCodes
        .map((c) => c?.trim())
        .filter((c): c is string => Boolean(c && !excludeSet.has(c) && c !== 'notes'))
    ));
    if (cleanCodes.length === 0) return result;

    try {
      const { data, error } = await this.client
        .from('profile_updates')
        .select('sender_code, updated_at, bio')
        .in('sender_code', cleanCodes)
        .order('updated_at', { ascending: false });

      if (!error && data && Array.isArray(data)) {
        const now = Date.now();
        for (const row of data) {
          const key = row.sender_code;
          if (!key || excludeSet.has(key)) continue;
          const rawUpdatedTime = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          const updatedTime = Number.isFinite(rawUpdatedTime) ? rawUpdatedTime : 0;
          const bio = row.bio || '';
          const match = bio.match(/<!--presence:(0|1):(\d+)-->/);
          let isExplicitOnline = false;
          let explicitTimestamp = updatedTime;
          if (match) {
            isExplicitOnline = match[1] === '1';
            const parsedExplicit = Number(match[2]);
            if (Number.isFinite(parsedExplicit) && parsedExplicit > 0) {
              explicitTimestamp = parsedExplicit;
            }
          }
          const recordTimestamp = Math.max(updatedTime, explicitTimestamp);
          const isFresh = recordTimestamp > 0 && (now - recordTimestamp) < 90000;
          const isOnline = Boolean(isExplicitOnline && isFresh);
          const lastSeen = isOnline ? now : (recordTimestamp > 0 ? recordTimestamp : 0);
          const existing = result.get(key);
          if (!existing || lastSeen > existing.lastSeen || (isOnline && !existing.isOnline)) {
            result.set(key, { isOnline, lastSeen });
          }
        }
      }
    } catch {}
    return result;
  }
}

export const supabaseService = new SupabaseService();