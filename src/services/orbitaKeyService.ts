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

  async generateKeyData(pin?: string, label?: string): Promise<{ payload: OrbitaKeyPayload; jsonString: string }> {
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
      version: 1,
      keyId,
      secret,
      createdAt: Date.now(),
      label: label || 'Orbita Security Key',
      encryptedPin,
      pinIv,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    return { payload, jsonString };
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
  },

  async scanForUsbKey(): Promise<{ found: boolean; keyPayload?: OrbitaKeyPayload; drive?: string; path?: string; error?: string }> {
    if (typeof window !== 'undefined' && (window as any).orbita?.scanUsbKey) {
      try {
        const res = await (window as any).orbita.scanUsbKey();
        if (res && res.found && res.keyData) {
          const parsed = typeof res.keyData === 'string' ? JSON.parse(res.keyData) : res.keyData;
          if (parsed && parsed.orbitaKey === true) {
            return {
              found: true,
              keyPayload: parsed,
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

  async verifyAndUnlock(keyInput: string | OrbitaKeyPayload): Promise<boolean> {
    try {
      let payload: OrbitaKeyPayload;
      if (typeof keyInput === 'string') {
        payload = JSON.parse(keyInput);
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

  async writeKeyToFolder(folderPath: string, jsonString: string): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).orbita?.writeUsbKey) {
      try {
        const res = await (window as any).orbita.writeUsbKey(folderPath, jsonString);
        return Boolean(res && res.success);
      } catch {
        return false;
      }
    }
    return false;
  },

  downloadKeyFile(jsonString: string, fileName = 'orbita.key'): void {
    const blob = new Blob([jsonString], { type: 'application/json' });
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
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && parsed.orbitaKey === true && parsed.keyId && parsed.secret) {
        return { success: true, payload: parsed };
      }
      return { success: false, error: 'invalid_format' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'parse_error' };
    }
  },
};
