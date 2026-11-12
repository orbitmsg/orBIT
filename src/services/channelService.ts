import { useAuthStore } from '../store/useAuthStore';
import { getPusher } from '../utils/pusher';
import { type LinkPreviewData } from '../store/useChatStore';
import { ablyService } from './ablyService';
import { generateChannelId } from '../lib/codes';
import { getVercelBaseUrl } from './gatewayManager';
import { deriveChannelKey, encryptMessage, decryptMessage } from '../lib/crypto';
import { sqliteStorage } from './sqliteStorage';
import { mediaManager } from './mediaManager';
import { getMediaInfoFromDataUrl } from '../utils/staticImageValidation';

export interface ChannelInfo {
  id: string;
  name: string;
  username?: string | null;
  description: string;
  avatarUrl: string | null;
  creatorId?: string;
  creatorNickname: string;
  subscribersCount: number;
  isOfficial?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  senderId?: string;
  sender: string;
  text: string;
  time: number;
  mediaType?: 'photo' | 'video' | 'audio' | 'voice' | 'file' | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mime?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  waveform?: number[] | null;
  audioMetadata?: any | null;
  linkPreview?: LinkPreviewData | null;
  reactions?: Record<string, string[]>;
}

const W = getVercelBaseUrl();
const CHANNELS_SUPABASE_URL = 'https://rugqiezexuknqcppicma.supabase.co';
const CHANNELS_SUPABASE_KEY = 'sb_publishable_XYjE7C93LWA-P1OHZqNONg_QHlyZ9sZ';
const getChannelPostsStorage = async (channelId: string): Promise<string | null> => {
  return await sqliteStorage.get(`orbita_channel_posts_${channelId}`);
};

const setChannelPostsStorage = async (channelId: string, val: string): Promise<void> => {
  await sqliteStorage.set(`orbita_channel_posts_${channelId}`, val);
};

class ChannelService {
  async getFeaturedChannels(): Promise<ChannelInfo[]> {
    try {
      const res = await fetch(`${W}/channels/featured`);
      if (res.ok) {
        const data = (await res.json()) as { channels: ChannelInfo[] };
        if (data.channels && data.channels.length > 0) return data.channels;
      }
    } catch {}

    try {
      const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/public_channels?select=*&order=created_at.desc&limit=20`, {
        headers: {
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data)) {
          return data.map((c) => ({
            id: c.id,
            name: c.name,
            username: c.username || null,
            description: c.description || '',
            avatarUrl: c.avatar_url || null,
            creatorId: c.creator_id || undefined,
            creatorNickname: c.creator_nickname,
            subscribersCount: c.subscribers_count || 1,
            isOfficial: c.is_official || false,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.created_at).getTime(),
          }));
        }
      }
    } catch {}
    return [];
  }

  async getChannel(channelId: string): Promise<ChannelInfo | null> {
    const cleanId = channelId.trim().replace(/^@+/, '');
    if (!cleanId) return null;

    try {
      const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/public_channels?or=(id.eq.${encodeURIComponent(cleanId)},username.ilike.${encodeURIComponent(cleanId)})&select=*&limit=1`, {
        headers: {
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data) && data.length > 0) {
          const c = data[0];
          return {
            id: c.id,
            name: c.name,
            username: c.username || null,
            description: c.description || '',
            avatarUrl: c.avatar_url || null,
            creatorId: c.creator_id || undefined,
            creatorNickname: c.creator_nickname,
            subscribersCount: c.subscribers_count || 1,
            isOfficial: c.is_official || false,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.created_at).getTime(),
          };
        }
      }
    } catch {}

    try {
      const res = await fetch(`${W}/channels/get?channelId=${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const data = (await res.json()) as { channel: ChannelInfo };
        if (data.channel) return data.channel;
      }
    } catch {}

    return null;
  }

  async checkChannelUsername(username: string, excludeChannelId?: string): Promise<boolean> {
    const clean = username.replace(/^@+/, '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(clean)) return false;
    try {
      let url = `${CHANNELS_SUPABASE_URL}/rest/v1/public_channels?select=id&username=ilike.${encodeURIComponent(clean)}`;
      if (excludeChannelId) {
        url += `&id=neq.${encodeURIComponent(excludeChannelId)}`;
      }
      const res = await fetch(url, {
        headers: {
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) && data.length === 0;
      }
    } catch {}
    try {
      const q = excludeChannelId ? `&excludeChannelId=${encodeURIComponent(excludeChannelId)}` : '';
      const res = await fetch(`${W}/channels/check-username?username=${encodeURIComponent(clean)}${q}`);
      if (res.ok) {
        const json = await res.json();
        return Boolean(json.available);
      }
    } catch {}
    return false;
  }

  async createChannel(
    name: string,
    description: string,
    avatarUrl: string | null,
    creatorNickname: string,
    creatorId?: string,
    customId?: string,
    username?: string | null
  ): Promise<ChannelInfo | null> {
    const isChannelCode = (s?: string) => Boolean(s && /^[A-Z0-9]{30,50}$/i.test(s.trim()));

    let actualCustomId = customId?.trim();
    let actualCreatorId = creatorId?.trim();

    if (!actualCustomId && actualCreatorId && isChannelCode(actualCreatorId)) {
      actualCustomId = actualCreatorId;
      actualCreatorId = undefined;
    }

    const idToUse = actualCustomId || generateChannelId();
    const validCreatorId = actualCreatorId && actualCreatorId.length >= 8 ? actualCreatorId : null;
    const cleanUsername = username ? username.replace(/^@+/, '').trim().toLowerCase() : null;
    let finalAvatarUrl = avatarUrl;
    if (avatarUrl && avatarUrl.startsWith('data:')) {
      const base64 = avatarUrl.includes(',') ? avatarUrl.split(',')[1] : avatarUrl;
      const { ext } = getMediaInfoFromDataUrl(avatarUrl);
      if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
        try {
          const tempPath = await window.orbita.writeTempFile(base64, ext);
          if (tempPath) {
            const publicId = `channel_avatar_${idToUse}_${Date.now()}`;
            const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
            if (result.success && result.secure_url) {
              finalAvatarUrl = result.secure_url;
            }
            await window.orbita.deleteTempFile(tempPath);
          }
        } catch {}
      }
    }
    const now = Date.now();
    const createdInfo: ChannelInfo = {
      id: idToUse,
      name: name.trim(),
      username: cleanUsername,
      description: description.trim(),
      avatarUrl: finalAvatarUrl || null,
      creatorId: validCreatorId || undefined,
      creatorNickname,
      subscribersCount: 1,
      isOfficial: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const res = await fetch(`${W}/channels/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: idToUse,
          name: name.trim(),
          username: cleanUsername,
          description: description.trim(),
          avatarUrl: finalAvatarUrl || null,
          creatorNickname,
          creatorId: validCreatorId || undefined,
        }),
      });

      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { channel?: ChannelInfo };
        if (data.channel) return data.channel;
      }
    } catch {}

    return createdInfo;
  }

  async updateChannelCreatorId(channelId: string, creatorId: string): Promise<void> {
    const cleanId = channelId.trim();
    if (!cleanId || !creatorId) return;
    try {
      await fetch(`${W}/channels/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: cleanId,
          creatorId,
        }),
      });
    } catch {}
  }

  async updateChannel(
    channelId: string,
    data: { name?: string; description?: string; avatarUrl?: string | null; username?: string | null },
    userId?: string
  ): Promise<boolean> {
    const cleanId = channelId.trim();
    let finalAvatarUrl = data.avatarUrl;
    const cleanUsername = data.username !== undefined
      ? (typeof data.username === 'string' && data.username.trim() ? data.username.replace(/^@+/, '').trim().toLowerCase() : null)
      : undefined;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:')) {
      const base64 = finalAvatarUrl.includes(',') ? finalAvatarUrl.split(',')[1] : finalAvatarUrl;
      const { ext } = getMediaInfoFromDataUrl(finalAvatarUrl);
      if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
        try {
          const tempPath = await window.orbita.writeTempFile(base64, ext);
          if (tempPath) {
            const publicId = `channel_avatar_${cleanId}_${Date.now()}`;
            const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
            if (result.success && result.secure_url) {
              finalAvatarUrl = result.secure_url;
            }
            await window.orbita.deleteTempFile(tempPath);
          }
        } catch {}
      }
    }

    const now = Date.now();
    const eventPayload: any = {
      type: 'channel-updated',
      channelId: cleanId,
      name: data.name,
      description: data.description,
      avatarUrl: finalAvatarUrl,
      updatedAt: now,
    };
    if (cleanUsername !== undefined) eventPayload.username = cleanUsername;

    try {
      ablyService.sendMessage(`public-channel-${cleanId}`, eventPayload).catch(() => {});
    } catch {}

    try {
      const res = await fetch(`${W}/channels/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: cleanId,
          userId,
          name: data.name,
          description: data.description,
          avatarUrl: finalAvatarUrl,
          username: cleanUsername,
        }),
      });
      if (res.ok) {
        return true;
      }
    } catch {}
    return true;
  }

  async getChannelPosts(channelId: string): Promise<ChannelPost[]> {
    const cleanId = channelId.trim();
    const channelKey = deriveChannelKey(cleanId);
    let rawPosts: ChannelPost[] = [];
    try {
      const res = await fetch(`${W}/channels/posts?channelId=${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const data = (await res.json()) as { posts: ChannelPost[] };
        if (data.posts && data.posts.length > 0) rawPosts = data.posts;
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to get channel posts via backend:', err);
    }

    if (rawPosts.length === 0) {
      try {
        const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/channel_posts?channel_id=eq.${encodeURIComponent(cleanId)}&order=created_at.asc&limit=100`, {
          headers: {
            'apikey': CHANNELS_SUPABASE_KEY,
            'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
          },
        });
        if (res.ok) {
          const data = (await res.json()) as any[];
          if (Array.isArray(data)) {
            rawPosts = data.map((p) => ({
              id: p.id,
              channelId: p.channel_id,
              senderId: p.sender_id || undefined,
              sender: p.sender_nickname,
              text: p.text || '',
              time: new Date(p.created_at).getTime(),
              mediaType: p.media_type || null,
              mediaUrl: p.media_url || null,
              mediaName: p.media_name || null,
              mime: p.mime || null,
              duration: p.duration || null,
              width: p.width || null,
              height: p.height || null,
              waveform: p.waveform || null,
              audioMetadata: p.audio_metadata || null,
              linkPreview: p.link_preview || null,
              reactions: p.reactions || {},
            }));
          }
        }
      } catch {}
    }

    const decryptedPosts = await Promise.all(
      rawPosts.map(async (p) => {
        let decryptedText = p.text || '';
        if (decryptedText.startsWith('orb_e2e:')) {
          const plain = await decryptMessage(decryptedText.slice(8), channelKey);
          if (plain && plain !== '[ENCRYPTED MESSAGE]') {
            decryptedText = plain;
          }
        }
        return {
          ...p,
          text: decryptedText,
        };
      })
    );

    if (decryptedPosts.length > 0) {
      try {
        await setChannelPostsStorage(cleanId, JSON.stringify(decryptedPosts));
      } catch {}

      decryptedPosts.forEach((p) => {
        if (p.mediaUrl) {
          mediaManager.getMedia(p.mediaUrl, channelKey, p.mediaName || undefined, cleanId, p.id).catch(() => {});
        }
      });
      return decryptedPosts;
    }

    try {
      const cachedStr = await getChannelPostsStorage(cleanId);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (Array.isArray(cached) && cached.length > 0) {
          return cached;
        }
      }
    } catch {}

    return decryptedPosts;
  }

  async publishPost(
    channelId: string,
    senderNickname: string,
    text: string,
    mediaPayload?: {
      type: string;
      url: string;
      name?: string;
      mime?: string;
      duration?: number;
      width?: number;
      height?: number;
      waveform?: number[];
      audioMetadata?: any;
    },
    linkPreview?: LinkPreviewData,
    customId?: string,
    senderId?: string
  ): Promise<ChannelPost | null> {
    const cleanId = channelId.trim();
    const channelKey = deriveChannelKey(cleanId);
    let cipherText = text || '';
    if (text) {
      try {
        const encrypted = await encryptMessage(text, channelKey);
        cipherText = `orb_e2e:${encrypted}`;
      } catch {
        cipherText = text;
      }
    }
    const postIdToUse = customId || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const body = {
        id: postIdToUse,
        channelId: cleanId,
        senderNickname,
        senderId,
        text: cipherText,
        mediaType: mediaPayload?.type || null,
        mediaUrl: mediaPayload?.url || null,
        mediaName: mediaPayload?.name || null,
        mime: mediaPayload?.mime || null,
        duration: mediaPayload?.duration || null,
        width: mediaPayload?.width || null,
        height: mediaPayload?.height || null,
        waveform: mediaPayload?.waveform || null,
        audioMetadata: mediaPayload?.audioMetadata ? {
          title: mediaPayload.audioMetadata.title,
          artist: mediaPayload.audioMetadata.artist,
          duration: mediaPayload.audioMetadata.duration,
          size: mediaPayload.audioMetadata.size,
        } : null,
        linkPreview: linkPreview || null,
      };

      await fetch(`${W}/channels/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {}

    const postObj: ChannelPost = {
      id: postIdToUse,
      channelId: cleanId,
      senderId,
      sender: senderNickname,
      text: text || '',
      time: Date.now(),
      mediaType: (mediaPayload?.type as any) || null,
      mediaUrl: mediaPayload?.url || null,
      mediaName: mediaPayload?.name || null,
      mime: mediaPayload?.mime || null,
      duration: mediaPayload?.duration || null,
      width: mediaPayload?.width || null,
      height: mediaPayload?.height || null,
      waveform: mediaPayload?.waveform || null,
      audioMetadata: mediaPayload?.audioMetadata ? {
        title: mediaPayload.audioMetadata.title,
        artist: mediaPayload.audioMetadata.artist,
        duration: mediaPayload.audioMetadata.duration,
        size: mediaPayload.audioMetadata.size,
      } : null,
      linkPreview: linkPreview || null,
      reactions: {},
    };

    try {
      const cachedStr = await getChannelPostsStorage(cleanId);
      const cachedList = cachedStr ? JSON.parse(cachedStr) : [];
      if (Array.isArray(cachedList) && !cachedList.some((p: any) => p.id === postObj.id)) {
        cachedList.push(postObj);
        cachedList.sort((a: any, b: any) => a.time - b.time);
        await setChannelPostsStorage(cleanId, JSON.stringify(cachedList));
      }
    } catch {}

    try {
      ablyService.sendMessage(`public-channel-${cleanId}`, {
        type: 'channel-post',
        post: { ...postObj, text: cipherText },
      }).catch(() => {});
    } catch {}

    return postObj;
  }

  async deletePost(channelId: string, postId: string, userId?: string): Promise<boolean> {
    const cleanChanId = channelId.trim();
    const cleanPostId = postId.trim();
    const senderNickname = useAuthStore.getState().nickname;

    try {
      const delKey = `orbita_deleted_channel_posts_${cleanChanId}`;
      const rawDel = localStorage.getItem(delKey);
      const list: string[] = rawDel ? JSON.parse(rawDel) : [];
      if (!list.includes(cleanPostId)) {
        list.push(cleanPostId);
        localStorage.setItem(delKey, JSON.stringify(list));
      }
    } catch {}

    try {
      const cached = await getChannelPostsStorage(cleanChanId);
      if (cached) {
        const posts = JSON.parse(cached);
        if (Array.isArray(posts)) {
          await setChannelPostsStorage(cleanChanId, JSON.stringify(posts.filter((p: any) => p.id !== cleanPostId)));
        }
      }
    } catch {}

    try {
      await fetch(`${W}/channels/delete-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: cleanChanId, postId: cleanPostId, userId, senderNickname }),
      });
    } catch {}

    try {
      await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/channel_posts?id=eq.${encodeURIComponent(cleanPostId)}`, {
        method: "DELETE",
        headers: {
          apikey: CHANNELS_SUPABASE_KEY,
          Authorization: `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
    } catch {}

    try {
      ablyService.sendMessage(`public-channel-${cleanChanId}`, {
        type: "delete-post",
        channelId: cleanChanId,
        postId: cleanPostId,
        targetMessageId: cleanPostId,
      }).catch(() => {});
    } catch {}

    return true;
  }
  async joinChannel(channelId: string, nickname?: string): Promise<number | null> {
    const cleanId = channelId.trim();
    try {
      const res = await fetch(`${W}/channels/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: cleanId, nickname }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscribersCount: number };
        if (typeof data.subscribersCount === 'number') {
          try {
            ablyService.sendMessage(`public-channel-${cleanId}`, {
              type: 'subscribers-updated',
              channelId: cleanId,
              subscribersCount: data.subscribersCount,
              action: 'join',
              nickname,
            }).catch(() => {});
          } catch {}
          return data.subscribersCount;
        }
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to join channel:', err);
    }
    return null;
  }

  async leaveChannel(channelId: string, nickname?: string): Promise<number | null> {
    const cleanId = channelId.trim();
    try {
      const res = await fetch(`${W}/channels/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: cleanId, nickname }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscribersCount: number };
        if (typeof data.subscribersCount === 'number') {
          try {
            ablyService.sendMessage(`public-channel-${cleanId}`, {
              type: 'subscribers-updated',
              channelId: cleanId,
              subscribersCount: data.subscribersCount,
              action: 'leave',
              nickname,
            }).catch(() => {});
          } catch {}
          return data.subscribersCount;
        }
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to leave channel:', err);
    }
    return null;
  }

  async toggleReaction(
    channelId: string,
    postId: string,
    emoji: string,
    userId: string,
    action?: 'add' | 'remove' | 'toggle',
    sessionId?: string
  ): Promise<Record<string, string[]> | null> {
    const cleanChanId = channelId.trim();
    const cleanPostId = postId.trim();
    let updatedReactions: Record<string, string[]> | null = null;

    try {
      const res = await fetch(`${W}/channels/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: cleanChanId, postId: cleanPostId, emoji, userId, action: action || 'toggle', sessionId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { reactions: Record<string, string[]> };
        if (data.reactions) {
          updatedReactions = data.reactions;
        }
      }
    } catch {}

    if (updatedReactions) {
      try {
        const cachedStr = await getChannelPostsStorage(cleanChanId);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached)) {
            const updated = cached.map((p: any) => p.id === cleanPostId ? { ...p, reactions: updatedReactions! } : p);
            await setChannelPostsStorage(cleanChanId, JSON.stringify(updated));
          }
        }
      } catch {}
      try {
        ablyService.sendMessage(`public-channel-${cleanChanId}`, {
          type: 'reaction-updated',
          postId: cleanPostId,
          emoji,
          userId,
          action: action || 'toggle',
          reactions: updatedReactions,
          sessionId,
        }).catch(() => {});
      } catch {}
    }

    return updatedReactions;
  }

  subscribeToChannel(
    channelId: string,
    onNewPost: (post: ChannelPost) => void,
    onReactionUpdated?: (data: { postId: string; emoji: string; userId: string; action: 'add' | 'remove' | 'toggle'; reactions: Record<string, string[]> }) => void,
    onSubscribersUpdated?: (data: { channelId: string; subscribersCount: number; action?: 'join' | 'leave'; nickname?: string }) => void
  ): () => void {
    const pusher = getPusher();
    const channelName = `public-channel-${channelId.trim()}`;
    const channel = pusher.subscribe(channelName);

    const postHandler = (data: ChannelPost) => {
      console.log('[ChannelService] Received new post via Pusher:', data);
      onNewPost(data);
    };

    const reactionHandler = (data: any) => {
      console.log('[ChannelService] Received reaction update via Pusher:', data);
      if (onReactionUpdated) onReactionUpdated(data);
    };

    const subscribersHandler = (data: any) => {
      console.log('[ChannelService] Received subscribers update via Pusher:', data);
      if (onSubscribersUpdated) onSubscribersUpdated(data);
    };

    channel.bind('new-post', postHandler);
    channel.bind('reaction-updated', reactionHandler);
    channel.bind('subscribers-updated', subscribersHandler);

    return () => {
      channel.unbind('new-post', postHandler);
      channel.unbind('reaction-updated', reactionHandler);
      channel.unbind('subscribers-updated', subscribersHandler);
      pusher.unsubscribe(channelName);
    };
  }
}

export const channelService = new ChannelService();
