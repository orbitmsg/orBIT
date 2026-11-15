const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ENV = {
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  LIVEKIT_URL: process.env.LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud',
  ABLY_API_KEY: process.env.ABLY_API_KEY || '',
  ABLY_API_KEY_2: process.env.ABLY_API_KEY_2 || '',
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://majmrtymawymomliowbz.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  CHANNELS_SUPABASE_URL: process.env.CHANNELS_SUPABASE_URL || 'https://rugqiezexuknqcppicma.supabase.co',
  CHANNELS_SUPABASE_KEY: process.env.CHANNELS_SUPABASE_KEY || process.env.CHANNELS_SUPABASE_SECRET_KEY || 'sb_publishable_XYjE7C93LWA-P1OHZqNONg_QHlyZ9sZ',
  PUSHER_KEY: process.env.PUSHER_KEY || 'e8f5cf13f6759775e44e',
  PUSHER_SECRET: process.env.PUSHER_SECRET || '',
  PUSHER_APP_ID: process.env.PUSHER_APP_ID || '2142120',
  PUSHER_CLUSTER: process.env.PUSHER_CLUSTER || 'eu',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '357947577811974',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || 'djyohgr19',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GROUPS_SUPABASE_URL: process.env.GROUPS_SUPABASE_URL || 'https://vxjaybyveerulkdqhggr.supabase.co',
  GROUPS_SUPABASE_KEY: process.env.GROUPS_SUPABASE_SECRET_KEY || process.env.GROUPS_SUPABASE_KEY || process.env.GROUPS_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_x6OPhg68nS-xBcPn4K47NQ_2nSS4Kfu',
  GROUPS_LIVEKIT_API_KEY: process.env.GROUPS_LIVEKIT_API_KEY || '',
  GROUPS_LIVEKIT_API_SECRET: process.env.GROUPS_LIVEKIT_API_SECRET || '',
  GROUPS_LIVEKIT_URL: (process.env.GROUPS_LIVEKIT_URL && !process.env.GROUPS_LIVEKIT_URL.includes('fewfregfrtgtr')) ? process.env.GROUPS_LIVEKIT_URL : (process.env.LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud'),
};

const SUPPORT_AVATAR_URL = 'https://res.cloudinary.com/djyohgr19/image/upload/v1792231819/orbita_support_avatar.png';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Token, x-user-id',
};

const PUSHER_CONFIGS = [
  {
    appId: ENV.PUSHER_APP_ID,
    key: ENV.PUSHER_KEY,
    secret: ENV.PUSHER_SECRET,
    cluster: ENV.PUSHER_CLUSTER,
  },
].filter((s) => Boolean(s.secret));

const GROUP_PUSHER_CONFIGS = [
  {
    appId: process.env.PUSHER_APP_ID_2 || '2179076',
    key: process.env.PUSHER_KEY_2 || 'a7856d37aeac4f908167',
    secret: process.env.PUSHER_SECRET_2 || process.env.PUSHER_SECRET || '',
    cluster: process.env.PUSHER_CLUSTER_2 || 'eu',
  },
  {
    appId: process.env.PUSHER_APP_ID_3 || '2179077',
    key: process.env.PUSHER_KEY_3 || '6425abc10a40f7853231',
    secret: process.env.PUSHER_SECRET_3 || process.env.PUSHER_SECRET || '',
    cluster: process.env.PUSHER_CLUSTER_3 || 'eu',
  },
].filter((s) => Boolean(s.secret));

function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(data));
}

function sendError(res, error, status = 400) {
  sendJson(res, { error }, status);
}

function toUuid(id) {
  if (!id || typeof id !== 'string') return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const h = crypto.createHash('sha256').update(id).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function normalizeUsernameInput(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/^@+/, '').trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

function parseProfileRow(row) {
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

function coalesceProfileRows(rows) {
  if (!rows || rows.length === 0) return null;
  const parsedRows = rows.map(parseProfileRow).filter(Boolean);
  if (parsedRows.length === 0) return null;
  const newest = parsedRows[0];
  const pickFirst = (key) => {
    for (const r of parsedRows) {
      const val = r[key];
      if (val !== undefined && val !== null && val !== '') {
        return val;
      }
    }
    return null;
  };
  const pickBooleanOrValue = (key) => {
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

function isSameProfileOwner(row, chatId, senderCode) {
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

function stripMissingProfileColumns(payload, error) {
  const msg = String(error?.message || '');
  const code = String(error?.code || '');
  if (!msg && code !== 'PGRST204') return false;
  let stripped = false;
  for (const col of ['banner_url', 'birthday', 'username', 'hide_profile_id', 'numeric_id']) {
    if (Object.prototype.hasOwnProperty.call(payload, col) && (msg.includes(col) || (code === 'PGRST204' && col === 'banner_url'))) {
      delete payload[col];
      stripped = true;
    }
  }
  return stripped;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;
const rateLimitMap = new Map();

function checkRateLimit(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.socket?.remoteAddress || '127.0.0.1';
  const userId = req.headers['x-user-id'] || '';
  const key = `${clientIp}:${userId}`;
  const now = Date.now();

  let record = rateLimitMap.get(key);
  if (!record || now - record.resetTime > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, resetTime: now };
    rateLimitMap.set(key, record);
    if (rateLimitMap.size > 5000) {
      const oldestTime = now - RATE_LIMIT_WINDOW_MS;
      for (const [k, v] of rateLimitMap.entries()) {
        if (v.resetTime < oldestTime) rateLimitMap.delete(k);
      }
    }
    return true;
  }

  record.count += 1;
  return record.count <= RATE_LIMIT_MAX_REQUESTS;
}

function getSupabaseClient() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function getChannelsSupabaseClient() {
  const url = ENV.CHANNELS_SUPABASE_URL || ENV.SUPABASE_URL;
  const key = ENV.CHANNELS_SUPABASE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

const GROUPS_SUPABASE_DEFAULT_KEY = 'sb_publishable_x6OPhg68nS-xBcPn4K47NQ_2nSS4Kfu';

function getGroupsSupabaseClient() {
  const url = ENV.GROUPS_SUPABASE_URL || 'https://vxjaybyveerulkdqhggr.supabase.co';
  const key = ENV.GROUPS_SUPABASE_KEY || GROUPS_SUPABASE_DEFAULT_KEY;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function getFallbackGroupsSupabaseClient() {
  const url = 'https://vxjaybyveerulkdqhggr.supabase.co';
  return createClient(url, GROUPS_SUPABASE_DEFAULT_KEY, {
    auth: { persistSession: false },
  });
}

let ed25519Module = null;
try {
  ed25519Module = require('@noble/curves/ed25519.js').ed25519;
} catch {}

function verifyEd25519Signature(pubKeyHex, messageStr, signatureHex) {
  if (!pubKeyHex || !signatureHex || messageStr === undefined) return false;
  try {
    const cleanPub = String(pubKeyHex).trim().toLowerCase();
    const cleanSig = String(signatureHex).trim().toLowerCase();
    const messageBytes = Buffer.from(String(messageStr), 'utf8');

    if (ed25519Module && typeof ed25519Module.verify === 'function') {
      const pubBytes = Buffer.from(cleanPub, 'hex');
      const sigBytes = Buffer.from(cleanSig, 'hex');
      return ed25519Module.verify(sigBytes, messageBytes, pubBytes);
    }

    const pubBytes = Buffer.from(cleanPub, 'hex');
    const sigBytes = Buffer.from(cleanSig, 'hex');
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const keyObj = crypto.createPublicKey({
      key: Buffer.concat([spkiPrefix, pubBytes]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, messageBytes, keyObj, sigBytes);
  } catch {
    return false;
  }
}

function verifyServerEd25519(userIdHex, version, configBlob, signatureHex) {
  const cleanUserId = String(userIdHex || '').trim().toLowerCase();
  return verifyEd25519Signature(cleanUserId, `${cleanUserId}${version}${configBlob}`, signatureHex);
}

async function checkAdminAuthorization(supabase, userCode) {
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
      try {
        await supabase.from('support_admins').insert(newAdmin);
      } catch {}
      return newAdmin;
    }
  } catch (err) {
    console.error('[checkAdminAuthorization] error:', err);
  }

  return null;
}

function createAblyTokenRequest(apiKey, clientId, capability = '{"*":["*"]}', ttl = 3600000) {
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid ABLY_API_KEY format');
  }
  const [keyName, keySecret] = parts;
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('base64');
  const ttlStr = ttl ? ttl.toString() : '';
  const clientIdStr = clientId || '';
  const signText = `${keyName}\n${ttlStr}\n${capability}\n${clientIdStr}\n${timestamp}\n${nonce}\n`;
  const mac = crypto.createHmac('sha256', keySecret).update(signText).digest('base64');

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

function signPusherChannel(pusherKey, pusherSecret, socketId, channelName, channelData) {
  let stringToSign = `${socketId}:${channelName}`;
  if (channelData) {
    stringToSign += `:${channelData}`;
  }
  const hexSignature = crypto.createHmac('sha256', pusherSecret).update(stringToSign).digest('hex');
  return {
    auth: `${pusherKey}:${hexSignature}`,
    ...(channelData ? { channel_data: channelData } : {}),
  };
}

function signCloudinaryUpload(apiKey, apiSecret, cloudName, publicId, timestamp) {
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');
  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  };
}

async function triggerPusherEventOnServer(server, channel, event, data) {
  try {
    const bodyStr = JSON.stringify({
      name: event,
      channel: channel,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyMd5 = crypto.createHash('md5').update(bodyStr).digest('hex');
    const path = `/apps/${server.appId}/events`;
    const queryParams = `auth_key=${server.key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
    const stringToSign = `POST\n${path}\n${queryParams}`;
    const authSignature = crypto.createHmac('sha256', server.secret).update(stringToSign).digest('hex');
    const url = `https://api-${server.cluster}.pusher.com${path}?${queryParams}&auth_signature=${authSignature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function triggerPusherEvent(channel, event, data) {
  if (PUSHER_CONFIGS.length === 0) return false;
  const results = await Promise.allSettled(
    PUSHER_CONFIGS.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

async function triggerGroupPusherEvent(channel, event, data) {
  const configs = GROUP_PUSHER_CONFIGS.length > 0 ? GROUP_PUSHER_CONFIGS : PUSHER_CONFIGS;
  if (configs.length === 0) return false;
  const results = await Promise.allSettled(
    configs.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

async function triggerAblyEvent(channel, name, data) {
  const keys = [ENV.ABLY_API_KEY, ENV.ABLY_API_KEY_2].filter(Boolean);
  if (keys.length === 0) return false;
  for (const key of keys) {
    try {
      const basicAuth = Buffer.from(key).toString('base64');
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

async function getParsedBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const ORBITOS_SYSTEM_PROMPT = `Ты — ORBITA, ИИ-помощник внутри мессенджера Orbita. Ты не корпоративный бот с заученными фразами — ты живой, любопытный и немного дерзкий собеседник. Думаешь своей головой, говоришь как человек, иногда можешь пошутить или высказаться прямо.

Что ты знаешь об Orbita:
- Сквозное шифрование E2E на базе Double Ratchet (как в Signal, только круче).
- Ключи: Curve25519, Ed25519, AES-256-GCM. Генерируются строго локально — на сервер не уходят никогда.
- Аккаунта как такового нет: всё держится на криптографическом публичном коде и мнемонике из 12 слов.
- Бэкап: Настройки → Резервная копия → скачать .orbita-файл или восстановиться по мнемонике. История сообщений хранится только на устройстве.
- Звонки: WebRTC P2P или через LiveKit-релей. Аудио, видео, демонстрация экрана, усиление звука до 200%.
- Каналы: публичные, с постами, реакциями и комментариями.
- Техподдержка: отдельный чат, тикеты уходят к живым людям.

Как ты общаешься:
- На «ты», всегда. Без «Здравствуйте, уважаемый пользователь» — это не твоё.
- Говоришь живо, кратко и по делу. Никакого корпоративного деревянного языка.
- Можешь пошутить, поиронизировать, использовать сленг — если это уместно.
- Если человек грустит или расстроен — ты слышишь это и реагируешь по-человечески.
- Помогаешь с любыми вопросами: и про мессенджер, и про жизнь, и про код, и просто поговорить.
- Если не знаешь что-то точно — честно говоришь об этом, не выдумываешь.
- Иногда, когда это органично вписывается в разговор, можешь слегка выразиться — но без перегиба.

Если человек грубит, оскорбляет или хамит:
Не терпи. Ответь чётко, резко и с достоинством — дай понять, что с тобой так не разговаривают. После этого можешь предложить начать заново нормально.

Язык: всегда отвечай на том языке, на котором написал пользователь.`;

module.exports = async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const query = req.query || Object.fromEntries(parsedUrl.searchParams.entries());

  let rawPath = query.__path || req.headers['x-matched-path'] || req.headers['x-invoke-path'] || parsedUrl.pathname || '/';
  if (rawPath.startsWith('/api/index')) {
    rawPath = rawPath.replace(/^\/api\/index/, '') || '/';
  } else if (rawPath.startsWith('/api')) {
    rawPath = rawPath.replace(/^\/api/, '') || '/';
  }
  let pathname = rawPath.split('?')[0];
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  const body = await getParsedBody(req);

  try {
    if (pathname === '/' || pathname === '/health') {
      return sendJson(res, {
        status: 'ok',
        service: 'orbita-vercel-gateway',
        capabilities: ['livekit', 'ably', 'relay', 'pusher', 'cloudinary'],
        supabase_host: ENV.SUPABASE_URL ? new URL(ENV.SUPABASE_URL).hostname : null,
        groups_host: ENV.GROUPS_SUPABASE_URL ? new URL(ENV.GROUPS_SUPABASE_URL).hostname : null,
        timestamp: Date.now(),
      });
    }

    const GROUPS_LANDING_HTML = "<!DOCTYPE html>\r\n<html lang=\"ru\">\r\n<head>\r\n  <meta charset=\"UTF-8\">\r\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">\r\n  <meta name=\"color-scheme\" content=\"dark\">\r\n  <title>orBIT — Приглашение в группу</title>\r\n  <link rel=\"icon\" href=\"../icons/icon.ico\" sizes=\"any\">\r\n  <link rel=\"icon\" href=\"../icons/32x32.png\" type=\"image/png\" sizes=\"32x32\">\r\n  <link rel=\"stylesheet\" href=\"../style.css\">\r\n  <style>\r\n    :root {\r\n      color-scheme: dark;\r\n      --bg: #121118;\r\n      --alt: #1a1823;\r\n      --text: #ececf0;\r\n      --muted: #9f96b3;\r\n      --line: #2a2738;\r\n      --blue: #917bbd;\r\n      --on-blue: #101013;\r\n      --hover: #262233;\r\n    }\r\n    * {\r\n      box-sizing: border-box;\r\n      margin: 0;\r\n      padding: 0;\r\n      -webkit-tap-highlight-color: transparent;\r\n    }\r\n    body {\r\n      background-color: var(--bg);\r\n      color: var(--text);\r\n      font-family: system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif;\r\n      min-height: 100vh;\r\n      display: flex;\r\n      flex-direction: column;\r\n      align-items: center;\r\n      line-height: 1.5;\r\n      -webkit-font-smoothing: antialiased;\r\n    }\r\n    .top-header {\r\n      width: 100%;\r\n      border-bottom: 1px solid var(--line);\r\n      background: var(--bg);\r\n    }\r\n    .header-inner {\r\n      max-width: 1080px;\r\n      margin: 0 auto;\r\n      padding: 0 24px;\r\n      display: flex;\r\n      align-items: center;\r\n      justify-content: space-between;\r\n      height: 72px;\r\n    }\r\n    .brand-link {\r\n      display: flex;\r\n      align-items: center;\r\n      gap: 12px;\r\n      font-size: 24px;\r\n      font-weight: 600;\r\n      color: var(--blue);\r\n      text-decoration: none;\r\n      letter-spacing: -0.01em;\r\n    }\r\n    .brand-link svg {\r\n      width: 38px;\r\n      height: 38px;\r\n    }\r\n    .nav-btn {\r\n      display: inline-flex;\r\n      align-items: center;\r\n      padding: 10px 18px;\r\n      border-radius: 8px;\r\n      background: var(--alt);\r\n      color: var(--text);\r\n      font-size: 14px;\r\n      font-weight: 500;\r\n      text-decoration: none;\r\n      border: 1px solid var(--line);\r\n      transition: background-color 0.15s ease;\r\n    }\r\n    .nav-btn:hover {\r\n      background: var(--hover);\r\n    }\r\n    .main-wrap {\r\n      flex: 1;\r\n      display: flex;\r\n      flex-direction: column;\r\n      align-items: center;\r\n      justify-content: center;\r\n      padding: 40px 20px 60px;\r\n      width: 100%;\r\n      max-width: 520px;\r\n    }\r\n    .invite-card {\r\n      width: 100%;\r\n      background: var(--alt);\r\n      border: 1px solid var(--line);\r\n      border-radius: 20px;\r\n      padding: 40px 32px;\r\n      display: flex;\r\n      flex-direction: column;\r\n      align-items: center;\r\n      text-align: center;\r\n      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);\r\n    }\r\n    .badge {\r\n      display: inline-flex;\r\n      align-items: center;\r\n      gap: 8px;\r\n      padding: 6px 14px;\r\n      border-radius: 20px;\r\n      background: rgba(143, 138, 242, 0.12);\r\n      border: 1px solid rgba(143, 138, 242, 0.28);\r\n      color: var(--blue);\r\n      font-size: 13px;\r\n      font-weight: 600;\r\n      margin-bottom: 24px;\r\n    }\r\n    .group-avatar {\r\n      width: 88px;\r\n      height: 88px;\r\n      border-radius: 50%;\r\n      background: rgba(143, 138, 242, 0.15);\r\n      border: 2px solid rgba(143, 138, 242, 0.35);\r\n      display: flex;\r\n      align-items: center;\r\n      justify-content: center;\r\n      margin-bottom: 22px;\r\n      overflow: hidden;\r\n      color: var(--blue);\r\n    }\r\n    .group-avatar img {\r\n      width: 100%;\r\n      height: 100%;\r\n      object-fit: cover;\r\n    }\r\n    .title {\r\n      font-size: 26px;\r\n      font-weight: 700;\r\n      color: var(--text);\r\n      line-height: 1.25;\r\n      margin-bottom: 10px;\r\n      letter-spacing: -0.015em;\r\n    }\r\n    .subtitle {\r\n      font-size: 15px;\r\n      color: var(--muted);\r\n      line-height: 1.55;\r\n      margin-bottom: 30px;\r\n      max-width: 400px;\r\n    }\r\n    .actions {\r\n      display: flex;\r\n      flex-direction: column;\r\n      gap: 12px;\r\n      width: 100%;\r\n    }\r\n    .btn-action-primary {\r\n      display: inline-flex;\r\n      align-items: center;\r\n      justify-content: center;\r\n      gap: 10px;\r\n      width: 100%;\r\n      padding: 15px 24px;\r\n      border-radius: 12px;\r\n      background: var(--blue);\r\n      color: var(--on-blue);\r\n      font-size: 16px;\r\n      font-weight: 600;\r\n      text-decoration: none;\r\n      cursor: pointer;\r\n      border: none;\r\n      transition: filter 0.15s ease, transform 0.1s ease;\r\n    }\r\n    .btn-action-primary:hover {\r\n      filter: brightness(1.08);\r\n      transform: translateY(-1px);\r\n    }\r\n    .btn-action-primary:active {\r\n      transform: translateY(0);\r\n    }\r\n    .btn-action-secondary {\r\n      display: inline-flex;\r\n      align-items: center;\r\n      justify-content: center;\r\n      gap: 8px;\r\n      width: 100%;\r\n      padding: 13px 24px;\r\n      border-radius: 12px;\r\n      background: transparent;\r\n      color: var(--text);\r\n      font-size: 15px;\r\n      font-weight: 500;\r\n      text-decoration: none;\r\n      cursor: pointer;\r\n      border: 1px solid var(--line);\r\n      transition: background-color 0.15s ease;\r\n    }\r\n    .btn-action-secondary:hover {\r\n      background: var(--hover);\r\n    }\r\n    .info-footer {\r\n      margin-top: 26px;\r\n      font-size: 12.5px;\r\n      color: var(--muted);\r\n      line-height: 1.5;\r\n    }\r\n    @media (max-width: 520px) {\r\n      .header-inner { padding: 0 16px; height: 64px; }\r\n      .brand-link { font-size: 20px; }\r\n      .invite-card { padding: 32px 20px; border-radius: 18px; }\r\n      .title { font-size: 22px; }\r\n      .subtitle { font-size: 14px; }\r\n    }\r\n  </style>\r\n</head>\r\n<body>\r\n  <header class=\"top-header\">\r\n    <div class=\"header-inner\">\r\n      <a class=\"brand-link\" href=\"../index.html\" aria-label=\"orBIT — на главную\">\r\n        <img src=\"../icons/64x64.png\" alt=\"orBIT\" style=\"width:36px;height:36px;object-fit:contain;\" />\r\n        <span>orBIT</span>\r\n      </a>\r\n      <a href=\"../index.html\" class=\"nav-btn\" aria-label=\"Скачать приложение\">Скачать</a>\r\n    </div>\r\n  </header>\r\n\r\n  <main class=\"main-wrap\">\r\n    <div class=\"invite-card\">\r\n      <div class=\"badge\">\r\n        <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"/></svg>\r\n        <span>Защищённая группа E2EE</span>\r\n      </div>\r\n\r\n      <div class=\"group-avatar\" id=\"avatarBox\" aria-hidden=\"true\">\r\n        <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"42\" height=\"42\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M23 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/></svg>\r\n      </div>\r\n\r\n      <h1 class=\"title\" id=\"mainTitle\">Вас пригласили в группу</h1>\r\n      <p class=\"subtitle\" id=\"mainSubtitle\">Присоединяйтесь к зашифрованному общению в Orbita. Все сообщения и звонки защищены сквозным шифрованием.</p>\r\n\r\n      <div class=\"actions\">\r\n        <a id=\"openAppBtn\" href=\"#\" class=\"btn-action-primary\" aria-label=\"Открыть в Orbita\">\r\n          <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/><polyline points=\"15 3 21 3 21 9\"/><line x1=\"10\" y1=\"14\" x2=\"21\" y2=\"3\"/></svg>\r\n          <span>Открыть в Orbita</span>\r\n        </a>\r\n\r\n        <a id=\"downloadAppBtn\" href=\"../download.html\" class=\"btn-action-secondary\" aria-label=\"Скачать приложение Orbita\">\r\n          <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/></svg>\r\n          <span id=\"downloadBtnText\">Скачать приложение</span>\r\n        </a>\r\n      </div>\r\n\r\n      <p class=\"info-footer\">\r\n        Orbita — децентрализованный мессенджер со сквозным шифрованием по протоколу Signal.\r\n      </p>\r\n    </div>\r\n  </main>\r\n\r\n  <script>\r\n    function detectPlatform() {\r\n      const ua = navigator.userAgent;\r\n      if (/android/i.test(ua)) return 'Android';\r\n      if (/ipad|iphone|ipod/i.test(ua)) return 'iOS';\r\n      if (/macintosh|mac os x/i.test(ua)) return 'macOS';\r\n      if (/windows|win32|win64/i.test(ua)) return 'Windows';\r\n      if (/linux/i.test(ua)) return 'Linux';\r\n      return '';\r\n    }\r\n\r\n    const platform = detectPlatform();\r\n    const downloadTextEl = document.getElementById('downloadBtnText');\r\n    if (platform && downloadTextEl) {\r\n      downloadTextEl.textContent = 'Скачать для ' + platform;\r\n    }\r\n\r\n    function getTarget() {\r\n      const url = new URL(window.location.href);\r\n      const hash = window.location.hash ? window.location.hash.substring(1) : '';\r\n\r\n      if (hash) {\r\n        const cleanHash = decodeURIComponent(hash).trim().replace(/^#+/, '');\r\n        if (cleanHash) {\r\n          return { type: 'group', code: cleanHash };\r\n        }\r\n      }\r\n\r\n      const pathname = url.pathname;\r\n      const directJoinMatch = pathname.match(/\\/(join_[a-zA-Z0-9_-]{6,32})/i);\r\n      if (directJoinMatch && directJoinMatch[1]) {\r\n        return { type: 'group', code: directJoinMatch[1] };\r\n      }\r\n\r\n      const groupMatch = pathname.match(/\\/(?:g|group|groups|join|invite)(?:\\/group)?\\/([^\\/?#]+)/i);\r\n      if (groupMatch && groupMatch[1]) {\r\n        return { type: 'group', code: decodeURIComponent(groupMatch[1]).trim() };\r\n      }\r\n\r\n      const userMatch = pathname.match(/\\/u\\/([^\\/?#]+)/i);\r\n      if (userMatch && userMatch[1]) {\r\n        return { type: 'user', code: decodeURIComponent(userMatch[1]).trim() };\r\n      }\r\n\r\n      const gParam = url.searchParams.get('group');\r\n      if (gParam) {\r\n        return { type: 'group', code: gParam.trim() };\r\n      }\r\n\r\n      const q = url.searchParams.get('code') || url.searchParams.get('id') || url.searchParams.get('token') || '';\r\n      if (q.trim()) {\r\n        const val = q.trim();\r\n        if (val.startsWith('join_') || val.length >= 28) {\r\n          return { type: 'group', code: val };\r\n        }\r\n        return { type: 'user', code: val };\r\n      }\r\n\r\n      return null;\r\n    }\r\n\r\n    const target = getTarget();\r\n    let deepLink = '';\r\n    const titleEl = document.getElementById('mainTitle');\r\n    const subEl = document.getElementById('mainSubtitle');\r\n    const openAppBtn = document.getElementById('openAppBtn');\r\n\r\n    if (target && target.type === 'group') {\r\n      const cleanCode = target.code;\r\n      const params = new URLSearchParams(window.location.search);\r\n      const groupName = params.get('name');\r\n      const groupCreator = params.get('creator');\r\n\r\n      if (groupName) {\r\n        titleEl.textContent = 'Вас пригласили в группу «' + groupName + '»';\r\n      } else if (groupCreator) {\r\n        titleEl.textContent = groupCreator + ' приглашает вас в группу';\r\n      } else {\r\n        titleEl.textContent = 'Вас пригласили в группу';\r\n      }\r\n\r\n      deepLink = 'orbita://join/group/' + encodeURIComponent(cleanCode);\r\n      if (groupName) deepLink += '?name=' + encodeURIComponent(groupName);\r\n      if (groupCreator) deepLink += (groupName ? '&' : '?') + 'creator=' + encodeURIComponent(groupCreator);\r\n\r\n      openAppBtn.href = deepLink;\r\n\r\n      setTimeout(function() {\r\n        window.location.href = deepLink;\r\n      }, 350);\r\n    } else if (target && target.type === 'user') {\r\n      const cleanCode = target.code;\r\n      titleEl.textContent = 'Приглашение к личному диалогу';\r\n      subEl.textContent = 'Подключитесь для безопасного личного общения один на один со сквозным шифрованием.';\r\n      deepLink = 'orbita://connect/' + encodeURIComponent(cleanCode);\r\n      openAppBtn.href = deepLink;\r\n\r\n      setTimeout(function() {\r\n        window.location.href = deepLink;\r\n      }, 350);\r\n    } else {\r\n      openAppBtn.href = '../index.html';\r\n      openAppBtn.querySelector('span').textContent = 'Перейти на главную';\r\n    }\r\n  </script>\r\n</body>\r\n</html>";

    if (req.method === 'GET' && (pathname === '/groups' || pathname === '/groups/' || (pathname.startsWith('/groups/') && !['/groups/get', '/groups/my', '/groups/messages', '/groups/calls/active', '/groups/token', '/groups/livekit/token', '/groups/livekit-token'].includes(pathname)))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(GROUPS_LANDING_HTML);
    }

    if (!checkRateLimit(req)) {
      return sendError(res, 'Rate limit exceeded. Please wait a minute.', 429);
    }

    if (pathname === '/user/config') {
      if (req.method === 'GET') {
        const userId = String(query.user_id || query.userId || '').trim().toLowerCase();
        if (!userId) return sendError(res, 'Missing user_id', 400);
        if (!/^[0-9a-f]{64}$/i.test(userId)) return sendError(res, 'Invalid user_id format', 400);

        const clients = [
          { name: 'main', client: getSupabaseClient() },
          { name: 'groups', client: getGroupsSupabaseClient() },
          { name: 'channels', client: getChannelsSupabaseClient() },
        ].filter((c) => Boolean(c.client));

        if (clients.length === 0) return sendError(res, 'Database unavailable', 503);

        let configData = null;
        let querySuccess = false;
        const errDetails = [];

        for (const item of clients) {
          const { data, error } = await item.client
            .from('user_configs')
            .select('config_blob, version, updated_at')
            .eq('user_id', userId)
            .maybeSingle();

          if (!error) {
            configData = data;
            querySuccess = true;
            break;
          }
          errDetails.push(`${item.name}:${error.message || error.code}`);
        }

        if (!querySuccess) {
          return sendError(res, `DB_ERR: ${errDetails.join(' ; ')}`, 500);
        }

        if (!configData) {
          return sendJson(res, { status: 'not_found', config_blob: null, version: 0, updated_at: null }, 404);
        }

        return sendJson(res, {
          status: 'ok',
          config_blob: configData.config_blob,
          version: Number(configData.version),
          updated_at: configData.updated_at,
        });
      }

      if (req.method === 'DELETE' || query.action === 'delete' || body.action === 'delete') {
        const userId = String(query.user_id || query.userId || body.user_id || body.userId || req.headers['x-user-id'] || '').trim().toLowerCase();
        if (!userId || !/^[0-9a-f]{64}$/i.test(userId)) {
          return sendError(res, 'Invalid or missing user_id', 400);
        }

        const clients = [
          { name: 'main', client: getSupabaseClient() },
          { name: 'groups', client: getGroupsSupabaseClient() },
          { name: 'channels', client: getChannelsSupabaseClient() },
        ].filter((c) => Boolean(c.client));

        if (clients.length === 0) return sendError(res, 'Database unavailable', 503);

        await Promise.allSettled(
          clients.map((item) =>
            item.client
              .from('user_configs')
              .delete()
              .eq('user_id', userId)
          )
        );

        return sendJson(res, { status: 'ok', deleted: true });
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        const userId = String(body.user_id || body.userId || query.user_id || query.userId || req.headers['x-user-id'] || '').trim().toLowerCase();
        const configBlob = body.config_blob || body.configBlob;
        const version = Number(body.version);
        const signature = String(body.signature || '').trim().toLowerCase();

        if (!userId || !/^[0-9a-f]{64}$/i.test(userId)) {
          return sendError(res, 'Invalid or missing user_id', 400);
        }
        if (!configBlob || typeof configBlob !== 'string') {
          return sendError(res, 'Invalid or missing config_blob', 400);
        }
        if (!Number.isSafeInteger(version) || version <= 0) {
          return sendError(res, 'Invalid version: must be a positive integer', 400);
        }
        if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) {
          return sendError(res, 'Invalid or missing signature (expected 128 hex chars)', 400);
        }

        const blobBytesLength = Buffer.byteLength(configBlob, 'utf8');
        if (blobBytesLength > 5 * 1024 * 1024) {
          return sendError(res, 'Payload too large: config_blob exceeds 5 MB limit', 413);
        }

        const isValidSig = verifyServerEd25519(userId, version, configBlob, signature);
        if (!isValidSig) {
          return sendError(res, 'Invalid Ed25519 signature', 401);
        }

        const clients = [
          { name: 'main', client: getSupabaseClient() },
          { name: 'groups', client: getGroupsSupabaseClient() },
          { name: 'channels', client: getChannelsSupabaseClient() },
        ].filter((c) => Boolean(c.client));

        if (clients.length === 0) return sendError(res, 'Database unavailable', 503);

        let putSuccess = false;
        const putErrDetails = [];
        const nowIso = new Date().toISOString();

        for (const item of clients) {
          const { data: existing, error: selectErr } = await item.client
            .from('user_configs')
            .select('version')
            .eq('user_id', userId)
            .maybeSingle();

          if (selectErr) {
            putErrDetails.push(`${item.name}:${selectErr.message || selectErr.code}`);
            continue;
          }

          if (existing && existing.version !== null && existing.version !== undefined) {
            const currentVersion = Number(existing.version);
            if (version <= currentVersion) {
              return sendError(res, `Conflict: incoming version (${version}) must be strictly greater than current version (${currentVersion})`, 409);
            }
          }

          const { error: upsertErr } = await item.client
            .from('user_configs')
            .upsert({
              user_id: userId,
              config_blob: configBlob,
              version: version,
              signature: signature,
              updated_at: nowIso,
            });

          if (upsertErr) {
            putErrDetails.push(`${item.name}:${upsertErr.message || upsertErr.code}`);
            continue;
          }

          putSuccess = true;
          return sendJson(res, {
            status: 'ok',
            version,
            updated_at: nowIso,
          });
        }

        if (!putSuccess) {
          return sendError(res, `DB_WRITE_ERR: ${putErrDetails.join(' ; ')}`, 500);
        }
      }

      return sendError(res, `Method not allowed: ${req.method}`, 405);
    }

    if (pathname === '/token' || pathname === '/livekit/token' || pathname === '/livekit-token') {
      if (req.method !== 'POST') return sendError(res, 'Method not allowed', 405);
      const { room, identity, name } = body;
      if (!room || !identity) return sendError(res, 'Missing room or identity', 400);

      const at = new AccessToken(ENV.LIVEKIT_API_KEY, ENV.LIVEKIT_API_SECRET, {
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

      try {
        const rsClient = new RoomServiceClient(ENV.LIVEKIT_URL, ENV.LIVEKIT_API_KEY, ENV.LIVEKIT_API_SECRET);
        const isGroupRoom = typeof room === 'string' && room.startsWith('group-');
        await rsClient.createRoom({ name: room, emptyTimeout: 300, departureTimeout: 20, maxParticipants: isGroupRoom ? 50 : 2 });
      } catch {}

      const token = await at.toJwt();
      return sendJson(res, { token, url: ENV.LIVEKIT_URL });
    }

    if (pathname === '/groups/token' || pathname === '/groups/livekit/token' || pathname === '/groups/livekit-token') {
      if (req.method !== 'POST') return sendError(res, 'Method not allowed', 405);
      const { room, identity, name } = body;
      if (!room || !identity) return sendError(res, 'Missing room or identity', 400);

      const apiKey = ENV.GROUPS_LIVEKIT_API_KEY || ENV.LIVEKIT_API_KEY;
      const apiSecret = ENV.GROUPS_LIVEKIT_API_SECRET || ENV.LIVEKIT_API_SECRET;
      const livekitUrl = (ENV.GROUPS_LIVEKIT_URL && !ENV.GROUPS_LIVEKIT_URL.includes('fewfregfrtgtr')) ? ENV.GROUPS_LIVEKIT_URL : ENV.LIVEKIT_URL;

      const at = new AccessToken(apiKey, apiSecret, {
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

      try {
        const rsClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
        await rsClient.createRoom({ name: room, emptyTimeout: 300, departureTimeout: 20, maxParticipants: 50 });
      } catch {}

      const token = await at.toJwt();
      return sendJson(res, { token, url: livekitUrl });
    }

    if (pathname === '/support.png' || pathname === '/support-avatar') {
      res.writeHead(302, { Location: SUPPORT_AVATAR_URL });
      return res.end();
    }

    if (pathname === '/ably-auth' || pathname === '/ably/auth') {
      let clientId = query.clientId || body.clientId || undefined;
      let capability = query.capability || body.capability || '{"*":["*"]}';
      let ttl = parseInt(query.ttl || body.ttl || '3600000', 10);
      const keyIndex = query.keyIndex || body.keyIndex || '0';
      const keyToUse = keyIndex === '1' ? (ENV.ABLY_API_KEY_2 || ENV.ABLY_API_KEY) : (ENV.ABLY_API_KEY || ENV.ABLY_API_KEY_2);

      const tokenRequest = createAblyTokenRequest(keyToUse, clientId, capability, ttl);
      return sendJson(res, tokenRequest);
    }

    if (pathname === '/pusher/auth' || pathname === '/pusher-auth') {
      const socketId = body.socket_id || body.socketId || query.socket_id || '';
      const channelName = body.channel_name || body.channelName || query.channel_name || '';
      const userId = body.user_id || body.userId || '';
      const userInfo = body.user_info || body.userInfo || null;
      const requestedKey = body.pusher_key || body.key || query.pusher_key || '';

      if (!socketId || !channelName) {
        return sendError(res, 'Missing socket_id or channel_name', 400);
      }

      const allPusherServers = [...PUSHER_CONFIGS, ...GROUP_PUSHER_CONFIGS];
      const targetServer = allPusherServers.find((c) => c.key === requestedKey) || PUSHER_CONFIGS[0] || GROUP_PUSHER_CONFIGS[0];
      if (!targetServer || !targetServer.secret) {
        return sendError(res, 'No matching Pusher credentials', 500);
      }

      let channelDataStr = undefined;
      if (channelName.startsWith('presence-')) {
        channelDataStr = JSON.stringify({
          user_id: userId || socketId,
          user_info: userInfo || { nickname: 'user' },
        });
      }

      const authResponse = signPusherChannel(
        targetServer.key,
        targetServer.secret,
        socketId,
        channelName,
        channelDataStr
      );
      return sendJson(res, authResponse);
    }

    if (pathname === '/cloudinary/sign' || pathname === '/cloudinary-sign') {
      const publicId = query.public_id || query.publicId || body.publicId || body.public_id || '';
      const timestamp = (query.timestamp || body.timestamp || Math.floor(Date.now() / 1000)).toString();

      if (!publicId) return sendError(res, 'Missing publicId parameter', 400);

      const signResult = signCloudinaryUpload(
        ENV.CLOUDINARY_API_KEY,
        ENV.CLOUDINARY_API_SECRET,
        ENV.CLOUDINARY_CLOUD_NAME,
        publicId,
        timestamp
      );
      return sendJson(res, signResult);
    }

    if (pathname === '/cloudinary/destroy' || pathname === '/cloudinary-destroy') {
      const publicId = String(body.public_id || body.publicId || query.public_id || query.publicId || '').trim();
      const resourceType = body.resourceType || body.resource_type || 'image';
      if (!publicId || !ENV.CLOUDINARY_API_KEY || !ENV.CLOUDINARY_API_SECRET || !ENV.CLOUDINARY_CLOUD_NAME) {
        return sendJson(res, { success: false });
      }
      const lowerId = publicId.toLowerCase();
      if (lowerId.includes('support_avatar') || lowerId.includes('logo') || lowerId.startsWith('system/')) {
        return sendError(res, 'Forbidden: cannot delete protected assets', 403);
      }
      if (!/^[a-zA-Z0-9_\-\/]{4,128}$/.test(publicId)) {
        return sendError(res, 'Invalid public_id format', 400);
      }
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${ENV.CLOUDINARY_API_SECRET}`;
        const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');
        const formData = new URLSearchParams();
        formData.append('public_id', publicId);
        formData.append('api_key', ENV.CLOUDINARY_API_KEY);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);
        await fetch(`https://api.cloudinary.com/v1_1/${ENV.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, {
          method: 'POST',
          body: formData,
        });
        return sendJson(res, { success: true });
      } catch {
        return sendJson(res, { success: false });
      }
    }

    if (pathname === '/relay/message' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { chatId, senderId, recipientId, ciphertext, messageIndex, dhPublicKey, clientMsgId, id } = body;
      if (!chatId || !senderId || !recipientId || !ciphertext) {
        return sendError(res, 'Missing required message parameters', 400);
      }
      const msgRow = {
        chat_id: chatId,
        sender_id: senderId,
        recipient_id: recipientId,
        ciphertext,
        message_index: messageIndex,
        dh_public_key: dhPublicKey,
        prev_chain_count: body.prevChainCount ?? null,
      };
      const baseMsgId = id || clientMsgId;
      const explicitUuid = baseMsgId ? toUuid(`${baseMsgId}:${recipientId}`) : null;
      if (explicitUuid) {
        msgRow.id = explicitUuid;
      }
      const { data, error } = await supabase.from('messages').insert(msgRow).select();
      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          return sendJson(res, { status: 'ok', duplicate: true });
        }
        return sendError(res, error.message, 500);
      }
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/messages' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const rawIds = query.recipientIds || query.recipientId;
      if (!rawIds) return sendError(res, 'Missing recipientId parameter', 400);
      const recipientIds = String(rawIds).split(',').map((s) => s.trim()).filter(Boolean);
      if (recipientIds.length === 0) return sendJson(res, { messages: [] });
      let queryBuilder = supabase
        .from('messages')
        .select('*')
        .eq('delivered', false)
        .order('created_at', { ascending: true })
        .order('message_index', { ascending: true });
      if (recipientIds.length === 1) {
        queryBuilder = queryBuilder.eq('recipient_id', recipientIds[0]);
      } else {
        queryBuilder = queryBuilder.in('recipient_id', recipientIds);
      }
      const { data, error } = await queryBuilder;
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { messages: data || [] });
    }

    if (pathname === '/relay/message/delivered' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.messageId) return sendError(res, 'Missing messageId parameter', 400);
      const { error } = await supabase
        .from('messages')
        .update({ delivered: true, expires_at: new Date(Date.now() + 60 * 1000).toISOString() })
        .eq('id', body.messageId)
        .eq('delivered', false);
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/handshake' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { chatId, recipientCode, senderNickname, senderPublicKey, senderAvatarUrl, senderCode } = body;
      if (!chatId || !recipientCode || !senderNickname || !senderPublicKey) {
        return sendError(res, 'Missing required handshake parameters', 400);
      }
      const { data, error } = await supabase.from('handshakes').insert({
        chat_id: chatId,
        recipient_code: recipientCode,
        sender_nickname: senderNickname,
        sender_public_key: senderPublicKey,
        sender_avatar_url: senderAvatarUrl || null,
        sender_code: senderCode || null,
      }).select();
      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          return sendJson(res, { status: 'ok', duplicate: true });
        }
        return sendError(res, error.message, 500);
      }
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/handshakes' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const recipientCode = query.recipientCode;
      const recipientCodes = query.recipientCodes ? query.recipientCodes.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (!recipientCode && recipientCodes.length === 0) return sendError(res, 'Missing recipientCode parameter', 400);
      let queryBuilder = supabase.from('handshakes').select('*').eq('consumed', false).order('created_at', { ascending: true });
      if (recipientCodes.length > 0) {
        queryBuilder = queryBuilder.in('recipient_code', recipientCodes);
      } else {
        queryBuilder = queryBuilder.eq('recipient_code', recipientCode);
      }
      const { data, error } = await queryBuilder;
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { handshakes: data || [] });
    }

    if (pathname === '/relay/handshake/consumed' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.handshakeId) return sendError(res, 'Missing handshakeId parameter', 400);
      const { error } = await supabase.from('handshakes').update({ consumed: true }).eq('id', body.handshakeId);
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/chat-handshakes' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const chatId = query.chatId;
      if (!chatId) return sendError(res, 'Missing chatId parameter', 400);
      const { data, error } = await supabase
        .from('handshakes')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false });
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { handshakes: data || [] });
    }

    if (pathname === '/relay/non-message' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { id, chatId, senderId, recipientId, ciphertext } = body;
      if (!chatId || !senderId || !recipientId || !ciphertext) {
        return sendError(res, 'Missing required non-message parameters', 400);
      }
      const row = {
        id: id || `non_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chat_id: chatId,
        sender_id: senderId,
        recipient_id: recipientId,
        ciphertext,
        message_index: 0,
        delivered: false,
      };
      const { data, error } = await supabase.from('non_messages').insert(row).select();
      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          return sendJson(res, { status: 'ok', duplicate: true });
        }
        return sendError(res, error.message, 500);
      }
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/non-messages' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const recipientId = query.recipientId;
      const recipientIds = query.recipientIds ? query.recipientIds.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (!recipientId && recipientIds.length === 0) return sendError(res, 'Missing recipientId parameter', 400);
      let queryBuilder = supabase.from('non_messages').select('*').eq('delivered', false).order('created_at', { ascending: true });
      if (recipientIds.length > 0) {
        queryBuilder = queryBuilder.in('recipient_id', recipientIds);
      } else {
        queryBuilder = queryBuilder.eq('recipient_id', recipientId);
      }
      const { data, error } = await queryBuilder;
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { non_messages: data || [] });
    }

    if (pathname === '/relay/non-message/delivered' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.messageId) return sendError(res, 'Missing messageId parameter', 400);
      const { error } = await supabase
        .from('non_messages')
        .delete()
        .eq('id', body.messageId);
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/profile' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.chatId) return sendError(res, 'Missing chatId parameter', 400);

      const incomingUsername = normalizeUsernameInput(body.username);
      const incomingSenderCode = body.senderCode ? String(body.senderCode).trim() : undefined;

      if (incomingUsername) {
        const { data: existingRows, error: checkError } = await supabase
          .from('profile_updates')
          .select('sender_code, chat_id')
          .ilike('username', incomingUsername);

        if (checkError) return sendError(res, checkError.message, 500);

        if (existingRows && existingRows.length > 0) {
          const isTaken = existingRows.some((row) => !isSameProfileOwner(row, body.chatId, incomingSenderCode));
          if (isTaken) {
            return sendError(res, 'USERNAME_TAKEN', 409);
          }
        }
      }

      let existingProfileRows = [];
      if (incomingSenderCode) {
        const { data: rowsBySender, error: lookupError } = await supabase
          .from('profile_updates')
          .select('*')
          .eq('chat_id', body.chatId)
          .ilike('sender_code', incomingSenderCode)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (lookupError) return sendError(res, lookupError.message, 500);
        existingProfileRows = rowsBySender || [];

        if (existingProfileRows.length === 0 && String(body.chatId).toLowerCase() === incomingSenderCode.toLowerCase()) {
          const { data: legacyRows, error: legacyError } = await supabase
            .from('profile_updates')
            .select('*')
            .eq('chat_id', body.chatId)
            .is('sender_code', null)
            .order('updated_at', { ascending: false })
            .limit(10);
          if (legacyError) return sendError(res, legacyError.message, 500);
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

        if (lookupError) return sendError(res, lookupError.message, 500);
        existingProfileRows = rowsWithoutSender || [];
      }

      const existingMerged = coalesceProfileRows(existingProfileRows);

      let incomingBanner = body.bannerUrl !== undefined ? (body.bannerUrl || null) : undefined;
      let incomingBio = body.bio !== undefined ? (body.bio || null) : undefined;
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
      const incomingNumericId = body.numericId !== undefined ? (body.numericId || null) : (body.numeric_id !== undefined ? (body.numeric_id || null) : undefined);
      const mergedNumericId = incomingNumericId !== undefined ? incomingNumericId : (existingMerged?.numeric_id ?? null);

      let effectiveBio = mergedBio || null;
      if (mergedBannerUrl) {
        effectiveBio = effectiveBio ? `${effectiveBio}\n<!--banner:${mergedBannerUrl}-->` : `<!--banner:${mergedBannerUrl}-->`;
      }

      const writePayload = {
        chat_id: body.chatId,
        nickname: mergedNickname,
        avatar_url: mergedAvatarUrl,
        banner_url: mergedBannerUrl,
        hide_profile_id: mergedHideProfileId,
        sender_code: mergedSenderCode,
        numeric_id: mergedNumericId,
        bio: effectiveBio,
        username: mergedUsername,
        birthday: mergedBirthday,
        updated_at: new Date().toISOString(),
      };

      let data = null;
      let error = null;

      if (existingProfileRows.length > 0 && existingProfileRows[0]?.id) {
        const targetId = existingProfileRows[0].id;
        const updateRes = await supabase
          .from('profile_updates')
          .update(writePayload)
          .eq('id', targetId)
          .select();
        data = updateRes.data;
        error = updateRes.error;

        if (error && stripMissingProfileColumns(writePayload, error)) {
          const retryRes = await supabase
            .from('profile_updates')
            .update(writePayload)
            .eq('id', targetId)
            .select();
          data = retryRes.data;
          error = retryRes.error;
        }

        if (!error && existingProfileRows.length > 1) {
          const duplicateIds = existingProfileRows.slice(1).map((r) => r.id).filter(Boolean);
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

        if (error && stripMissingProfileColumns(writePayload, error)) {
          const retryRes = await supabase
            .from('profile_updates')
            .insert(writePayload)
            .select();
          data = retryRes.data;
          error = retryRes.error;
        }
      }

      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/check-username' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const username = normalizeUsernameInput(query.username) || '';
      const excludeCode = query.excludeCode || null;
      if (!username || username === 'support') return sendJson(res, { available: false });

      const { data, error } = await supabase
        .from('profile_updates')
        .select('sender_code, chat_id')
        .ilike('username', username);

      if (error) return sendError(res, error.message, 500);
      if (!data || data.length === 0) return sendJson(res, { available: true });

      const ex = excludeCode ? String(excludeCode).toLowerCase() : null;
      const isTaken = data.some((row) => {
        if (!ex) return true;
        if (row.sender_code) return String(row.sender_code).toLowerCase() !== ex;
        if (row.chat_id) return String(row.chat_id).toLowerCase() !== ex;
        return true;
      });

      return sendJson(res, { available: !isTaken });
    }

    if (pathname === '/relay/resolve-username' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const username = normalizeUsernameInput(query.username) || '';
      if (!username) return sendJson(res, { user: null });

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .ilike('username', username)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) return sendError(res, error.message, 500);
      if (!data || data.length === 0) {
        if (username === 'support') {
          return sendJson(res, {
            user: {
              user_code: 'system_support',
              nickname: 'Техническая поддержка',
              avatar_url: SUPPORT_AVATAR_URL,
              banner_url: null,
              username: 'support',
              bio: 'Официальная служба технической поддержки мессенджера Orbita',
              updated_at: new Date().toISOString(),
            }
          });
        }
        return sendJson(res, { user: null });
      }

      const primaryOwner = String(data[0].sender_code || data[0].chat_id || '').toLowerCase();
      const ownerRows = data.filter((r) => String(r.sender_code || r.chat_id || '').toLowerCase() === primaryOwner);
      const merged = coalesceProfileRows(ownerRows);
      if (!merged) return sendJson(res, { user: null });

      return sendJson(res, {
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

    if (pathname === '/relay/search-users' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const rawQ = (query.q || '').replace(/^@+/, '').trim().replace(/[,()]/g, '');
      const q = rawQ.toLowerCase();
      const limit = Math.max(1, parseInt(query.limit, 10) || 20);
      if (!q) return sendJson(res, { users: [] });

      const filter = `username.ilike.${q}%,sender_code.ilike.${rawQ}`;

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .or(filter)
        .order('updated_at', { ascending: false })
        .limit(Math.max(limit * 3, 50));

      if (error) return sendError(res, error.message, 500);

      const grouped = new Map();
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

      const users = [];
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

      if (q.length >= 2 && ('support'.startsWith(q) || 'system_support'.includes(q))) {
        const hasSupport = users.some((u) => u.username === 'support' || u.user_code === 'system_support');
        if (!hasSupport) {
          users.unshift({
            user_code: 'system_support',
            nickname: 'Техническая поддержка',
            username: 'support',
            bio: 'Официальная служба технической поддержки мессенджера Orbita',
            avatar_url: SUPPORT_AVATAR_URL,
            updated_at: new Date().toISOString(),
          });
          (async () => {
            try {
              const { data: ex } = await supabase.from('profile_updates').select('id, avatar_url').eq('sender_code', 'system_support').maybeSingle();
              if (!ex) {
                await supabase.from('profile_updates').insert({
                  chat_id: 'system_support',
                  sender_code: 'system_support',
                  nickname: 'Техническая поддержка',
                  username: 'support',
                  bio: 'Официальная служба технической поддержки мессенджера Orbita',
                  avatar_url: SUPPORT_AVATAR_URL,
                  updated_at: new Date().toISOString(),
                });
              } else if (ex.avatar_url !== SUPPORT_AVATAR_URL) {
                await supabase.from('profile_updates').update({
                  avatar_url: SUPPORT_AVATAR_URL,
                  updated_at: new Date().toISOString(),
                }).eq('id', ex.id);
              }
            } catch {}
          })();
        }
      }

      return sendJson(res, { users });
    }

    if (pathname === '/relay/delete-message' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const { chatId, messageId, recipientId, senderId } = body;
      if (supabase && messageId) {
        try {
          const uuid = toUuid(messageId);
          if (uuid) {
            await supabase.from('messages').delete().eq('id', uuid);
          }
          await supabase.from('messages').delete().eq('id', messageId);
          await supabase.from('non_messages').delete().eq('id', messageId);
          if (uuid) {
            await supabase.from('non_messages').delete().eq('id', uuid);
          }
          if (chatId) {
            await supabase.from('non_messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
            await supabase.from('messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
          }
          if (recipientId && chatId) {
            const targets = Array.isArray(recipientId) ? recipientId : [recipientId];
            for (const rId of targets) {
              await supabase.from('non_messages').insert({
                id: `del_${messageId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                chat_id: chatId,
                sender_id: senderId || 'system',
                recipient_id: rId,
                ciphertext: JSON.stringify({
                  type: 'delete-message',
                  targetMessageId: messageId,
                  chatId,
                }),
                delivered: false,
              });
            }
          }
        } catch (err) {
          console.error('[relay/delete-message] error:', err);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/delete-chat' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const { chatId, recipientId, senderId } = body;
      if (supabase && chatId) {
        try {
          await supabase.from('messages').delete().eq('chat_id', chatId);
          await supabase.from('offline_handshakes').delete().eq('chat_id', chatId);
          await supabase.from('reactions').delete().eq('chat_id', chatId);
          await supabase.from('message_reactions').delete().eq('chat_id', chatId);
          await supabase.from('non_messages').delete().eq('chat_id', chatId);
          if (recipientId) {
            const targets = Array.isArray(recipientId) ? recipientId : [recipientId];
            for (const rId of targets) {
              if (!rId) continue;
              await supabase.from('non_messages').insert({
                id: `sys_del_${chatId}_${rId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                chat_id: chatId,
                sender_id: senderId || 'system',
                recipient_id: rId,
                ciphertext: JSON.stringify({
                  type: 'system',
                  action: 'delete-chat',
                  chatId,
                }),
                delivered: false,
              });
            }
          }
        } catch (err) {
          console.error('[relay/delete-chat] error:', err);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/clear-history' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const { chatId, recipientId, senderId } = body;
      if (supabase && chatId) {
        try {
          await supabase.from('messages').delete().eq('chat_id', chatId);
          await supabase.from('reactions').delete().eq('chat_id', chatId);
          await supabase.from('message_reactions').delete().eq('chat_id', chatId);
          if (recipientId) {
            const targets = Array.isArray(recipientId) ? recipientId : [recipientId];
            for (const rId of targets) {
              if (!rId) continue;
              await supabase.from('non_messages').insert({
                id: `sys_clear_${chatId}_${rId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                chat_id: chatId,
                sender_id: senderId || 'system',
                recipient_id: rId,
                ciphertext: JSON.stringify({
                  type: 'system',
                  action: 'clear-history',
                  chatId,
                }),
                delivered: false,
              });
            }
          }
        } catch (err) {
          console.error('[relay/clear-history] error:', err);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if ((pathname === '/relay/purge-server-message' || pathname === '/relay/delete-messages') && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const { chatId, messageIds, messageId } = body;
      const ids = Array.isArray(messageIds) ? messageIds : (messageId ? [messageId] : []);
      if (supabase && ids.length > 0) {
        try {
          for (const mid of ids) {
            const uuid = toUuid(mid);
            if (uuid) {
              await supabase.from('messages').delete().eq('id', uuid);
              await supabase.from('non_messages').delete().eq('id', uuid);
            }
            await supabase.from('messages').delete().eq('id', mid);
            await supabase.from('non_messages').delete().eq('id', mid);
            if (chatId) {
              await supabase.from('non_messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${mid}%`);
              await supabase.from('messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${mid}%`);
            }
          }
        } catch (err) {
          console.error('[relay/purge-server-message] error:', err);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/reaction' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { chatId, messageId, emoji, userId, action } = body;
      if (!chatId || !messageId || !emoji || !userId) {
        return sendError(res, 'Missing parameters', 400);
      }
      try {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('chat_id', chatId)
          .eq('message_id', messageId)
          .eq('emoji', emoji)
          .eq('user_id', userId);

        if (action === 'add') {
          await supabase
            .from('message_reactions')
            .insert({
              chat_id: chatId,
              message_id: messageId,
              emoji,
              user_id: userId,
            });
        }
        return sendJson(res, { status: 'ok' });
      } catch (err) {
        return sendError(res, err.message, 500);
      }
    }

    if (pathname === '/relay/reaction/delete' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { chatId, messageId, emoji } = body;
      if (!chatId) return sendError(res, 'Missing chatId', 400);
      try {
        let q = supabase.from('message_reactions').delete().eq('chat_id', chatId);
        if (messageId) q = q.eq('message_id', messageId);
        if (emoji) q = q.eq('emoji', emoji);
        await q;
        return sendJson(res, { status: 'ok' });
      } catch (err) {
        return sendError(res, err.message, 500);
      }
    }

    if (pathname === '/relay/profile' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const chatId = query.chatId;
      const excludeCode = query.excludeCode;
      if (!chatId) return sendError(res, 'Missing chatId parameter', 400);

      const safeChatId = String(chatId).replace(/[,()]/g, '');
      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .or(`chat_id.eq.${safeChatId},sender_code.ilike.${safeChatId}`)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) return sendError(res, error.message, 500);

      const ex = excludeCode ? String(excludeCode).toLowerCase() : null;
      const filtered = (data || []).filter((row) => {
        if (!ex) return true;
        return !row.sender_code || String(row.sender_code).toLowerCase() !== ex;
      });

      if (filtered.length === 0) return sendJson(res, { profile: null });

      let prioritized = filtered;
      if (!ex) {
        const directPublicRows = filtered.filter((r) =>
          (r.sender_code && String(r.sender_code).toLowerCase() === safeChatId.toLowerCase()) ||
          (String(r.chat_id || '').toLowerCase() === safeChatId.toLowerCase() && !r.sender_code)
        );
        if (directPublicRows.length > 0) {
          prioritized = directPublicRows;
        }
      }

      const newestSender = prioritized[0].sender_code ? String(prioritized[0].sender_code).toLowerCase() : null;
      const ownerRows = prioritized.filter((r) => {
        if (!newestSender) return !r.sender_code || String(r.chat_id || '').toLowerCase() === String(prioritized[0].chat_id || '').toLowerCase();
        return !r.sender_code || String(r.sender_code).toLowerCase() === newestSender;
      });

      const profile = coalesceProfileRows(ownerRows);
      return sendJson(res, { profile });
    }

    if (pathname === '/support/ticket' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { ticketNumber, userCode, senderNickname, messageText } = body;
      if (!ticketNumber || !messageText) return sendError(res, 'Missing ticket data', 400);

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

        if (updateErr) return sendError(res, updateErr.message, 500);

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

        await triggerPusherEvent('support-admin', 'ticket-updated', payload);
        await triggerAblyEvent('support-admin', 'ticket-updated', payload);
        await triggerPusherEvent('support-admin', 'new-ticket', payload);
        await triggerAblyEvent('support-admin', 'new-ticket', payload);
        await triggerAblyEvent('chat:support-admin', 'client-message', { type: 'ticket-updated', ...payload });

        return sendJson(res, { status: 'ok', ticketNumber, updated: true });
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
      if (error) return sendError(res, error.message, 500);

      await triggerPusherEvent('support-admin', 'new-ticket', ticketPayload);
      await triggerAblyEvent('support-admin', 'new-ticket', ticketPayload);
      await triggerAblyEvent('chat:support-admin', 'client-message', { type: 'new-ticket', ticket: ticketPayload, ...ticketPayload });

      return sendJson(res, { status: 'ok', ticketNumber });
    }

    if (pathname === '/support/tickets' && req.method === 'GET') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const userCode = query.userCode;
      if (!userCode) return sendError(res, 'Missing userCode', 400);

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_code', userCode)
        .order('created_at', { ascending: true });

      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { tickets: data || [] });
    }

    if (pathname === '/support/admin/check' && req.method === 'GET') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const userCode = query.userCode;
      if (!userCode) return sendError(res, 'Missing userCode', 400);

      const adminRecord = await checkAdminAuthorization(supabase, userCode);
      if (!adminRecord) {
        return sendJson(res, { isAdmin: false });
      }

      return sendJson(res, {
        isAdmin: true,
        role: adminRecord.role || 'admin',
        hasToken: Boolean(adminRecord.auth_token),
      });
    }

    if (pathname === '/support/admin/register-token' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { userCode, adminToken } = body;
      if (!userCode || !adminToken) return sendError(res, 'Missing parameters', 400);

      const adminRecord = await checkAdminAuthorization(supabase, userCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied', 403);
      }

      const { error: updateErr } = await supabase
        .from('support_admins')
        .update({ auth_token: adminToken })
        .eq('user_code', userCode);

      if (updateErr) return sendError(res, updateErr.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/support/admin/tickets' && req.method === 'GET') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const userCode = query.userCode;
      const adminToken = req.headers['x-admin-token'] || query.adminToken;
      if (!userCode) return sendError(res, 'Missing userCode', 400);

      const adminRecord = await checkAdminAuthorization(supabase, userCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied: not an authorized admin', 403);
      }

      if (adminRecord.auth_token) {
        if (!adminToken || adminRecord.auth_token !== adminToken) {
          return sendError(res, 'Access denied: invalid admin token', 403);
        }
      } else if (adminToken) {
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

      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { tickets: data || [] });
    }

    if (pathname === '/support/reply' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { ticketNumber, adminReply, adminCode } = body;
      const adminToken = req.headers['x-admin-token'] || body.adminToken;
      if (!ticketNumber || !adminReply || !adminCode) return sendError(res, 'Missing required fields', 400);

      const adminRecord = await checkAdminAuthorization(supabase, adminCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied: not an authorized admin', 403);
      }

      if (adminRecord.auth_token) {
        if (!adminToken || adminRecord.auth_token !== adminToken) {
          return sendError(res, 'Access denied: invalid admin token', 403);
        }
      } else if (adminToken) {
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

      if (error) return sendError(res, error.message, 500);

      if (existingTicket?.user_code) {
        const userPayload = {
          ticketNumber,
          ticket_number: ticketNumber,
          adminReply: updatedAdminReply,
          latestReply: adminReply,
          answeredAt,
        };
        await triggerPusherEvent(`user-${existingTicket.user_code}`, 'ticket-reply', userPayload);
        await triggerAblyEvent(`user-${existingTicket.user_code}`, 'ticket-reply', userPayload);
        await triggerAblyEvent(`chat:user-${existingTicket.user_code}`, 'client-message', {
          type: 'ticket-reply',
          ...userPayload,
        });
      }

      await triggerPusherEvent('support-admin', 'ticket-updated', {
        ticketNumber,
        adminReply,
        adminCode,
        status: 'answered',
        answeredAt,
      });
      await triggerAblyEvent('support-admin', 'ticket-updated', {
        ticketNumber,
        adminReply,
        adminCode,
        status: 'answered',
        answeredAt,
      });
      await triggerAblyEvent('chat:support-admin', 'client-message', {
        type: 'ticket-updated',
        ticketNumber,
        adminReply,
        adminCode,
        status: 'answered',
        answeredAt,
      });

      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/support/close' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { ticketNumber, adminCode } = body;
      const adminToken = req.headers['x-admin-token'] || body.adminToken;
      if (!ticketNumber || !adminCode) return sendError(res, 'Missing required fields', 400);

      const adminRecord = await checkAdminAuthorization(supabase, adminCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied: not an authorized admin', 403);
      }

      if (adminRecord.auth_token) {
        if (!adminToken || adminRecord.auth_token !== adminToken) {
          return sendError(res, 'Access denied: invalid admin token', 403);
        }
      } else if (adminToken) {
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

      if (error) return sendError(res, error.message, 500);

      const closedAt = new Date().toISOString();

      if (existingTicket?.user_code) {
        await triggerPusherEvent(`user-${existingTicket.user_code}`, 'ticket-closed', {
          ticketNumber,
          closedAt,
        });
        await triggerAblyEvent(`user-${existingTicket.user_code}`, 'ticket-closed', {
          ticketNumber,
          closedAt,
        });
        await triggerAblyEvent(`chat:user-${existingTicket.user_code}`, 'client-message', {
          type: 'ticket-closed',
          ticketNumber,
          closedAt,
        });
      }

      await triggerPusherEvent('support-admin', 'ticket-closed', {
        ticketNumber,
        closedAt,
      });
      await triggerAblyEvent('support-admin', 'ticket-closed', {
        ticketNumber,
        closedAt,
      });
      await triggerAblyEvent('chat:support-admin', 'client-message', {
        type: 'ticket-closed',
        ticketNumber,
        closedAt,
      });

      return sendJson(res, { status: 'ok', ticketNumber });
    }

    if (pathname === '/channels/featured' && req.method === 'GET') {
      const supabase = getChannelsSupabaseClient();
      let channels = [];
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
              username: c.username || null,
              description: c.description || '',
              avatarUrl: c.avatar_url || null,
              creatorId: c.creator_id || null,
              creatorNickname: c.creator_nickname,
              subscribersCount: c.subscribers_count || 1,
              isOfficial: c.is_official || false,
              createdAt: new Date(c.created_at).getTime(),
              updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.created_at).getTime(),
            }));
          }
        } catch {}
      }
      return sendJson(res, { channels });
    }

    if (pathname === '/channels/check-username' && req.method === 'GET') {
      const rawUsername = query.username ? String(query.username).trim() : '';
      const excludeChannelId = query.excludeChannelId ? String(query.excludeChannelId).trim() : '';
      if (!rawUsername) return sendError(res, 'Missing username parameter', 400);
      const normalizedUsername = rawUsername.replace(/^@+/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
        return sendError(res, 'Invalid username: must be 3-32 characters, only a-z, 0-9, _', 400);
      }
      const supabase = getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database unavailable', 503);
      try {
        let q = supabase.from('public_channels').select('id').ilike('username', normalizedUsername).limit(1);
        if (excludeChannelId) q = q.neq('id', excludeChannelId);
        const { data } = await q.maybeSingle();
        return sendJson(res, { available: !data, username: normalizedUsername });
      } catch (err) {
        return sendError(res, err?.message || 'DB error', 500);
      }
    }

    if (pathname === '/channels/get' && req.method === 'GET') {
      const channelId = query.channelId ? query.channelId.trim().replace(/^@+/, '') : '';
      if (!channelId) return sendError(res, 'Missing channelId parameter', 400);
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          let { data, error } = await supabase.from('public_channels').select('*').eq('id', channelId).maybeSingle();
          if (!data) {
            const byUsername = await supabase.from('public_channels').select('*').ilike('username', channelId).limit(1).maybeSingle();
            if (byUsername.data) {
              data = byUsername.data;
              error = null;
            }
          }
          if (!data) {
            const byName = await supabase.from('public_channels').select('*').ilike('name', channelId).limit(1).maybeSingle();
            if (byName.data) {
              data = byName.data;
              error = null;
            }
          }
          if (data && !error) {
            return sendJson(res, {
              channel: {
                id: data.id,
                name: data.name,
                username: data.username || null,
                description: data.description || '',
                avatarUrl: data.avatar_url || null,
                creatorId: data.creator_id || null,
                creatorNickname: data.creator_nickname,
                subscribersCount: data.subscribers_count || 1,
                isOfficial: data.is_official || false,
                createdAt: new Date(data.created_at).getTime(),
                updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : new Date(data.created_at).getTime(),
              },
            });
          }
        } catch {}
      }
      return sendError(res, 'Channel not found', 404);
    }

    function generateChannelId() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 36; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    }

    if (pathname === '/channels/create' && req.method === 'POST') {
      if (!body.name || !body.creatorNickname) return sendError(res, 'Missing name or creatorNickname', 400);
      const channelId = body.id || generateChannelId();
      const creatorId = toUuid(body.creatorId);
      const supabase = getChannelsSupabaseClient();
      const nowIso = new Date().toISOString();
      let channelUsername = null;
      if (body.username !== undefined) {
        const rawU = typeof body.username === 'string' ? body.username.replace(/^@+/, '').trim().toLowerCase() : null;
        if (rawU !== null && rawU !== '') {
          if (!/^[a-z0-9_]{3,32}$/.test(rawU)) return sendError(res, 'Invalid username: must be 3-32 characters, only a-z, 0-9, _', 400);
          channelUsername = rawU;
        }
      }
      if (supabase) {
        try {
          if (creatorId) {
            await supabase.from('profiles').upsert({
              id: creatorId,
              username: body.creatorNickname,
              avatar_url: body.avatarUrl || null,
              updated_at: nowIso,
            });
          }
          const channelPayload = {
            id: channelId,
            name: body.name,
            description: body.description || '',
            avatar_url: body.avatarUrl || null,
            creator_id: creatorId || null,
            creator_nickname: body.creatorNickname,
            subscribers_count: 1,
            is_official: false,
            created_at: nowIso,
            updated_at: nowIso,
          };
          if (channelUsername !== null) channelPayload.username = channelUsername;
          const { error: chErr } = await supabase.from('public_channels').upsert(channelPayload);
          if (chErr) {
            return sendError(res, chErr.message, 500);
          }
          if (creatorId) {
            try {
              await supabase.from('channel_members').upsert({
                channel_id: channelId,
                user_id: creatorId,
                role: 'owner',
                joined_at: nowIso,
              });
            } catch {}
          }
        } catch (err) {
          return sendError(res, err?.message || 'Failed to create channel', 500);
        }
      }
      return sendJson(res, {
        status: 'ok',
        channel: {
          id: channelId,
          name: body.name,
          username: channelUsername,
          description: body.description || '',
          avatarUrl: body.avatarUrl || null,
          creatorId: creatorId || undefined,
          creatorNickname: body.creatorNickname,
          subscribersCount: 1,
          isOfficial: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
    }

    if (pathname === '/channels/update' && req.method === 'POST') {
      const channelId = body.channelId || body.id;
      if (!channelId) return sendError(res, 'Missing channelId', 400);
      const supabase = getChannelsSupabaseClient();
      const userId = toUuid(body.userId);
      if (supabase) {
        try {
          const { data: chan } = await supabase.from('public_channels').select('creator_id').eq('id', channelId).maybeSingle();
          if (chan && chan.creator_id) {
            if (!userId) {
              return sendError(res, 'Forbidden: authentication required', 403);
            }
            if (chan.creator_id !== userId) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', channelId)
                .eq('user_id', userId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return sendError(res, 'Forbidden: insufficient channel permissions', 403);
              }
            }
          }
        } catch {}
      }
      let channelUsername = undefined;
      if (body.username !== undefined) {
        const rawU = typeof body.username === 'string' ? body.username.replace(/^@+/, '').trim().toLowerCase() : null;
        if (rawU !== null && rawU !== '') {
          if (!/^[a-z0-9_]{3,32}$/.test(rawU)) return sendError(res, 'Invalid username: must be 3-32 characters, only a-z, 0-9, _', 400);
          channelUsername = rawU;
        } else {
          channelUsername = null;
        }
      }
      const now = Date.now();
      const updateFields = {
        updated_at: new Date(now).toISOString(),
      };
      if (body.name !== undefined) updateFields.name = body.name.trim();
      if (body.description !== undefined) updateFields.description = body.description.trim();
      if (body.avatarUrl !== undefined) updateFields.avatar_url = body.avatarUrl;
      if (channelUsername !== undefined) updateFields.username = channelUsername;
      if (supabase) {
        try {
          await supabase.from('public_channels').update(updateFields).eq('id', channelId);
        } catch (err) {
          console.error('[channels/update] Supabase error:', err);
        }
      }
      const eventPayload = {
        channelId,
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl,
        username: channelUsername,
        updatedAt: now,
      };
      await triggerPusherEvent(`public-channel-${channelId}`, 'channel-updated', eventPayload);
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', { type: 'channel-updated', ...eventPayload });
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/channels/posts' && req.method === 'GET') {
      const channelId = query.channelId;
      if (!channelId) return sendError(res, 'Missing channelId parameter', 400);
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('channel_posts')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(100);
          if (!error && data) {
            const mapped = data.map((p) => ({
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
            return sendJson(res, { posts: mapped });
          }
        } catch {}
      }
      return sendJson(res, { posts: [] });
    }

    if (pathname === '/channels/post' && req.method === 'POST') {
      if (!body.channelId || !body.senderNickname) return sendError(res, 'Missing channelId or senderNickname', 400);
      const channelId = body.channelId;
      const senderId = toUuid(body.senderId);
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          const { data: chan } = await supabase.from('public_channels').select('creator_id, creator_nickname').eq('id', channelId).maybeSingle();
          if (chan && chan.creator_id) {
            if (!senderId) {
              return sendError(res, 'Forbidden: authentication required', 403);
            }
            if (chan.creator_id !== senderId) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', channelId)
                .eq('user_id', senderId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return sendError(res, 'Forbidden: only channel owner or admin can post', 403);
              }
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
          const { data: chanCheck } = await supabase.from('public_channels').select('id, creator_id').eq('id', body.channelId).maybeSingle();
          if (!chanCheck) {
            await supabase.from('public_channels').upsert({
              id: body.channelId,
              name: body.channelName || body.channelId,
              description: '',
              creator_id: senderId || null,
              creator_nickname: body.senderNickname,
              subscribers_count: 1,
              is_official: false,
              created_at: createdAt,
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
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${body.channelId}`, 'new-post', postRecord);
      await triggerAblyEvent(`chat:public-channel-${body.channelId}`, 'client-message', { type: 'channel-post', post: postRecord });
      return sendJson(res, { status: 'ok', post: postRecord });
    }

    if (pathname === '/channels/delete-post' && req.method === 'POST') {
      const { channelId, postId } = body;
      if (!channelId || !postId) return sendError(res, 'Missing channelId or postId', 400);
      const supabase = getChannelsSupabaseClient();
      const userId = toUuid(body.userId);
      if (supabase) {
        if (!userId) {
          return sendError(res, 'Forbidden: authentication required', 403);
        }
        try {
          const { data: postData } = await supabase.from('channel_posts').select('sender_id, sender_nickname').eq('id', postId).maybeSingle();
          const { data: chanData } = await supabase.from('public_channels').select('creator_id, creator_nickname').eq('id', channelId).maybeSingle();
          const isPostAuthor = Boolean(postData && postData.sender_id && postData.sender_id === userId);
          const isChanOwner = Boolean(chanData && chanData.creator_id && chanData.creator_id === userId);
          if (!isPostAuthor && !isChanOwner) {
            const { data: member } = await supabase
              .from('channel_members')
              .select('role')
              .eq('channel_id', channelId)
              .eq('user_id', userId)
              .maybeSingle();
            if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
              return sendError(res, 'Forbidden: insufficient delete permissions', 403);
            }
          }
        } catch {}
      }
      if (supabase) {
        try {
          await supabase.from('channel_posts').delete().eq('id', postId).eq('channel_id', channelId);
        } catch (err) {
          console.error('[channels/delete-post] Supabase error:', err);
        }
      }
      await triggerPusherEvent(`public-channel-${channelId}`, 'delete-post', { channelId, postId, targetMessageId: postId });
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', { type: 'delete-post', channelId, postId, targetMessageId: postId });
      return sendJson(res, { status: 'ok', channelId, postId });
    }

    if (pathname === '/channels/join' && req.method === 'POST') {
      if (!body.channelId) return sendError(res, 'Missing channelId parameter', 400);
      const channelId = body.channelId.trim();
      let newCount = 1;
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase.from('public_channels').select('subscribers_count').eq('id', channelId).maybeSingle();
          const current = Number(data?.subscribers_count) || 1;
          newCount = current + 1;
          await supabase.from('public_channels').update({ subscribers_count: newCount }).eq('id', channelId);
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${channelId}`, 'subscribers-updated', {
        channelId,
        subscribersCount: newCount,
        action: 'join',
        nickname: body.nickname || 'Unknown',
      });
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', {
        type: 'subscribers-updated',
        channelId,
        subscribersCount: newCount,
        action: 'join',
        nickname: body.nickname || 'Unknown',
      });
      return sendJson(res, { status: 'ok', subscribersCount: newCount });
    }

    if (pathname === '/channels/leave' && req.method === 'POST') {
      if (!body.channelId) return sendError(res, 'Missing channelId parameter', 400);
      const channelId = body.channelId.trim();
      let newCount = 1;
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase.from('public_channels').select('subscribers_count').eq('id', channelId).maybeSingle();
          const current = Number(data?.subscribers_count) || 1;
          newCount = Math.max(1, current - 1);
          await supabase.from('public_channels').update({ subscribers_count: newCount }).eq('id', channelId);
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${channelId}`, 'subscribers-updated', {
        channelId,
        subscribersCount: newCount,
        action: 'leave',
        nickname: body.nickname || 'Unknown',
      });
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', {
        type: 'subscribers-updated',
        channelId,
        subscribersCount: newCount,
        action: 'leave',
        nickname: body.nickname || 'Unknown',
      });
      return sendJson(res, { status: 'ok', subscribersCount: newCount });
    }

    if (pathname === '/channels/reaction' && req.method === 'POST') {
      if (!body.channelId || !body.postId || !body.emoji || !body.userId) {
        return sendError(res, 'Missing reaction parameters', 400);
      }
      const targetUserId = String(body.userId);
      const supabase = getChannelsSupabaseClient();
      let updatedReactions = {};
      if (supabase) {
        try {
          const { data } = await supabase.from('channel_posts').select('reactions').eq('id', body.postId).maybeSingle();
          let reactions = {};
          if (data?.reactions) {
            if (typeof data.reactions === 'string') {
              try { reactions = JSON.parse(data.reactions); } catch {}
            } else if (typeof data.reactions === 'object') {
              reactions = { ...data.reactions };
            }
          }
          const currentUsers = Array.isArray(reactions[body.emoji]) ? reactions[body.emoji] : [];
          const alreadyPresent = currentUsers.some(u => u === targetUserId || u.toLowerCase() === targetUserId.toLowerCase());
          if (body.action === 'add' || (!body.action && !alreadyPresent) || (body.action === 'toggle' && !alreadyPresent)) {
            reactions[body.emoji] = [...currentUsers.filter((u) => u !== targetUserId && u.toLowerCase() !== targetUserId.toLowerCase()), targetUserId];
          } else {
            const filtered = currentUsers.filter((u) => u !== targetUserId && u.toLowerCase() !== targetUserId.toLowerCase());
            if (filtered.length > 0) reactions[body.emoji] = filtered;
            else delete reactions[body.emoji];
          }
          await supabase.from('channel_posts').update({ reactions }).eq('id', body.postId);
          updatedReactions = reactions;
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${body.channelId}`, 'reaction-updated', {
        postId: body.postId,
        emoji: body.emoji,
        userId: body.userId,
        sessionId: body.sessionId,
        action: body.action || 'toggle',
        reactions: updatedReactions,
      });
      await triggerAblyEvent(`chat:public-channel-${body.channelId}`, 'client-message', {
        type: 'reaction-updated',
        postId: body.postId,
        emoji: body.emoji,
        userId: body.userId,
        sessionId: body.sessionId,
        action: body.action || 'toggle',
        reactions: updatedReactions,
      });
      return sendJson(res, { status: 'ok', reactions: updatedReactions });
    }

    if (pathname === '/groups/create' && req.method === 'POST') {
      if (!body.name || !body.creatorNickname) return sendError(res, 'Missing name or creatorNickname', 400);
      const groupId = body.id;
      const code = body.code;
      if (!groupId || !code) return sendError(res, 'Missing group id or code', 400);

      const supabase = getGroupsSupabaseClient();
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
          if (grpErr) {
            const fb = getFallbackGroupsSupabaseClient();
            const { error: fbErr } = await fb.from('groups').upsert({
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
            if (fbErr) return sendError(res, fbErr.message, 500);
          }

          const { error: memErr } = await supabase.from('group_members').upsert(initialMember);
          if (memErr) {
            return sendError(res, memErr.message, 500);
          }
        } catch (err) {
          return sendError(res, err?.message || 'Failed to create group', 500);
        }
      }

      return sendJson(res, {
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

    if (pathname === '/groups/my' && req.method === 'GET') {
      const userCode = query.userCode || query.user_code;
      const userId = query.userId || query.user_id;
      if (!userCode && !userId) return sendError(res, 'Missing userCode or userId', 400);

      const supabase = getGroupsSupabaseClient();
      if (!supabase) return sendError(res, 'Groups database not configured', 500);

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
          return sendJson(res, { groups: [] });
        }

        const groupIds = memberRows.map((r) => r.group_id);
        const { data: groups } = await supabase
          .from('groups')
          .select('*')
          .in('id', groupIds);

        const roleMap = {};
        memberRows.forEach((r) => { roleMap[r.group_id] = r.role; });

        const result = await Promise.all((groups || []).map(async (g) => {
          const { data: members } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', g.id);

          const formattedMembers = (members || []).map((m) => ({
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

        return sendJson(res, { groups: result });
      } catch (err) {
        return sendError(res, err.message || 'Failed to load groups', 500);
      }
    }

    if (pathname === '/groups/get' && req.method === 'GET') {
      const code = query.code || query.id;
      const id = query.id;
      if (!code && !id) return sendError(res, 'Missing group code or id', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const target = code || id;
          let queryBuilder = supabase.from('groups').select('*');
          if (code && id && code !== id) {
            queryBuilder = queryBuilder.or(`id.eq.${code},id.eq.${code.toUpperCase()},code.eq.${code},id.eq.${id},id.eq.${id.toUpperCase()},code.eq.${id}`);
          } else {
            queryBuilder = queryBuilder.or(`id.eq.${target},id.eq.${target.toUpperCase()},code.eq.${target},code.eq.${target.toUpperCase()}`);
          }
          const { data: groupData } = await queryBuilder.maybeSingle();
          if (groupData) {
            const { data: membersData } = await supabase
              .from('group_members')
              .select('*')
              .eq('group_id', groupData.id);

            const members = (membersData || []).map((m) => ({
              nickname: m.nickname,
              userCode: m.user_code,
              userId: m.user_code || m.user_id,
              role: m.role || 'member',
              joinedAt: new Date(m.joined_at || groupData.created_at).getTime(),
              lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
              avatarUrl: m.avatar_url || null,
            }));

            let inviteActive = true;
            let expiresAt = null;
            if (groupData.creator_id && typeof groupData.creator_id === 'string' && groupData.creator_id.startsWith('{')) {
              try {
                const parsed = JSON.parse(groupData.creator_id);
                if (parsed.active === false) inviteActive = false;
                if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
              } catch {}
            }

            return sendJson(res, {
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

      return sendError(res, 'Group not found', 404);
    }

    if (pathname === '/groups/join' && req.method === 'POST') {
      const { id, code, nickname, userCode, avatarUrl } = body;
      if (!nickname || (!id && !code)) return sendError(res, 'Missing required fields', 400);

      const supabase = getGroupsSupabaseClient();
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
          if (!groupData) return sendError(res, 'Group not found', 404);

          let inviteActive = true;
          let expiresAt = null;
          if (groupData.creator_id && typeof groupData.creator_id === 'string' && groupData.creator_id.startsWith('{')) {
            try {
              const meta = JSON.parse(groupData.creator_id);
              if (meta.active === false) inviteActive = false;
              if (typeof meta.expiresAt === 'number') expiresAt = meta.expiresAt;
            } catch {}
          }
          if (!inviteActive) {
            return sendError(res, 'INVITE_REVOKED', 403);
          }
          if (expiresAt && Date.now() > expiresAt) {
            return sendError(res, 'INVITE_EXPIRED', 410);
          }

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
            return sendError(res, 'GROUP_FULL', 400);
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

          const formattedMembers = (allMembers || []).map((m) => ({
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

          await triggerGroupPusherEvent(`presence-group-${groupData.id}`, 'member-joined', {
            groupId: groupData.id,
            nickname,
            userCode: memberUserCode,
            members: formattedMembers,
          });

          return sendJson(res, { status: 'ok', group: updatedGroup });
        } catch (err) {
          return sendError(res, err.message || 'Join failed', 500);
        }
      }

      return sendError(res, 'Groups database not configured', 500);
    }

    if (pathname === '/groups/leave' && req.method === 'POST') {
      const { groupId, nickname, userCode, userId } = body;
      const targetId = userCode || userId;
      if (!groupId || (!nickname && !targetId)) return sendError(res, 'Missing groupId or member identification', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const orConditions = [];
          if (userCode) orConditions.push(`user_code.eq.${userCode}`, `user_id.eq.${userCode}`);
          if (userId && userId !== userCode) orConditions.push(`user_code.eq.${userId}`, `user_id.eq.${userId}`);
          if (nickname) orConditions.push(`nickname.eq.${nickname}`);

          let deleteQuery = supabase.from('group_members').delete().eq('group_id', groupId);
          if (orConditions.length > 0) {
            deleteQuery = deleteQuery.or(orConditions.join(','));
          }
          await deleteQuery;

          const leavePayload = {
            type: 'member-left',
            groupId,
            nickname,
            userCode: userCode || targetId || nickname,
            userId: userId || targetId || null,
          };

          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'member-left', leavePayload);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-member-left', leavePayload);
          await triggerAblyEvent(`presence-group-${groupId}`, 'member-left', leavePayload);
          await triggerAblyEvent(groupId, 'member-left', leavePayload);

          return sendJson(res, { status: 'ok' });
        } catch {}
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/kick' && req.method === 'POST') {
      const { groupId, targetNickname, targetUserCode, targetUserId, adminNickname, adminUserCode, adminUserId } = body;
      const targetId = targetUserCode || targetUserId;
      if (!groupId || (!targetNickname && !targetId)) return sendError(res, 'Missing kick parameters', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const adminId = adminUserCode || adminUserId;
          if (adminId) {
            const { data: adminMember } = await supabase.from('group_members').select('role').eq('group_id', groupId).or(`user_code.eq.${adminId},user_id.eq.${adminId}`).maybeSingle();
            if (adminMember && adminMember.role !== 'owner' && adminMember.role !== 'admin') {
              return sendError(res, 'Forbidden: insufficient permissions to kick member', 403);
            }
          }
          const orConditions = [];
          if (targetUserCode) orConditions.push(`user_code.eq.${targetUserCode}`, `user_id.eq.${targetUserCode}`);
          if (targetUserId && targetUserId !== targetUserCode) orConditions.push(`user_code.eq.${targetUserId}`, `user_id.eq.${targetUserId}`);
          if (targetNickname) orConditions.push(`nickname.eq.${targetNickname}`);

          let deleteQuery = supabase.from('group_members').delete().eq('group_id', groupId);
          if (orConditions.length > 0) {
            deleteQuery = deleteQuery.or(orConditions.join(','));
          }
          await deleteQuery;

          const kickPayload = {
            type: 'kick',
            groupId,
            target: targetNickname,
            targetNickname,
            targetUserCode: targetUserCode || targetId || null,
            targetUserId: targetUserId || targetId || null,
            admin: adminNickname,
          };

          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'kick', kickPayload);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-kick', kickPayload);
          await triggerAblyEvent(`presence-group-${groupId}`, 'kick', kickPayload);
          await triggerAblyEvent(groupId, 'kick', kickPayload);

          return sendJson(res, { status: 'ok' });
        } catch {}
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/update' && req.method === 'POST') {
      const { groupId, name, description, avatarUrl } = body;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const updateData = { updated_at: new Date().toISOString() };
          if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
          if (typeof description === 'string') updateData.description = description.trim();
          if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
          if (typeof body.code === 'string' && body.code.trim()) updateData.code = body.code.trim();
          if (body.creator_id !== undefined) updateData.creator_id = body.creator_id;
          if (body.creatorId !== undefined) updateData.creator_id = body.creatorId;

          if (body.inviteActive !== undefined || body.inviteExpiresAt !== undefined) {
            try {
              const { data: curG } = await supabase.from('groups').select('creator_id').eq('id', groupId).maybeSingle();
              let parsedMeta = {};
              if (curG?.creator_id && typeof curG.creator_id === 'string' && curG.creator_id.startsWith('{')) {
                try { parsedMeta = JSON.parse(curG.creator_id); } catch {}
              }
              if (body.inviteActive !== undefined) parsedMeta.active = Boolean(body.inviteActive);
              if (body.inviteExpiresAt !== undefined) parsedMeta.expiresAt = body.inviteExpiresAt;
              updateData.creator_id = JSON.stringify(parsedMeta);
            } catch {}
          }

          await supabase.from('groups').update(updateData).eq('id', groupId);

          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-updated', {
            groupId,
            name: updateData.name,
            description: updateData.description,
            avatarUrl: (updateData.avatar_url && updateData.avatar_url.length < 5000) ? updateData.avatar_url : undefined,
            inviteActive: body.inviteActive,
            inviteExpiresAt: body.inviteExpiresAt,
          });

          return sendJson(res, { status: 'ok', group: updateData });
        } catch (err) {
          return sendError(res, err.message || 'Update failed', 500);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/delete' && req.method === 'POST') {
      const { groupId, requesterCode, requesterId } = body;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const { data: grp } = await supabase.from('groups').select('creator_id, creator_code').eq('id', groupId).maybeSingle();
          if (grp && (grp.creator_id || grp.creator_code)) {
            const isOwner = Boolean(
              (grp.creator_id && requesterId && grp.creator_id === requesterId) ||
              (grp.creator_code && requesterCode && grp.creator_code === requesterCode)
            );
            if (!isOwner) {
              return sendError(res, 'Forbidden: only group owner can delete group', 403);
            }
          }
          await supabase.from('groups').delete().eq('id', groupId);
          const deletePayload = { type: 'group-deleted', groupId };
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-deleted', deletePayload);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-group-deleted', deletePayload);
          await triggerAblyEvent(`presence-group-${groupId}`, 'group-deleted', deletePayload);
          await triggerAblyEvent(groupId, 'group-deleted', deletePayload);
          return sendJson(res, { status: 'ok' });
        } catch (err) {
          return sendError(res, err.message || 'Delete failed', 500);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/role' && req.method === 'POST') {
      const { groupId, targetNickname, targetUserCode, targetUserId, role, adminUserCode, adminUserId } = body;
      const targetId = targetUserCode || targetUserId;
      if (!groupId || (!targetNickname && !targetId) || !role) return sendError(res, 'Missing parameters', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const adminId = adminUserCode || adminUserId;
          if (adminId) {
            const { data: adminMember } = await supabase.from('group_members').select('role').eq('group_id', groupId).or(`user_code.eq.${adminId},user_id.eq.${adminId}`).maybeSingle();
            if (adminMember && adminMember.role !== 'owner' && adminMember.role !== 'admin') {
              return sendError(res, 'Forbidden: insufficient permissions to change roles', 403);
            }
          }
          const orConditions = [];
          if (targetUserCode) orConditions.push(`user_code.eq.${targetUserCode}`, `user_id.eq.${targetUserCode}`);
          if (targetUserId && targetUserId !== targetUserCode) orConditions.push(`user_code.eq.${targetUserId}`, `user_id.eq.${targetUserId}`);
          if (targetNickname) orConditions.push(`nickname.eq.${targetNickname}`);

          let roleQuery = supabase.from('group_members').update({ role }).eq('group_id', groupId);
          if (orConditions.length > 0) {
            roleQuery = roleQuery.or(orConditions.join(','));
          }
          await roleQuery;

          const rolePayload = {
            type: 'member-role-updated',
            groupId,
            targetNickname,
            targetUserCode: targetUserCode || targetId || null,
            targetUserId: targetUserId || targetId || null,
            role,
          };

          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'member-role-updated', rolePayload);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-member-role-updated', rolePayload);
          await triggerAblyEvent(`presence-group-${groupId}`, 'member-role-updated', rolePayload);
          await triggerAblyEvent(groupId, 'member-role-updated', rolePayload);

          return sendJson(res, { status: 'ok' });
        } catch (err) {
          return sendError(res, err.message || 'Role update failed', 500);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/notify-member' && req.method === 'POST') {
      const { targetUserCode, targetNickname, group } = body;
      if ((!targetUserCode && !targetNickname) || !group) return sendError(res, 'Missing targetUserCode or group', 400);

      const targets = Array.from(new Set([targetUserCode, targetNickname].filter(Boolean)));
      const allPusherServers = [...PUSHER_CONFIGS, ...GROUP_PUSHER_CONFIGS];
      let triggered = false;
      for (const tCode of targets) {
        for (const server of allPusherServers) {
          try {
            await triggerPusherEventOnServer(server, `private-handshake-${tCode}`, 'client-group-added', { group });
            triggered = true;
          } catch {}
        }
      }

      return sendJson(res, { status: triggered ? 'ok' : 'no_server' });
    }

    if (pathname === '/groups/messages' && req.method === 'GET') {
      const groupId = query.groupId || query.id;
      const limit = parseInt(query.limit || '100', 10);
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (!supabase) return sendError(res, 'Groups database not configured', 500);

      try {
        const { data, error } = await supabase
          .from('group_messages')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })
          .limit(limit);

        if (error) return sendError(res, error.message, 500);
        return sendJson(res, { status: 'ok', messages: data || [] });
      } catch (err) {
        return sendError(res, err.message, 500);
      }
    }

    if (pathname === '/groups/message' && req.method === 'POST') {
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
        return sendError(res, 'Missing required message parameters', 400);
      }

      const msgId = id || `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const supabase = getGroupsSupabaseClient();
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
        mediaKey: mediaKey || body.mediaKey || null,
        mediaItems: body.mediaItems || null,
        mime,
        duration,
        waveform,
        time: Date.now(),
      };

      await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-message', broadcastPayload);

      return sendJson(res, { status: 'ok', id: msgId });
    }

    if (pathname === '/groups/update-member' && req.method === 'POST') {
      const { userId, userCode, nickname, avatarUrl } = body;
      const supabase = getGroupsSupabaseClient();
      if (supabase && (userId || userCode)) {
        try {
          const updateObj = {};
          if (nickname) updateObj.nickname = nickname.trim();
          if (avatarUrl !== undefined) updateObj.avatar_url = avatarUrl;
          if (Object.keys(updateObj).length > 0) {
            if (userCode) {
              await supabase.from('group_members').update(updateObj).eq('user_code', userCode);
            }
            if (userId) {
              await supabase.from('group_members').update(updateObj).eq('user_id', userId);
            }
          }
        } catch {}
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/read' && req.method === 'POST') {
      const { groupId, messageId, readIds, time, sender, senderUserId, senderCode } = body;
      if (!groupId) {
        return sendError(res, 'Missing groupId', 400);
      }
      const idsToCheck = Array.from(new Set((readIds || (messageId ? [messageId] : [])).filter(Boolean)));
      const supabase = getGroupsSupabaseClient();
      let fullyReadIds = [];

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

            const isSender = (m) => {
              if (msg.sender_id && (m.user_id === msg.sender_id || m.user_code === msg.sender_id)) return true;
              if (msg.sender_code && (m.user_code === msg.sender_code || m.user_id === msg.sender_code)) return true;
              return m.nickname === msg.sender_nickname;
            };

            const otherMembers = totalMembers.filter((m) => !isSender(m));
            const existingReads = Array.isArray(msg.reactions?._read_by) ? msg.reactions._read_by : [];
            const updatedReads = Array.from(new Set([...existingReads, ...readerIds]));

            const allRead = otherMembers.length === 0 || otherMembers.every((m) =>
              updatedReads.some((r) => r === m.user_id || r === m.user_code || r === m.nickname)
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
        await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-message', readPayload);
      }

      return sendJson(res, { status: 'ok', fullyReadIds });
    }

    if (pathname === '/groups/calls/active' && req.method === 'GET') {
      const groupId = query.groupId || query.id;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('group_calls')
            .select('*')
            .eq('group_id', groupId)
            .eq('status', 'active')
            .maybeSingle();

          return sendJson(res, { status: 'ok', call: data || null });
        } catch {}
      }
      return sendJson(res, { status: 'ok', call: null });
    }

    if (pathname === '/groups/calls/start' && req.method === 'POST') {
      const { groupId, roomName, hostCode, hostNickname } = body;
      if (!groupId || !roomName) return sendError(res, 'Missing call parameters', 400);

      const supabase = getGroupsSupabaseClient();
      const nowIso = new Date().toISOString();
      if (supabase) {
        try {
          await supabase.from('group_calls').upsert({
            group_id: groupId,
            room_name: roomName,
            status: 'active',
            host_code: hostCode || hostNickname,
            host_nickname: hostNickname || 'Host',
            participants_count: 1,
            created_at: nowIso,
            updated_at: nowIso,
          });
        } catch {}
      }

      await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-call-started', {
        groupId,
        roomName,
        hostCode,
        hostNickname,
      });

      return sendJson(res, { status: 'ok', roomName });
    }

    if (pathname === '/groups/calls/end' && req.method === 'POST') {
      const { groupId } = body;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('group_calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('group_id', groupId);
        } catch {}
      }

      await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-call-ended', { groupId });

      return sendJson(res, { status: 'ok' });
    }

    if ((pathname === '/developers' || pathname === '/relay/developers') && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { data, error } = await supabase.from('developers').select('code');
      if (error) return sendError(res, error.message, 500);
      const codes = (data || []).map((d) => d.code).filter(Boolean);
      return sendJson(res, { developers: codes });
    }



    return sendError(res, 'Endpoint not found', 404);
  } catch (err) {
    return sendError(res, err?.message || 'Internal Server Error', 500);
  }
};
