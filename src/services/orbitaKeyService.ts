import { securityService } from './securityService';

export interface OrbitaKeyPayload {
  orbitaKey: boolean;
  version: number;
  keyId: string;
  secret: string;
  createdAt: number;
  label?: string;
  encryptedPin?: string;
  pinIv?: string;
}

export interface OrbitaKeyInfo {
  isConfigured: boolean;
  keyId?: string;
  createdAt?: number;
  label?: string;
}

const STORAGE_KEY_ENABLED = 'orbita_usb_key_enabled';
const STORAGE_KEY_ID = 'orbita_usb_key_id';
const STORAGE_KEY_HASH = 'orbita_usb_key_hash';
const STORAGE_KEY_CREATED_AT = 'orbita_usb_key_created_at';
const STORAGE_KEY_LABEL = 'orbita_usb_key_label';
const STORAGE_KEY_DEVICE_SECRET = 'orbita_usb_key_device_secret';

const MAGIC_HEADER = new Uint8Array([0x4F, 0x52, 0x42, 0x4B, 0x02]);

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return bufferToHex(new Uint8Array(hashBuf));
}

async function encryptWithSecret(secretBytes: Uint8Array, text: string): Promise<{ encrypted: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(text)
  );

  return {
    encrypted: bufferToHex(new Uint8Array(encryptedBuf)),
    iv: bufferToHex(iv),
  };
}

async function decryptWithSecret(secretBytes: Uint8Array, encryptedHex: string, ivHex: string): Promise<string | null> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBuffer(ivHex) as BufferSource },
      key,
      hexToBuffer(encryptedHex) as BufferSource
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuf);
  } catch {
    return null;
  }
}

async function getOrCreateDeviceSecret(): Promise<Uint8Array> {
  const existingHex = localStorage.getItem(STORAGE_KEY_DEVICE_SECRET);
  if (existingHex && existingHex.length === 64) {
    return hexToBuffer(existingHex);
  }
  const newSecret = new Uint8Array(32);
  crypto.getRandomValues(newSecret);
  localStorage.setItem(STORAGE_KEY_DEVICE_SECRET, bufferToHex(newSecret));
  return newSecret;
}

async function deriveContainerKey(deviceSecret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    deviceSecret as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function packBinaryKey(payload: OrbitaKeyPayload, deviceSecret: Uint8Array): Promise<Uint8Array> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await deriveContainerKey(deviceSecret, salt);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    jsonBytes as BufferSource
  );
  const cipherBytes = new Uint8Array(encryptedBuf);

  const totalLength = MAGIC_HEADER.length + salt.length + iv.length + cipherBytes.length;
  const out = new Uint8Array(totalLength);
  out.set(MAGIC_HEADER, 0);
  out.set(salt, MAGIC_HEADER.length);
  out.set(iv, MAGIC_HEADER.length + salt.length);
  out.set(cipherBytes, MAGIC_HEADER.length + salt.length + iv.length);
  return out;
}

async function unpackBinaryKey(rawBytes: Uint8Array, deviceSecret: Uint8Array): Promise<OrbitaKeyPayload | null> {
  if (rawBytes.length < MAGIC_HEADER.length + 16 + 12 + 16) {
    return null;
  }
  for (let i = 0; i < MAGIC_HEADER.length; i++) {
    if (rawBytes[i] !== MAGIC_HEADER[i]) {
      return null;
    }
  }

  const saltOffset = MAGIC_HEADER.length;
  const ivOffset = saltOffset + 16;
  const cipherOffset = ivOffset + 12;

  const salt = rawBytes.subarray(saltOffset, ivOffset);
  const iv = rawBytes.subarray(ivOffset, cipherOffset);
  const cipherBytes = rawBytes.subarray(cipherOffset);

  try {
    const key = await deriveContainerKey(deviceSecret, salt);
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource
    );
    const text = new TextDecoder().decode(decryptedBuf);
    const parsed = JSON.parse(text);
    if (parsed && parsed.orbitaKey === true) {
      return parsed as OrbitaKeyPayload;
    }
  } catch {}
  return null;
}

async function parseRawKeyData(input: Uint8Array | string | any): Promise<OrbitaKeyPayload | null> {
  let bytes: Uint8Array | null = null;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (typeof input === 'string') {
    if (!input.trim().startsWith('{')) {
      bytes = new TextEncoder().encode(input);
    }
  } else if (input && typeof input === 'object' && input.type === 'Buffer' && Array.isArray(input.data)) {
    bytes = new Uint8Array(input.data);
  }

  if (bytes && bytes.length >= MAGIC_HEADER.length) {
    let isV2 = true;
    for (let i = 0; i < MAGIC_HEADER.length; i++) {
      if (bytes[i] !== MAGIC_HEADER[i]) {
        isV2 = false;
        break;
      }
    }
    if (isV2) {
      const deviceSecret = await getOrCreateDeviceSecret();
      const payload = await unpackBinaryKey(bytes, deviceSecret);
      if (payload) return payload;
    }
  }

  try {
    const str = typeof input === 'string' ? input : new TextDecoder().decode(bytes || input);
    if (str.trim().startsWith('{')) {
      const parsed = JSON.parse(str);
      if (parsed && parsed.orbitaKey === true) {
        return parsed as OrbitaKeyPayload;
      }
    }
  } catch {}

  return null;
}

export const orbitaKeyService = {
  isKeyConfigured(): boolean {
    return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
  },

  getKeyInfo(): OrbitaKeyInfo {
    const isConfigured = this.isKeyConfigured();
    if (!isConfigured) return { isConfigured: false };

    return {
      isConfigured: true,
      keyId: localStorage.getItem(STORAGE_KEY_ID) || '',
      createdAt: parseInt(localStorage.getItem(STORAGE_KEY_CREATED_AT) || '0', 10) || undefined,
      label: localStorage.getItem(STORAGE_KEY_LABEL) || '',
    };
  },

  async generateKeyData(pin?: string, label?: string): Promise<{ payload: OrbitaKeyPayload; binaryBytes: Uint8Array }> {
    const keyIdBytes = new Uint8Array(8);
    crypto.getRandomValues(keyIdBytes);
    const keyId = 'orbita_' + bufferToHex(keyIdBytes);

    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const secret = bufferToHex(secretBytes);

    let encryptedPin: string | undefined;
    let pinIv: string | undefined;

    if (pin) {
      const encryptedRes = await encryptWithSecret(secretBytes, pin);
      encryptedPin = encryptedRes.encrypted;
      pinIv = encryptedRes.iv;
    }

    const payload: OrbitaKeyPayload = {
      orbitaKey: true,
      version: 2,
      keyId,
      secret,
      createdAt: Date.now(),
      label: label || 'Orbita Security Key',
      encryptedPin,
      pinIv,
    };

    const deviceSecret = await getOrCreateDeviceSecret();
    const binaryBytes = await packBinaryKey(payload, deviceSecret);
    return { payload, binaryBytes };
  },

  async registerKey(payload: OrbitaKeyPayload, label?: string): Promise<boolean> {
    try {
      const secretBytes = hexToBuffer(payload.secret);
      const secretHash = await sha256Hex(secretBytes);

      localStorage.setItem(STORAGE_KEY_ENABLED, 'true');
      localStorage.setItem(STORAGE_KEY_ID, payload.keyId);
      localStorage.setItem(STORAGE_KEY_HASH, secretHash);
      localStorage.setItem(STORAGE_KEY_CREATED_AT, String(payload.createdAt || Date.now()));
      if (label) {
        localStorage.setItem(STORAGE_KEY_LABEL, label);
      }

      return true;
    } catch {
      return false;
    }
  },

  removeKey(): void {
    localStorage.removeItem(STORAGE_KEY_ENABLED);
    localStorage.removeItem(STORAGE_KEY_ID);
    localStorage.removeItem(STORAGE_KEY_HASH);
    localStorage.removeItem(STORAGE_KEY_CREATED_AT);
    localStorage.removeItem(STORAGE_KEY_LABEL);
    localStorage.removeItem(STORAGE_KEY_DEVICE_SECRET);
  },

  async scanForUsbKey(): Promise<{ found: boolean; keyPayload?: OrbitaKeyPayload; drive?: string; path?: string; error?: string }> {
    if (typeof window !== 'undefined' && (window as any).orbita?.scanUsbKey) {
      try {
        const res = await (window as any).orbita.scanUsbKey();
        if (res && res.found && res.keyData) {
          const payload = await parseRawKeyData(res.keyData);
          if (payload && payload.orbitaKey === true) {
            return {
              found: true,
              keyPayload: payload,
              drive: res.drive,
              path: res.path,
            };
          }
        }
      } catch (err: any) {
        return { found: false, error: err?.message };
      }
    }
    return { found: false };
  },

  async verifyAndUnlock(keyInput: string | Uint8Array | OrbitaKeyPayload): Promise<boolean> {
    try {
      let payload: OrbitaKeyPayload | null = null;
      if (typeof keyInput === 'string' || keyInput instanceof Uint8Array) {
        payload = await parseRawKeyData(keyInput);
      } else {
        payload = keyInput;
      }

      if (!payload || payload.orbitaKey !== true || !payload.keyId || !payload.secret) {
        return false;
      }

      const expectedKeyId = localStorage.getItem(STORAGE_KEY_ID);
      const expectedHash = localStorage.getItem(STORAGE_KEY_HASH);

      if (!expectedKeyId || !expectedHash) {
        return false;
      }

      if (payload.keyId !== expectedKeyId) {
        return false;
      }

      const secretBytes = hexToBuffer(payload.secret);
      const computedHash = await sha256Hex(secretBytes);

      if (computedHash !== expectedHash) {
        return false;
      }

      const isPasswordSet = securityService.isPasswordSet();
      if (isPasswordSet) {
        if (!payload.encryptedPin || !payload.pinIv) {
          return false;
        }

        const decryptedPin = await decryptWithSecret(secretBytes, payload.encryptedPin, payload.pinIv);
        if (!decryptedPin) {
          return false;
        }

        const pinValid = await securityService.verifyPassword(decryptedPin);
        return pinValid;
      }

      return true;
    } catch {
      return false;
    }
  },

  async writeKeyToFolder(folderPath: string, keyData: Uint8Array | string): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).orbita?.writeUsbKey) {
      try {
        const res = await (window as any).orbita.writeUsbKey(folderPath, keyData);
        return Boolean(res && res.success);
      } catch {
        return false;
      }
    }
    return false;
  },

  downloadKeyFile(data: Uint8Array | string, fileName = 'orbita.key'): void {
    const blob = typeof data === 'string'
      ? new Blob([data], { type: 'application/octet-stream' })
      : new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
  },

  async parseKeyFile(file: File): Promise<{ success: boolean; payload?: OrbitaKeyPayload; error?: string }> {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const payload = await parseRawKeyData(bytes);
      if (payload && payload.orbitaKey === true && payload.keyId && payload.secret) {
        return { success: true, payload };
      }
      return { success: false, error: 'invalid_format' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'parse_error' };
    }
  },
};
