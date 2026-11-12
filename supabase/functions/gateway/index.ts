// @ts-nocheck
// supabase/functions/gateway/index.ts
// Supabase Edge Function: Orbita Multi-Gateway
import { AccessToken } from 'npm:livekit-server-sdk@2.9.5';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// API Credentials
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || '';
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || '';
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || '';

const PUSHER_KEY = Deno.env.get('PUSHER_KEY') || '';
const PUSHER_SECRET = Deno.env.get('PUSHER_SECRET') || '';

const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') || '';
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') || '';
const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') || '';

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  return createClient(supabaseUrl, supabaseKey);
}

function normalizeUsernameInput(value: any): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/^@+/, '').trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

function parseProfileRow(row: any): any {
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
  const username = normalizeUsernameInput(row.username);
  return {
    ...row,
    username: username === undefined ? null : username,
    banner_url: bannerUrl,
    bio,
  };
}

function coalesceProfileRows(rows: any[]): any {
  if (!rows || rows.length === 0) return null;
  const parsedRows = rows.map(parseProfileRow).filter(Boolean);
  if (parsedRows.length === 0) return null;
  const newest = parsedRows[0];
  const pickFirst = (key: string) => {
    for (const r of parsedRows) {
      const val = r[key];
      if (val !== undefined && val !== null && val !== '') {
        return val;
      }
    }
    return null;
  };
  const pickBooleanOrValue = (key: string) => {
    for (const r of parsedRows) {
      if (r[key] !== undefined && r[key] !== null) {
        return r[key];
      }
    }
    return null;
  };
  return {
    ...newest,
    nickname: pickFirst('nickname'),
    avatar_url: pickFirst('avatar_url'),
    banner_url: pickFirst('banner_url'),
    username: pickFirst('username'),
    bio: pickFirst('bio'),
    birthday: pickFirst('birthday'),
    sender_code: pickFirst('sender_code'),
    numeric_id: pickFirst('numeric_id'),
    hide_profile_id: pickBooleanOrValue('hide_profile_id'),
  };
}

function isSameProfileOwner(row: any, chatId: string, senderCode?: string | null): boolean {
  const rSender = row.sender_code ? String(row.sender_code).toLowerCase() : null;
  const rChat = row.chat_id ? String(row.chat_id).toLowerCase() : null;
  const bSender = senderCode ? String(senderCode).toLowerCase() : null;
  const bChat = chatId ? String(chatId).toLowerCase() : null;
  if (bSender && rSender) {
    return rSender === bSender;
  }
  if (!rSender && rChat) {
    return rChat === bSender || rChat === bChat;
  }
  if (!bSender && rSender) {
    return rSender === bChat;
  }
  return Boolean(rChat && bChat && rChat === bChat);
}

function stripMissingColumns(payload: Record<string, any>, error: any): boolean {
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

Deno.serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/gateway/, '').replace(/^\/functions\/v1\/gateway/, '');

  try {
    // 2. Health check
    if (path === '' || path === '/' || path === '/health') {
      return jsonResponse({
        status: 'ok',
        server: 'Supabase Edge Functions (AWS Global)',
        timestamp: Date.now(),
      });
    }

    // 3. LiveKit генератор токенов звонков
    if ((path === '/token' || path.endsWith('/token')) && req.method === 'POST') {
      const body = await req.json();
      const { room, identity, name } = body;

      if (!room || !identity) {
        return jsonResponse({ error: 'room and identity are required' }, 400);
      }

      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: name || identity,
        ttl: '4h',
      });

      at.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      return jsonResponse({ token, url: LIVEKIT_URL });
    }

    // 4. Ably Token Request (/ably-auth)
    if ((path === '/ably-auth' || path.endsWith('/ably-auth')) && (req.method === 'GET' || req.method === 'POST')) {
      let clientId = url.searchParams.get('clientId') || undefined;
      if (req.method === 'POST') {
        try {
          const body = await req.json();
          if (body.clientId) clientId = body.clientId;
        } catch {}
      }

      const ablyRes = await fetch(`https://orbita.ypgreg78.workers.dev/ably-auth?clientId=${encodeURIComponent(clientId || '')}`);
      if (ablyRes.ok) {
        const data = await ablyRes.json();
        return jsonResponse(data);
      }
    }

    // 5. Pusher Channel Auth
    if ((path === '/pusher-auth' || path.endsWith('/pusher-auth') || path.endsWith('/pusher/auth')) && req.method === 'POST') {
      const body = await req.json();
      const { socket_id, channel_name, channel_data } = body;

      if (!socket_id || !channel_name) {
        return jsonResponse({ error: 'socket_id and channel_name are required' }, 400);
      }

      let stringToSign = `${socket_id}:${channel_name}`;
      if (channel_data) {
        stringToSign += `:${channel_data}`;
      }

      const encoder = new TextEncoder();
      const keyData = encoder.encode(PUSHER_SECRET);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
      const sigBytes = new Uint8Array(signatureBuffer);
      const hexSignature = Array.from(sigBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      return jsonResponse({
        auth: `${PUSHER_KEY}:${hexSignature}`,
        ...(channel_data ? { channel_data } : {}),
      });
    }

    // 6. Cloudinary Upload Sign
    if ((path === '/cloudinary-sign' || path.endsWith('/cloudinary-sign')) && req.method === 'POST') {
      const body = await req.json();
      const { public_id, timestamp = Math.floor(Date.now() / 1000).toString() } = body;

      if (!public_id) {
        return jsonResponse({ error: 'public_id is required' }, 400);
      }

      const paramsToSign = `public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign));
      const hashBytes = new Uint8Array(hashBuffer);
      const signature = Array.from(hashBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      return jsonResponse({
        signature,
        timestamp,
        apiKey: CLOUDINARY_API_KEY,
        cloudName: CLOUDINARY_CLOUD_NAME,
        uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      });
    }

    // 7. Relay: Сохранение входящего рукопожатия / заявки в друзья
    if ((path === '/relay/handshake' || path.endsWith('/relay/handshake')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const { chatId, recipientCode, senderNickname, senderPublicKey, senderAvatarUrl, senderCode } = body;

      if (!chatId || !recipientCode || !senderNickname || !senderPublicKey) {
        return jsonResponse({ error: 'Missing required handshake parameters' }, 400);
      }

      const { data, error } = await supabase
        .from('handshakes')
        .insert({
          chat_id: chatId,
          recipient_code: recipientCode,
          sender_nickname: senderNickname,
          sender_public_key: senderPublicKey,
          sender_avatar_url: senderAvatarUrl || null,
          sender_code: senderCode || null,
        })
        .select();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok', data });
    }

    // 8. Relay: Получение входящих рукопожатий / заявок в друзья
    if ((path === '/relay/handshakes' || path.endsWith('/relay/handshakes')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const recipientCode = url.searchParams.get('recipientCode');
      if (!recipientCode) return jsonResponse({ error: 'Missing recipientCode parameter' }, 400);

      const { data, error } = await supabase
        .from('handshakes')
        .select('*')
        .eq('recipient_code', recipientCode)
        .eq('consumed', false)
        .order('created_at', { ascending: true });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ handshakes: data || [] });
    }

    // 9. Relay: Пометить рукопожатие как обработанное (принято/отклонено)
    if ((path === '/relay/handshake/consumed' || path.endsWith('/relay/handshake/consumed')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      if (!body.handshakeId) return jsonResponse({ error: 'Missing handshakeId parameter' }, 400);

      const { error } = await supabase
        .from('handshakes')
        .update({ consumed: true })
        .eq('id', body.handshakeId);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok' });
    }

    // 10. Relay: Отправка сообщения (офлайн/резерв)
    if ((path === '/relay/message' || path.endsWith('/relay/message')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const { data, error } = await supabase
        .from('messages')
        .insert({
          chat_id: body.chatId,
          sender_id: body.senderId,
          recipient_id: body.recipientId,
          ciphertext: body.ciphertext,
          message_index: body.messageIndex,
          dh_public_key: body.dhPublicKey,
        })
        .select();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok', data });
    }

    // 11. Relay: Получение сообщений для получателя
    if ((path === '/relay/messages' || path.endsWith('/relay/messages')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const recipientId = url.searchParams.get('recipientId');
      if (!recipientId) return jsonResponse({ error: 'Missing recipientId parameter' }, 400);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('recipient_id', recipientId)
        .eq('delivered', false)
        .order('created_at', { ascending: true });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ messages: data || [] });
    }

    // 12. Relay: Пометить сообщение доставленным
    if ((path === '/relay/message/delivered' || path.endsWith('/relay/message/delivered')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      if (!body.messageId) return jsonResponse({ error: 'Missing messageId parameter' }, 400);

      const { error } = await supabase
        .from('messages')
        .update({
          delivered: true,
          expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
        })
        .eq('id', body.messageId)
        .eq('delivered', false);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok' });
    }

    if ((path === '/relay/profile' || path.endsWith('/relay/profile')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      if (!body.chatId) return jsonResponse({ error: 'Missing chatId parameter' }, 400);

      const incomingUsername = normalizeUsernameInput(body.username);
      const incomingSenderCode = body.senderCode ? String(body.senderCode).trim() : undefined;

      if (incomingUsername) {
        const { data: existingRows, error: checkError } = await supabase
          .from('profile_updates')
          .select('sender_code, chat_id')
          .ilike('username', incomingUsername);

        if (checkError) return jsonResponse({ error: checkError.message }, 500);

        if (existingRows && existingRows.length > 0) {
          const isTaken = existingRows.some((row: any) => !isSameProfileOwner(row, body.chatId, incomingSenderCode));
          if (isTaken) {
            return jsonResponse({ error: 'USERNAME_TAKEN' }, 409);
          }
        }
      }

      let existingProfileRows: any[] = [];
      if (incomingSenderCode) {
        const { data: rowsBySender, error: lookupError } = await supabase
          .from('profile_updates')
          .select('*')
          .eq('chat_id', body.chatId)
          .ilike('sender_code', incomingSenderCode)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (lookupError) return jsonResponse({ error: lookupError.message }, 500);
        existingProfileRows = rowsBySender || [];

        if (existingProfileRows.length === 0 && String(body.chatId).toLowerCase() === incomingSenderCode.toLowerCase()) {
          const { data: legacyRows, error: legacyError } = await supabase
            .from('profile_updates')
            .select('*')
            .eq('chat_id', body.chatId)
            .is('sender_code', null)
            .order('updated_at', { ascending: false })
            .limit(10);
          if (legacyError) return jsonResponse({ error: legacyError.message }, 500);
          existingProfileRows = legacyRows || [];
        }
      } else {
        const { data: rowsWithoutSender, error: lookupError } = await supabase
          .from('profile_updates')
          .select('*')
          .eq('chat_id', body.chatId)
          .is('sender_code', null)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (lookupError) return jsonResponse({ error: lookupError.message }, 500);
        existingProfileRows = rowsWithoutSender || [];
      }

      const existingMerged = coalesceProfileRows(existingProfileRows);

      let incomingBanner = body.bannerUrl !== undefined ? (body.bannerUrl || null) : undefined;
      let incomingBio: string | null | undefined = body.bio !== undefined ? (body.bio || null) : undefined;
      if (typeof incomingBio === 'string') {
        const bannerMatch = incomingBio.match(/<!--banner:(.*?)-->/);
        if (bannerMatch && incomingBanner === undefined) {
          incomingBanner = bannerMatch[1] || null;
        }
        incomingBio = incomingBio.replace(/<!--banner:.*?-->/g, '').trim() || null;
      }

      const mergedNickname = body.nickname !== undefined ? (body.nickname || null) : (existingMerged?.nickname ?? null);
      const mergedAvatarUrl = body.avatarUrl !== undefined ? (body.avatarUrl || null) : (existingMerged?.avatar_url ?? null);
      const mergedBannerUrl = incomingBanner !== undefined ? incomingBanner : (existingMerged?.banner_url ?? null);
      const mergedBio = incomingBio !== undefined ? incomingBio : (existingMerged?.bio ?? null);
      const mergedUsername = incomingUsername !== undefined ? incomingUsername : (existingMerged?.username ?? null);
      const mergedBirthday = body.birthday !== undefined ? (body.birthday || null) : (existingMerged?.birthday ?? null);
      const mergedHideProfileId = body.hideProfileId !== undefined ? body.hideProfileId : (existingMerged?.hide_profile_id ?? null);
      const mergedSenderCode = incomingSenderCode !== undefined ? incomingSenderCode : (existingMerged?.sender_code ?? null);

      let effectiveBio = mergedBio || null;
      if (mergedBannerUrl) {
        effectiveBio = effectiveBio ? `${effectiveBio}\n<!--banner:${mergedBannerUrl}-->` : `<!--banner:${mergedBannerUrl}-->`;
      }

      const writePayload: Record<string, any> = {
        chat_id: body.chatId,
        nickname: mergedNickname,
        avatar_url: mergedAvatarUrl,
        banner_url: mergedBannerUrl,
        hide_profile_id: mergedHideProfileId,
        sender_code: mergedSenderCode,
        bio: effectiveBio,
        username: mergedUsername,
        birthday: mergedBirthday,
        updated_at: new Date().toISOString(),
      };

      let data: any = null;
      let error: any = null;

      if (existingProfileRows.length > 0 && existingProfileRows[0]?.id) {
        const targetId = existingProfileRows[0].id;
        const updateRes = await supabase
          .from('profile_updates')
          .update(writePayload)
          .eq('id', targetId)
          .select();
        data = updateRes.data;
        error = updateRes.error;

        if (error && stripMissingColumns(writePayload, error)) {
          const retryRes = await supabase
            .from('profile_updates')
            .update(writePayload)
            .eq('id', targetId)
            .select();
          data = retryRes.data;
          error = retryRes.error;
        }

        if (!error && existingProfileRows.length > 1) {
          const duplicateIds = existingProfileRows.slice(1).map((r: any) => r.id).filter(Boolean);
          if (duplicateIds.length > 0) {
            await supabase.from('profile_updates').delete().in('id', duplicateIds);
          }
        }
      } else {
        const insertRes = await supabase
          .from('profile_updates')
          .insert(writePayload)
          .select();
        data = insertRes.data;
        error = insertRes.error;

        if (error && stripMissingColumns(writePayload, error)) {
          const retryRes = await supabase
            .from('profile_updates')
            .insert(writePayload)
            .select();
          data = retryRes.data;
          error = retryRes.error;
        }
      }

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok', data });
    }

    if ((path === '/relay/check-username' || path.endsWith('/relay/check-username')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const username = normalizeUsernameInput(url.searchParams.get('username')) || '';
      const excludeCode = url.searchParams.get('excludeCode') || null;
      if (!username || username === 'support') return jsonResponse({ available: false });

      const { data, error } = await supabase
        .from('profile_updates')
        .select('sender_code, chat_id')
        .ilike('username', username);

      if (error) return jsonResponse({ error: error.message }, 500);
      if (!data || data.length === 0) return jsonResponse({ available: true });

      const ex = excludeCode ? excludeCode.toLowerCase() : null;
      const isTaken = data.some((row: any) => {
        if (!ex) return true;
        if (row.sender_code) return String(row.sender_code).toLowerCase() !== ex;
        if (row.chat_id) return String(row.chat_id).toLowerCase() !== ex;
        return true;
      });

      return jsonResponse({ available: !isTaken });
    }

    if ((path === '/relay/search-users' || path.endsWith('/relay/search-users')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const rawQ = (url.searchParams.get('q') || '').replace(/^@+/, '').trim().replace(/[,()]/g, '');
      const q = rawQ.toLowerCase();
      const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20);
      if (!q) return jsonResponse({ users: [] });

      const filter = `username.ilike.${q}%,sender_code.ilike.${rawQ}`;

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .or(filter)
        .order('updated_at', { ascending: false })
        .limit(Math.max(limit * 3, 50));

      if (error) return jsonResponse({ error: error.message }, 500);

      const grouped = new Map<string, { userCode: string; rows: any[] }>();
      for (const row of (data || [])) {
        const userCode = row.sender_code || row.chat_id;
        if (!userCode) continue;
        const key = String(userCode).toLowerCase();
        const entry = grouped.get(key);
        if (entry) {
          entry.rows.push(row);
        } else if (grouped.size < limit) {
          grouped.set(key, { userCode, rows: [row] });
        }
      }

      const users: any[] = [];
      for (const { userCode, rows } of grouped.values()) {
        const merged = coalesceProfileRows(rows);
        if (!merged) continue;
        users.push({
          user_code: userCode,
          numeric_id: merged.numeric_id || null,
          nickname: merged.nickname || 'User',
          avatar_url: merged.avatar_url || null,
          banner_url: merged.banner_url || null,
          username: merged.username || null,
          bio: merged.bio || null,
          birthday: merged.birthday || null,
          updated_at: merged.updated_at,
        });
      }
      return jsonResponse({ users });
    }

    if ((path === '/relay/resolve-username' || path.endsWith('/relay/resolve-username')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const username = normalizeUsernameInput(url.searchParams.get('username')) || '';
      if (!username) return jsonResponse({ user: null });

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .ilike('username', username)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) return jsonResponse({ error: error.message }, 500);
      if (!data || data.length === 0) return jsonResponse({ user: null });

      const primaryOwner = String(data[0].sender_code || data[0].chat_id || '').toLowerCase();
      const ownerRows = data.filter((r: any) => String(r.sender_code || r.chat_id || '').toLowerCase() === primaryOwner);
      const merged = coalesceProfileRows(ownerRows);
      if (!merged) return jsonResponse({ user: null });

      return jsonResponse({
        user: {
          user_code: merged.sender_code || merged.chat_id,
          numeric_id: merged.numeric_id || null,
          nickname: merged.nickname || 'User',
          avatar_url: merged.avatar_url || null,
          banner_url: merged.banner_url || null,
          username: merged.username || null,
          bio: merged.bio || null,
          birthday: merged.birthday || null,
          updated_at: merged.updated_at,
        }
      });
    }

    if ((path === '/relay/profile' || path.endsWith('/relay/profile')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const chatId = url.searchParams.get('chatId');
      const excludeCode = url.searchParams.get('excludeCode');
      if (!chatId) return jsonResponse({ error: 'Missing chatId parameter' }, 400);

      const safeChatId = chatId.replace(/[,()]/g, '');
      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .or(`chat_id.eq.${safeChatId},sender_code.ilike.${safeChatId}`)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) return jsonResponse({ error: error.message }, 500);

      const ex = excludeCode ? excludeCode.toLowerCase() : null;
      const filtered = (data || []).filter((row: any) => {
        if (!ex) return true;
        return !row.sender_code || String(row.sender_code).toLowerCase() !== ex;
      });

      if (filtered.length === 0) return jsonResponse({ profile: null });

      let prioritized = filtered;
      if (!ex) {
        const directPublicRows = filtered.filter((r: any) =>
          (r.sender_code && String(r.sender_code).toLowerCase() === safeChatId.toLowerCase()) ||
          (String(r.chat_id || '').toLowerCase() === safeChatId.toLowerCase() && !r.sender_code)
        );
        if (directPublicRows.length > 0) {
          prioritized = directPublicRows;
        }
      }

      const newestSender = prioritized[0].sender_code ? String(prioritized[0].sender_code).toLowerCase() : null;
      const ownerRows = prioritized.filter((r: any) => {
        if (!newestSender) return !r.sender_code || String(r.chat_id || '').toLowerCase() === String(prioritized[0].chat_id || '').toLowerCase();
        return !r.sender_code || String(r.sender_code).toLowerCase() === newestSender;
      });

      const profile = coalesceProfileRows(ownerRows);
      return jsonResponse({ profile });
    }

    if ((path === '/relay/profiles/latest' || path.endsWith('/relay/profiles/latest')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const { chatIds } = body as { chatIds: string[] };

      if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
        return jsonResponse({ updates: [] });
      }

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .in('chat_id', chatIds)
        .order('updated_at', { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const groupedByChat = new Map<string, any[]>();
      for (const update of data || []) {
        const list = groupedByChat.get(update.chat_id);
        if (list) {
          list.push(update);
        } else {
          groupedByChat.set(update.chat_id, [update]);
        }
      }

      const updates: any[] = [];
      for (const rows of groupedByChat.values()) {
        const newestSender = rows[0].sender_code ? String(rows[0].sender_code).toLowerCase() : null;
        const ownerRows = rows.filter((r: any) => !newestSender || !r.sender_code || String(r.sender_code).toLowerCase() === newestSender);
        const merged = coalesceProfileRows(ownerRows);
        if (merged) updates.push(merged);
      }

      return jsonResponse({ updates });
    }

    // 16. Список разработчиков Orbita
    if ((path === '/developers' || path === '/relay/developers' || path.endsWith('/developers')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('developers')
        .select('code');

      if (error) return jsonResponse({ error: error.message }, 500);
      const codes = (data || []).map((d: any) => d.code).filter(Boolean);
      return jsonResponse({ developers: codes });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (err: any) {
    console.error('[Supabase Gateway] Error:', err);
    return jsonResponse({ error: err?.message || 'Internal server error' }, 500);
  }
});
