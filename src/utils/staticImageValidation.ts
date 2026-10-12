export function isStaticImageExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp';
}

export function isStaticImageDataUrl(dataUrl: string): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  if (dataUrl.startsWith('data:image/gif') || dataUrl.startsWith('data:video/')) {
    return false;
  }
  const base64Index = dataUrl.indexOf(',');
  const base64 = base64Index !== -1 ? dataUrl.slice(base64Index + 1, base64Index + 65536) : dataUrl.slice(0, 65536);
  try {
    const raw = atob(base64);
    if (raw.startsWith('GIF')) return false;
    if (raw.includes('acTL')) return false;
    if (raw.includes('ANIM')) return false;
  } catch {}
  return true;
}

export async function isStaticImageFile(fileOrPath: File | string): Promise<{ ok: boolean; reason?: string }> {
  if (typeof fileOrPath === 'string') {
    if (!isStaticImageExtension(fileOrPath)) {
      return { ok: false, reason: 'format' };
    }
    return { ok: true };
  }
  const ext = fileOrPath.name?.split('.').pop()?.toLowerCase();
  const allowed = ['jpg', 'jpeg', 'png', 'webp'];
  if (!ext || !allowed.includes(ext)) {
    return { ok: false, reason: 'format' };
  }
  if (fileOrPath.type && !['image/png', 'image/jpeg', 'image/webp'].includes(fileOrPath.type)) {
    return { ok: false, reason: 'format' };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
          resolve({ ok: false, reason: 'animated' });
          return;
        }
        for (let i = 0; i < Math.min(bytes.length - 4, 32768); i++) {
          if (bytes[i] === 0x61 && bytes[i + 1] === 0x63 && bytes[i + 2] === 0x54 && bytes[i + 3] === 0x4c) {
            resolve({ ok: false, reason: 'animated' });
            return;
          }
        }
        for (let i = 0; i < Math.min(bytes.length - 4, 32768); i++) {
          if (bytes[i] === 0x41 && bytes[i + 1] === 0x4e && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4d) {
            resolve({ ok: false, reason: 'animated' });
            return;
          }
        }
        resolve({ ok: true });
      } catch {
        resolve({ ok: true });
      }
    };
    reader.onerror = () => resolve({ ok: true });
    reader.readAsArrayBuffer(fileOrPath.slice(0, 65536));
  });
}
