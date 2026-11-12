import { extractGroupCode } from '../lib/groupCrypto';

export const BASE_INVITE_URL = 'https://orbita-chess-network.alwaysdata.net/u';
export const ORBITA_PRIMARY_DOMAIN = 'https://orbitachat.vercel.app';

export type ParsedOrbitaLink =
  | { kind: 'group'; identifier: string; raw: string }
  | { kind: 'channel'; identifier: string; raw: string }
  | { kind: 'user'; identifier: string; raw: string }
  | { kind: 'slug'; identifier: string; raw: string };

export function buildChannelInviteLink(channel: { id: string; username?: string | null }): string {
  if (!channel?.id) return '';
  const cleanUsername = channel.username ? channel.username.replace(/^@+/, '').trim().toLowerCase() : '';
  if (cleanUsername) {
    return `${ORBITA_PRIMARY_DOMAIN}/${encodeURIComponent(cleanUsername)}`;
  }
  return `${ORBITA_PRIMARY_DOMAIN}/c/${encodeURIComponent(channel.id)}`;
}

export function parseOrbitaLink(input: string): ParsedOrbitaLink | null {
  if (!input) return null;
  const trimmed = input.trim();

  const groupCode = extractGroupCode(trimmed);
  if (groupCode) {
    return { kind: 'group', identifier: groupCode, raw: trimmed };
  }

  const channelMatch = trimmed.match(/(?:\/(?:c|channel)\/|orbita:\/\/(?:c|channel)\/)([a-zA-Z0-9_-]{3,64})/i);
  if (channelMatch && channelMatch[1]) {
    return { kind: 'channel', identifier: channelMatch[1], raw: trimmed };
  }

  const userMatch = trimmed.match(/(?:\/u\/|orbita:\/\/(?:u|connect)\/)([a-zA-Z0-9_-]{2,64})/i);
  if (userMatch && userMatch[1]) {
    return { kind: 'user', identifier: userMatch[1], raw: trimmed };
  }

  const queryUserMatch = trimmed.match(/[?&](?:code|id)=([a-zA-Z0-9_-]{2,64})/i);
  if (queryUserMatch && queryUserMatch[1]) {
    return { kind: 'user', identifier: queryUserMatch[1], raw: trimmed };
  }

  const slugMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)*(?:orbitachat\.vercel\.app|orbitad\.vercel\.app|orbita\.app|orbita\.chat)\/@?([a-zA-Z0-9_]{3,32})\/?(?:\?.*)?$/i
  );
  if (slugMatch && slugMatch[1]) {
    const slug = slugMatch[1].toLowerCase();
    const reserved = ['group', 'groups', 'channel', 'channels', 'c', 'u', 'join', 'invite', 'connect', 'api', 'health'];
    if (!reserved.includes(slug)) {
      return { kind: 'slug', identifier: slug, raw: trimmed };
    }
  }

  const orbitaSchemeSlug = trimmed.match(/^orbita:\/\/@?([a-zA-Z0-9_]{3,32})\/?(?:\?.*)?$/i);
  if (orbitaSchemeSlug && orbitaSchemeSlug[1]) {
    const slug = orbitaSchemeSlug[1].toLowerCase();
    const reserved = ['group', 'groups', 'channel', 'channels', 'c', 'u', 'join', 'invite', 'connect', 'api', 'health'];
    if (!reserved.includes(slug)) {
      return { kind: 'slug', identifier: slug, raw: trimmed };
    }
  }

  if (trimmed.startsWith('@')) {
    const cleanAt = trimmed.replace(/^@+/, '').trim().toLowerCase();
    if (/^[a-z0-9_]{3,32}$/.test(cleanAt)) {
      return { kind: 'slug', identifier: cleanAt, raw: trimmed };
    }
  }

  return null;
}

export function getInviteLink(code: string): string {
  if (!code) return '';
  const cleanCode = code.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(cleanCode) && /^[a-zA-Z0-9_]{3,32}$/.test(cleanCode)) {
    return `${ORBITA_PRIMARY_DOMAIN}/${encodeURIComponent(cleanCode)}`;
  }
  return `${BASE_INVITE_URL}/${encodeURIComponent(cleanCode)}`;
}

const EXPLICIT_GROUP_INVITE_RE =
  /(?:^|\/)(?:g|group|groups|join|invite)(?:\/|$|\?)|#[a-zA-Z0-9_-]{6,64}|(?:^|[?&])(?:group|token)=|join_[a-zA-Z0-9_-]{6,32}|orbita:\/\/(?:group|groups|join|invite)/i;

export function extractCodeFromInput(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  if (EXPLICIT_GROUP_INVITE_RE.test(trimmed) && extractGroupCode(trimmed)) {
    return '';
  }

  const urlMatch = trimmed.match(/\/u\/([a-zA-Z0-9_-]{2,64})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  const queryMatch = trimmed.match(/[?&](?:code|id)=([a-zA-Z0-9_-]{2,64})/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  const deepLinkMatch = trimmed.match(/orbita:\/\/(?:connect|u)?\/?(?:code=)?([a-zA-Z0-9_-]{2,64})/i);
  if (deepLinkMatch && deepLinkMatch[1]) {
    return deepLinkMatch[1];
  }

  return trimmed;
}
