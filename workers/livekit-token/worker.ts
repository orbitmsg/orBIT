import { AccessToken } from 'livekit-server-sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ed25519 } from '@noble/curves/ed25519.js';

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface Env {
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_URL?: string;
  ABLY_API_KEY?: string;
  ABLY_API_KEY_2?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  CHANNELS_SUPABASE_URL?: string;
  CHANNELS_SUPABASE_KEY?: string;
  GROUPS_SUPABASE_URL?: string;
  GROUPS_SUPABASE_KEY?: string;
  GROUPS_SUPABASE_SECRET_KEY?: string;
  PUSHER_KEY?: string;
  PUSHER_SECRET?: string;
  PUSHER_APP_ID?: string;
  PUSHER_CLUSTER?: string;
  PUSHER_KEY_2?: string;
  PUSHER_SECRET_2?: string;
  PUSHER_APP_ID_2?: string;
  PUSHER_CLUSTER_2?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_CLOUD_NAME?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Token, x-user-id',
};

const inMemoryActiveGroupCalls = new Map<string, any>();

function verifyWorkerEd25519(userIdHex: string, version: number, configBlob: string, signatureHex: string): boolean {
  if (!userIdHex || !signatureHex || version === undefined || !configBlob) return false;
  try {
    const cleanUserId = String(userIdHex).trim().toLowerCase();
    const cleanSig = String(signatureHex).trim().toLowerCase();
    const messageStr = `${cleanUserId}${version}${configBlob}`;
    const messageBytes = new TextEncoder().encode(messageStr);
    const pubBytes = new Uint8Array(cleanUserId.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    return ed25519.verify(sigBytes, messageBytes, pubBytes);
  } catch {
    return false;
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ error }, status);
}

function getSupabaseClient(env: Env): SupabaseClient | null {
  const url = env.SUPABASE_URL || 'https://majmrtymawymomliowbz.supabase.co';
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        if (key.startsWith('sb_secret_') || key.startsWith('sb_publishable_')) {
          headers.delete('Authorization');
          headers.set('apikey', key);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function getGroupsSupabaseClient(env: Env): SupabaseClient | null {
  const url = env.GROUPS_SUPABASE_URL || 'https://vxjaybyveerulkdqhggr.supabase.co';
  const key = env.GROUPS_SUPABASE_SECRET_KEY || env.GROUPS_SUPABASE_KEY || 'sb_publishable_x6OPhg68nS-xBcPn4K47NQ_2nSS4Kfu';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        if (key.startsWith('sb_secret_') || key.startsWith('sb_publishable_')) {
          headers.delete('Authorization');
          headers.set('apikey', key);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function getChannelsSupabaseClient(env: Env): SupabaseClient | null {
  const url = env.CHANNELS_SUPABASE_URL || 'https://rugqiezexuknqcppicma.supabase.co';
  const key = env.CHANNELS_SUPABASE_KEY || 'sb_publishable_XYjE7C93LWA-P1OHZqNONg_QHlyZ9sZ';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        if (key.startsWith('sb_secret_') || key.startsWith('sb_publishable_')) {
          headers.delete('Authorization');
          headers.set('apikey', key);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function checkAdminAuthorization(supabase: SupabaseClient | null, userCode: string) {
  if (!supabase || !userCode) return null;
  try {
    const { data: adminRecord } = await supabase
      .from('support_admins')
      .select('user_code, role, auth_token')
      .eq('user_code', userCode)
      .maybeSingle();

    if (adminRecord) return adminRecord;

    const { data: devRecord } = await supabase
      .from('developers')
      .select('code')
      .eq('code', userCode)
      .maybeSingle();

    if (devRecord) {
      const newAdmin = {
        user_code: userCode,
        role: 'superadmin',
        auth_token: null,
      };
      await supabase.from('support_admins').upsert(newAdmin);
      return newAdmin;
    }
  } catch (err) {
    console.error('[checkAdminAuthorization] error:', err);
  }
  return null;
}

async function toUuid(id?: string): Promise<string | null> {
  if (!id || typeof id !== 'string') return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const enc = new TextEncoder().encode(id);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const hashArr = Array.from(new Uint8Array(hashBuf)).slice(0, 16);
  const h = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function createAblyTokenRequest(
  apiKey: string,
  clientId?: string,
  capability = '{"*":["*"]}',
  ttl = 3600000
) {
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid ABLY_API_KEY format (expected keyName:keySecret)');
  }
  const [keyName, keySecret] = parts;
  const timestamp = Date.now();

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let binaryNonce = '';
  for (let i = 0; i < randomBytes.byteLength; i++) {
    binaryNonce += String.fromCharCode(randomBytes[i]);
  }
  const nonce = btoa(binaryNonce);

  const ttlStr = ttl ? ttl.toString() : '';
  const clientIdStr = clientId || '';
  const signText = `${keyName}\n${ttlStr}\n${capability}\n${clientIdStr}\n${timestamp}\n${nonce}\n`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(keySecret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(signText));
  const sigBytes = new Uint8Array(signatureBuffer);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.byteLength; i++) {
    sigBinary += String.fromCharCode(sigBytes[i]);
  }
  const mac = btoa(sigBinary);

  return {
    keyName,
    ttl,
    capability,
    clientId: clientIdStr || undefined,
    timestamp,
    nonce,
    mac,
  };
}

/**
 * Генерация Pusher Channel Auth подписи (HMAC-SHA256)
 */
async function signPusherChannel(
  pusherKey: string,
  pusherSecret: string,
  socketId: string,
  channelName: string,
  channelData?: string
): Promise<{ auth: string; channel_data?: string }> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(pusherSecret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  let stringToSign = `${socketId}:${channelName}`;
  if (channelData) {
    stringToSign += `:${channelData}`;
  }

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
  const sigBytes = new Uint8Array(signatureBuffer);
  const hexSignature = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    auth: `${pusherKey}:${hexSignature}`,
    ...(channelData ? { channel_data: channelData } : {}),
  };
}

/**
 * Генерация Cloudinary Upload подписи (SHA-1)
 */
async function signCloudinaryUpload(
  apiKey: string,
  apiSecret: string,
  cloudName: string,
  publicId: string,
  timestamp: string
) {
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign));
  const hashBytes = new Uint8Array(hashBuffer);
  const signature = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  };
}

/**
 * Отправка события Pusher с сервера (REST API)
 */
const PUSHER_CONFIGS = (env: Env): Array<{ appId: string; key: string; secret: string; cluster: string }> => [
  {
    appId: env.PUSHER_APP_ID || '',
    key: env.PUSHER_KEY || '',
    secret: env.PUSHER_SECRET || '',
    cluster: env.PUSHER_CLUSTER || 'eu',
  }
].filter((s): s is { appId: string; key: string; secret: string; cluster: string } => Boolean(s.secret));

async function triggerPusherEventOnServer(
  server: { appId: string; key: string; secret: string; cluster: string },
  channel: string,
  event: string,
  data: any
): Promise<boolean> {
  try {
    const bodyStr = JSON.stringify({
      name: event,
      channel: channel,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });

    const encoder = new TextEncoder();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = `/apps/${server.appId}/events`;
    const queryParams = `auth_key=${server.key}&auth_timestamp=${timestamp}&auth_version=1.0`;

    const stringToSign = `POST\n${path}\n${queryParams}`;
    const keyData = encoder.encode(server.secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
    const authSignature = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const url = `https://api-${server.cluster}.pusher.com${path}?${queryParams}&auth_signature=${authSignature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });

    return res.ok;
  } catch (err) {
    console.error(`[Worker] Pusher trigger on ${server.key} failed:`, err);
    return false;
  }
}

async function triggerPusherEvent(
  env: Env,
  channel: string,
  event: string,
  data: any
): Promise<boolean> {
  const configs = PUSHER_CONFIGS(env);
  if (configs.length === 0) return false;

  const results = await Promise.allSettled(
    configs.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );

  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

const GROUP_PUSHER_CONFIGS = (env: Env): Array<{ appId: string; key: string; secret: string; cluster: string }> => [
  {
    appId: env.PUSHER_APP_ID_2 || '2179076',
    key: env.PUSHER_KEY_2 || 'a7856d37aeac4f908167',
    secret: env.PUSHER_SECRET_2 || env.PUSHER_SECRET || '',
    cluster: env.PUSHER_CLUSTER_2 || 'eu',
  }
].filter((s): s is { appId: string; key: string; secret: string; cluster: string } => Boolean(s.secret));

async function triggerGroupPusherEvent(
  env: Env,
  channel: string,
  event: string,
  data: any
): Promise<boolean> {
  const configs = GROUP_PUSHER_CONFIGS(env).length > 0 ? GROUP_PUSHER_CONFIGS(env) : PUSHER_CONFIGS(env);
  if (configs.length === 0) return false;
  const results = await Promise.allSettled(
    configs.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

async function triggerAblyEvent(
  env: Env,
  channel: string,
  name: string,
  data: any
): Promise<boolean> {
  const keys = [env.ABLY_API_KEY, env.ABLY_API_KEY_2].filter(Boolean);
  if (keys.length === 0) return false;
  for (const key of keys) {
    try {
      const basicAuth = btoa(key!);
      const url = `https://rest.ably.io/channels/${encodeURIComponent(channel)}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, data }),
      });
      if (res.ok) return true;
    } catch {}
  }
  return false;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === '/' || pathname === '/health') {
        const groupsUrl = env.GROUPS_SUPABASE_URL || 'https://vxjaybyveerulkdqhggr.supabase.co';
        return jsonResponse({
          status: 'ok',
          service: 'orbita-relay-worker',
          capabilities: ['livekit', 'ably', 'relay', 'pusher', 'cloudinary', 'groups', 'support', 'channels'],
          supabase_host: env.SUPABASE_URL ? new URL(env.SUPABASE_URL).hostname : 'majmrtymawymomliowbz.supabase.co',
          groups_host: groupsUrl ? new URL(groupsUrl).hostname : null,
          timestamp: Date.now(),
        });
      }

      if (pathname === '/user/config' || pathname === '/api/user/config') {
        if (request.method === 'GET') {
          const userId = (url.searchParams.get('user_id') || url.searchParams.get('userId') || '').trim().toLowerCase();
          if (!userId) return errorResponse('Missing user_id', 400);
          if (!/^[0-9a-f]{64}$/i.test(userId)) return errorResponse('Invalid user_id format', 400);

          const supabase = getSupabaseClient(env);
          if (!supabase) return errorResponse('Database not configured on server', 503);

          const { data, error } = await supabase
            .from('user_configs')
            .select('config_blob, version, updated_at')
            .eq('user_id', userId)
            .maybeSingle();

          if (error) {
            return errorResponse(error.message, 500);
          }

          if (!data) {
            return jsonResponse({ status: 'not_found', config_blob: null, version: 0, updated_at: null }, 404);
          }

          return jsonResponse({
            status: 'ok',
            config_blob: data.config_blob,
            version: Number(data.version),
            updated_at: data.updated_at,
          });
        }

        if (request.method === 'PUT' || request.method === 'POST') {
          let body: any;
          try {
            body = await request.json();
          } catch {
            return errorResponse('Invalid JSON body', 400);
          }

          const userId = String(body.user_id || body.userId || url.searchParams.get('user_id') || url.searchParams.get('userId') || request.headers.get('x-user-id') || '').trim().toLowerCase();
          const configBlob = body.config_blob || body.configBlob;
          const version = Number(body.version);
          const signature = String(body.signature || '').trim().toLowerCase();

          if (!userId || !/^[0-9a-f]{64}$/i.test(userId)) {
            return errorResponse('Invalid or missing user_id', 400);
          }
          if (!configBlob || typeof configBlob !== 'string') {
            return errorResponse('Invalid or missing config_blob', 400);
          }
          if (!Number.isSafeInteger(version) || version <= 0) {
            return errorResponse('Invalid version: must be a positive integer', 400);
          }
          if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) {
            return errorResponse('Invalid or missing signature (expected 128 hex chars)', 400);
          }

          const blobBytesLength = new TextEncoder().encode(configBlob).length;
          if (blobBytesLength > 5 * 1024 * 1024) {
            return errorResponse('Payload too large: config_blob exceeds 5 MB limit', 413);
          }

          const isValidSig = verifyWorkerEd25519(userId, version, configBlob, signature);
          if (!isValidSig) {
            return errorResponse('Invalid Ed25519 signature', 401);
          }

          const supabase = getSupabaseClient(env);
          if (!supabase) return errorResponse('Database not configured on server', 503);

          const { data: existing, error: selectErr } = await supabase
            .from('user_configs')
            .select('version')
            .eq('user_id', userId)
            .maybeSingle();

          if (selectErr) {
            return errorResponse(selectErr.message, 500);
          }

          if (existing && existing.version !== null && existing.version !== undefined) {
            const currentVersion = Number(existing.version);
            if (version <= currentVersion) {
              return errorResponse(`Conflict: incoming version (${version}) must be strictly greater than current version (${currentVersion})`, 409);
            }
          }

          const nowIso = new Date().toISOString();
          const { error: upsertErr } = await supabase
            .from('user_configs')
            .upsert({
              user_id: userId,
              config_blob: configBlob,
              version: version,
              signature: signature,
              updated_at: nowIso,
            });

          if (upsertErr) {
            return errorResponse(upsertErr.message, 500);
          }

          return jsonResponse({
            status: 'ok',
            version,
            updated_at: nowIso,
          });
        }

        if (request.method === 'DELETE') {
          const userId = (
            url.searchParams.get('user_id') ||
            url.searchParams.get('userId') ||
            request.headers.get('x-user-id') ||
            ''
          ).trim().toLowerCase();
          if (!userId || !/^[0-9a-f]{64}$/i.test(userId)) {
            return errorResponse('Invalid or missing user_id', 400);
          }

          const supabase = getSupabaseClient(env);
          if (!supabase) return errorResponse('Database not configured on server', 503);

          const { error } = await supabase
            .from('user_configs')
            .delete()
            .eq('user_id', userId);

          if (error) {
            return errorResponse(error.message, 500);
          }

          return jsonResponse({ status: 'ok', deleted: true });
        }

        return errorResponse('Method not allowed', 405);
      }

      // 3. LiveKit Token (/token или /api/livekit/token)
      if (pathname === '/token' || pathname === '/api/livekit/token' || pathname === '/groups/token' || pathname === '/groups/livekit/token' || pathname === '/groups/livekit-token' || pathname === '/livekit-token') {
        if (request.method !== 'POST') return errorResponse('Method not allowed', 405);
        if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
          return errorResponse('LiveKit credentials not configured on server', 500);
        }

        const body = (await request.json()) as { room?: string; identity?: string; name?: string };
        const { room, identity, name } = body;

        if (!room || !identity) {
          return errorResponse('Missing room or identity', 400);
        }

        const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
          identity,
          name: name || identity,
        });

        at.addGrant({
          room,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        });

        const token = await at.toJwt();
        const livekitUrl = env.LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud';

        return jsonResponse({ token, url: livekitUrl });
      }

      if (pathname === '/ably-auth' || pathname === '/api/ably-auth') {
        const ablyKey = env.ABLY_API_KEY;
        if (!ablyKey) return errorResponse('Ably credentials not configured on server', 500);
        let clientId = url.searchParams.get('clientId') || undefined;
        let capability = url.searchParams.get('capability') || '{"*":["*"]}';
        let ttl = parseInt(url.searchParams.get('ttl') || '3600000', 10);

        if (request.method === 'POST') {
          try {
            const body = (await request.json()) as any;
            if (body.clientId) clientId = body.clientId;
            if (body.capability) capability = typeof body.capability === 'string' ? body.capability : JSON.stringify(body.capability);
            if (body.ttl) ttl = body.ttl;
          } catch {
          }
        }

        const tokenRequest = await createAblyTokenRequest(ablyKey, clientId, capability, ttl);
        return jsonResponse(tokenRequest);
      }

      if (pathname === '/pusher/auth' || pathname === '/api/pusher/auth') {
        const configs = PUSHER_CONFIGS(env);
        let socketId = '';
        let channelName = '';
        let userId = '';
        let userInfo: any = null;
        let requestedKey = '';

        if (request.method === 'POST') {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = (await request.json()) as any;
            socketId = body.socket_id || body.socketId;
            channelName = body.channel_name || body.channelName;
            userId = body.user_id || body.userId;
            userInfo = body.user_info || body.userInfo;
            requestedKey = body.pusher_key || body.key;
          } else {
            const formData = await request.formData();
            socketId = formData.get('socket_id')?.toString() || '';
            channelName = formData.get('channel_name')?.toString() || '';
            userId = formData.get('user_id')?.toString() || '';
            requestedKey = formData.get('pusher_key')?.toString() || '';
          }
        } else {
          socketId = url.searchParams.get('socket_id') || '';
          channelName = url.searchParams.get('channel_name') || '';
          requestedKey = url.searchParams.get('pusher_key') || '';
        }

        if (!socketId || !channelName) {
          return errorResponse('Missing socket_id or channel_name', 400);
        }

        const targetServer = configs.find((c) => c.key === requestedKey) || configs[0];
        if (!targetServer || !targetServer.secret) {
          return errorResponse('No matching Pusher credentials configured on server', 500);
        }

        let channelDataStr: string | undefined = undefined;
        if (channelName.startsWith('presence-')) {
          channelDataStr = JSON.stringify({
            user_id: userId || socketId,
            user_info: userInfo || { nickname: 'user' },
          });
        }

        const authResponse = await signPusherChannel(
          targetServer.key,
          targetServer.secret,
          socketId,
          channelName,
          channelDataStr
        );
        return jsonResponse(authResponse);
      }

      // 6. Cloudinary Signature (/cloudinary/sign или /api/cloudinary/sign)
      if (pathname === '/cloudinary/sign' || pathname === '/api/cloudinary/sign') {
        const apiKey = env.CLOUDINARY_API_KEY;
        const apiSecret = env.CLOUDINARY_API_SECRET;
        const cloudName = env.CLOUDINARY_CLOUD_NAME;

        if (!apiKey || !apiSecret || !cloudName) {
          return errorResponse('Cloudinary credentials not configured on server', 500);
        }

        let publicId = url.searchParams.get('public_id') || url.searchParams.get('publicId') || '';
        let timestamp = url.searchParams.get('timestamp') || Math.floor(Date.now() / 1000).toString();

        if (request.method === 'POST') {
          try {
            const body = (await request.json()) as any;
            if (body.publicId || body.public_id) publicId = body.publicId || body.public_id;
            if (body.timestamp) timestamp = body.timestamp.toString();
          } catch {}
        }

        if (!publicId) {
          return errorResponse('Missing publicId parameter', 400);
        }

        const signResult = await signCloudinaryUpload(apiKey, apiSecret, cloudName, publicId, timestamp);
        return jsonResponse(signResult);
      }

      if (pathname === '/cloudinary/destroy' || pathname === '/cloudinary-destroy') {
        let publicId = '';
        let resourceType = 'image';
        if (request.method === 'POST') {
          try {
            const body = (await request.json()) as any;
            publicId = body.public_id || body.publicId || '';
            resourceType = body.resourceType || body.resource_type || 'image';
          } catch {}
        }
        if (!publicId) {
          publicId = url.searchParams.get('public_id') || url.searchParams.get('publicId') || '';
        }
        const apiKey = env.CLOUDINARY_API_KEY;
        const apiSecret = env.CLOUDINARY_API_SECRET;
        const cloudName = env.CLOUDINARY_CLOUD_NAME;
        if (!publicId || !apiKey || !apiSecret || !cloudName) {
          return jsonResponse({ success: false });
        }
        try {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
          const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(paramsToSign));
          const signature = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
          const formData = new URLSearchParams();
          formData.append('public_id', publicId);
          formData.append('api_key', apiKey);
          formData.append('timestamp', timestamp);
          formData.append('signature', signature);
          await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
            method: 'POST',
            body: formData,
          });
          return jsonResponse({ success: true });
        } catch {
          return jsonResponse({ success: false });
        }
      }

      if (pathname === '/relay/message' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          senderId: string;
          recipientId: string;
          ciphertext: string;
          messageIndex: number;
          dhPublicKey: string;
          prevChainCount?: number;
          clientMsgId?: string;
          id?: string;
        };

        const { chatId, senderId, recipientId, ciphertext, messageIndex, dhPublicKey, clientMsgId, id } = body;
        if (!chatId || !senderId || !recipientId || !ciphertext) {
          return errorResponse('Missing required message parameters', 400);
        }

        const msgRow: any = {
          chat_id: chatId,
          sender_id: senderId,
          recipient_id: recipientId,
          ciphertext,
          message_index: messageIndex,
          dh_public_key: dhPublicKey,
          prev_chain_count: body.prevChainCount ?? null,
        };
        const explicitUuid = await toUuid(id || clientMsgId);
        if (explicitUuid) {
          msgRow.id = explicitUuid;
        }

        const { data, error } = await supabase
          .from('messages')
          .insert(msgRow)
          .select();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/messages' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const recipientId = url.searchParams.get('recipientId');
        if (!recipientId) return errorResponse('Missing recipientId parameter', 400);

        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('recipient_id', recipientId)
          .eq('delivered', false)
          .order('created_at', { ascending: true });

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ messages: data || [] });
      }

      if (pathname === '/relay/message/delivered' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as { messageId: string };
        if (!body.messageId) return errorResponse('Missing messageId parameter', 400);

        const { error } = await supabase
          .from('messages')
          .update({
            delivered: true,
            expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
          })
          .eq('id', body.messageId)
          .eq('delivered', false);

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/non-message' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as {
          id?: string;
          chatId: string;
          senderId: string;
          recipientId: string;
          ciphertext: string;
        };
        if (!body.chatId || !body.senderId || !body.recipientId || !body.ciphertext) {
          return errorResponse('Missing required non-message parameters', 400);
        }
        const row = {
          id: body.id || `non_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chat_id: body.chatId,
          sender_id: body.senderId,
          recipient_id: body.recipientId,
          ciphertext: body.ciphertext,
          message_index: 0,
          delivered: false,
        };
        const { data, error } = await supabase.from('non_messages').insert(row).select();
        if (error) {
          if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
            return jsonResponse({ status: 'ok', duplicate: true });
          }
          return errorResponse(error.message, 500);
        }
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/non-messages' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const recipientId = url.searchParams.get('recipientId');
        if (!recipientId) return errorResponse('Missing recipientId parameter', 400);
        const { data, error } = await supabase
          .from('non_messages')
          .select('*')
          .eq('recipient_id', recipientId)
          .eq('delivered', false)
          .order('created_at', { ascending: true });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ non_messages: data || [] });
      }

      if (pathname === '/relay/non-message/delivered' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { messageId: string };
        if (!body.messageId) return errorResponse('Missing messageId parameter', 400);
        const { error } = await supabase
          .from('non_messages')
          .delete()
          .eq('id', body.messageId);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok' });
      }
      if (pathname === '/relay/handshake' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          recipientCode: string;
          senderNickname: string;
          senderPublicKey: string;
          senderAvatarUrl?: string | null;
          senderCode?: string | null;
        };

        const { chatId, recipientCode, senderNickname, senderPublicKey, senderAvatarUrl, senderCode } = body;
        if (!chatId || !recipientCode || !senderNickname || !senderPublicKey) {
          return errorResponse('Missing required handshake parameters', 400);
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

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/handshakes' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const recipientCode = url.searchParams.get('recipientCode');
        if (!recipientCode) return errorResponse('Missing recipientCode parameter', 400);

        const { data, error } = await supabase
          .from('handshakes')
          .select('*')
          .eq('recipient_code', recipientCode)
          .eq('consumed', false)
          .order('created_at', { ascending: true });

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ handshakes: data || [] });
      }

      if (pathname === '/relay/handshake/consumed' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as { handshakeId: string };
        if (!body.handshakeId) return errorResponse('Missing handshakeId parameter', 400);

        const { error } = await supabase
          .from('handshakes')
          .update({ consumed: true })
          .eq('id', body.handshakeId);

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/chat-handshakes' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const chatId = url.searchParams.get('chatId');
        if (!chatId) return errorResponse('Missing chatId parameter', 400);
        const { data, error } = await supabase
          .from('handshakes')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ handshakes: data || [] });
      }

      if (pathname === '/relay/profile' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          nickname?: string | null;
          avatarUrl?: string | null;
          hideProfileId?: boolean | null;
          senderCode?: string | null;
          bio?: string | null;
          username?: string | null;
          birthday?: string | null;
          numericId?: string | null;
          numeric_id?: string | null;
        };

        if (!body.chatId) return errorResponse('Missing chatId parameter', 400);

        const cleanUsername = body.username ? body.username.replace(/^@+/, '').trim().toLowerCase() : null;
        if (cleanUsername) {
          const { data: existingRows } = await supabase
            .from('profile_updates')
            .select('sender_code, chat_id')
            .ilike('username', cleanUsername);

          if (existingRows && existingRows.length > 0) {
            const isTaken = existingRows.some((row: any) => {
              const owner = row.sender_code || row.chat_id;
              const current = body.senderCode || body.chatId;
              return owner && current && owner !== current;
            });
            if (isTaken) {
              return errorResponse('USERNAME_TAKEN', 409);
            }
          }
        }

        try {
          if (body.senderCode) {
            await supabase.from('profile_updates').delete().eq('chat_id', body.chatId).eq('sender_code', body.senderCode);
          }
        } catch {}

        let effectiveBio = body.bio || null;
        if ((body as any).bannerUrl) {
          effectiveBio = effectiveBio ? `${effectiveBio}\n<!--banner:${(body as any).bannerUrl}-->` : `<!--banner:${(body as any).bannerUrl}-->`;
        }

        const insertPayload: Record<string, any> = {
          chat_id: body.chatId,
          nickname: body.nickname || null,
          avatar_url: body.avatarUrl || null,
          banner_url: (body as any).bannerUrl !== undefined ? (body as any).bannerUrl : null,
          hide_profile_id: body.hideProfileId !== undefined ? body.hideProfileId : null,
          sender_code: body.senderCode || null,
          bio: effectiveBio,
          username: cleanUsername,
          birthday: body.birthday || null,
        };

        let { data, error } = await supabase
          .from('profile_updates')
          .insert(insertPayload)
          .select();

        if (error && (error.message?.includes('banner_url') || error.code === 'PGRST204')) {
          delete insertPayload.banner_url;
          const retryRes = await supabase
            .from('profile_updates')
            .insert(insertPayload)
            .select();
          error = retryRes.error;
          data = retryRes.data;
        }

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/check-username' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const username = (url.searchParams.get('username') || '').replace(/^@+/, '').trim().toLowerCase();
        const excludeCode = url.searchParams.get('excludeCode') || null;
        if (!username) return jsonResponse({ available: false });

        const { data, error } = await supabase
          .from('profile_updates')
          .select('sender_code, chat_id')
          .ilike('username', username);

        if (error) return errorResponse(error.message, 500);
        if (!data || data.length === 0) return jsonResponse({ available: true });

        const isTaken = data.some((row: any) => {
          const owner = row.sender_code || row.chat_id;
          return owner && excludeCode && owner !== excludeCode;
        });

        return jsonResponse({ available: !isTaken });
      }

      if (pathname === '/relay/search-users' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const q = (url.searchParams.get('q') || '').replace(/^@+/, '').trim().toLowerCase();
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        if (!q) return jsonResponse({ users: [] });

        const filter = `username.eq.${q},sender_code.eq.${q}`;

        const { data, error } = await supabase
          .from('profile_updates')
          .select('*')
          .or(filter)
          .order('updated_at', { ascending: false })
          .limit(limit);

        if (error) return errorResponse(error.message, 500);

        const seen = new Set();
        const users: any[] = [];
        for (const row of (data || [])) {
          const userCode = row.sender_code || row.chat_id;
          if (userCode && !seen.has(userCode)) {
            seen.add(userCode);
            users.push({
              user_code: userCode,
              nickname: row.nickname || 'User',
              avatar_url: row.avatar_url,
              username: row.username,
              bio: row.bio,
              birthday: row.birthday,
              updated_at: row.updated_at,
            });
          }
        }
        return jsonResponse({ users });
      }

      if (pathname === '/relay/resolve-username' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const username = (url.searchParams.get('username') || '').replace(/^@+/, '').trim().toLowerCase();
        if (!username) return jsonResponse({ user: null });

        const { data, error } = await supabase
          .from('profile_updates')
          .select('*')
          .ilike('username', username)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return errorResponse(error.message, 500);
        if (!data) return jsonResponse({ user: null });

        let bannerUrl = data.banner_url || null;
        let bio = data.bio || null;
        if (bio && typeof bio === 'string') {
          const bannerMatch = bio.match(/<!--banner:(.*?)-->/);
          if (bannerMatch) {
            if (!bannerUrl) bannerUrl = bannerMatch[1];
            bio = bio.replace(/<!--banner:.*?-->/g, '').trim() || null;
          }
        }

        return jsonResponse({
          user: {
            user_code: data.sender_code || data.chat_id,
            nickname: data.nickname || 'User',
            avatar_url: data.avatar_url,
            banner_url: bannerUrl,
            username: data.username,
            bio: bio,
            birthday: data.birthday,
            updated_at: data.updated_at,
          }
        });
      }

      if (pathname === '/relay/delete-message' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId?: string;
          messageId: string;
          recipientId?: string;
          senderId?: string;
        };

        if (body.messageId) {
          try {
            const uuid = await toUuid(body.messageId);
            if (uuid) {
              await supabase.from('messages').delete().eq('id', uuid);
            }
            await supabase.from('messages').delete().eq('id', body.messageId);
            await supabase.from('non_messages').delete().eq('id', body.messageId);
            if (uuid) {
              await supabase.from('non_messages').delete().eq('id', uuid);
            }
            if (body.chatId) {
              await supabase.from('non_messages').delete().eq('chat_id', body.chatId).ilike('ciphertext', `%${body.messageId}%`);
              await supabase.from('messages').delete().eq('chat_id', body.chatId).ilike('ciphertext', `%${body.messageId}%`);
            }
            if (body.recipientId && body.chatId) {
              const targets = Array.isArray(body.recipientId) ? body.recipientId : [body.recipientId];
              for (const rId of targets) {
                await supabase.from('non_messages').insert({
                  id: `del_${body.messageId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  chat_id: body.chatId,
                  sender_id: body.senderId || 'system',
                  recipient_id: rId,
                  ciphertext: JSON.stringify({
                    type: 'delete-message',
                    targetMessageId: body.messageId,
                    chatId: body.chatId,
                  }),
                  delivered: false,
                });
              }
            }
          } catch (e) {
            console.warn('[Worker] delete-message error:', e);
          }
        }

        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/purge-server-message' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId?: string;
          messageIds?: string[];
          messageId?: string;
        };

        const ids = Array.isArray(body.messageIds) ? body.messageIds : (body.messageId ? [body.messageId] : []);
        if (ids.length > 0) {
          try {
            for (const mid of ids) {
              const uuid = await toUuid(mid);
              if (uuid) {
                await supabase.from('messages').delete().eq('id', uuid);
                await supabase.from('non_messages').delete().eq('id', uuid);
              }
              await supabase.from('messages').delete().eq('id', mid);
              await supabase.from('non_messages').delete().eq('id', mid);
              if (body.chatId) {
                await supabase.from('non_messages').delete().eq('chat_id', body.chatId).ilike('ciphertext', `%${mid}%`);
                await supabase.from('messages').delete().eq('chat_id', body.chatId).ilike('ciphertext', `%${mid}%`);
              }
            }
          } catch (e) {
            console.warn('[Worker] purge-server-message error:', e);
          }
        }

        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/delete-chat' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        const body = (await request.json()) as { chatId?: string; recipientId?: string | string[]; senderId?: string };
        if (supabase && body.chatId) {
          try {
            await supabase.from('messages').delete().eq('chat_id', body.chatId);
            await supabase.from('offline_handshakes').delete().eq('chat_id', body.chatId);
            await supabase.from('reactions').delete().eq('chat_id', body.chatId);
            await supabase.from('message_reactions').delete().eq('chat_id', body.chatId);
            await supabase.from('non_messages').delete().eq('chat_id', body.chatId);
            if (body.recipientId) {
              const targets = Array.isArray(body.recipientId) ? body.recipientId : [body.recipientId];
              for (const rId of targets) {
                if (!rId) continue;
                await supabase.from('non_messages').insert({
                  id: `sys_del_${body.chatId}_${rId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  chat_id: body.chatId,
                  sender_id: body.senderId || 'system',
                  recipient_id: rId,
                  ciphertext: JSON.stringify({
                    type: 'system',
                    action: 'delete-chat',
                    chatId: body.chatId,
                  }),
                  delivered: false,
                });
              }
            }
          } catch (err) {
            console.error('[relay/delete-chat] error:', err);
          }
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/clear-history' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        const body = (await request.json()) as { chatId?: string; recipientId?: string | string[]; senderId?: string };
        if (supabase && body.chatId) {
          try {
            await supabase.from('messages').delete().eq('chat_id', body.chatId);
            await supabase.from('reactions').delete().eq('chat_id', body.chatId);
            await supabase.from('message_reactions').delete().eq('chat_id', body.chatId);
            if (body.recipientId) {
              const targets = Array.isArray(body.recipientId) ? body.recipientId : [body.recipientId];
              for (const rId of targets) {
                if (!rId) continue;
                await supabase.from('non_messages').insert({
                  id: `sys_clear_${body.chatId}_${rId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  chat_id: body.chatId,
                  sender_id: body.senderId || 'system',
                  recipient_id: rId,
                  ciphertext: JSON.stringify({
                    type: 'system',
                    action: 'clear-history',
                    chatId: body.chatId,
                  }),
                  delivered: false,
                });
              }
            }
          } catch (err) {
            console.error('[relay/clear-history] error:', err);
          }
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/reaction' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { chatId: string; messageId: string; emoji: string; userId: string; action?: string };
        if (!body.chatId || !body.messageId || !body.emoji || !body.userId) {
          return errorResponse('Missing parameters', 400);
        }
        try {
          await supabase
            .from('message_reactions')
            .delete()
            .eq('chat_id', body.chatId)
            .eq('message_id', body.messageId)
            .eq('emoji', body.emoji)
            .eq('user_id', body.userId);

          if (body.action === 'add') {
            await supabase
              .from('message_reactions')
              .insert({
                chat_id: body.chatId,
                message_id: body.messageId,
                emoji: body.emoji,
                user_id: body.userId,
              });
          }
          return jsonResponse({ status: 'ok' });
        } catch (err: any) {
          return errorResponse(err?.message || 'Reaction failed', 500);
        }
      }

      if (pathname === '/relay/reaction/delete' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { chatId: string; messageId?: string; emoji?: string };
        if (!body.chatId) return errorResponse('Missing chatId', 400);
        try {
          let q = supabase.from('message_reactions').delete().eq('chat_id', body.chatId);
          if (body.messageId) q = q.eq('message_id', body.messageId);
          if (body.emoji) q = q.eq('emoji', body.emoji);
          await q;
          return jsonResponse({ status: 'ok' });
        } catch (err: any) {
          return errorResponse(err?.message || 'Reaction delete failed', 500);
        }
      }

      if (pathname === '/relay/profile' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const chatId = url.searchParams.get('chatId');
        if (!chatId) return errorResponse('Missing chatId parameter', 400);
        const excludeCode = url.searchParams.get('excludeCode');

        let query = supabase
          .from('profile_updates')
          .select('*')
          .or(`chat_id.eq.${chatId},sender_code.eq.${chatId}`);

        if (excludeCode) {
          query = query.neq('sender_code', excludeCode);
        }

        const { data, error } = await query
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return errorResponse(error.message, 500);
        let profile = data || null;
        if (profile && profile.bio && typeof profile.bio === 'string') {
          const bannerMatch = profile.bio.match(/<!--banner:(.*?)-->/);
          if (bannerMatch) {
            profile = {
              ...profile,
              banner_url: profile.banner_url || bannerMatch[1],
              bio: profile.bio.replace(/<!--banner:.*?-->/g, '').trim() || null,
            };
          }
        }
        return jsonResponse({ profile });
      }

      // 10. Public Channels (Сообщества / Публичные каналы)
      if (pathname === '/channels/featured' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        let channels: any[] = [];
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(20);
            if (data && data.length > 0) {
              channels = data.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description || '',
                avatarUrl: c.avatar_url || null,
                creatorNickname: c.creator_nickname,
                subscribersCount: c.subscribers_count || 1,
                isOfficial: c.is_official || false,
                createdAt: new Date(c.created_at).getTime(),
              }));
            }
          } catch {}
        }
        return jsonResponse({ channels });
      }

      if (pathname === '/channels/get' && request.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('public_channels')
              .select('*')
              .eq('id', channelId)
              .maybeSingle();

            if (data && !error) {
              return jsonResponse({
                channel: {
                  id: data.id,
                  name: data.name,
                  description: data.description || '',
                  avatarUrl: data.avatar_url || null,
                  creatorNickname: data.creator_nickname,
                  subscribersCount: data.subscribers_count || 1,
                  isOfficial: data.is_official || false,
                  createdAt: new Date(data.created_at).getTime(),
                },
              });
            }
          } catch {}
        }

        return errorResponse('Channel not found', 404);
      }

      if (pathname === '/channels/create' && request.method === 'POST') {
        const body = (await request.json()) as {
          id?: string;
          name: string;
          description?: string;
          avatarUrl?: string | null;
          creatorNickname: string;
          creatorId?: string;
        };

        if (!body.name || !body.creatorNickname) {
          return errorResponse('Missing name or creatorNickname parameter', 400);
        }

        const channelId = body.id || `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const creatorId = await toUuid(body.creatorId);
        const supabase = getSupabaseClient(env);

        if (supabase) {
          try {
            if (creatorId) {
              await supabase.from('profiles').upsert({
                id: creatorId,
                username: body.creatorNickname,
                avatar_url: body.avatarUrl || null,
                updated_at: new Date().toISOString(),
              });
            }
            const { error } = await supabase.from('public_channels').upsert({
              id: channelId,
              name: body.name,
              description: body.description || '',
              avatar_url: body.avatarUrl || null,
              creator_id: creatorId || null,
              creator_nickname: body.creatorNickname,
              subscribers_count: 1,
              is_official: false,
              created_at: new Date().toISOString(),
            });

            if (creatorId) {
              await supabase.from('channel_members').upsert({
                channel_id: channelId,
                user_id: creatorId,
                role: 'owner',
                joined_at: new Date().toISOString(),
              });
            }

            if (error) console.warn('[Worker] Channels upsert warning:', error.message);
          } catch (e) {
            console.warn('[Worker] Channels db error:', e);
          }
        }

        const channelObj = {
          id: channelId,
          name: body.name,
          description: body.description || '',
          avatarUrl: body.avatarUrl || null,
          creatorId: creatorId || undefined,
          creatorNickname: body.creatorNickname,
          subscribersCount: 1,
          isOfficial: false,
          createdAt: Date.now(),
        };

        return jsonResponse({ status: 'ok', channel: channelObj });
      }

      if (pathname === '/channels/update' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId?: string;
          id?: string;
          userId?: string;
          name?: string;
          description?: string;
          avatarUrl?: string | null;
        };

        const channelId = body.channelId || body.id;
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        const supabase = getSupabaseClient(env);
        const userId = await toUuid(body.userId);
        if (supabase && userId) {
          try {
            const { data: chan } = await supabase.from('public_channels').select('creator_id').eq('id', channelId).maybeSingle();
            if (chan && chan.creator_id && chan.creator_id !== userId) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', channelId)
                .eq('user_id', userId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return errorResponse('Forbidden: insufficient channel permissions', 403);
              }
            }
          } catch {}
        }

        const updateFields: any = {};
        if (body.name !== undefined) updateFields.name = body.name.trim();
        if (body.description !== undefined) updateFields.description = body.description.trim();
        if (body.avatarUrl !== undefined) updateFields.avatar_url = body.avatarUrl;

        if (supabase) {
          try {
            await supabase.from('public_channels').update(updateFields).eq('id', channelId);
          } catch (e) {
            console.warn('[Worker] Channels update error:', e);
          }
        }

        const eventPayload = {
          channelId,
          name: body.name,
          description: body.description,
          avatarUrl: body.avatarUrl,
        };

        await triggerPusherEvent(env, `public-channel-${channelId}`, 'channel-updated', eventPayload);

        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/channels/posts' && request.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        const supabase = getSupabaseClient(env);
        let posts: any[] = [];
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('channel_posts')
              .select('*')
              .eq('channel_id', channelId)
              .order('created_at', { ascending: true })
              .limit(100);

            if (!error && data) {
              posts = data.map((p: any) => ({
                id: p.id,
                channelId: p.channel_id,
                senderId: p.sender_id || null,
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
          } catch (e) {
            console.warn('[Worker] Fetch channel posts error:', e);
          }
        }

        return jsonResponse({ posts });
      }

      if (pathname === '/channels/post' && request.method === 'POST') {
        const body = (await request.json()) as {
          id?: string;
          channelId: string;
          senderNickname: string;
          senderId?: string;
          text?: string;
          mediaType?: string | null;
          mediaUrl?: string | null;
          mediaName?: string | null;
          mime?: string | null;
          duration?: number | null;
          width?: number | null;
          height?: number | null;
          waveform?: number[] | null;
          audioMetadata?: any | null;
          linkPreview?: any | null;
        };

        if (!body.channelId || !body.senderNickname) {
          return errorResponse('Missing channelId or senderNickname parameter', 400);
        }

        const supabase = getSupabaseClient(env);
        const senderId = await toUuid(body.senderId);
        if (supabase && senderId) {
          try {
            const { data: chan } = await supabase.from('public_channels').select('creator_id').eq('id', body.channelId).maybeSingle();
            if (chan && chan.creator_id && chan.creator_id !== senderId) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', body.channelId)
                .eq('user_id', senderId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return errorResponse('Forbidden: only channel owner or admin can post', 403);
              }
            }
          } catch {}
        }

        const postId = body.id || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const createdAt = new Date().toISOString();

        const postRecord = {
          id: postId,
          channelId: body.channelId,
          senderId: senderId || null,
          sender: body.senderNickname,
          text: body.text || '',
          time: Date.now(),
          mediaType: body.mediaType || null,
          mediaUrl: body.mediaUrl || null,
          mediaName: body.mediaName || null,
          mime: body.mime || null,
          duration: body.duration || null,
          width: body.width || null,
          height: body.height || null,
          waveform: body.waveform || null,
          audioMetadata: body.audioMetadata || null,
          linkPreview: body.linkPreview || null,
          reactions: {},
        };

        if (supabase) {
          try {
            if (senderId) {
              await supabase.from('profiles').upsert({
                id: senderId,
                username: body.senderNickname,
                updated_at: createdAt,
              });
            }
            await supabase.from('channel_posts').insert({
              id: postId,
              channel_id: body.channelId,
              sender_id: senderId || null,
              sender_nickname: body.senderNickname,
              text: body.text || '',
              media_type: body.mediaType || null,
              media_url: body.mediaUrl || null,
              media_name: body.mediaName || null,
              mime: body.mime || null,
              duration: body.duration || null,
              width: body.width || null,
              height: body.height || null,
              waveform: body.waveform || null,
              audio_metadata: body.audioMetadata || null,
              link_preview: body.linkPreview || null,
              reactions: {},
              created_at: createdAt,
            });
          } catch (e) {
            console.warn('[Worker] Save channel post to DB failed:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'new-post', postRecord);

        return jsonResponse({ status: 'ok', post: postRecord });
      }

      if (pathname === '/channels/delete-post' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          postId: string;
          userId?: string;
        };
        if (!body.channelId || !body.postId) return errorResponse('Missing channelId or postId parameter', 400);

        const supabase = getSupabaseClient(env);
        const userId = await toUuid(body.userId);
        if (supabase && userId) {
          try {
            const { data: postData } = await supabase.from('channel_posts').select('sender_id').eq('id', body.postId).maybeSingle();
            const { data: chanData } = await supabase.from('public_channels').select('creator_id').eq('id', body.channelId).maybeSingle();
            const isPostAuthor = postData && postData.sender_id && postData.sender_id === userId;
            const isChanOwner = chanData && chanData.creator_id && chanData.creator_id === userId;
            if (!isPostAuthor && !isChanOwner) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', body.channelId)
                .eq('user_id', userId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return errorResponse('Forbidden: insufficient delete permissions', 403);
              }
            }
          } catch {}
        }
        if (supabase) {
          try {
            await supabase.from('channel_posts').delete().eq('id', body.postId).eq('channel_id', body.channelId);
          } catch (e) {
            console.warn('[Worker] delete channel post error:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'delete-post', { channelId: body.channelId, postId: body.postId, targetMessageId: body.postId });

        return jsonResponse({ status: 'ok', channelId: body.channelId, postId: body.postId });
      }

      if (pathname === '/channels/join' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          nickname?: string;
        };
        if (!body.channelId) return errorResponse('Missing channelId parameter', 400);

        const channelId = body.channelId.trim();
        let newCount = 1;
        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('subscribers_count')
              .eq('id', channelId)
              .maybeSingle();

            const current = Number(data?.subscribers_count) || 1;
            newCount = current + 1;

            await supabase
              .from('public_channels')
              .update({ subscribers_count: newCount })
              .eq('id', channelId);
          } catch (e) {
            console.warn('[Worker] Join channel db error:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${channelId}`, 'subscribers-updated', {
          channelId,
          subscribersCount: newCount,
          action: 'join',
          nickname: body.nickname || 'Unknown',
        });

        return jsonResponse({ status: 'ok', subscribersCount: newCount });
      }

      if (pathname === '/channels/leave' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          nickname?: string;
        };
        if (!body.channelId) return errorResponse('Missing channelId parameter', 400);

        const channelId = body.channelId.trim();
        let newCount = 1;
        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('subscribers_count')
              .eq('id', channelId)
              .maybeSingle();

            const current = Number(data?.subscribers_count) || 1;
            newCount = Math.max(1, current - 1);

            await supabase
              .from('public_channels')
              .update({ subscribers_count: newCount })
              .eq('id', channelId);
          } catch (e) {
            console.warn('[Worker] Leave channel db error:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${channelId}`, 'subscribers-updated', {
          channelId,
          subscribersCount: newCount,
          action: 'leave',
          nickname: body.nickname || 'Unknown',
        });

        return jsonResponse({ status: 'ok', subscribersCount: newCount });
      }

      if (pathname === '/channels/reaction' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          postId: string;
          emoji: string;
          userId: string;
          sessionId?: string;
          action?: 'add' | 'remove' | 'toggle';
        };

        if (!body.channelId || !body.postId || !body.emoji || !body.userId) {
          return errorResponse('Missing required reaction parameters', 400);
        }

        const supabase = getSupabaseClient(env);
        let updatedReactions: Record<string, string[]> = {};

        if (supabase) {
          try {
            const { data } = await supabase
              .from('channel_posts')
              .select('reactions')
              .eq('id', body.postId)
              .maybeSingle();

            let reactions: Record<string, string[]> = {};
            if (data?.reactions) {
              if (typeof data.reactions === 'string') {
                try {
                  reactions = JSON.parse(data.reactions);
                } catch {}
              } else if (typeof data.reactions === 'object') {
                reactions = { ...data.reactions };
              }
            }

            const currentUsers = Array.isArray(reactions[body.emoji]) ? reactions[body.emoji] : [];
            const alreadyPresent = currentUsers.some((u) => u === body.userId || u.toLowerCase() === body.userId.toLowerCase());

            if (
              body.action === 'add' ||
              (!body.action && !alreadyPresent) ||
              (body.action === 'toggle' && !alreadyPresent)
            ) {
              reactions[body.emoji] = [...currentUsers.filter((u) => u !== body.userId && u.toLowerCase() !== body.userId.toLowerCase()), body.userId];
            } else {
              const filtered = currentUsers.filter((u) => u !== body.userId && u.toLowerCase() !== body.userId.toLowerCase());
              if (filtered.length > 0) {
                reactions[body.emoji] = filtered;
              } else {
                delete reactions[body.emoji];
              }
            }

            await supabase
              .from('channel_posts')
              .update({ reactions })
              .eq('id', body.postId);

            updatedReactions = reactions;
          } catch (e) {
            console.warn('[Worker] Update reaction in DB failed:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'reaction-updated', {
          postId: body.postId,
          emoji: body.emoji,
          userId: body.userId,
          sessionId: body.sessionId,
          action: body.action || 'toggle',
          reactions: updatedReactions,
        });

        return jsonResponse({ status: 'ok', reactions: updatedReactions });
      }

      if (pathname === '/support/ticket' && request.method === 'POST') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { ticketNumber: string; userCode?: string; senderNickname?: string; messageText: string };
        const { ticketNumber, userCode, senderNickname, messageText } = body;
        if (!ticketNumber || !messageText) return errorResponse('Missing ticket data', 400);

        const { data: existingTicket } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('ticket_number', ticketNumber)
          .maybeSingle();

        if (existingTicket) {
          const updatedMessage = existingTicket.message_text
            ? `${existingTicket.message_text}\n\n---\n\n${messageText}`
            : messageText;

          const { error: updateErr } = await supabase
            .from('support_tickets')
            .update({
              message_text: updatedMessage,
              status: 'sent',
              sender_nickname: senderNickname || existingTicket.sender_nickname,
              created_at: new Date().toISOString(),
            })
            .eq('ticket_number', ticketNumber);

          if (updateErr) return errorResponse(updateErr.message, 500);

          const payload = {
            ticket_number: ticketNumber,
            ticketNumber: ticketNumber,
            user_code: existingTicket.user_code,
            userCode: existingTicket.user_code,
            sender_nickname: senderNickname || existingTicket.sender_nickname,
            senderNickname: senderNickname || existingTicket.sender_nickname,
            message_text: updatedMessage,
            messageText: updatedMessage,
            status: 'sent',
            admin_reply: existingTicket.admin_reply,
            created_at: new Date().toISOString(),
          };

          await triggerPusherEvent(env, 'support-admin', 'ticket-updated', payload);
          await triggerAblyEvent(env, 'support-admin', 'ticket-updated', payload);
          await triggerPusherEvent(env, 'support-admin', 'new-ticket', payload);
          await triggerAblyEvent(env, 'support-admin', 'new-ticket', payload);
          await triggerAblyEvent(env, 'chat:support-admin', 'client-message', { type: 'ticket-updated', ...payload });

          return jsonResponse({ status: 'ok', ticketNumber, updated: true });
        }

        const ticketPayload = {
          ticket_number: ticketNumber,
          user_code: userCode || 'ANON',
          sender_nickname: senderNickname || 'User',
          message_text: messageText,
          status: 'sent',
          created_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('support_tickets').insert(ticketPayload);
        if (error) return errorResponse(error.message, 500);

        await triggerPusherEvent(env, 'support-admin', 'new-ticket', ticketPayload);
        await triggerAblyEvent(env, 'support-admin', 'new-ticket', ticketPayload);
        await triggerAblyEvent(env, 'chat:support-admin', 'client-message', { type: 'new-ticket', ticket: ticketPayload, ...ticketPayload });

        return jsonResponse({ status: 'ok', ticketNumber });
      }

      if (pathname === '/support/tickets' && request.method === 'GET') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const userCode = url.searchParams.get('userCode');
        if (!userCode) return errorResponse('Missing userCode', 400);

        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('user_code', userCode)
          .order('created_at', { ascending: true });

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ tickets: data || [] });
      }

      if (pathname === '/support/admin/check' && request.method === 'GET') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const userCode = url.searchParams.get('userCode');
        if (!userCode) return errorResponse('Missing userCode', 400);

        const adminRecord = await checkAdminAuthorization(supabase, userCode);
        if (!adminRecord) {
          return jsonResponse({ isAdmin: false });
        }

        return jsonResponse({
          isAdmin: true,
          role: adminRecord.role || 'admin',
          hasToken: Boolean(adminRecord.auth_token),
        });
      }

      if (pathname === '/support/admin/register-token' && request.method === 'POST') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { userCode: string; adminToken: string };
        const { userCode, adminToken } = body;
        if (!userCode || !adminToken) return errorResponse('Missing parameters', 400);

        const adminRecord = await checkAdminAuthorization(supabase, userCode);
        if (!adminRecord) {
          return errorResponse('Access denied', 403);
        }

        const { error: updateErr } = await supabase
          .from('support_admins')
          .update({ auth_token: adminToken })
          .eq('user_code', userCode);

        if (updateErr) return errorResponse(updateErr.message, 500);
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/support/admin/tickets' && request.method === 'GET') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const userCode = url.searchParams.get('userCode');
        const adminToken = request.headers.get('x-admin-token') || url.searchParams.get('adminToken');
        if (!userCode) return errorResponse('Missing userCode', 400);

        const adminRecord = await checkAdminAuthorization(supabase, userCode);
        if (!adminRecord) {
          return errorResponse('Access denied: not an authorized admin', 403);
        }

        if (adminToken && adminRecord.auth_token !== adminToken) {
          await supabase
            .from('support_admins')
            .update({ auth_token: adminToken })
            .eq('user_code', userCode);
        }

        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ tickets: data || [] });
      }

      if (pathname === '/support/reply' && request.method === 'POST') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { ticketNumber: string; adminReply: string; adminCode: string; adminToken?: string };
        const { ticketNumber, adminReply, adminCode } = body;
        const adminToken = request.headers.get('x-admin-token') || body.adminToken;
        if (!ticketNumber || !adminReply || !adminCode) return errorResponse('Missing required fields', 400);

        const adminRecord = await checkAdminAuthorization(supabase, adminCode);
        if (!adminRecord) {
          return errorResponse('Access denied: not an authorized admin', 403);
        }

        if (adminToken && adminRecord.auth_token !== adminToken) {
          await supabase
            .from('support_admins')
            .update({ auth_token: adminToken })
            .eq('user_code', adminCode);
        }

        const { data: existingTicket } = await supabase
          .from('support_tickets')
          .select('user_code, message_text, admin_reply')
          .eq('ticket_number', ticketNumber)
          .maybeSingle();

        const answeredAt = new Date().toISOString();
        const updatedAdminReply = existingTicket?.admin_reply
          ? `${existingTicket.admin_reply}\n\n---\n\n${adminReply}`
          : adminReply;

        const { error } = await supabase
          .from('support_tickets')
          .update({
            admin_reply: updatedAdminReply,
            status: 'answered',
            answered_at: answeredAt,
          })
          .eq('ticket_number', ticketNumber);

        if (error) return errorResponse(error.message, 500);

        if (existingTicket?.user_code) {
          const userPayload = {
            ticketNumber,
            ticket_number: ticketNumber,
            adminReply: updatedAdminReply,
            latestReply: adminReply,
            answeredAt,
          };
          await triggerPusherEvent(env, `user-${existingTicket.user_code}`, 'ticket-reply', userPayload);
          await triggerAblyEvent(env, `user-${existingTicket.user_code}`, 'ticket-reply', userPayload);
          await triggerAblyEvent(env, `chat:user-${existingTicket.user_code}`, 'client-message', {
            type: 'ticket-reply',
            ...userPayload,
          });
        }

        const adminPayload = {
          ticketNumber,
          adminReply,
          adminCode,
          status: 'answered',
          answeredAt,
        };
        await triggerPusherEvent(env, 'support-admin', 'ticket-updated', adminPayload);
        await triggerAblyEvent(env, 'support-admin', 'ticket-updated', adminPayload);
        await triggerAblyEvent(env, 'chat:support-admin', 'client-message', {
          type: 'ticket-updated',
          ...adminPayload,
        });

        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/support/close' && request.method === 'POST') {
        const supabase = getSupabaseClient(env) || getChannelsSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const body = (await request.json()) as { ticketNumber: string; adminCode: string; adminToken?: string };
        const { ticketNumber, adminCode } = body;
        const adminToken = request.headers.get('x-admin-token') || body.adminToken;
        if (!ticketNumber || !adminCode) return errorResponse('Missing required fields', 400);

        const adminRecord = await checkAdminAuthorization(supabase, adminCode);
        if (!adminRecord) {
          return errorResponse('Access denied: not an authorized admin', 403);
        }

        if (adminToken && adminRecord.auth_token !== adminToken) {
          await supabase
            .from('support_admins')
            .update({ auth_token: adminToken })
            .eq('user_code', adminCode);
        }

        const { data: existingTicket } = await supabase
          .from('support_tickets')
          .select('user_code')
          .eq('ticket_number', ticketNumber)
          .maybeSingle();

        const { error } = await supabase
          .from('support_tickets')
          .delete()
          .eq('ticket_number', ticketNumber);

        if (error) return errorResponse(error.message, 500);

        const closedAt = new Date().toISOString();

        if (existingTicket?.user_code) {
          await triggerPusherEvent(env, `user-${existingTicket.user_code}`, 'ticket-closed', {
            ticketNumber,
            closedAt,
          });
          await triggerAblyEvent(env, `user-${existingTicket.user_code}`, 'ticket-closed', {
            ticketNumber,
            closedAt,
          });
          await triggerAblyEvent(env, `chat:user-${existingTicket.user_code}`, 'client-message', {
            type: 'ticket-closed',
            ticketNumber,
            closedAt,
          });
        }

        const closeAdminPayload = {
          ticketNumber,
          closedAt,
        };
        await triggerPusherEvent(env, 'support-admin', 'ticket-closed', closeAdminPayload);
        await triggerAblyEvent(env, 'support-admin', 'ticket-closed', closeAdminPayload);
        await triggerAblyEvent(env, 'chat:support-admin', 'client-message', {
          type: 'ticket-closed',
          ...closeAdminPayload,
        });

        return jsonResponse({ status: 'ok', ticketNumber });
      }

      if (pathname === '/groups/create' && request.method === 'POST') {
        const body = (await request.json()) as any;
        if (!body.name || !body.creatorNickname) return errorResponse('Missing name or creatorNickname', 400);
        const groupId = body.id;
        const code = body.code;
        if (!groupId || !code) return errorResponse('Missing group id or code', 400);

        const supabase = getGroupsSupabaseClient(env);
        const nowIso = new Date().toISOString();
        const initialMember = {
          group_id: groupId,
          user_code: body.creatorCode || body.creatorNickname,
          user_id: body.creatorId || null,
          nickname: body.creatorNickname,
          role: 'owner',
          joined_at: nowIso,
          last_seen: nowIso,
        };

        if (supabase) {
          try {
            const { error: grpErr } = await supabase.from('groups').upsert({
              id: groupId,
              code: code,
              name: body.name.trim(),
              description: (body.description || '').trim(),
              avatar_url: body.avatarUrl || null,
              creator_id: body.creatorId || null,
              creator_code: body.creatorCode || null,
              creator_nickname: body.creatorNickname,
              max_members: 10,
              members_count: 1,
              created_at: nowIso,
              updated_at: nowIso,
            });
            if (grpErr) return errorResponse(grpErr.message, 500);

            const { error: memErr } = await supabase.from('group_members').upsert(initialMember);
            if (memErr) return errorResponse(memErr.message, 500);
          } catch (err: any) {
            return errorResponse(err?.message || 'Failed to create group', 500);
          }
        }

        return jsonResponse({
          status: 'ok',
          group: {
            id: groupId,
            code: code,
            name: body.name.trim(),
            description: (body.description || '').trim(),
            avatarUrl: body.avatarUrl || null,
            creatorNickname: body.creatorNickname,
            creatorCode: body.creatorCode || null,
            membersCount: 1,
            maxMembers: 10,
            members: [
              {
                nickname: body.creatorNickname,
                userCode: body.creatorCode,
                role: 'owner',
                joinedAt: Date.now(),
                lastSeen: Date.now(),
              }
            ],
            createdAt: Date.now(),
          },
        });
      }

      if (pathname === '/groups/my' && request.method === 'GET') {
        const userCode = url.searchParams.get('userCode') || url.searchParams.get('user_code');
        const userId = url.searchParams.get('userId') || url.searchParams.get('user_id');
        if (!userCode && !userId) return errorResponse('Missing userCode or userId', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (!supabase) return errorResponse('Groups database not configured', 500);

        try {
          const filters = [];
          if (userCode) {
            filters.push(`user_code.eq.${userCode}`);
            filters.push(`user_id.eq.${userCode}`);
          }
          if (userId && userId !== userCode) {
            filters.push(`user_code.eq.${userId}`);
            filters.push(`user_id.eq.${userId}`);
          }
          const { data: memberRows } = await supabase
            .from('group_members')
            .select('group_id, role')
            .or(filters.join(','));

          if (!memberRows || memberRows.length === 0) {
            return jsonResponse({ groups: [] });
          }

          const groupIds = memberRows.map((r: any) => r.group_id);
          const { data: groups } = await supabase
            .from('groups')
            .select('*')
            .in('id', groupIds);

          const roleMap: Record<string, string> = {};
          memberRows.forEach((r: any) => { roleMap[r.group_id] = r.role; });

          const result = await Promise.all((groups || []).map(async (g: any) => {
            const { data: members } = await supabase
              .from('group_members')
              .select('*')
              .eq('group_id', g.id);

            const formattedMembers = (members || []).map((m: any) => ({
              nickname: m.nickname,
              userCode: m.user_code,
              userId: m.user_code || m.user_id,
              role: m.role || 'member',
              joinedAt: new Date(m.joined_at || g.created_at).getTime(),
              lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
              avatarUrl: m.avatar_url || null,
            }));

            return {
              id: g.id,
              code: g.code,
              name: g.name,
              description: g.description || '',
              avatarUrl: g.avatar_url || null,
              creatorNickname: g.creator_nickname,
              creatorCode: g.creator_code || null,
              membersCount: g.members_count || formattedMembers.length || 1,
              maxMembers: g.max_members || 10,
              members: formattedMembers,
              createdAt: new Date(g.created_at).getTime(),
              role: roleMap[g.id] || 'member',
            };
          }));

          return jsonResponse({ groups: result });
        } catch (err: any) {
          return errorResponse(err?.message || 'Failed to load groups', 500);
        }
      }

      if (pathname === '/groups/get' && request.method === 'GET') {
        const code = url.searchParams.get('code') || url.searchParams.get('id');
        if (!code) return errorResponse('Missing group code or id', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            const { data: groupData } = await supabase.from('groups').select('*').or(`id.eq.${code},code.eq.${code}`).maybeSingle();
            if (groupData) {
              const { data: membersData } = await supabase
                .from('group_members')
                .select('*')
                .eq('group_id', groupData.id);

              const members = (membersData || []).map((m: any) => ({
                nickname: m.nickname,
                userCode: m.user_code,
                userId: m.user_code || m.user_id,
                role: m.role || 'member',
                joinedAt: new Date(m.joined_at || groupData.created_at).getTime(),
                lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
                avatarUrl: m.avatar_url || null,
              }));

              let inviteActive = true;
              let expiresAt: number | null = null;
              if (groupData.creator_id && typeof groupData.creator_id === 'string' && groupData.creator_id.startsWith('{')) {
                try {
                  const parsed = JSON.parse(groupData.creator_id);
                  if (parsed.active === false) inviteActive = false;
                  if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
                } catch {}
              }

              return jsonResponse({
                status: 'ok',
                group: {
                  id: groupData.id,
                  code: groupData.code,
                  name: groupData.name,
                  description: groupData.description || '',
                  avatarUrl: groupData.avatar_url || null,
                  creatorNickname: groupData.creator_nickname,
                  creatorCode: groupData.creator_code || null,
                  membersCount: groupData.members_count || members.length || 1,
                  maxMembers: groupData.max_members || 10,
                  members,
                  createdAt: new Date(groupData.created_at).getTime(),
                  inviteActive,
                  inviteExpiresAt: expiresAt,
                },
              });
            }
          } catch {}
        }
        return errorResponse('Group not found', 404);
      }

      if (pathname === '/groups/join' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { id, code, nickname, userCode, avatarUrl } = body;
        if (!nickname || (!id && !code)) return errorResponse('Missing required fields', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            let queryBuilder = supabase.from('groups').select('*');
            if (code && id) {
              queryBuilder = queryBuilder.or(`id.eq.${id},code.eq.${code}`);
            } else if (code) {
              queryBuilder = queryBuilder.or(`id.eq.${code},code.eq.${code}`);
            } else if (id) {
              queryBuilder = queryBuilder.eq('id', id);
            }
            const { data: groupData } = await queryBuilder.maybeSingle();
            if (!groupData) return errorResponse('Group not found', 404);

            let inviteActive = true;
            let expiresAt = null;
            if (groupData.creator_id && typeof groupData.creator_id === 'string' && groupData.creator_id.startsWith('{')) {
              try {
                const meta = JSON.parse(groupData.creator_id);
                if (meta.active === false) inviteActive = false;
                if (typeof meta.expiresAt === 'number') expiresAt = meta.expiresAt;
              } catch {}
            }
            if (!inviteActive) return errorResponse('INVITE_REVOKED', 403);
            if (expiresAt && Date.now() > expiresAt) return errorResponse('INVITE_EXPIRED', 410);

            const { count } = await supabase
              .from('group_members')
              .select('*', { count: 'exact', head: true })
              .eq('group_id', groupData.id);

            const currentCount = typeof count === 'number' ? count : (groupData.members_count || 1);
            const candidateId = body.userId || userCode;
            const memberUserCode = userCode || candidateId || nickname;

            let memberQuery = supabase.from('group_members').select('*').eq('group_id', groupData.id);
            if (candidateId) {
              memberQuery = memberQuery.or(`user_code.eq.${candidateId},user_id.eq.${candidateId}`);
            } else {
              memberQuery = memberQuery.eq('user_code', memberUserCode);
            }
            const { data: existingMember } = await memberQuery.maybeSingle();

            if (!existingMember && currentCount >= 10) {
              return errorResponse('GROUP_FULL', 400);
            }

            const nowIso = new Date().toISOString();
            await supabase.from('group_members').upsert({
              group_id: groupData.id,
              user_code: memberUserCode,
              user_id: body.userId || candidateId || memberUserCode,
              nickname: nickname,
              role: existingMember?.role || 'member',
              avatar_url: avatarUrl || null,
              joined_at: existingMember?.joined_at || nowIso,
              last_seen: nowIso,
            });

            const { data: allMembers } = await supabase
              .from('group_members')
              .select('*')
              .eq('group_id', groupData.id);

            const formattedMembers = (allMembers || []).map((m: any) => ({
              nickname: m.nickname,
              userCode: m.user_code,
              userId: m.user_code || m.user_id,
              role: m.role || 'member',
              joinedAt: new Date(m.joined_at || groupData.created_at).getTime(),
              lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
              avatarUrl: m.avatar_url || null,
            }));

            const updatedGroup = {
              id: groupData.id,
              code: groupData.code,
              name: groupData.name,
              description: groupData.description || '',
              avatarUrl: groupData.avatar_url || null,
              creatorNickname: groupData.creator_nickname,
              creatorCode: groupData.creator_code || null,
              membersCount: formattedMembers.length,
              maxMembers: 10,
              members: formattedMembers,
              createdAt: new Date(groupData.created_at).getTime(),
            };

            await triggerGroupPusherEvent(env, `presence-group-${groupData.id}`, 'member-joined', {
              groupId: groupData.id,
              nickname,
              userCode: memberUserCode,
              members: formattedMembers,
            });

            return jsonResponse({ status: 'ok', group: updatedGroup });
          } catch (err: any) {
            return errorResponse(err?.message || 'Join failed', 500);
          }
        }
        return errorResponse('Groups database not configured', 500);
      }

      if (pathname === '/groups/leave' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId, nickname, userCode, userId } = body;
        const targetId = userCode || userId;
        if (!groupId || (!nickname && !targetId)) return errorResponse('Missing groupId or member identification', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            let deleteQuery = supabase.from('group_members').delete().eq('group_id', groupId);
            if (targetId) {
              deleteQuery = deleteQuery.or(`user_code.eq.${targetId},user_id.eq.${targetId}`);
            } else {
              deleteQuery = deleteQuery.eq('nickname', nickname);
            }
            await deleteQuery;
            await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'member-left', {
              groupId,
              nickname,
              userCode: targetId || nickname,
              userId: targetId || null,
            });
            return jsonResponse({ status: 'ok' });
          } catch {}
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/groups/kick' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId, targetNickname, targetUserCode, targetUserId, adminNickname } = body;
        const targetId = targetUserCode || targetUserId;
        if (!groupId || (!targetNickname && !targetId)) return errorResponse('Missing kick parameters', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            let deleteQuery = supabase.from('group_members').delete().eq('group_id', groupId);
            if (targetId) {
              deleteQuery = deleteQuery.or(`user_code.eq.${targetId},user_id.eq.${targetId}`);
            } else {
              deleteQuery = deleteQuery.eq('nickname', targetNickname);
            }
            await deleteQuery;
            await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'kick', {
              groupId,
              target: targetNickname,
              targetUserCode: targetId,
              targetUserId: targetId,
              admin: adminNickname,
            });
            return jsonResponse({ status: 'ok' });
          } catch {}
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/groups/update' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId, name, description, avatarUrl } = body;
        if (!groupId) return errorResponse('Missing groupId', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            const updateData: any = { updated_at: new Date().toISOString() };
            if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
            if (typeof description === 'string') updateData.description = description.trim();
            if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
            if (typeof body.code === 'string' && body.code.trim()) updateData.code = body.code.trim();
            if (body.creator_id !== undefined) updateData.creator_id = body.creator_id;
            if (body.creatorId !== undefined) updateData.creator_id = body.creatorId;

            await supabase.from('groups').update(updateData).eq('id', groupId);

            await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'group-updated', {
              groupId,
              name: updateData.name,
              description: updateData.description,
              avatarUrl: updateData.avatar_url,
            });

            return jsonResponse({ status: 'ok', group: updateData });
          } catch (err: any) {
            return errorResponse(err?.message || 'Update failed', 500);
          }
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/groups/delete' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId } = body;
        if (!groupId) return errorResponse('Missing groupId', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            await supabase.from('groups').delete().eq('id', groupId);
            await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'group-deleted', {
              groupId,
            });
            return jsonResponse({ status: 'ok' });
          } catch (err: any) {
            return errorResponse(err?.message || 'Delete failed', 500);
          }
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/groups/role' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId, targetNickname, targetUserCode, targetUserId, role } = body;
        const targetId = targetUserCode || targetUserId;
        if (!groupId || (!targetNickname && !targetId) || !role) return errorResponse('Missing parameters', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            let roleQuery = supabase.from('group_members').update({ role }).eq('group_id', groupId);
            if (targetId) {
              roleQuery = roleQuery.or(`user_code.eq.${targetId},user_id.eq.${targetId}`);
            } else {
              roleQuery = roleQuery.eq('nickname', targetNickname);
            }
            await roleQuery;
            await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'member-role-updated', {
              groupId,
              targetNickname,
              targetUserCode: targetId,
              targetUserId: targetId,
              role,
            });
            return jsonResponse({ status: 'ok' });
          } catch (err: any) {
            return errorResponse(err?.message || 'Role update failed', 500);
          }
        }
        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/groups/notify-member' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { targetUserCode, targetNickname, group } = body;
        if ((!targetUserCode && !targetNickname) || !group) return errorResponse('Missing targetUserCode or group', 400);

        const targets = Array.from(new Set([targetUserCode, targetNickname].filter(Boolean)));
        const allPusherServers = [...PUSHER_CONFIGS(env), ...GROUP_PUSHER_CONFIGS(env)];
        let triggered = false;
        for (const tCode of targets) {
          for (const server of allPusherServers) {
            try {
              await triggerPusherEventOnServer(server, `private-handshake-${tCode}`, 'client-group-added', { group });
              triggered = true;
            } catch {}
          }
        }
        return jsonResponse({ status: triggered ? 'ok' : 'no_server' });
      }

      if (pathname === '/groups/messages' && request.method === 'GET') {
        const groupId = url.searchParams.get('groupId') || url.searchParams.get('id');
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        if (!groupId) return errorResponse('Missing groupId', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (!supabase) return errorResponse('Groups database not configured', 500);

        try {
          const { data, error } = await supabase
            .from('group_messages')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true })
            .limit(limit);

          if (error) return errorResponse(error.message, 500);
          return jsonResponse({ status: 'ok', messages: data || [] });
        } catch (err: any) {
          return errorResponse(err?.message || 'Failed to fetch messages', 500);
        }
      }

      if (pathname === '/groups/message' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const {
          id,
          groupId,
          senderCode,
          senderId,
          senderNickname,
          ciphertext,
          mediaType,
          mediaUrl,
          mediaName,
          mediaKey,
          mime,
          duration,
          width,
          height,
          waveform,
          audioMetadata,
          linkPreview,
        } = body;

        if (!groupId || !ciphertext || !senderNickname) {
          return errorResponse('Missing required message parameters', 400);
        }

        const msgId = id || `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const supabase = getGroupsSupabaseClient(env);
        const nowIso = new Date().toISOString();

        const messageRow = {
          id: msgId,
          group_id: groupId,
          sender_code: senderCode || senderNickname,
          sender_id: senderId || null,
          sender_nickname: senderNickname,
          ciphertext,
          media_type: mediaType || null,
          media_url: mediaUrl || null,
          media_name: mediaName || null,
          media_key: mediaKey || null,
          mime: mime || null,
          duration: duration || null,
          width: width || null,
          height: height || null,
          waveform: waveform || null,
          audio_metadata: audioMetadata || null,
          link_preview: linkPreview || null,
          created_at: nowIso,
        };

        if (supabase) {
          try {
            await supabase.from('group_messages').insert(messageRow);
          } catch {}
        }

        const broadcastPayload = {
          type: 'group-message',
          id: msgId,
          groupId,
          sender: senderNickname,
          senderCode: senderCode || senderNickname,
          senderId: senderId || null,
          ciphertext,
          mediaType,
          mediaUrl,
          mediaName,
          mime,
          duration,
          waveform,
          time: Date.now(),
        };

        await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'client-message', broadcastPayload);

        return jsonResponse({ status: 'ok', id: msgId });
      }

      if (pathname === '/groups/read' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId, messageId, readIds, time, sender, senderUserId, senderCode } = body;
        if (!groupId) return errorResponse('Missing groupId', 400);

        const idsToCheck = Array.from(new Set((readIds || (messageId ? [messageId] : [])).filter(Boolean)));
        const supabase = getGroupsSupabaseClient(env);
        let fullyReadIds: any[] = [];

        if (supabase && idsToCheck.length > 0) {
          try {
            const { data: members } = await supabase
              .from('group_members')
              .select('user_code, user_id, nickname')
              .eq('group_id', groupId);

            const totalMembers = members || [];
            const readerIds = [senderUserId, senderCode, sender].filter(Boolean);

            for (const mId of idsToCheck) {
              const { data: msg } = await supabase
                .from('group_messages')
                .select('id, sender_code, sender_id, sender_nickname, reactions')
                .eq('id', mId)
                .maybeSingle();

              if (!msg) {
                fullyReadIds.push(mId);
                continue;
              }

              const isSender = (m: any) => {
                if (msg.sender_id && (m.user_id === msg.sender_id || m.user_code === msg.sender_id)) return true;
                if (msg.sender_code && (m.user_code === msg.sender_code || m.user_id === msg.sender_code)) return true;
                return m.nickname === msg.sender_nickname;
              };

              const otherMembers = totalMembers.filter((m: any) => !isSender(m));
              const existingReads = Array.isArray(msg.reactions?._read_by) ? msg.reactions._read_by : [];
              const updatedReads = Array.from(new Set([...existingReads, ...readerIds]));

              const allRead = otherMembers.length === 0 || otherMembers.every((m: any) =>
                updatedReads.some((r: any) => r === m.user_id || r === m.user_code || r === m.nickname)
              );

              if (allRead) {
                await supabase.from('group_messages').delete().eq('id', mId);
                fullyReadIds.push(mId);
              } else {
                await supabase
                  .from('group_messages')
                  .update({ reactions: { ...(msg.reactions || {}), _read_by: updatedReads } })
                  .eq('id', mId);
              }
            }
          } catch (err) {
            console.error('[groups/read] error processing reads:', err);
          }
        }

        if (fullyReadIds.length > 0) {
          const readPayload = {
            type: 'read',
            groupId,
            messageId: fullyReadIds[fullyReadIds.length - 1],
            readIds: fullyReadIds,
            time: time || Date.now(),
            sender,
            senderUserId,
            senderCode,
            senderId: senderUserId || senderCode,
          };
          await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'client-message', readPayload);
        }

        return jsonResponse({ status: 'ok', fullyReadIds });
      }

      if (pathname === '/groups/calls/active' && request.method === 'GET') {
        const groupId = url.searchParams.get('groupId') || url.searchParams.get('id');
        if (!groupId) return errorResponse('Missing groupId', 400);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            const { data } = await supabase
              .from('group_calls')
              .select('*')
              .eq('group_id', groupId)
              .eq('status', 'active')
              .maybeSingle();

            if (data) {
              return jsonResponse({ status: 'ok', call: data });
            }
          } catch {}
        }
        const memCall = inMemoryActiveGroupCalls.get(groupId);
        if (memCall && memCall.status === 'active') {
          return jsonResponse({ status: 'ok', call: memCall });
        }
        return jsonResponse({ status: 'ok', call: null });
      }

      if (pathname === '/groups/calls/start' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId, roomName, hostCode, hostNickname } = body;
        if (!groupId || !roomName) return errorResponse('Missing call parameters', 400);

        const nowIso = new Date().toISOString();
        const callData = {
          group_id: groupId,
          room_name: roomName,
          status: 'active',
          host_code: hostCode || hostNickname,
          host_nickname: hostNickname || 'Host',
          participants_count: 1,
          created_at: nowIso,
          updated_at: nowIso,
        };
        inMemoryActiveGroupCalls.set(groupId, callData);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            await supabase.from('group_calls').upsert(callData);
          } catch {}
        }

        await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'group-call-started', {
          groupId,
          roomName,
          hostCode,
          hostNickname,
        });

        return jsonResponse({ status: 'ok', roomName });
      }

      if (pathname === '/groups/calls/end' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const { groupId } = body;
        if (!groupId) return errorResponse('Missing groupId', 400);

        inMemoryActiveGroupCalls.delete(groupId);

        const supabase = getGroupsSupabaseClient(env);
        if (supabase) {
          try {
            await supabase.from('group_calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('group_id', groupId);
          } catch {}
        }

        await triggerGroupPusherEvent(env, `presence-group-${groupId}`, 'group-call-ended', { groupId });

        return jsonResponse({ status: 'ok' });
      }

      if ((pathname === '/developers' || pathname === '/relay/developers') && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) {
          return errorResponse('Supabase not configured on worker', 500);
        }
        const { data, error } = await supabase
          .from('developers')
          .select('code');

        if (error) {
          return errorResponse(error.message, 500);
        }

        const codes = (data || []).map((d: any) => d.code).filter(Boolean);
        return jsonResponse({ developers: codes });
      }

      return errorResponse('Endpoint not found', 404);
    } catch (err: any) {
      console.error('[Worker] Unhandled error:', err);
      return errorResponse(err?.message || 'Internal Server Error', 500);
    }
  },
};