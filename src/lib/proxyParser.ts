export type ProxyType = 'socks5' | 'socks5h' | 'socks4' | 'socks4a' | 'http' | 'https' | 'ss' | 'trojan';

export interface ParsedProxyProfile {
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  method?: string;
  sni?: string;
  allowInsecure?: boolean;
}

const VALID_PROXY_TYPES: ReadonlySet<string> = new Set([
  'socks5',
  'socks5h',
  'socks4',
  'socks4a',
  'http',
  'https',
  'ss',
  'trojan',
]);

function isValidPort(val: string | number): boolean {
  if (typeof val === 'string') {
    if (!/^\d+$/.test(val.trim())) return false;
    const n = Number(val.trim());
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  }
  return Number.isInteger(val) && val >= 1 && val <= 65535;
}

function isValidIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet < 0 || octet > 255) return false;
  }
  return true;
}

function isValidHost(host: string): boolean {
  const h = host.trim();
  if (!h || /[\s@/?#\\]/.test(h)) return false;
  if (h.includes(':')) {
    const colonCount = (h.match(/:/g) || []).length;
    return colonCount >= 2 && /^[0-9a-fA-F:]+(%[a-zA-Z0-9_.-]+)?$/.test(h);
  }
  if (/^[\d.]+$/.test(h)) {
    return isValidIpv4(h);
  }
  if (h.startsWith('.') || h.endsWith('.') || h.startsWith('-') || h.endsWith('-')) return false;
  return /^[a-zA-Z0-9._-]+$/.test(h) && /[a-zA-Z0-9]/.test(h);
}

function looksLikeIpOrDomain(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (isValidIpv4(v)) return true;
  if (v.toLowerCase() === 'localhost') return true;
  return v.includes('.') && isValidHost(v) && !/^\d+$/.test(v);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeBase64Utf8(input: string): string | null {
  try {
    const cleaned = input.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    if (!cleaned || !/^[A-Za-z0-9+/=]+$/.test(cleaned)) return null;
    const padLen = (4 - (cleaned.length % 4)) % 4;
    const padded = cleaned + '='.repeat(padLen);
    if (typeof atob === 'function') {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function encodeBase64UrlUtf8(input: string): string {
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(input, 'utf8').toString('base64url');
}

function formatHostForUri(host: string): string {
  const h = host.trim();
  if (h.includes(':') && !h.startsWith('[')) {
    return `[${h}]`;
  }
  return h;
}

function defaultProfileName(host: string, port: number): string {
  return `${formatHostForUri(host)}:${port}`;
}

function parseHostPort(raw: string): { host: string; port: number } | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('[')) {
    const m = s.match(/^\[([^\]]+)\]:(\d+)$/);
    if (!m) return null;
    if (!isValidHost(m[1]) || !isValidPort(m[2])) return null;
    return { host: m[1], port: Number(m[2]) };
  }
  const idx = s.lastIndexOf(':');
  if (idx <= 0) return null;
  const host = s.slice(0, idx);
  const portStr = s.slice(idx + 1);
  if (host.includes(':')) return null;
  if (!isValidHost(host) || !isValidPort(portStr)) return null;
  return { host, port: Number(portStr) };
}

function normalizeProxyType(raw?: string): ProxyType | null {
  if (!raw) return 'socks5';
  const lower = raw.trim().toLowerCase();
  if (lower === 'socks') return 'socks5';
  if (lower === 'shadowsocks') return 'ss';
  if (VALID_PROXY_TYPES.has(lower)) return lower as ProxyType;
  return null;
}

function splitHashRemark(input: string): { body: string; remark: string } {
  const hashIdx = input.indexOf('#');
  if (hashIdx < 0) return { body: input, remark: '' };
  return {
    body: input.slice(0, hashIdx),
    remark: safeDecode(input.slice(hashIdx + 1)).trim(),
  };
}

function parseJsonProxy(trimmed: string): ParsedProxyProfile | null {
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rawHost = String(parsed.host ?? parsed.server ?? parsed.address ?? parsed.ip ?? '').trim();
    const rawPort = parsed.port ?? parsed.server_port;
    const port = typeof rawPort === 'string' ? Number(rawPort.trim()) : Number(rawPort);
    if (!isValidHost(rawHost) || !isValidPort(port)) return null;
    const type = normalizeProxyType(parsed.type ?? parsed.protocol ?? parsed.scheme);
    if (!type) return null;
    const username = parsed.username ?? parsed.user;
    const password = parsed.password ?? parsed.pass;
    const method = parsed.method ?? parsed.cipher;
    const sni = parsed.sni ?? parsed.servername ?? parsed.peer;
    const rawInsecure = parsed.allowInsecure ?? parsed.insecure ?? parsed.skipCertVerify;
    const allowInsecure = rawInsecure === true || rawInsecure === 1 || rawInsecure === '1' || rawInsecure === 'true';
    const rawName = String(parsed.name ?? parsed.remark ?? parsed.remarks ?? parsed.tag ?? parsed.ps ?? '').trim();
    return {
      name: rawName || defaultProfileName(rawHost, port),
      type,
      host: rawHost,
      port,
      username: username ? String(username) : undefined,
      password: password !== undefined && password !== null && String(password) !== '' ? String(password) : undefined,
      method: method ? String(method) : undefined,
      sni: sni ? String(sni) : undefined,
      allowInsecure: allowInsecure || undefined,
    };
  } catch {
    return null;
  }
}

function parseTelegramLink(trimmed: string): ParsedProxyProfile | null {
  const { body, remark } = splitHashRemark(trimmed);
  if (/^(tg:\/\/proxy|https?:\/\/t\.me\/proxy|t\.me\/proxy|https?:\/\/telegram\.me\/proxy|telegram\.me\/proxy)/i.test(body)) {
    return null;
  }
  const tgMatch = body.match(/^(?:tg:\/\/socks|(?:https?:\/\/)?(?:t\.me|telegram\.me)\/socks)\?(.*)$/i);
  if (!tgMatch) return null;
  const params = new URLSearchParams(tgMatch[1]);
  const server = (params.get('server') || '').trim();
  const portStr = (params.get('port') || '').trim();
  if (!isValidHost(server) || !isValidPort(portStr)) return null;
  const port = Number(portStr);
  const username = params.get('user') || params.get('username') || undefined;
  const password = params.get('pass') || params.get('password') || undefined;
  const nameParam = (params.get('name') || params.get('remark') || '').trim();
  return {
    name: remark || nameParam || defaultProfileName(server, port),
    type: 'socks5',
    host: server,
    port,
    username: username || undefined,
    password: password !== undefined && password !== '' ? password : undefined,
  };
}

function parseShadowsocksUri(trimmed: string): ParsedProxyProfile | null {
  const { body, remark } = splitHashRemark(trimmed);
  const withoutScheme = body.slice(5);
  const qIdx = withoutScheme.indexOf('?');
  const main = (qIdx >= 0 ? withoutScheme.slice(0, qIdx) : withoutScheme).replace(/\/+$/, '');
  if (!main) return null;

  const atIdx = main.lastIndexOf('@');
  if (atIdx >= 0) {
    const userinfo = main.slice(0, atIdx);
    const hostPortRaw = main.slice(atIdx + 1);
    const hp = parseHostPort(hostPortRaw);
    if (!hp) return null;

    let method = '';
    let password = '';
    if (userinfo.includes(':')) {
      const cIdx = userinfo.indexOf(':');
      method = safeDecode(userinfo.slice(0, cIdx));
      password = safeDecode(userinfo.slice(cIdx + 1));
    } else {
      const decoded = decodeBase64Utf8(userinfo);
      if (!decoded || !decoded.includes(':')) return null;
      const cIdx = decoded.indexOf(':');
      method = decoded.slice(0, cIdx);
      password = decoded.slice(cIdx + 1);
    }
    if (!method.trim()) return null;
    return {
      name: remark || defaultProfileName(hp.host, hp.port),
      type: 'ss',
      host: hp.host,
      port: hp.port,
      method: method.trim(),
      password,
    };
  }

  const decoded = decodeBase64Utf8(main);
  if (!decoded) return null;
  const decAtIdx = decoded.lastIndexOf('@');
  if (decAtIdx <= 0) return null;
  const creds = decoded.slice(0, decAtIdx);
  const hostPortRaw = decoded.slice(decAtIdx + 1);
  const hp = parseHostPort(hostPortRaw);
  if (!hp) return null;
  const cIdx = creds.indexOf(':');
  if (cIdx <= 0) return null;
  const method = creds.slice(0, cIdx).trim();
  const password = creds.slice(cIdx + 1);
  if (!method) return null;
  return {
    name: remark || defaultProfileName(hp.host, hp.port),
    type: 'ss',
    host: hp.host,
    port: hp.port,
    method,
    password,
  };
}

function parseTrojanUri(trimmed: string): ParsedProxyProfile | null {
  const { body, remark } = splitHashRemark(trimmed);
  const withoutScheme = body.slice(9);
  const qIdx = withoutScheme.indexOf('?');
  const slashIdx = withoutScheme.indexOf('/');
  const splitIdx = qIdx >= 0 && slashIdx >= 0 ? Math.min(qIdx, slashIdx) : Math.max(qIdx, slashIdx);
  const authority = splitIdx >= 0 ? withoutScheme.slice(0, splitIdx) : withoutScheme;
  const query = qIdx >= 0 ? withoutScheme.slice(qIdx + 1) : '';

  const atIdx = authority.lastIndexOf('@');
  if (atIdx < 0) return null;
  const password = safeDecode(authority.slice(0, atIdx));
  const hp = parseHostPort(authority.slice(atIdx + 1));
  if (!hp) return null;

  const params = new URLSearchParams(query);
  const sni = (params.get('sni') || params.get('peer') || '').trim() || undefined;
  const allowRaw = params.get('allowInsecure') || params.get('insecure');
  const allowInsecure = allowRaw === '1' || allowRaw === 'true' ? true : undefined;

  return {
    name: remark || defaultProfileName(hp.host, hp.port),
    type: 'trojan',
    host: hp.host,
    port: hp.port,
    password: password || undefined,
    sni,
    allowInsecure,
  };
}

function parseStandardSchemeUri(trimmed: string): ParsedProxyProfile | null {
  const schemeMatch = trimmed.match(/^(socks5h?|socks4a?|socks|https?):\/\/(.*)$/i);
  if (!schemeMatch) return null;

  const rawScheme = schemeMatch[1].toLowerCase();
  const type: ProxyType = rawScheme === 'socks' ? 'socks5' : (rawScheme as ProxyType);
  const { body, remark } = splitHashRemark(schemeMatch[2]);

  const qIdx = body.indexOf('?');
  const slashIdx = body.indexOf('/');
  const cut = qIdx >= 0 && slashIdx >= 0 ? Math.min(qIdx, slashIdx) : Math.max(qIdx, slashIdx);
  const authority = cut >= 0 ? body.slice(0, cut) : body;
  const query = qIdx >= 0 ? body.slice(qIdx + 1) : '';
  const params = new URLSearchParams(query);

  let hp: { host: string; port: number } | null = null;
  let username: string | undefined;
  let password: string | undefined;

  const atIdx = authority.lastIndexOf('@');
  if (atIdx >= 0) {
    const creds = authority.slice(0, atIdx);
    hp = parseHostPort(authority.slice(atIdx + 1));
    if (!hp) return null;
    const colonIdx = creds.indexOf(':');
    if (colonIdx >= 0) {
      username = safeDecode(creds.slice(0, colonIdx)) || undefined;
      const passVal = safeDecode(creds.slice(colonIdx + 1));
      password = passVal !== '' ? passVal : undefined;
    } else {
      username = safeDecode(creds) || undefined;
    }
  } else {
    hp = parseHostPort(authority);
    if (!hp) {
      if (authority.startsWith('[')) {
        const ipv6Match = authority.match(/^\[([^\]]+)\]:(\d+):([^:]*):(.*)$/);
        if (ipv6Match && isValidHost(ipv6Match[1]) && isValidPort(ipv6Match[2])) {
          hp = { host: ipv6Match[1], port: Number(ipv6Match[2]) };
          username = safeDecode(ipv6Match[3]) || undefined;
          const passVal = safeDecode(ipv6Match[4]);
          password = passVal !== '' ? passVal : undefined;
        }
      } else {
        const parts = authority.split(':');
        if (parts.length >= 4 && isValidHost(parts[0]) && isValidPort(parts[1])) {
          hp = { host: parts[0], port: Number(parts[1]) };
          username = safeDecode(parts[2]) || undefined;
          const passVal = safeDecode(parts.slice(3).join(':'));
          password = passVal !== '' ? passVal : undefined;
        } else if (parts.length === 3 && isValidHost(parts[0]) && isValidPort(parts[1])) {
          hp = { host: parts[0], port: Number(parts[1]) };
          username = safeDecode(parts[2]) || undefined;
        }
      }
    }
  }

  if (!hp) return null;

  if (!username) {
    const qUser = params.get('user') || params.get('username');
    if (qUser) username = qUser;
  }
  if (password === undefined) {
    const qPass = params.get('pass') || params.get('password');
    if (qPass) password = qPass;
  }

  const sni = type === 'https' ? (params.get('sni') || params.get('peer') || '').trim() || undefined : undefined;
  const allowRaw = type === 'https' ? params.get('allowInsecure') || params.get('insecure') : null;
  const allowInsecure = allowRaw === '1' || allowRaw === 'true' ? true : undefined;
  const qName = (params.get('remark') || params.get('name') || '').trim();

  return {
    name: remark || qName || defaultProfileName(hp.host, hp.port),
    type,
    host: hp.host,
    port: hp.port,
    username,
    password,
    sni,
    allowInsecure,
  };
}

function parseRawProxy(trimmed: string): ParsedProxyProfile | null {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return null;
  }

  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx >= 0 && !/\s/.test(trimmed)) {
    const creds = trimmed.slice(0, atIdx);
    const hp = parseHostPort(trimmed.slice(atIdx + 1));
    if (!hp) return null;
    const cIdx = creds.indexOf(':');
    const username = cIdx >= 0 ? safeDecode(creds.slice(0, cIdx)) : safeDecode(creds);
    const password = cIdx >= 0 ? safeDecode(creds.slice(cIdx + 1)) : undefined;
    return {
      name: defaultProfileName(hp.host, hp.port),
      type: 'socks5',
      host: hp.host,
      port: hp.port,
      username: username || undefined,
      password: password !== undefined && password !== '' ? password : undefined,
    };
  }

  if (/\s/.test(trimmed)) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.length <= 4 && isValidHost(tokens[0]) && isValidPort(tokens[1])) {
      const port = Number(tokens[1]);
      return {
        name: defaultProfileName(tokens[0], port),
        type: 'socks5',
        host: tokens[0],
        port,
        username: tokens[2] || undefined,
        password: tokens[3] || undefined,
      };
    }
    return null;
  }

  if (trimmed.startsWith('[')) {
    const m = trimmed.match(/^\[([^\]]+)\]:(\d+)(?::([^:]*)(?::(.*))?)?$/);
    if (!m || !isValidHost(m[1]) || !isValidPort(m[2])) return null;
    const port = Number(m[2]);
    return {
      name: defaultProfileName(m[1], port),
      type: 'socks5',
      host: m[1],
      port,
      username: m[3] || undefined,
      password: m[4] !== undefined && m[4] !== '' ? m[4] : undefined,
    };
  }

  const parts = trimmed.split(':');
  if (parts.length === 2) {
    if (!isValidHost(parts[0]) || !isValidPort(parts[1])) return null;
    const port = Number(parts[1]);
    return {
      name: defaultProfileName(parts[0], port),
      type: 'socks5',
      host: parts[0],
      port,
    };
  }

  if (parts.length === 3) {
    if (!isValidHost(parts[0]) || !isValidPort(parts[1])) return null;
    const port = Number(parts[1]);
    return {
      name: defaultProfileName(parts[0], port),
      type: 'socks5',
      host: parts[0],
      port,
      username: parts[2] || undefined,
    };
  }

  if (parts.length === 4) {
    const isUserPassHostPort =
      isValidHost(parts[2]) &&
      isValidPort(parts[3]) &&
      (!isValidPort(parts[1]) || (looksLikeIpOrDomain(parts[2]) && !looksLikeIpOrDomain(parts[0])));

    if (isUserPassHostPort) {
      const port = Number(parts[3]);
      return {
        name: defaultProfileName(parts[2], port),
        type: 'socks5',
        host: parts[2],
        port,
        username: parts[0] || undefined,
        password: parts[1] || undefined,
      };
    }

    if (isValidHost(parts[0]) && isValidPort(parts[1])) {
      const port = Number(parts[1]);
      return {
        name: defaultProfileName(parts[0], port),
        type: 'socks5',
        host: parts[0],
        port,
        username: parts[2] || undefined,
        password: parts[3] || undefined,
      };
    }
    return null;
  }

  if (parts.length > 4 && isValidHost(parts[0]) && isValidPort(parts[1])) {
    const port = Number(parts[1]);
    return {
      name: defaultProfileName(parts[0], port),
      type: 'socks5',
      host: parts[0],
      port,
      username: parts[2] || undefined,
      password: parts.slice(3).join(':') || undefined,
    };
  }

  return null;
}

export function parseProxyInput(input: string): ParsedProxyProfile | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return parseJsonProxy(trimmed);
  }

  if (/^(tg:\/\/|(?:https?:\/\/)?(?:t\.me|telegram\.me)\/)/i.test(trimmed)) {
    return parseTelegramLink(trimmed);
  }

  if (/^ss:\/\//i.test(trimmed)) {
    return parseShadowsocksUri(trimmed);
  }

  if (/^trojan:\/\//i.test(trimmed)) {
    return parseTrojanUri(trimmed);
  }

  if (/^(socks5h?|socks4a?|socks|https?):\/\//i.test(trimmed)) {
    return parseStandardSchemeUri(trimmed);
  }

  return parseRawProxy(trimmed);
}

function dedupeKey(proxy: ParsedProxyProfile): string {
  return [
    proxy.type,
    proxy.host.toLowerCase(),
    proxy.port,
    proxy.username || '',
    proxy.password || '',
    proxy.method || '',
    proxy.sni || '',
  ].join('|');
}

export function parseProxyList(input: string): ParsedProxyProfile[] {
  const results: ParsedProxyProfile[] = [];
  const seen = new Set<string>();
  const lines = input.split(/\r?\n/);

  const pushIfValid = (parsed: ParsedProxyProfile | null) => {
    if (!parsed) return;
    const key = dedupeKey(parsed);
    if (!seen.has(key)) {
      seen.add(key);
      results.push(parsed);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('{') && line.endsWith('}')) {
      pushIfValid(parseProxyInput(line));
      continue;
    }

    if (/[,;]/.test(line)) {
      const segments = line.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      const parsedSegments = segments.map((seg) => parseProxyInput(seg));
      const validCount = parsedSegments.filter(Boolean).length;
      if (validCount >= 2) {
        for (const p of parsedSegments) {
          pushIfValid(p);
        }
        continue;
      }
    }

    pushIfValid(parseProxyInput(line));
  }

  return results;
}

export function formatProxyUri(proxy: ParsedProxyProfile): string {
  const hostStr = formatHostForUri(proxy.host);
  const defaultName = defaultProfileName(proxy.host, proxy.port);
  const hasCustomName = Boolean(proxy.name && proxy.name.trim() && proxy.name.trim() !== defaultName);
  const remark = hasCustomName ? `#${encodeURIComponent(proxy.name.trim())}` : '';

  if (proxy.type === 'ss') {
    const method = proxy.method || 'aes-256-gcm';
    const password = proxy.password || '';
    const userinfo = encodeBase64UrlUtf8(`${method}:${password}`);
    return `ss://${userinfo}@${hostStr}:${proxy.port}${remark}`;
  }

  if (proxy.type === 'trojan') {
    const password = encodeURIComponent(proxy.password || '');
    const params = new URLSearchParams();
    if (proxy.sni) params.set('sni', proxy.sni);
    if (proxy.allowInsecure) params.set('allowInsecure', '1');
    const qs = params.toString();
    return `trojan://${password}@${hostStr}:${proxy.port}${qs ? `?${qs}` : ''}${remark}`;
  }

  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${proxy.password ? `:${encodeURIComponent(proxy.password)}` : ''}@`
    : '';
  const params = new URLSearchParams();
  if (proxy.type === 'https') {
    if (proxy.sni) params.set('sni', proxy.sni);
    if (proxy.allowInsecure) params.set('allowInsecure', '1');
  }
  const qs = params.toString();
  return `${proxy.type}://${auth}${hostStr}:${proxy.port}${qs ? `?${qs}` : ''}${remark}`;
}

export function formatTelegramSocksLink(proxy: ParsedProxyProfile): string | null {
  if (proxy.type !== 'socks5' && proxy.type !== 'socks5h') {
    return null;
  }
  const params = new URLSearchParams();
  params.set('server', proxy.host);
  params.set('port', String(proxy.port));
  if (proxy.username) params.set('user', proxy.username);
  if (proxy.password) params.set('pass', proxy.password);
  return `https://t.me/socks?${params.toString()}`;
}
