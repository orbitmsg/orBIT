export const MAX_AVATAR_BANNER_SIZE = 3 * 1024 * 1024;

export const SUPPORTED_MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'];

export function isStaticImageExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase()?.split('?')[0];
  return Boolean(ext && SUPPORTED_MEDIA_EXTENSIONS.includes(ext));
}

export function isAnimatedMedia(src: string): boolean {
  if (!src || typeof src !== 'string') return false;
  const lower = src.toLowerCase();
  if (lower.startsWith('data:image/gif') || lower.startsWith('data:video/')) return true;
  if (lower.includes('/video/')) return true;
  const ext = lower.split('.').pop()?.split('?')[0];
  if (ext && ['gif', 'mp4', 'webm', 'mov'].includes(ext)) return true;

  const base64Index = src.indexOf(',');
  if (base64Index !== -1) {
    const chunk = src.slice(base64Index + 1, base64Index + 16384);
    try {
      const raw = atob(chunk);
      if (raw.startsWith('GIF')) return true;
      if (raw.includes('acTL')) return true;
      if (raw.includes('ANIM')) return true;
    } catch {}
  }
  return false;
}

export function isStaticImageDataUrl(dataUrl: string): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
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
  if (!ext || !SUPPORTED_MEDIA_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: 'format' };
  }

  if (fileOrPath.size > MAX_AVATAR_BANNER_SIZE) {
    return { ok: false, reason: 'too_large' };
  }

  return { ok: true };
}

export function getMediaInfoFromDataUrl(dataUrl: string): { ext: string; mime: string } {
  if (!dataUrl || typeof dataUrl !== 'string') return { ext: 'png', mime: 'image/png' };
  const lower = dataUrl.toLowerCase();
  if (lower.startsWith('data:image/gif')) return { ext: 'gif', mime: 'image/gif' };
  if (lower.startsWith('data:video/mp4')) return { ext: 'mp4', mime: 'video/mp4' };
  if (lower.startsWith('data:video/webm')) return { ext: 'webm', mime: 'video/webm' };
  if (lower.startsWith('data:video/quicktime')) return { ext: 'mov', mime: 'video/quicktime' };
  if (lower.startsWith('data:image/webp')) return { ext: 'webp', mime: 'image/webp' };
  if (lower.startsWith('data:image/jpeg') || lower.startsWith('data:image/jpg')) return { ext: 'jpg', mime: 'image/jpeg' };
  if (lower.startsWith('data:image/png')) return { ext: 'png', mime: 'image/png' };

  const base64Index = dataUrl.indexOf(',');
  if (base64Index !== -1) {
    const chunk = dataUrl.slice(base64Index + 1, base64Index + 1024);
    try {
      const raw = atob(chunk);
      if (raw.startsWith('GIF')) return { ext: 'gif', mime: 'image/gif' };
      if (raw.startsWith('\x89PNG')) return { ext: 'png', mime: 'image/png' };
      if (raw.startsWith('\xFF\xD8\xFF')) return { ext: 'jpg', mime: 'image/jpeg' };
      if (raw.includes('ftypmp4') || raw.includes('ftypisom')) return { ext: 'mp4', mime: 'video/mp4' };
    } catch {}
  }

  return { ext: 'png', mime: 'image/png' };
}
