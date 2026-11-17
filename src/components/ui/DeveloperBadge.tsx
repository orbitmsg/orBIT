import React, { useEffect } from 'react';
import { supabaseService } from '../../services/supabaseService';
import { useToastStore } from '../../store/useToastStore';
import { sqliteStorage } from '../../services/sqliteStorage';
import { OrbitIcon } from '../common/OrbitBrand';

export const DEV_BADGE_COLOR = '#917bbd';

const STORAGE_KEY = 'orbita_cached_dev_codes_v2';
const LAST_FETCH_KEY = 'orbita_dev_codes_last_fetch';

let developerCodes: Set<string> = new Set();
let lastFetchTime = 0;
const listeners = new Set<() => void>();

sqliteStorage.getJson<string[]>(STORAGE_KEY, []).then((list) => {
  if (Array.isArray(list) && list.length > 0) {
    developerCodes = new Set(list.map((c: string) => c.trim()));
    notifyListeners();
  }
}).catch(() => {});

sqliteStorage.get(LAST_FETCH_KEY).then((val) => {
  if (val) lastFetchTime = Number(val) || 0;
}).catch(() => {});

const notifyListeners = () => {
  listeners.forEach((fn) => fn());
};

export const loadDeveloperCodes = async (force = false): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const now = Date.now();

  if (!force && developerCodes.size > 0 && now - lastFetchTime < 60 * 1000) {
    return true;
  }

  try {
    const codes = await supabaseService.getDeveloperCodes();
    if (codes && Array.isArray(codes)) {
      developerCodes = new Set(codes.map((c) => c.trim()));
      lastFetchTime = now;
      sqliteStorage.setJson(STORAGE_KEY, Array.from(developerCodes)).catch(() => {});
      sqliteStorage.set(LAST_FETCH_KEY, String(now)).catch(() => {});
      notifyListeners();
      return true;
    }
  } catch (err) {
    console.warn('[DeveloperBadge] Background revalidation failed, preserving persistent cache:', err);
  }
  return false;
};

export const revalidateDevelopersOnConnection = async (userId?: string): Promise<boolean> => {
  try {
    await loadDeveloperCodes(false);
  } catch {}
  return isDeveloper(userId);
};

if (typeof window !== 'undefined') {
  loadDeveloperCodes(true);

  supabaseService.subscribeToDevelopers((newCodes) => {
    if (newCodes && newCodes.length > 0) {
      developerCodes = new Set(newCodes.map((c) => c.trim()));
      sqliteStorage.setJson(STORAGE_KEY, Array.from(developerCodes)).catch(() => {});
      sqliteStorage.set(LAST_FETCH_KEY, String(Date.now())).catch(() => {});
      notifyListeners();
    }
  });

  setInterval(() => {
    loadDeveloperCodes(true);
  }, 5 * 60 * 1000);
}

export const isDeveloper = (userId: string | undefined | null): boolean => {
  if (!userId) return false;
  const trimmed = userId.trim();
  return (
    developerCodes.has(trimmed) ||
    developerCodes.has(trimmed.toUpperCase()) ||
    developerCodes.has(trimmed.toLowerCase())
  );
};

export const OrbitaBadgeIcon: React.FC<{ size?: number | string; color?: string; className?: string }> = ({
  size = '100%',
  color = DEV_BADGE_COLOR,
  className = '',
}) => (
  <OrbitIcon size={size} color={color} className={className} />
);

interface DeveloperBadgeProps {
  userId?: string | null;
  nickname?: string | null;
  username?: string | null;
  numericId?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

export const DeveloperBadge: React.FC<DeveloperBadgeProps> = ({
  userId,
  nickname,
  username,
  numericId,
  size = 15,
  className = '',
  style = {},
  onClick,
}) => {
  const [, setTick] = React.useState(0);

  useEffect(() => {
    const update = () => setTick((t) => t + 1);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const isDev =
    isDeveloper(userId) ||
    isDeveloper(nickname) ||
    isDeveloper(username) ||
    isDeveloper(numericId);
  if (!isDev) return null;

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
    } else {
      e.stopPropagation();
      useToastStore.getState().showDevToast(nickname || userId || undefined);
    }
  };

  return (
    <span
      onClick={handleClick}
      className={`developer-badge-icon ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        width: size,
        height: size,
        flexShrink: 0,
        verticalAlign: 'middle',
        color: DEV_BADGE_COLOR,
        ...style,
      }}
    >
      <OrbitaBadgeIcon size={size} color={DEV_BADGE_COLOR} />
    </span>
  );
};

export const DeveloperToast: React.FC<{
  isOpen: boolean;
  nickname?: string;
}> = ({ isOpen, nickname }) => {
  useEffect(() => {
    if (isOpen) {
      useToastStore.getState().showDevToast(nickname);
    }
  }, [isOpen, nickname]);

  return null;
};
