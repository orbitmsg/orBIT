import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';

const KEY_FILE = 'local_key.enc';
const KEY_BACKUP = 'local_key.bak';
const PIN_KEY_FILE = 'local_key_pin.enc';

let localKey: Buffer | null = null;
let nativeModuleRef: any = null;

export class LocalKeyError extends Error {
  code: string;
  constructor(message: string, code: string = 'LOCAL_KEY_ERROR') {
    super(message);
    this.name = 'LocalKeyError';
    this.code = code;
  }
}

type KeyReadResult =
  | { status: 'missing' }
  | { status: 'ok'; key: Buffer; wasEncrypted: boolean }
  | { status: 'error'; reason: string; error?: unknown };

function writeFileAtomic(filePath: string, data: Buffer | string, encoding?: BufferEncoding): void {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    if (typeof data === 'string') {
      fs.writeFileSync(tmpPath, data, encoding || 'utf8');
    } else {
      fs.writeFileSync(tmpPath, data);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

function backupCorruptKeyFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const corruptPath = `${filePath}.corrupt`;
    if (!fs.existsSync(corruptPath)) {
      fs.copyFileSync(filePath, corruptPath);
    }
  } catch (err) {
    console.error(`[LocalKey] Failed to back up unreadable key file ${filePath}:`, err);
  }
}

function tryLoadKeyFile(filePath: string): KeyReadResult {
  if (!fs.existsSync(filePath)) {
    return { status: 'missing' };
  }
  let fileData: Buffer;
  try {
    fileData = fs.readFileSync(filePath);
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      return { status: 'missing' };
    }
    return { status: 'error', reason: `Failed to read ${path.basename(filePath)}: ${err?.message || String(err)}`, error: err };
  }

  if (fileData.length === 32) {
    return { status: 'ok', key: fileData, wasEncrypted: false };
  }

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(fileData);
      const parsed = Buffer.from(decrypted.trim(), 'hex');
      if (parsed.length === 32) {
        return { status: 'ok', key: parsed, wasEncrypted: true };
      }
      return {
        status: 'error',
        reason: `Decrypted key from ${path.basename(filePath)} had invalid length ${parsed.length}`,
      };
    } catch (err: any) {
      return {
        status: 'error',
        reason: `safeStorage.decryptString failed for ${path.basename(filePath)}: ${err?.message || String(err)}`,
        error: err,
      };
    }
  }

  return {
    status: 'error',
    reason: `Key file ${path.basename(filePath)} has length ${fileData.length} and safeStorage is unavailable`,
  };
}

export function setNativeModule(mod: any) {
  nativeModuleRef = mod;
}

function getPinFilePath(): string {
  return path.join(app.getPath('userData'), PIN_KEY_FILE);
}

function getKeyFilePath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function getBackupFilePath(): string {
  return path.join(app.getPath('userData'), KEY_BACKUP);
}

export function isPinSet(): boolean {
  return fs.existsSync(getPinFilePath());
}

export function isPinLocked(): boolean {
  return isPinSet() && localKey === null;
}

export function unlockWithPin(pin: string): boolean {
  const pinPath = getPinFilePath();
  if (!fs.existsSync(pinPath)) return false;

  try {
    const raw = fs.readFileSync(pinPath, 'utf8');

    if (nativeModuleRef && nativeModuleRef.rustUnlockWithPin) {
      try {
        const hexKey = nativeModuleRef.rustUnlockWithPin(pin, raw);
        if (hexKey) {
          const buf = Buffer.from(hexKey, 'hex');
          if (buf.length === 32) {
            localKey = buf;
            return true;
          }
        }
      } catch {}
    }

    const parsed = JSON.parse(raw);
    const salt = Buffer.from(parsed.salt, 'hex');
    const iv = Buffer.from(parsed.iv, 'hex');
    const tag = Buffer.from(parsed.tag, 'hex');
    const cipherText = Buffer.from(parsed.data, 'hex');

    const derivedKey = pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);

    if (decrypted.length === 32) {
      localKey = decrypted;
      return true;
    }
  } catch {}

  return false;
}

export function setupPin(pin: string): boolean {
  try {
    if (isPinLocked()) {
      return false;
    }

    let keyToProtect = localKey;
    if (!keyToProtect) {
      keyToProtect = getLocalKey();
    }
    if (!keyToProtect) {
      if (isPinSet()) {
        return false;
      }
      keyToProtect = randomBytes(32);
    }

    let payload: string | null = null;
    if (nativeModuleRef && nativeModuleRef.rustSetupPin) {
      try {
        payload = nativeModuleRef.rustSetupPin(pin, keyToProtect.toString('hex'));
      } catch {}
    }

    if (!payload) {
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const derivedKey = pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
      const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
      const encrypted = Buffer.concat([cipher.update(keyToProtect), cipher.final()]);
      const tag = cipher.getAuthTag();

      payload = JSON.stringify({
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex'),
      });
    }

    const pinPath = getPinFilePath();
    writeFileAtomic(pinPath, payload, 'utf8');

    if (!fs.existsSync(pinPath) || fs.statSync(pinPath).size === 0) {
      return false;
    }

    localKey = keyToProtect;

    const keyPath = getKeyFilePath();
    const backupPath = getBackupFilePath();
    if (fs.existsSync(keyPath)) {
      try { fs.unlinkSync(keyPath); } catch {}
    }
    if (fs.existsSync(backupPath)) {
      try { fs.unlinkSync(backupPath); } catch {}
    }

    return true;
  } catch (err) {
    console.error('[LocalKey] setupPin failed:', err);
    return false;
  }
}

export function removePin(): boolean {
  try {
    if (!localKey) return false;

    const keyPath = getKeyFilePath();
    const backupPath = getBackupFilePath();

    writeFileAtomic(keyPath, localKey);
    writeFileAtomic(backupPath, localKey);

    if (!fs.existsSync(keyPath) || !fs.existsSync(backupPath)) {
      return false;
    }

    const pinPath = getPinFilePath();
    if (fs.existsSync(pinPath)) {
      try { fs.unlinkSync(pinPath); } catch {}
    }

    return true;
  } catch (err) {
    console.error('[LocalKey] removePin failed:', err);
    return false;
  }
}

export function getLocalKey(): Buffer | null {
  if (localKey) return localKey;

  if (isPinSet()) {
    return null;
  }

  const keyPath = getKeyFilePath();
  const backupPath = getBackupFilePath();

  const primary = tryLoadKeyFile(keyPath);
  if (primary.status === 'ok') {
    localKey = primary.key;
    if (primary.wasEncrypted) {
      try {
        writeFileAtomic(keyPath, localKey);
      } catch (err) {
        console.error('[LocalKey] Failed to normalize primary key file:', err);
      }
    }
    const backupCheck = tryLoadKeyFile(backupPath);
    if (backupCheck.status !== 'ok') {
      if (backupCheck.status === 'error') {
        backupCorruptKeyFile(backupPath);
      }
      try {
        writeFileAtomic(backupPath, localKey);
      } catch (err) {
        console.error('[LocalKey] Failed to repair backup key file:', err);
      }
    }
    return localKey;
  }

  const backup = tryLoadKeyFile(backupPath);
  if (backup.status === 'ok') {
    localKey = backup.key;
    if (primary.status === 'error') {
      console.error('[LocalKey] Primary key file invalid, recovering from backup:', primary.reason);
      backupCorruptKeyFile(keyPath);
    }
    try {
      writeFileAtomic(keyPath, localKey);
    } catch (err) {
      console.error('[LocalKey] Failed to repair primary key file:', err);
    }
    if (backup.wasEncrypted) {
      try {
        writeFileAtomic(backupPath, localKey);
      } catch (err) {
        console.error('[LocalKey] Failed to normalize backup key file:', err);
      }
    }
    return localKey;
  }

  if (primary.status === 'error' || backup.status === 'error' || fs.existsSync(keyPath) || fs.existsSync(backupPath)) {
    const details: string[] = [];
    if (primary.status === 'error') {
      backupCorruptKeyFile(keyPath);
      details.push(`primary(${primary.reason})`);
    }
    if (backup.status === 'error') {
      backupCorruptKeyFile(backupPath);
      details.push(`backup(${backup.reason})`);
    }
    const msg = `[LocalKey] Existing key file(s) could not be decrypted or validated; refusing to overwrite: ${details.join('; ')}`;
    console.error(msg);
    throw new LocalKeyError(msg, 'LOCAL_KEY_UNREADABLE');
  }

  const newKey = randomBytes(32);
  try {
    writeFileAtomic(keyPath, newKey);
    writeFileAtomic(backupPath, newKey);
  } catch (err) {
    console.error('[LocalKey] Failed to persist newly generated key:', err);
  }
  localKey = newKey;
  return localKey;
}

export function clearLocalKey(): void {
  const keyPath = getKeyFilePath();
  const backupPath = getBackupFilePath();
  const pinPath = getPinFilePath();

  if (fs.existsSync(keyPath)) {
    try { fs.unlinkSync(keyPath); } catch {}
  }
  if (fs.existsSync(backupPath)) {
    try { fs.unlinkSync(backupPath); } catch {}
  }
  if (fs.existsSync(pinPath)) {
    try { fs.unlinkSync(pinPath); } catch {}
  }
  localKey = null;
}