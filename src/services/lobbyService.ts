import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { aesGcmEncrypt, aesGcmDecrypt } from '../lib/crypto';
import { encode as hexEncode, decode as hexDecode } from '@stablelib/hex';
import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { generateGroupCode } from '../lib/groupCrypto';

async function deriveLobbyKey(secretHex: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const secretBytes = hexDecode(secretHex);
  const hkdf = new HKDF(SHA256, secretBytes, enc.encode('orbita-lobby-salt'), enc.encode('orbita-lobby-key'));
  return hkdf.expand(32);
}

async function encryptLobbyPayload(plaintext: string, secretHex: string): Promise<string> {
  const key = await deriveLobbyKey(secretHex);
  const plainBytes = new TextEncoder().encode(plaintext);
  const { ciphertext, nonce, tag } = await aesGcmEncrypt(key, plainBytes);
  const combined = new Uint8Array(nonce.length + ciphertext.length + tag.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  combined.set(tag, nonce.length + ciphertext.length);
  return hexEncode(combined);
}

async function decryptLobbyPayload(hexCiphertext: string, secretHex: string): Promise<string> {
  const key = await deriveLobbyKey(secretHex);
  const combined = hexDecode(hexCiphertext);
  if (combined.byteLength < 28) return '[Encrypted]';
  const nonce = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12, combined.byteLength - 16);
  const tag = combined.subarray(combined.byteLength - 16);
  const decrypted = await aesGcmDecrypt(key, ciphertext, nonce, tag);
  if (!decrypted) return '[Encrypted]';
  return new TextDecoder().decode(decrypted);
}

const SUPABASE_URL = 'https://majmrtymawymomliowbz.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ham1ydHltYXd5bW9tbGlvd2J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODQ5NzgsImV4cCI6MjA5OTk2MDk3OH0.VFyDYZdgRPm-_L-GObvfkKrilnE1GP7MJ2CWDW7-nRU';

export interface Lobby {
  id: string;
  code: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  category: string;
  creatorCode: string;
  creatorNickname: string;
  sharedSecret: string | null;
  isPublic: boolean;
  membersCount: number;
  maxMembers: number;
  activeCallRoom?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LobbyMember {
  id: string;
  lobbyId: string;
  userCode: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
  lastSeen: number;
}

export interface LobbyMessage {
  id: string;
  lobbyId: string;
  senderCode: string;
  senderNickname: string;
  senderAvatarUrl: string | null;
  text: string;
  mediaType?: 'photo' | 'video' | 'audio' | 'voice' | 'file' | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  replyToId?: string | null;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
  createdAt: number;
  editedAt?: number | null;
}

export class LobbyService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  private generateSharedSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async createLobby(params: {
    name: string;
    description?: string;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    category?: string;
    isPublic?: boolean;
    creatorCode: string;
    creatorNickname: string;
    creatorAvatar?: string | null;
  }): Promise<Lobby> {
    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const inviteCode = generateGroupCode();
    const sharedSecret = this.generateSharedSecret();
    const nowIso = new Date().toISOString();

    const { data: lobbyRow, error: lobbyError } = await this.client
      .from('lobbies')
      .insert({
        id: lobbyId,
        code: inviteCode,
        name: params.name.trim(),
        description: params.description?.trim() || '',
        avatar_url: params.avatarUrl || null,
        banner_url: params.bannerUrl || null,
        category: params.category || 'general',
        creator_code: params.creatorCode,
        creator_nickname: params.creatorNickname,
        shared_secret: sharedSecret,
        is_public: params.isPublic ?? false,
        members_count: 1,
        max_members: 1000,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (lobbyError || !lobbyRow) {
      throw new Error(lobbyError?.message || 'Failed to create lobby');
    }

    await this.client.from('lobby_members').insert({
      lobby_id: lobbyId,
      user_code: params.creatorCode,
      nickname: params.creatorNickname,
      avatar_url: params.creatorAvatar || null,
      role: 'owner',
      joined_at: nowIso,
      last_seen: nowIso,
    });

    return this.mapLobbyRow(lobbyRow);
  }

  async getPublicLobbies(category?: string, search?: string): Promise<Lobby[]> {
    let query = this.client
      .from('lobbies')
      .select('*')
      .eq('is_public', true)
      .order('members_count', { ascending: false });

    if (category && category !== 'all' && category !== 'general') {
      query = query.eq('category', category);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`name.ilike.${s},description.ilike.${s}`);
    }

    const { data, error } = await query.limit(50);
    if (error || !data) return [];
    return data.map((r) => this.mapLobbyRow(r));
  }

  async getLobbyByCode(code: string): Promise<Lobby | null> {
    const clean = code.trim();
    const { data, error } = await this.client
      .from('lobbies')
      .select('*')
      .or(`code.eq.${clean},id.eq.${clean}`)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapLobbyRow(data);
  }

  async getLobbyById(id: string): Promise<Lobby | null> {
    const { data, error } = await this.client
      .from('lobbies')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapLobbyRow(data);
  }

  async joinLobby(
    lobbyId: string,
    user: { userCode: string; nickname: string; avatarUrl?: string | null }
  ): Promise<Lobby | null> {
    const lobby = await this.getLobbyById(lobbyId);
    if (!lobby) return null;

    const nowIso = new Date().toISOString();
    await this.client.from('lobby_members').upsert(
      {
        lobby_id: lobbyId,
        user_code: user.userCode,
        nickname: user.nickname,
        avatar_url: user.avatarUrl || null,
        role: 'member',
        last_seen: nowIso,
      },
      { onConflict: 'lobby_id,user_code' }
    );

    const { count } = await this.client
      .from('lobby_members')
      .select('id', { count: 'exact', head: true })
      .eq('lobby_id', lobbyId);

    const newCount = count || lobby.membersCount + 1;
    await this.client.from('lobbies').update({ members_count: newCount }).eq('id', lobbyId);
    lobby.membersCount = newCount;

    return lobby;
  }

  async leaveLobby(lobbyId: string, userCode: string): Promise<void> {
    await this.client
      .from('lobby_members')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('user_code', userCode);

    const { count } = await this.client
      .from('lobby_members')
      .select('id', { count: 'exact', head: true })
      .eq('lobby_id', lobbyId);

    await this.client
      .from('lobbies')
      .update({ members_count: Math.max(0, count || 0) })
      .eq('id', lobbyId);
  }

  async getLobbyMembers(lobbyId: string): Promise<LobbyMember[]> {
    const { data, error } = await this.client
      .from('lobby_members')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('joined_at', { ascending: true });

    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      lobbyId: r.lobby_id,
      userCode: r.user_code,
      nickname: r.nickname,
      avatarUrl: r.avatar_url,
      role: r.role,
      joinedAt: new Date(r.joined_at).getTime(),
      lastSeen: new Date(r.last_seen).getTime(),
    }));
  }

  async sendLobbyMessage(params: {
    lobbyId: string;
    senderCode: string;
    senderNickname: string;
    senderAvatarUrl?: string | null;
    text: string;
    sharedSecret?: string | null;
    mediaType?: 'photo' | 'video' | 'audio' | 'voice' | 'file';
    mediaUrl?: string | null;
    mediaName?: string | null;
    mediaSize?: number | null;
    replyToId?: string | null;
  }): Promise<LobbyMessage> {
    const msgId = `lmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const nowIso = new Date().toISOString();

    let ciphertext: string | null = null;
    let storedText = params.text;

    if (params.sharedSecret && params.text) {
      try {
        ciphertext = await encryptLobbyPayload(params.text, params.sharedSecret);
        storedText = '';
      } catch (e) {
        console.error('Failed to encrypt lobby message:', e);
      }
    }

    const { data, error } = await this.client
      .from('lobby_messages')
      .insert({
        id: msgId,
        lobby_id: params.lobbyId,
        sender_code: params.senderCode,
        sender_nickname: params.senderNickname,
        sender_avatar_url: params.senderAvatarUrl || null,
        text: storedText,
        ciphertext: ciphertext,
        media_type: params.mediaType || null,
        media_url: params.mediaUrl || null,
        media_name: params.mediaName || null,
        media_size: params.mediaSize || null,
        reply_to_id: params.replyToId || null,
        created_at: nowIso,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to send message to lobby');
    }

    return {
      id: data.id,
      lobbyId: data.lobby_id,
      senderCode: data.sender_code,
      senderNickname: data.sender_nickname,
      senderAvatarUrl: data.sender_avatar_url,
      text: params.text,
      mediaType: data.media_type,
      mediaUrl: data.media_url,
      mediaName: data.media_name,
      mediaSize: data.media_size,
      replyToId: data.reply_to_id,
      reactions: data.reactions || {},
      pinned: data.pinned || false,
      createdAt: new Date(data.created_at).getTime(),
      editedAt: data.edited_at ? new Date(data.edited_at).getTime() : null,
    };
  }

  async getLobbyMessages(lobbyId: string, sharedSecret?: string | null, limit = 50): Promise<LobbyMessage[]> {
    const { data, error } = await this.client
      .from('lobby_messages')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    const messages = await Promise.all(
      data.reverse().map(async (r) => {
        let text = r.text || '';
        if (r.ciphertext && sharedSecret) {
          try {
            text = await decryptLobbyPayload(r.ciphertext, sharedSecret);
          } catch {
            text = '[Зашифрованное сообщение]';
          }
        }
        return {
          id: r.id,
          lobbyId: r.lobby_id,
          senderCode: r.sender_code,
          senderNickname: r.sender_nickname,
          senderAvatarUrl: r.sender_avatar_url,
          text,
          mediaType: r.media_type,
          mediaUrl: r.media_url,
          mediaName: r.media_name,
          mediaSize: r.media_size,
          replyToId: r.reply_to_id,
          reactions: r.reactions || {},
          pinned: r.pinned || false,
          createdAt: new Date(r.created_at).getTime(),
          editedAt: r.edited_at ? new Date(r.edited_at).getTime() : null,
        };
      })
    );

    return messages;
  }

  subscribeToLobby(
    lobbyId: string,
    onMessage: (msg: LobbyMessage) => void,
    onMemberChange?: () => void
  ) {
    const channel = this.client
      .channel(`lobby:${lobbyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lobby_messages', filter: `lobby_id=eq.${lobbyId}` },
        (payload) => {
          const r = payload.new as any;
          onMessage({
            id: r.id,
            lobbyId: r.lobby_id,
            senderCode: r.sender_code,
            senderNickname: r.sender_nickname,
            senderAvatarUrl: r.sender_avatar_url,
            text: r.text || '',
            mediaType: r.media_type,
            mediaUrl: r.media_url,
            mediaName: r.media_name,
            mediaSize: r.media_size,
            replyToId: r.reply_to_id,
            reactions: r.reactions || {},
            pinned: r.pinned || false,
            createdAt: new Date(r.created_at).getTime(),
            editedAt: r.edited_at ? new Date(r.edited_at).getTime() : null,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_members', filter: `lobby_id=eq.${lobbyId}` },
        () => {
          onMemberChange?.();
        }
      )
      .subscribe();

    return () => {
      this.client.removeChannel(channel);
    };
  }

  private mapLobbyRow(r: any): Lobby {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description || '',
      avatarUrl: r.avatar_url,
      bannerUrl: r.banner_url,
      category: r.category || 'general',
      creatorCode: r.creator_code,
      creatorNickname: r.creator_nickname,
      sharedSecret: r.shared_secret,
      isPublic: r.is_public,
      membersCount: r.members_count || 1,
      maxMembers: r.max_members || 1000,
      activeCallRoom: r.active_call_room,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    };
  }
}

export const lobbyService = new LobbyService();
