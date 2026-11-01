import { LinkPreviewData } from '../store/useChatStore';

const previewCache = new Map<string, LinkPreviewData | null>();

export function isOrbitaInviteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('orbitachat.vercel.app') ||
    lower.includes('orbitad.vercel.app') ||
    lower.includes('orbita.workers.dev') ||
    lower.includes('/groups/#') ||
    lower.includes('/groups/') ||
    lower.includes('localhost') ||
    lower.includes('127.0.0.1')
  );
}

export function isValidLinkPreview(data: LinkPreviewData | null | undefined): boolean {
  if (!data) return false;
  if (isOrbitaInviteUrl(data.url)) return false;
  const hasImage = Boolean(data.image && data.image.trim().length > 0);
  const hasDesc = Boolean(data.description && data.description.trim().length > 10);
  return hasImage || hasDesc;
}

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(
    /\b(?:https?:\/\/|ftp:\/\/)?(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s]*)?/i
  );
  if (!match) return null;
  let url = match[0].trim();
  if (!url.match(/^(https?:\/\/|ftp:\/\/)/i)) {
    url = `https://${url}`;
  }
  return url;
}

export function getDomainHost(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return urlStr;
  }
}

export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.slice(1).split('/')[0] || null;
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || null;
      }
      return url.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchYouTubePreview(cleanUrl: string): Promise<LinkPreviewData | null> {
  const videoId = extractYouTubeVideoId(cleanUrl);
  if (!videoId) return null;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
    let responseText = '';
    if (typeof window !== 'undefined' && (window as any).orbita?.fetchUrl) {
      responseText = await (window as any).orbita.fetchUrl(oembedUrl);
    } else {
      const resp = await fetch(oembedUrl);
      if (!resp.ok) throw new Error();
      responseText = await resp.text();
    }

    const data = JSON.parse(responseText);
    const image = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return {
      url: cleanUrl,
      siteName: 'YouTube',
      title: data.title || 'YouTube Video',
      description: data.author_name ? `Автор: ${data.author_name}` : '',
      image,
    };
  } catch {
    return {
      url: cleanUrl,
      siteName: 'YouTube',
      title: 'YouTube Video',
      description: '',
      image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

function parseOpenGraph(html: string, targetUrl: string): LinkPreviewData | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const getMeta = (property: string) => {
    const el =
      doc.querySelector(`meta[property="${property}"]`) ||
      doc.querySelector(`meta[name="${property}"]`) ||
      doc.querySelector(`meta[property="og:${property}"]`) ||
      doc.querySelector(`meta[name="og:${property}"]`);
    return el ? el.getAttribute('content')?.trim() || '' : '';
  };

  const title =
    getMeta('og:title') ||
    getMeta('twitter:title') ||
    getMeta('title') ||
    doc.querySelector('title')?.textContent?.trim() ||
    '';

  const description =
    getMeta('og:description') ||
    getMeta('twitter:description') ||
    getMeta('description') ||
    '';

  let image =
    getMeta('og:image') ||
    getMeta('twitter:image') ||
    getMeta('og:image:url') ||
    getMeta('image') ||
    doc.querySelector('link[rel="image_src"]')?.getAttribute('href') ||
    doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
    '';

  if (image && !image.match(/^(https?:\/\/|data:)/i)) {
    try {
      image = new URL(image, targetUrl).href;
    } catch {
      image = '';
    }
  }

  const siteName =
    getMeta('og:site_name') ||
    getMeta('application-name') ||
    getDomainHost(targetUrl);

  const preview: LinkPreviewData = {
    url: targetUrl,
    siteName,
    title,
    description: description.length > 250 ? `${description.slice(0, 250)}...` : description,
    image,
  };

  if (!isValidLinkPreview(preview)) {
    return null;
  }

  return preview;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  if (!url) return null;
  const cleanUrl = url.trim();

  if (isOrbitaInviteUrl(cleanUrl)) {
    return null;
  }

  if (previewCache.has(cleanUrl)) {
    return previewCache.get(cleanUrl) || null;
  }

  if (extractYouTubeVideoId(cleanUrl)) {
    const ytPreview = await fetchYouTubePreview(cleanUrl);
    if (ytPreview && isValidLinkPreview(ytPreview)) {
      previewCache.set(cleanUrl, ytPreview);
      return ytPreview;
    }
    return null;
  }

  if (typeof window !== 'undefined' && (window as any).orbita?.fetchLinkPreview) {
    try {
      const nativePreview = await (window as any).orbita.fetchLinkPreview(cleanUrl);
      if (isValidLinkPreview(nativePreview)) {
        previewCache.set(cleanUrl, nativePreview);
        return nativePreview;
      }
      previewCache.set(cleanUrl, null);
      return null;
    } catch {
      previewCache.set(cleanUrl, null);
      return null;
    }
  }

  try {
    const goBackendUrl = `http://localhost:8080/api/preview?url=${encodeURIComponent(cleanUrl)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const goResp = await fetch(goBackendUrl, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeoutId);

    if (goResp && goResp.ok) {
      const goData = await goResp.json();
      if (goData.has_preview && isValidLinkPreview(goData)) {
        const preview: LinkPreviewData = {
          url: goData.url || cleanUrl,
          title: goData.title,
          description: goData.description,
          image: goData.image,
          siteName: goData.site_name,
        };
        previewCache.set(cleanUrl, preview);
        return preview;
      }
      previewCache.set(cleanUrl, null);
      return null;
    }
  } catch {
  }

  try {
    let html = '';
    if (typeof window !== 'undefined' && (window as any).orbita?.fetchUrl) {
      html = await (window as any).orbita.fetchUrl(cleanUrl);
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const resp = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error();
      html = await resp.text();
    }

    const preview = parseOpenGraph(html, cleanUrl);
    if (preview && isValidLinkPreview(preview)) {
      previewCache.set(cleanUrl, preview);
      return preview;
    }
    previewCache.set(cleanUrl, null);
    return null;
  } catch {
    previewCache.set(cleanUrl, null);
    return null;
  }
}
