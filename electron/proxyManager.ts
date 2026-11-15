import * as net from 'net';
import * as tls from 'tls';
import * as crypto from 'crypto';
import * as dns from 'dns';
import { Duplex } from 'stream';

export type ProxyProtocol =
  | 'socks5'
  | 'socks5h'
  | 'socks4'
  | 'socks4a'
  | 'http'
  | 'https'
  | 'ss'
  | 'trojan';

export interface ProxyConfigPayload {
  host: string;
  port: number;
  type?: string;
  username?: string;
  password?: string;
  method?: string;
  sni?: string;
  allowInsecure?: boolean;
  proxyCalls?: boolean;
}

export interface ProxyTestResult {
  success: boolean;
  ping?: number;
  error?: string;
}

export interface ProxyVerifyResult {
  success: boolean;
  exitIp?: string;
  ping?: number;
  error?: string;
}

export interface RelayStartResult {
  port: number;
}

const MAX_SS_PAYLOAD = 0x3fff;
const MAX_HTTP_HEADER_BYTES = 65536;

interface CipherSpec {
  nodeCipher: string;
  keyLen: number;
  saltLen: number;
  nonceLen: number;
  tagLen: number;
}

const SS_CIPHERS: Record<string, CipherSpec> = {
  'aes-256-gcm': {
    nodeCipher: 'aes-256-gcm',
    keyLen: 32,
    saltLen: 32,
    nonceLen: 12,
    tagLen: 16,
  },
  'aes-128-gcm': {
    nodeCipher: 'aes-128-gcm',
    keyLen: 16,
    saltLen: 16,
    nonceLen: 12,
    tagLen: 16,
  },
  'chacha20-ietf-poly1305': {
    nodeCipher: 'chacha20-poly1305',
    keyLen: 32,
    saltLen: 32,
    nonceLen: 12,
    tagLen: 16,
  },
  'chacha20-poly1305': {
    nodeCipher: 'chacha20-poly1305',
    keyLen: 32,
    saltLen: 32,
    nonceLen: 12,
    tagLen: 16,
  },
};

export function normalizeProxyType(type?: string): ProxyProtocol {
  const raw = (type || 'socks5').trim().toLowerCase();
  if (raw === 'socks' || raw === 'socks5') return 'socks5';
  if (raw === 'socks5h') return 'socks5h';
  if (raw === 'socks4') return 'socks4';
  if (raw === 'socks4a') return 'socks4a';
  if (raw === 'http') return 'http';
  if (raw === 'https') return 'https';
  if (raw === 'ss' || raw === 'shadowsocks') return 'ss';
  if (raw === 'trojan') return 'trojan';
  return 'socks5';
}

function cleanHost(host: string): string {
  const trimmed = (host || '').trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatHostForAuthority(host: string): string {
  const stripped = cleanHost(host);
  return net.isIPv6(stripped) ? `[${stripped}]` : stripped;
}

function validateConfig(config: ProxyConfigPayload): { host: string; port: number; type: ProxyProtocol } {
  const host = cleanHost(config?.host || '');
  const port = Number(config?.port);
  if (!host) {
    throw new Error('Proxy host is required');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Proxy port must be between 1 and 65535');
  }
  return {
    host,
    port,
    type: normalizeProxyType(config.type),
  };
}

function parseIPv6ToBuffer(ip: string): Buffer {
  const zoneIdx = ip.indexOf('%');
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;
  const halves = clean.split('::');
  if (halves.length > 2) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  const parseGroups = (part: string): number[] => {
    if (!part) return [];
    const tokens = part.split(':');
    const groups: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.includes('.') && i === tokens.length - 1) {
        const octets = token.split('.').map((n) => Number(n));
        if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
          throw new Error(`Invalid IPv4-mapped IPv6 address: ${ip}`);
        }
        groups.push((octets[0] << 8) | octets[1]);
        groups.push((octets[2] << 8) | octets[3]);
      } else {
        const val = parseInt(token, 16);
        if (Number.isNaN(val) || val < 0 || val > 0xffff) {
          throw new Error(`Invalid IPv6 group: ${token}`);
        }
        groups.push(val);
      }
    }
    return groups;
  };

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : [];
  const missing = 8 - (left.length + right.length);
  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    throw new Error(`Invalid IPv6 address length: ${ip}`);
  }

  const full = [...left, ...new Array(missing).fill(0), ...right];
  const out = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    out.writeUInt16BE(full[i], i * 2);
  }
  return out;
}

export function encodeSocks5Address(host: string, port: number): Buffer {
  const target = cleanHost(host);
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port, 0);

  const ipVer = net.isIP(target);
  if (ipVer === 4) {
    const octets = target.split('.').map((n) => Number(n));
    return Buffer.concat([Buffer.from([0x01, ...octets]), portBuf]);
  }
  if (ipVer === 6) {
    return Buffer.concat([Buffer.from([0x04]), parseIPv6ToBuffer(target), portBuf]);
  }

  const domainBuf = Buffer.from(target, 'utf8');
  if (domainBuf.length === 0 || domainBuf.length > 255) {
    throw new Error(`Invalid domain length for SOCKS5: ${target}`);
  }
  return Buffer.concat([Buffer.from([0x03, domainBuf.length]), domainBuf, portBuf]);
}

class SocketReader {
  private buffer: Buffer = Buffer.alloc(0);
  private ended = false;
  private err: Error | null = null;
  private waiter: (() => void) | null = null;
  private detached = false;

  constructor(private readonly socket: Duplex) {
    this.onReadable = this.onReadable.bind(this);
    this.onEnd = this.onEnd.bind(this);
    this.onError = this.onError.bind(this);
    this.onClose = this.onClose.bind(this);

    socket.on('readable', this.onReadable);
    socket.on('end', this.onEnd);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
    this.drainAvailable();
  }

  private drainAvailable(): void {
    if (this.detached) return;
    while (true) {
      const chunk = this.socket.read() as Buffer | null;
      if (!chunk || chunk.length === 0) break;
      this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    }
  }

  private wake(): void {
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve();
    }
  }

  private onReadable(): void {
    this.drainAvailable();
    if (this.buffer.length > 0) {
      this.wake();
    }
  }

  private onEnd(): void {
    this.ended = true;
    this.wake();
  }

  private onClose(): void {
    this.ended = true;
    this.wake();
  }

  private onError(err: Error): void {
    this.err = err;
    this.wake();
  }

  private waitForMore(): Promise<void> {
    this.drainAvailable();
    if (this.buffer.length > 0 || this.ended || this.err) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  async readExact(length: number): Promise<Buffer> {
    while (this.buffer.length < length) {
      if (this.err) throw this.err;
      if (this.ended) throw new Error('Unexpected EOF from socket');
      await this.waitForMore();
    }
    const out = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return out;
  }

  async readByte(): Promise<number> {
    const b = await this.readExact(1);
    return b[0];
  }

  async peekByte(): Promise<number> {
    while (this.buffer.length < 1) {
      if (this.err) throw this.err;
      if (this.ended) throw new Error('Unexpected EOF from socket');
      await this.waitForMore();
    }
    return this.buffer[0];
  }

  async readUntil(delimiter: Buffer, maxBytes: number): Promise<Buffer> {
    let searchFrom = 0;
    while (true) {
      const idx = this.buffer.indexOf(delimiter, searchFrom);
      if (idx !== -1) {
        const endIdx = idx + delimiter.length;
        const out = this.buffer.subarray(0, endIdx);
        this.buffer = this.buffer.subarray(endIdx);
        return out;
      }
      if (this.buffer.length > maxBytes) {
        throw new Error('Header exceeded maximum allowed size');
      }
      if (this.err) throw this.err;
      if (this.ended) throw new Error('Unexpected EOF before delimiter');
      searchFrom = Math.max(0, this.buffer.length - delimiter.length);
      await this.waitForMore();
    }
  }

  detachAndUnshift(): Buffer {
    if (this.detached) return Buffer.alloc(0);
    this.detached = true;
    this.socket.removeListener('readable', this.onReadable);
    this.socket.removeListener('end', this.onEnd);
    this.socket.removeListener('error', this.onError);
    this.socket.removeListener('close', this.onClose);
    const leftover = this.buffer;
    this.buffer = Buffer.alloc(0);
    if (leftover.length > 0) {
      this.socket.unshift(leftover);
    }
    return leftover;
  }

  detachConsumeLeftover(): Buffer {
    if (this.detached) return Buffer.alloc(0);
    this.detached = true;
    this.socket.removeListener('readable', this.onReadable);
    this.socket.removeListener('end', this.onEnd);
    this.socket.removeListener('error', this.onError);
    this.socket.removeListener('close', this.onClose);
    const leftover = this.buffer;
    this.buffer = Buffer.alloc(0);
    return leftover;
  }
}

function writeAsync(socket: Duplex, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error('Socket destroyed before write'));
      return;
    }
    const onError = (err: Error) => {
      reject(err);
    };
    socket.once('error', onError);
    socket.write(data, (err) => {
      socket.removeListener('error', onError);
      if (err) reject(err);
      else resolve();
    });
  });
}

function connectTcp(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setNoDelay(true);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        socket.destroy();
        reject(new Error(`TCP connection timeout to ${host}:${port}`));
      }
    }, timeoutMs);

    const onError = (err: Error) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        socket.destroy();
        reject(err);
      }
    };

    socket.once('error', onError);
    socket.once('connect', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        socket.removeListener('error', onError);
        resolve(socket);
      }
    });
  });
}

function connectTls(
  host: string,
  port: number,
  servername: string | undefined,
  rejectUnauthorized: boolean,
  timeoutMs: number
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const options: tls.ConnectionOptions = {
      host,
      port,
      rejectUnauthorized,
    };
    if (servername && !net.isIP(servername)) {
      options.servername = servername;
    }
    const socket = tls.connect(options);
    socket.setNoDelay(true);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        socket.destroy();
        reject(new Error(`TLS connection timeout to ${host}:${port}`));
      }
    }, timeoutMs);

    const onError = (err: Error) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        socket.destroy();
        reject(err);
      }
    };

    socket.once('error', onError);
    socket.once('secureConnect', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        socket.removeListener('error', onError);
        resolve(socket);
      }
    });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        onTimeout();
        reject(new Error(label));
      }
    }, timeoutMs);

    promise.then(
      (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    );
  });
}

function mapSocks5ReplyError(code: number): string {
  switch (code) {
    case 0x01:
      return 'SOCKS5 general server failure';
    case 0x02:
      return 'SOCKS5 connection not allowed by ruleset';
    case 0x03:
      return 'SOCKS5 network unreachable';
    case 0x04:
      return 'SOCKS5 host unreachable';
    case 0x05:
      return 'SOCKS5 connection refused by destination';
    case 0x06:
      return 'SOCKS5 TTL expired';
    case 0x07:
      return 'SOCKS5 command not supported';
    case 0x08:
      return 'SOCKS5 address type not supported';
    default:
      return `SOCKS5 connection failed (code 0x${code.toString(16)})`;
  }
}

async function connectViaSocks5(
  config: ProxyConfigPayload,
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  timeoutMs: number
): Promise<net.Socket> {
  const start = Date.now();
  const socket = await connectTcp(proxyHost, proxyPort, timeoutMs);
  const remaining = Math.max(500, timeoutMs - (Date.now() - start));
  const reader = new SocketReader(socket);

  try {
    await withTimeout(
      (async () => {
        const hasAuth =
          (config.username !== undefined && config.username !== '') ||
          (config.password !== undefined && config.password !== '');

        const greeting = hasAuth
          ? Buffer.from([0x05, 0x02, 0x00, 0x02])
          : Buffer.from([0x05, 0x01, 0x00]);
        await writeAsync(socket, greeting);

        const methodReply = await reader.readExact(2);
        if (methodReply[0] !== 0x05) {
          throw new Error(`Invalid SOCKS5 version: ${methodReply[0]}`);
        }
        const selectedMethod = methodReply[1];
        if (selectedMethod === 0xff) {
          throw new Error('SOCKS5 server rejected all authentication methods');
        }
        if (selectedMethod === 0x02) {
          if (!hasAuth) {
            throw new Error('SOCKS5 server requires username/password authentication');
          }
          const userBuf = Buffer.from(config.username || '', 'utf8');
          const passBuf = Buffer.from(config.password || '', 'utf8');
          if (userBuf.length > 255 || passBuf.length > 255) {
            throw new Error('SOCKS5 credentials exceed 255 bytes');
          }
          const authPacket = Buffer.concat([
            Buffer.from([0x01, userBuf.length]),
            userBuf,
            Buffer.from([passBuf.length]),
            passBuf,
          ]);
          await writeAsync(socket, authPacket);
          const authReply = await reader.readExact(2);
          if (authReply[0] !== 0x01 || authReply[1] !== 0x00) {
            throw new Error('SOCKS5 authentication failed');
          }
        } else if (selectedMethod !== 0x00) {
          throw new Error(`Unsupported SOCKS5 auth method: 0x${selectedMethod.toString(16)}`);
        }

        const addrBuf = encodeSocks5Address(targetHost, targetPort);
        const connectReq = Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), addrBuf]);
        await writeAsync(socket, connectReq);

        const head = await reader.readExact(4);
        if (head[0] !== 0x05) {
          throw new Error(`Invalid SOCKS5 reply version: ${head[0]}`);
        }
        if (head[1] !== 0x00) {
          throw new Error(mapSocks5ReplyError(head[1]));
        }
        const atyp = head[3];
        if (atyp === 0x01) {
          await reader.readExact(6);
        } else if (atyp === 0x04) {
          await reader.readExact(18);
        } else if (atyp === 0x03) {
          const len = await reader.readByte();
          await reader.readExact(len + 2);
        } else {
          throw new Error(`Invalid SOCKS5 reply ATYP: 0x${atyp.toString(16)}`);
        }
      })(),
      remaining,
      () => socket.destroy(),
      'SOCKS5 handshake timeout'
    );

    reader.detachAndUnshift();
    return socket;
  } catch (err) {
    reader.detachConsumeLeftover();
    socket.destroy();
    throw err;
  }
}

async function connectViaSocks4(
  config: ProxyConfigPayload,
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  isSocks4a: boolean,
  timeoutMs: number
): Promise<net.Socket> {
  const start = Date.now();
  const cleanTarget = cleanHost(targetHost);
  if (net.isIPv6(cleanTarget)) {
    throw new Error('SOCKS4/4a does not support IPv6 targets');
  }

  let resolvedIpv4: string | null = net.isIPv4(cleanTarget) ? cleanTarget : null;
  if (!resolvedIpv4 && !isSocks4a) {
    const lookup = await dns.promises.lookup(cleanTarget, { family: 4 });
    resolvedIpv4 = lookup.address;
  }

  const remainingAfterDns = Math.max(500, timeoutMs - (Date.now() - start));
  const socket = await connectTcp(proxyHost, proxyPort, remainingAfterDns);
  const remaining = Math.max(500, timeoutMs - (Date.now() - start));
  const reader = new SocketReader(socket);

  try {
    await withTimeout(
      (async () => {
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort, 0);
        const userIdBuf = Buffer.from(config.username || '', 'utf8');

        let packet: Buffer;
        if (resolvedIpv4) {
          const octets = resolvedIpv4.split('.').map((n) => Number(n));
          packet = Buffer.concat([
            Buffer.from([0x04, 0x01]),
            portBuf,
            Buffer.from(octets),
            userIdBuf,
            Buffer.from([0x00]),
          ]);
        } else {
          const domainBuf = Buffer.from(cleanTarget, 'utf8');
          packet = Buffer.concat([
            Buffer.from([0x04, 0x01]),
            portBuf,
            Buffer.from([0x00, 0x00, 0x00, 0x01]),
            userIdBuf,
            Buffer.from([0x00]),
            domainBuf,
            Buffer.from([0x00]),
          ]);
        }

        await writeAsync(socket, packet);
        const reply = await reader.readExact(8);
        if (reply[0] !== 0x00 && reply[0] !== 0x04) {
          throw new Error(`Invalid SOCKS4 reply version: ${reply[0]}`);
        }
        if (reply[1] !== 0x5a) {
          throw new Error(`SOCKS4 request rejected (code 0x${reply[1].toString(16)})`);
        }
      })(),
      remaining,
      () => socket.destroy(),
      'SOCKS4 handshake timeout'
    );

    reader.detachAndUnshift();
    return socket;
  } catch (err) {
    reader.detachConsumeLeftover();
    socket.destroy();
    throw err;
  }
}

async function connectViaHttpTunnel(
  config: ProxyConfigPayload,
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  useTls: boolean,
  timeoutMs: number
): Promise<Duplex> {
  const start = Date.now();
  const sni = config.sni?.trim() || proxyHost;
  const rejectUnauthorized = !config.allowInsecure;
  const socket: Duplex = useTls
    ? await connectTls(proxyHost, proxyPort, sni, rejectUnauthorized, timeoutMs)
    : await connectTcp(proxyHost, proxyPort, timeoutMs);

  const remaining = Math.max(500, timeoutMs - (Date.now() - start));
  const reader = new SocketReader(socket);

  try {
    await withTimeout(
      (async () => {
        const authority = `${formatHostForAuthority(targetHost)}:${targetPort}`;
        const headers = [
          `CONNECT ${authority} HTTP/1.1`,
          `Host: ${authority}`,
          'Proxy-Connection: keep-alive',
        ];
        if ((config.username !== undefined && config.username !== '') || (config.password !== undefined && config.password !== '')) {
          const token = Buffer.from(`${config.username || ''}:${config.password || ''}`, 'utf8').toString('base64');
          headers.push(`Proxy-Authorization: Basic ${token}`);
        }
        const requestStr = `${headers.join('\r\n')}\r\n\r\n`;
        await writeAsync(socket, Buffer.from(requestStr, 'utf8'));

        const rawHead = await reader.readUntil(Buffer.from('\r\n\r\n', 'ascii'), MAX_HTTP_HEADER_BYTES);
        const statusLine = rawHead.toString('utf8').split('\r\n')[0] || '';
        const match = /^HTTP\/\d\.\d\s+(\d{3})/i.exec(statusLine);
        if (!match) {
          throw new Error(`Invalid HTTP proxy response: ${statusLine}`);
        }
        const statusCode = Number(match[1]);
        if (statusCode === 407) {
          throw new Error('HTTP proxy authentication required or invalid credentials (407)');
        }
        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(`HTTP proxy CONNECT failed: ${statusLine}`);
        }
      })(),
      remaining,
      () => socket.destroy(),
      'HTTP CONNECT handshake timeout'
    );

    reader.detachAndUnshift();
    return socket;
  } catch (err) {
    reader.detachConsumeLeftover();
    socket.destroy();
    throw err;
  }
}

function evpBytesToKey(password: string, keyLen: number): Buffer {
  const passBuf = Buffer.from(password, 'utf8');
  const blocks: Buffer[] = [];
  let total = 0;
  let prev = Buffer.alloc(0);
  while (total < keyLen) {
    const hash = crypto.createHash('md5');
    hash.update(prev);
    hash.update(passBuf);
    prev = hash.digest();
    blocks.push(prev);
    total += prev.length;
  }
  return Buffer.concat(blocks, keyLen);
}

function deriveShadowsocksSubkey(masterKey: Buffer, salt: Buffer, keyLen: number): Buffer {
  const raw = crypto.hkdfSync('sha1', masterKey, salt, Buffer.from('ss-subkey', 'ascii'), keyLen);
  return Buffer.from(raw);
}

function incrementNonceLE(nonce: Buffer): void {
  for (let i = 0; i < nonce.length; i++) {
    nonce[i] = (nonce[i] + 1) & 0xff;
    if (nonce[i] !== 0) break;
  }
}

function aeadEncrypt(
  spec: CipherSpec,
  subkey: Buffer,
  nonce: Buffer,
  plaintext: Buffer
): Buffer {
  const cipher = crypto.createCipheriv(
    spec.nodeCipher as crypto.CipherGCMTypes,
    subkey,
    nonce,
    { authTagLength: spec.tagLen }
  ) as crypto.CipherGCM;
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  incrementNonceLE(nonce);
  return Buffer.concat([ciphertext, tag]);
}

function aeadDecrypt(
  spec: CipherSpec,
  subkey: Buffer,
  nonce: Buffer,
  ciphertextWithTag: Buffer
): Buffer {
  const ctLen = ciphertextWithTag.length - spec.tagLen;
  if (ctLen < 0) {
    throw new Error('Shadowsocks ciphertext shorter than auth tag');
  }
  const ciphertext = ciphertextWithTag.subarray(0, ctLen);
  const tag = ciphertextWithTag.subarray(ctLen);
  const decipher = crypto.createDecipheriv(
    spec.nodeCipher as crypto.CipherGCMTypes,
    subkey,
    nonce,
    { authTagLength: spec.tagLen }
  ) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  incrementNonceLE(nonce);
  return plaintext;
}

class ShadowsocksStream extends Duplex {
  private readonly spec: CipherSpec;
  private readonly masterKey: Buffer;
  private readonly txSubkey: Buffer;
  private readonly txNonce: Buffer;
  private rxSubkey: Buffer | null = null;
  private readonly rxNonce: Buffer;
  private rxBuffer: Buffer = Buffer.alloc(0);
  private expectedPayloadLen: number | null = null;
  private txSaltSent = false;
  private readonly txSalt: Buffer;
  private handshakeSent = false;

  constructor(
    private readonly rawSocket: net.Socket,
    spec: CipherSpec,
    masterKey: Buffer,
    private readonly targetAddressHeader: Buffer
  ) {
    super();
    this.spec = spec;
    this.masterKey = masterKey;
    this.txSalt = crypto.randomBytes(spec.saltLen);
    this.txSubkey = deriveShadowsocksSubkey(masterKey, this.txSalt, spec.keyLen);
    this.txNonce = Buffer.alloc(spec.nonceLen, 0);
    this.rxNonce = Buffer.alloc(spec.nonceLen, 0);

    this.rawSocket.on('data', (chunk: Buffer) => this.handleIncoming(chunk));
    this.rawSocket.on('end', () => {
      this.push(null);
    });
    this.rawSocket.on('error', (err: Error) => {
      if (!this.destroyed) {
        this.destroy(err);
      }
    });
    this.rawSocket.on('close', () => {
      if (!this.destroyed) {
        this.destroy();
      }
    });
  }

  private encryptChunk(payload: Buffer): Buffer {
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(payload.length, 0);
    const encLen = aeadEncrypt(this.spec, this.txSubkey, this.txNonce, lenBuf);
    const encPayload = aeadEncrypt(this.spec, this.txSubkey, this.txNonce, payload);
    return Buffer.concat([encLen, encPayload]);
  }

  private encodeOutgoingFrame(payload: Buffer): Buffer {
    const parts: Buffer[] = [];
    if (!this.txSaltSent) {
      this.txSaltSent = true;
      parts.push(this.txSalt);
    }
    if (!this.handshakeSent) {
      this.handshakeSent = true;
      const combined = Buffer.concat([this.targetAddressHeader, payload]);
      let offset = 0;
      while (offset < combined.length) {
        const end = Math.min(offset + MAX_SS_PAYLOAD, combined.length);
        parts.push(this.encryptChunk(combined.subarray(offset, end)));
        offset = end;
      }
      return Buffer.concat(parts);
    }
    let offset = 0;
    while (offset < payload.length) {
      const end = Math.min(offset + MAX_SS_PAYLOAD, payload.length);
      parts.push(this.encryptChunk(payload.subarray(offset, end)));
      offset = end;
    }
    return Buffer.concat(parts);
  }

  sendHeader(): Promise<void> {
    if (this.handshakeSent) return Promise.resolve();
    const frame = this.encodeOutgoingFrame(Buffer.alloc(0));
    return writeAsync(this.rawSocket, frame);
  }

  private handleIncoming(chunk: Buffer): void {
    if (this.destroyed) return;
    this.rxBuffer = this.rxBuffer.length === 0 ? chunk : Buffer.concat([this.rxBuffer, chunk]);

    try {
      if (!this.rxSubkey) {
        if (this.rxBuffer.length < this.spec.saltLen) return;
        const rxSalt = this.rxBuffer.subarray(0, this.spec.saltLen);
        this.rxBuffer = this.rxBuffer.subarray(this.spec.saltLen);
        this.rxSubkey = deriveShadowsocksSubkey(this.masterKey, rxSalt, this.spec.keyLen);
      }

      while (true) {
        if (this.expectedPayloadLen === null) {
          const lenFrameSize = 2 + this.spec.tagLen;
          if (this.rxBuffer.length < lenFrameSize) break;
          const encLen = this.rxBuffer.subarray(0, lenFrameSize);
          this.rxBuffer = this.rxBuffer.subarray(lenFrameSize);
          const lenBuf = aeadDecrypt(this.spec, this.rxSubkey, this.rxNonce, encLen);
          const len = lenBuf.readUInt16BE(0);
          if (len === 0 || len > MAX_SS_PAYLOAD) {
            throw new Error(`Invalid Shadowsocks chunk length: ${len}`);
          }
          this.expectedPayloadLen = len;
        }

        const payloadFrameSize = this.expectedPayloadLen + this.spec.tagLen;
        if (this.rxBuffer.length < payloadFrameSize) break;
        const encPayload = this.rxBuffer.subarray(0, payloadFrameSize);
        this.rxBuffer = this.rxBuffer.subarray(payloadFrameSize);
        this.expectedPayloadLen = null;
        const plain = aeadDecrypt(this.spec, this.rxSubkey, this.rxNonce, encPayload);
        if (!this.push(plain)) {
          this.rawSocket.pause();
        }
      }
    } catch (err) {
      this.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  }

  _read(): void {
    if (!this.rawSocket.destroyed) {
      this.rawSocket.resume();
    }
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      if (chunk.length === 0 && this.handshakeSent) {
        callback();
        return;
      }
      const frame = this.encodeOutgoingFrame(chunk);
      if (frame.length === 0) {
        callback();
        return;
      }
      const ok = this.rawSocket.write(frame, (err) => {
        if (err) callback(err);
      });
      if (ok) {
        callback();
      } else {
        this.rawSocket.once('drain', () => callback());
      }
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    if (!this.handshakeSent) {
      this.sendHeader()
        .then(() => {
          this.rawSocket.end(() => callback());
        })
        .catch((err) => callback(err instanceof Error ? err : new Error(String(err))));
      return;
    }
    this.rawSocket.end(() => callback());
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (!this.rawSocket.destroyed) {
      this.rawSocket.destroy(error || undefined);
    }
    callback(error);
  }
}

async function connectViaShadowsocks(
  config: ProxyConfigPayload,
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  timeoutMs: number
): Promise<Duplex> {
  const method = (config.method || 'aes-256-gcm').trim().toLowerCase();
  const spec = SS_CIPHERS[method];
  if (!spec) {
    throw new Error(`Unsupported Shadowsocks cipher method: ${method}`);
  }
  if (!config.password) {
    throw new Error('Shadowsocks password is required');
  }

  const masterKey = evpBytesToKey(config.password, spec.keyLen);
  const addrHeader = encodeSocks5Address(targetHost, targetPort);
  const rawSocket = await connectTcp(proxyHost, proxyPort, timeoutMs);
  const stream = new ShadowsocksStream(rawSocket, spec, masterKey, addrHeader);
  try {
    await stream.sendHeader();
    return stream;
  } catch (err) {
    stream.destroy();
    throw err;
  }
}

async function connectViaTrojan(
  config: ProxyConfigPayload,
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  timeoutMs: number
): Promise<tls.TLSSocket> {
  const sni = config.sni?.trim() || proxyHost;
  const rejectUnauthorized = !config.allowInsecure;
  const socket = await connectTls(proxyHost, proxyPort, sni, rejectUnauthorized, timeoutMs);

  try {
    const passHash = crypto.createHash('sha224').update(config.password || '', 'utf8').digest('hex');
    const addrBuf = encodeSocks5Address(targetHost, targetPort);
    const header = Buffer.concat([
      Buffer.from(`${passHash}\r\n`, 'ascii'),
      Buffer.from([0x01]),
      addrBuf,
      Buffer.from('\r\n', 'ascii'),
    ]);
    await writeAsync(socket, header);
    return socket;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

export async function createUpstreamSocket(
  config: ProxyConfigPayload,
  targetHost: string,
  targetPort: number,
  timeoutMs = 10000
): Promise<Duplex> {
  const { host: proxyHost, port: proxyPort, type } = validateConfig(config);
  const cleanTarget = cleanHost(targetHost);
  if (!cleanTarget) {
    throw new Error('Target host is required');
  }
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw new Error('Target port must be between 1 and 65535');
  }

  switch (type) {
    case 'socks5':
    case 'socks5h':
      return connectViaSocks5(config, proxyHost, proxyPort, cleanTarget, targetPort, timeoutMs);
    case 'socks4':
      return connectViaSocks4(config, proxyHost, proxyPort, cleanTarget, targetPort, false, timeoutMs);
    case 'socks4a':
      return connectViaSocks4(config, proxyHost, proxyPort, cleanTarget, targetPort, true, timeoutMs);
    case 'http':
      return connectViaHttpTunnel(config, proxyHost, proxyPort, cleanTarget, targetPort, false, timeoutMs);
    case 'https':
      return connectViaHttpTunnel(config, proxyHost, proxyPort, cleanTarget, targetPort, true, timeoutMs);
    case 'ss':
      return connectViaShadowsocks(config, proxyHost, proxyPort, cleanTarget, targetPort, timeoutMs);
    case 'trojan':
      return connectViaTrojan(config, proxyHost, proxyPort, cleanTarget, targetPort, timeoutMs);
    default:
      return connectViaSocks5(config, proxyHost, proxyPort, cleanTarget, targetPort, timeoutMs);
  }
}

function pipeBidirectional(a: Duplex, b: Duplex, tracked: Set<Duplex>): void {
  tracked.add(a);
  tracked.add(b);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    tracked.delete(a);
    tracked.delete(b);
    if (!a.destroyed) a.destroy();
    if (!b.destroyed) b.destroy();
  };

  a.on('error', cleanup);
  b.on('error', cleanup);
  a.on('close', cleanup);
  b.on('close', cleanup);

  a.pipe(b);
  b.pipe(a);
}

function parseAuthority(authority: string, defaultPort: number): { host: string; port: number } {
  const trimmed = authority.trim();
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1) {
      throw new Error(`Invalid IPv6 authority: ${authority}`);
    }
    const host = trimmed.slice(1, closeIdx);
    const rest = trimmed.slice(closeIdx + 1);
    const port = rest.startsWith(':') ? Number(rest.slice(1)) : defaultPort;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port in authority: ${authority}`);
    }
    return { host, port };
  }

  const colonIdx = trimmed.lastIndexOf(':');
  if (colonIdx > 0) {
    const host = trimmed.slice(0, colonIdx);
    const port = Number(trimmed.slice(colonIdx + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port in authority: ${authority}`);
    }
    return { host, port };
  }
  return { host: trimmed, port: defaultPort };
}

function formatIPv6Bytes(buf: Buffer): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(buf.readUInt16BE(i).toString(16));
  }
  return groups.join(':');
}

async function handleLocalSocks5Client(
  clientSocket: net.Socket,
  reader: SocketReader,
  config: ProxyConfigPayload,
  tracked: Set<Duplex>
): Promise<void> {
  const ver = await reader.readByte();
  if (ver !== 0x05) {
    throw new Error('Unexpected SOCKS5 version');
  }
  const nMethods = await reader.readByte();
  await reader.readExact(nMethods);
  await writeAsync(clientSocket, Buffer.from([0x05, 0x00]));

  const reqHead = await reader.readExact(4);
  if (reqHead[0] !== 0x05) {
    throw new Error('Invalid SOCKS5 request version');
  }
  const cmd = reqHead[1];
  const atyp = reqHead[3];

  let targetHost = '';
  if (atyp === 0x01) {
    const ipBytes = await reader.readExact(4);
    targetHost = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
  } else if (atyp === 0x03) {
    const len = await reader.readByte();
    const domainBytes = await reader.readExact(len);
    targetHost = domainBytes.toString('utf8');
  } else if (atyp === 0x04) {
    const ipBytes = await reader.readExact(16);
    targetHost = formatIPv6Bytes(ipBytes);
  } else {
    await writeAsync(clientSocket, Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    clientSocket.destroy();
    return;
  }

  const portBuf = await reader.readExact(2);
  const targetPort = portBuf.readUInt16BE(0);

  if (cmd !== 0x01) {
    await writeAsync(clientSocket, Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    clientSocket.destroy();
    return;
  }

  let upstream: Duplex;
  try {
    upstream = await createUpstreamSocket(config, targetHost, targetPort, 15000);
  } catch {
    if (!clientSocket.destroyed) {
      await writeAsync(clientSocket, Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0])).catch(() => {});
      clientSocket.destroy();
    }
    return;
  }

  if (clientSocket.destroyed) {
    upstream.destroy();
    return;
  }

  const leftover = reader.detachConsumeLeftover();
  await writeAsync(clientSocket, Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
  if (leftover.length > 0) {
    await writeAsync(upstream, leftover);
  }
  pipeBidirectional(clientSocket, upstream, tracked);
}

async function handleLocalHttpClient(
  clientSocket: net.Socket,
  reader: SocketReader,
  config: ProxyConfigPayload,
  tracked: Set<Duplex>
): Promise<void> {
  const rawHead = await reader.readUntil(Buffer.from('\r\n\r\n', 'ascii'), MAX_HTTP_HEADER_BYTES);
  const headerText = rawHead.toString('utf8');
  const lines = headerText.split('\r\n');
  const requestLine = lines[0] || '';
  const parts = requestLine.split(' ');
  if (parts.length < 3) {
    await writeAsync(clientSocket, Buffer.from('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
    clientSocket.destroy();
    return;
  }

  const method = parts[0].toUpperCase();
  const target = parts[1];
  const version = parts[2];

  if (method === 'CONNECT') {
    const { host, port } = parseAuthority(target, 443);
    let upstream: Duplex;
    try {
      upstream = await createUpstreamSocket(config, host, port, 15000);
    } catch {
      if (!clientSocket.destroyed) {
        await writeAsync(clientSocket, Buffer.from('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')).catch(() => {});
        clientSocket.destroy();
      }
      return;
    }

    if (clientSocket.destroyed) {
      upstream.destroy();
      return;
    }

    const leftover = reader.detachConsumeLeftover();
    await writeAsync(clientSocket, Buffer.from('HTTP/1.1 200 Connection Established\r\n\r\n'));
    if (leftover.length > 0) {
      await writeAsync(upstream, leftover);
    }
    pipeBidirectional(clientSocket, upstream, tracked);
    return;
  }

  let targetHost = '';
  let targetPort = 80;
  let relativePath = target;

  if (/^https?:\/\//i.test(target)) {
    const parsed = new URL(target);
    targetHost = cleanHost(parsed.hostname);
    targetPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    relativePath = `${parsed.pathname || '/'}${parsed.search || ''}`;
  } else {
    const hostLine = lines.find((line) => line.toLowerCase().startsWith('host:'));
    if (!hostLine) {
      await writeAsync(clientSocket, Buffer.from('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
      clientSocket.destroy();
      return;
    }
    const parsedAuthority = parseAuthority(hostLine.slice(5), 80);
    targetHost = parsedAuthority.host;
    targetPort = parsedAuthority.port;
  }

  const upstreamType = normalizeProxyType(config.type);
  if (upstreamType === 'http' || upstreamType === 'https') {
    const validated = validateConfig(config);
    const sni = config.sni?.trim() || validated.host;
    const rejectUnauthorized = !config.allowInsecure;
    let upstream: Duplex;
    try {
      upstream =
        upstreamType === 'https'
          ? await connectTls(validated.host, validated.port, sni, rejectUnauthorized, 15000)
          : await connectTcp(validated.host, validated.port, 15000);
    } catch {
      if (!clientSocket.destroyed) {
        await writeAsync(clientSocket, Buffer.from('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')).catch(() => {});
        clientSocket.destroy();
      }
      return;
    }

    const filteredHeaders = lines.slice(1).filter((line) => {
      if (!line) return false;
      const lower = line.toLowerCase();
      return !lower.startsWith('proxy-authorization:');
    });
    if ((config.username !== undefined && config.username !== '') || (config.password !== undefined && config.password !== '')) {
      const token = Buffer.from(`${config.username || ''}:${config.password || ''}`, 'utf8').toString('base64');
      filteredHeaders.push(`Proxy-Authorization: Basic ${token}`);
    }
    const absoluteTarget = /^https?:\/\//i.test(target)
      ? target
      : `http://${formatHostForAuthority(targetHost)}${targetPort === 80 ? '' : `:${targetPort}`}${relativePath}`;
    const rebuilt = `${method} ${absoluteTarget} ${version}\r\n${filteredHeaders.join('\r\n')}\r\n\r\n`;
    const leftover = reader.detachConsumeLeftover();
    await writeAsync(upstream, Buffer.from(rebuilt, 'utf8'));
    if (leftover.length > 0) {
      await writeAsync(upstream, leftover);
    }
    pipeBidirectional(clientSocket, upstream, tracked);
    return;
  }

  let upstream: Duplex;
  try {
    upstream = await createUpstreamSocket(config, targetHost, targetPort, 15000);
  } catch {
    if (!clientSocket.destroyed) {
      await writeAsync(clientSocket, Buffer.from('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')).catch(() => {});
      clientSocket.destroy();
    }
    return;
  }

  if (clientSocket.destroyed) {
    upstream.destroy();
    return;
  }

  const filteredHeaders = lines.slice(1).filter((line) => {
    if (!line) return false;
    const lower = line.toLowerCase();
    return !lower.startsWith('proxy-connection:') && !lower.startsWith('proxy-authorization:');
  });
  const rebuilt = `${method} ${relativePath} ${version}\r\n${filteredHeaders.join('\r\n')}\r\n\r\n`;
  const leftover = reader.detachConsumeLeftover();
  await writeAsync(upstream, Buffer.from(rebuilt, 'utf8'));
  if (leftover.length > 0) {
    await writeAsync(upstream, leftover);
  }
  pipeBidirectional(clientSocket, upstream, tracked);
}

let relayServer: net.Server | null = null;
let relayPort: number | null = null;
let activeRelayConfig: ProxyConfigPayload | null = null;
const activeRelaySockets = new Set<Duplex>();
let relayGeneration = 0;

export function getActiveProxyConfig(): ProxyConfigPayload | null {
  return activeRelayConfig ? { ...activeRelayConfig } : null;
}

export function getLocalRelayPort(): number | null {
  return relayPort;
}

export async function stopLocalProxyRelay(): Promise<void> {
  relayGeneration++;
  const server = relayServer;
  relayServer = null;
  relayPort = null;
  activeRelayConfig = null;

  for (const sock of Array.from(activeRelaySockets)) {
    if (!sock.destroyed) {
      sock.destroy();
    }
  }
  activeRelaySockets.clear();

  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

export async function startLocalProxyRelay(config: ProxyConfigPayload): Promise<RelayStartResult> {
  validateConfig(config);
  const myGen = ++relayGeneration;

  const prevServer = relayServer;
  relayServer = null;
  relayPort = null;
  activeRelayConfig = null;

  for (const sock of Array.from(activeRelaySockets)) {
    if (!sock.destroyed) {
      sock.destroy();
    }
  }
  activeRelaySockets.clear();

  if (prevServer) {
    await new Promise<void>((resolve) => {
      prevServer.close(() => resolve());
    });
  }

  if (myGen !== relayGeneration) {
    throw new Error('Proxy relay start superseded');
  }

  const snapshot: ProxyConfigPayload = { ...config };
  const server = net.createServer((clientSocket) => {
    activeRelaySockets.add(clientSocket);
    clientSocket.setNoDelay(true);
    clientSocket.on('close', () => {
      activeRelaySockets.delete(clientSocket);
    });
    clientSocket.on('error', () => {
      if (!clientSocket.destroyed) {
        clientSocket.destroy();
      }
    });

    const reader = new SocketReader(clientSocket);
    (async () => {
      try {
        const firstByte = await reader.peekByte();
        if (firstByte === 0x05) {
          await handleLocalSocks5Client(clientSocket, reader, snapshot, activeRelaySockets);
        } else {
          await handleLocalHttpClient(clientSocket, reader, snapshot, activeRelaySockets);
        }
      } catch {
        reader.detachConsumeLeftover();
        if (!clientSocket.destroyed) {
          clientSocket.destroy();
        }
      }
    })();
  });

  return new Promise<RelayStartResult>((resolve, reject) => {
    server.once('error', (err) => {
      reject(err);
    });
    server.listen(0, '127.0.0.1', () => {
      if (myGen !== relayGeneration) {
        server.close();
        reject(new Error('Proxy relay start superseded'));
        return;
      }
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to obtain local relay port'));
        return;
      }
      relayServer = server;
      relayPort = address.port;
      activeRelayConfig = snapshot;
      resolve({ port: address.port });
    });
  });
}

function upgradeToTls(
  socket: Duplex,
  host: string,
  rejectUnauthorized: boolean,
  timeoutMs: number
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const options: tls.ConnectionOptions = {
      socket,
      rejectUnauthorized,
    };
    if (net.isIP(host)) {
      options.host = host;
    } else {
      options.servername = host;
    }

    const tlsSocket = tls.connect(options);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        tlsSocket.destroy();
        socket.destroy();
        reject(new Error('Target TLS handshake timeout'));
      }
    }, timeoutMs);

    const onError = (err: Error) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        tlsSocket.destroy();
        socket.destroy();
        reject(err);
      }
    };

    tlsSocket.once('error', onError);
    tlsSocket.once('secureConnect', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        tlsSocket.removeListener('error', onError);
        resolve(tlsSocket);
      }
    });
  });
}

async function performHttpRequestOverSocket(
  socket: Duplex,
  hostHeader: string,
  requestPath: string,
  timeoutMs: number
): Promise<{ statusCode: number; body: string }> {
  const reader = new SocketReader(socket);
  try {
    return await withTimeout(
      (async () => {
        const req = [
          `GET ${requestPath} HTTP/1.1`,
          `Host: ${hostHeader}`,
          'User-Agent: Orbita/2.0',
          'Accept: text/plain, */*',
          'Connection: close',
          '',
          '',
        ].join('\r\n');
        await writeAsync(socket, Buffer.from(req, 'utf8'));

        const rawHead = await reader.readUntil(Buffer.from('\r\n\r\n', 'ascii'), MAX_HTTP_HEADER_BYTES);
        const headText = rawHead.toString('utf8');
        const statusLine = headText.split('\r\n')[0] || '';
        const match = /^HTTP\/\d\.\d\s+(\d{3})/i.exec(statusLine);
        const statusCode = match ? Number(match[1]) : 0;

        const chunks: Buffer[] = [];
        const leftover = reader.detachConsumeLeftover();
        if (leftover.length > 0) chunks.push(leftover);

        await new Promise<void>((resolve, reject) => {
          const onData = (c: Buffer) => chunks.push(c);
          const onEnd = () => {
            cleanup();
            resolve();
          };
          const onErr = (err: Error) => {
            cleanup();
            if (chunks.length > 0) resolve();
            else reject(err);
          };
          const cleanup = () => {
            socket.removeListener('data', onData);
            socket.removeListener('end', onEnd);
            socket.removeListener('close', onEnd);
            socket.removeListener('error', onErr);
          };
          socket.on('data', onData);
          socket.once('end', onEnd);
          socket.once('close', onEnd);
          socket.once('error', onErr);
          socket.resume();
        });

        const rawBody = Buffer.concat(chunks).toString('utf8');
        return { statusCode, body: rawBody };
      })(),
      timeoutMs,
      () => socket.destroy(),
      'HTTP probe response timeout'
    );
  } finally {
    reader.detachConsumeLeftover();
  }
}

export async function testProxyConnection(
  config: ProxyConfigPayload,
  timeoutMs = 5000,
  target?: { host: string; port: number; useTls?: boolean }
): Promise<ProxyTestResult> {
  const start = Date.now();
  const targetHost = target?.host || '1.1.1.1';
  const targetPort = target?.port || 443;
  const useTls = target?.useTls !== undefined ? target.useTls : targetPort === 443;

  let socket: Duplex | null = null;
  let tlsSocket: tls.TLSSocket | null = null;
  try {
    validateConfig(config);
    socket = await createUpstreamSocket(config, targetHost, targetPort, timeoutMs);
    const elapsed = Date.now() - start;
    const remaining = Math.max(800, timeoutMs - elapsed);

    if (useTls) {
      tlsSocket = await upgradeToTls(socket, targetHost, !config.allowInsecure, remaining);
      tlsSocket.destroy();
    } else {
      const reader = new SocketReader(socket);
      try {
        await withTimeout(
          (async () => {
            const req = `HEAD / HTTP/1.1\r\nHost: ${formatHostForAuthority(targetHost)}\r\nConnection: close\r\n\r\n`;
            await writeAsync(socket!, Buffer.from(req, 'utf8'));
            const head = await reader.readUntil(Buffer.from('\r\n\r\n', 'ascii'), MAX_HTTP_HEADER_BYTES);
            const firstLine = head.toString('utf8').split('\r\n')[0] || '';
            if (!/^HTTP\/\d\.\d\s+\d{3}/i.test(firstLine)) {
              throw new Error(`Unexpected target HTTP response: ${firstLine}`);
            }
          })(),
          remaining,
          () => socket?.destroy(),
          'Target HTTP probe timeout'
        );
      } finally {
        reader.detachConsumeLeftover();
      }
      socket.destroy();
    }

    const ping = Math.max(1, Date.now() - start);
    return { success: true, ping };
  } catch (err: unknown) {
    if (tlsSocket && !tlsSocket.destroyed) tlsSocket.destroy();
    if (socket && !socket.destroyed) socket.destroy();
    const message = err instanceof Error ? err.message : String(err || 'Proxy connection failed');
    return { success: false, error: message };
  }
}

async function queryExitIpFromEndpoint(
  config: ProxyConfigPayload,
  host: string,
  path: string,
  timeoutMs: number
): Promise<{ exitIp: string; ping: number }> {
  const start = Date.now();
  const socket = await createUpstreamSocket(config, host, 443, timeoutMs);
  const remaining = Math.max(1000, timeoutMs - (Date.now() - start));
  let tlsSocket: tls.TLSSocket | null = null;
  try {
    tlsSocket = await upgradeToTls(socket, host, !config.allowInsecure, remaining);
    const remAfterTls = Math.max(1000, timeoutMs - (Date.now() - start));
    const { statusCode, body } = await performHttpRequestOverSocket(tlsSocket, host, path, remAfterTls);
    if (statusCode < 200 || statusCode >= 400) {
      throw new Error(`IP verification endpoint returned HTTP ${statusCode}`);
    }

    let exitIp = '';
    const traceMatch = /^ip=([^\r\n]+)/m.exec(body);
    if (traceMatch) {
      exitIp = traceMatch[1].trim();
    } else {
      for (const line of body.split(/[\r\n]+/)) {
        const candidate = line.trim();
        if (candidate && net.isIP(candidate)) {
          exitIp = candidate;
          break;
        }
      }
    }

    if (!exitIp || !net.isIP(exitIp)) {
      throw new Error('Could not parse exit IP from response');
    }

    return {
      exitIp,
      ping: Math.max(1, Date.now() - start),
    };
  } finally {
    if (tlsSocket && !tlsSocket.destroyed) tlsSocket.destroy();
    if (!socket.destroyed) socket.destroy();
  }
}

export async function verifyProxyExitIp(
  config: ProxyConfigPayload,
  timeoutMs = 8000
): Promise<ProxyVerifyResult> {
  try {
    validateConfig(config);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Invalid proxy configuration',
    };
  }

  try {
    const res = await queryExitIpFromEndpoint(config, '1.1.1.1', '/cdn-cgi/trace', timeoutMs);
    return { success: true, exitIp: res.exitIp, ping: res.ping };
  } catch (primaryErr: unknown) {
    try {
      const fallback = await queryExitIpFromEndpoint(config, 'api.ipify.org', '/?format=text', timeoutMs);
      return { success: true, exitIp: fallback.exitIp, ping: fallback.ping };
    } catch {
      const message = primaryErr instanceof Error ? primaryErr.message : String(primaryErr || 'Verification failed');
      return { success: false, error: message };
    }
  }
}
