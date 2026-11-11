import { create } from 'zustand';
import { sqliteStorage } from '../services/sqliteStorage';
import { parseProxyInput, type ProxyType, type ParsedProxyProfile } from '../lib/proxyParser';
import { useChatStore } from './useChatStore';

export type { ProxyType, ParsedProxyProfile };

export interface ProxyProfile {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  method?: string;
  sni?: string;
  allowInsecure?: boolean;
  ping?: number | null;
  pingStatus?: 'success' | 'error' | 'testing' | 'idle';
  lastError?: string;
  lastChecked?: number;
  exitIp?: string;
}

export interface ProxyConfigPayload {
  host: string;
  port: number;
  type: ProxyType;
  username?: string;
  password?: string;
  method?: string;
  sni?: string;
  allowInsecure?: boolean;
  proxyCalls: boolean;
}

export interface VerifyProxyResult {
  success: boolean;
  exitIp?: string;
  ping?: number;
  error?: string;
}

export interface ConnectionState {
  proxyEnabled: boolean;
  activeProxyId: string | null;
  proxies: ProxyProfile[];
  killSwitch: boolean;
  proxyCalls: boolean;
  autoFallback: boolean;
  isApplying: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  isServerConnected: boolean;
  errorMessage: string | null;

  initConnection: () => Promise<void>;
  setServerConnected: (connected: boolean) => void;
  setProxyEnabled: (enabled: boolean) => Promise<void>;
  setActiveProxy: (id: string) => Promise<void>;
  addProxy: (proxy: Omit<ProxyProfile, 'id'>) => Promise<string>;
  addProxiesBulk: (list: Array<Omit<ProxyProfile, 'id'>>) => Promise<string[]>;
  updateProxy: (id: string, updates: Partial<ProxyProfile>) => Promise<void>;
  deleteProxy: (id: string) => Promise<void>;
  setKillSwitch: (enabled: boolean) => Promise<void>;
  setProxyCalls: (enabled: boolean) => Promise<void>;
  setAutoFallback: (enabled: boolean) => void;
  checkPing: (id: string) => Promise<number | null>;
  checkAllPings: () => Promise<void>;
  verifyActiveProxy: () => Promise<VerifyProxyResult>;
  clearError: () => void;
  parseProxyUrl: (input: string) => Partial<ProxyProfile> | null;
}

interface PersistedConnectionState {
  proxyEnabled: boolean;
  activeProxyId: string | null;
  proxies: ProxyProfile[];
  killSwitch: boolean;
  proxyCalls: boolean;
  autoFallback: boolean;
}

interface OrbitaProxyBridge {
  setProxy?: (config: ProxyConfigPayload) => Promise<{ success: boolean; localPort?: number; error?: string }>;
  clearProxy?: () => Promise<{ success: boolean; error?: string }>;
  setKillSwitchIsolation?: (isolate: boolean) => Promise<{ success: boolean; error?: string }>;
  checkProxyPing?: (
    configOrHost: ProxyConfigPayload | string,
    port?: number,
    timeoutMs?: number
  ) => Promise<{ success: boolean; ping?: number; error?: string }>;
  verifyProxyConnection?: (config?: ProxyConfigPayload) => Promise<VerifyProxyResult>;
}

const STORAGE_KEY = 'orbita_connection_settings';
const HEALTH_CHECK_INTERVAL_MS = 25000;

const VALID_TYPES: ReadonlySet<string> = new Set([
  'socks5',
  'socks5h',
  'socks4',
  'socks4a',
  'http',
  'https',
  'ss',
  'trojan',
]);

const DEFAULT_PROXIES: ProxyProfile[] = [
  {
    id: 'default-socks5-1',
    name: 'SOCKS5 127.0.0.1:1080',
    type: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    ping: null,
    pingStatus: 'idle',
  },
];

let isHydrated = false;
let initPromise: Promise<void> | null = null;
let healthMonitorTimer: ReturnType<typeof setInterval> | null = null;
let healthCheckInFlight = false;
let failoverInFlight = false;
const preHydrationMutations = new Set<keyof PersistedConnectionState>();

const getOrbitaProxyBridge = (): OrbitaProxyBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { orbita?: OrbitaProxyBridge }).orbita;
};

const normalizeType = (raw: unknown): ProxyType => {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'socks') return 'socks5';
  if (s === 'shadowsocks') return 'ss';
  if (VALID_TYPES.has(s)) return s as ProxyType;
  return 'socks5';
};

const normalizeStoredProxy = (raw: any): ProxyProfile => {
  const port = Number(raw?.port);
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : `${raw?.host || '127.0.0.1'}:${port || 1080}`,
    type: normalizeType(raw?.type),
    host: typeof raw?.host === 'string' ? raw.host.trim() : '',
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 1080,
    username: typeof raw?.username === 'string' && raw.username ? raw.username : undefined,
    password: typeof raw?.password === 'string' && raw.password !== '' ? raw.password : undefined,
    method: typeof raw?.method === 'string' && raw.method ? raw.method : undefined,
    sni: typeof raw?.sni === 'string' && raw.sni ? raw.sni : undefined,
    allowInsecure: Boolean(raw?.allowInsecure) || undefined,
    ping: typeof raw?.ping === 'number' ? raw.ping : null,
    pingStatus: raw?.pingStatus === 'testing' ? 'idle' : raw?.pingStatus || 'idle',
    lastError: typeof raw?.lastError === 'string' ? raw.lastError : undefined,
    lastChecked: typeof raw?.lastChecked === 'number' ? raw.lastChecked : undefined,
    exitIp: typeof raw?.exitIp === 'string' ? raw.exitIp : undefined,
  };
};

const buildProxyPayload = (proxy: ProxyProfile, proxyCalls: boolean): ProxyConfigPayload => ({
  host: proxy.host,
  port: proxy.port,
  type: proxy.type,
  username: proxy.username,
  password: proxy.password,
  method: proxy.method,
  sni: proxy.sni,
  allowInsecure: proxy.allowInsecure,
  proxyCalls,
});

const proxyIdentityKey = (proxy: Omit<ProxyProfile, 'id'>): string =>
  [
    proxy.type,
    proxy.host.trim().toLowerCase(),
    proxy.port,
    proxy.username || '',
    proxy.password || '',
    proxy.method || '',
    proxy.sni || '',
  ].join('|');

const syncChatStoreProxy = (connected: boolean, proxy: ProxyProfile | null) => {
  try {
    const chatStore = useChatStore.getState();
    if (connected && proxy) {
      chatStore.setProxyActive(true, {
        protocol: proxy.type.toUpperCase(),
        address: proxy.host,
        port: proxy.port,
      });
    } else {
      chatStore.setProxyActive(false, null);
    }
  } catch {}
};

const persistStateNow = (state: ConnectionState) => {
  const toSave: PersistedConnectionState = {
    proxyEnabled: state.proxyEnabled,
    activeProxyId: state.activeProxyId,
    proxies: state.proxies,
    killSwitch: state.killSwitch,
    proxyCalls: state.proxyCalls,
    autoFallback: state.autoFallback,
  };
  sqliteStorage.setJson(STORAGE_KEY, toSave).catch(() => {});
};

const saveState = (state: ConnectionState, mutatedKeys?: Array<keyof PersistedConnectionState>) => {
  if (!isHydrated) {
    if (mutatedKeys) {
      for (const k of mutatedKeys) {
        preHydrationMutations.add(k);
      }
    }
    return;
  }
  persistStateNow(state);
};

const stopHealthMonitor = () => {
  if (healthMonitorTimer !== null) {
    clearInterval(healthMonitorTimer);
    healthMonitorTimer = null;
  }
};

const startHealthMonitor = () => {
  if (healthMonitorTimer !== null) return;
  healthMonitorTimer = setInterval(() => {
    if (healthCheckInFlight || failoverInFlight) return;
    const state = useConnectionStore.getState();
    if (!state.proxyEnabled || !state.activeProxyId) {
      stopHealthMonitor();
      return;
    }
    if (state.isApplying || state.connectionStatus === 'connecting') return;
    healthCheckInFlight = true;
    state
      .checkPing(state.activeProxyId)
      .catch(() => {})
      .finally(() => {
        healthCheckInFlight = false;
      });
  }, HEALTH_CHECK_INTERVAL_MS);
};

const testSingleProxy = async (
  proxy: ProxyProfile,
  proxyCalls: boolean,
  timeoutMs = 5000
): Promise<{ success: boolean; ping: number | null; error?: string }> => {
  const orbita = getOrbitaProxyBridge();
  if (orbita?.checkProxyPing) {
    try {
      const res = await orbita.checkProxyPing(buildProxyPayload(proxy, proxyCalls), undefined, timeoutMs);
      const pingVal = res?.success && typeof res.ping === 'number' ? res.ping : null;
      const status = res?.success ? 'success' : 'error';
      const errText = res?.success ? undefined : res?.error || 'Proxy check failed';
      useConnectionStore.setState((prev) => ({
        proxies: prev.proxies.map((p) =>
          p.id === proxy.id
            ? {
                ...p,
                ping: pingVal,
                pingStatus: status,
                lastError: errText,
                lastChecked: Date.now(),
              }
            : p
        ),
      }));
      return { success: Boolean(res?.success), ping: pingVal, error: errText };
    } catch (err: any) {
      const errText = err?.message || 'Proxy check failed';
      useConnectionStore.setState((prev) => ({
        proxies: prev.proxies.map((p) =>
          p.id === proxy.id
            ? {
                ...p,
                ping: null,
                pingStatus: 'error',
                lastError: errText,
                lastChecked: Date.now(),
              }
            : p
        ),
      }));
      return { success: false, ping: null, error: errText };
    }
  }

  const fallbackPing = Math.floor(Math.random() * 80) + 30;
  useConnectionStore.setState((prev) => ({
    proxies: prev.proxies.map((p) =>
      p.id === proxy.id
        ? {
            ...p,
            ping: fallbackPing,
            pingStatus: 'success',
            lastError: undefined,
            lastChecked: Date.now(),
          }
        : p
    ),
  }));
  return { success: true, ping: fallbackPing };
};

const handleProxyFailure = async (failedId: string, reason: string): Promise<void> => {
  if (failoverInFlight) return;
  failoverInFlight = true;
  try {
    const state = useConnectionStore.getState();
    if (!state.proxyEnabled || state.activeProxyId !== failedId) return;

    if (state.autoFallback) {
      const candidates = state.proxies.filter((p) => p.id !== failedId);
      if (candidates.length > 0) {
        const results = await Promise.all(
          candidates.map(async (candidate) => {
            const res = await testSingleProxy(candidate, state.proxyCalls, 4500);
            return { candidate, res };
          })
        );

        const latestBeforeSwitch = useConnectionStore.getState();
        if (!latestBeforeSwitch.proxyEnabled || latestBeforeSwitch.activeProxyId !== failedId) return;

        const working = results
          .filter((item) => item.res.success && item.res.ping !== null)
          .sort((a, b) => (a.res.ping ?? Number.MAX_SAFE_INTEGER) - (b.res.ping ?? Number.MAX_SAFE_INTEGER));

        const best = working[0]?.candidate;
        if (best) {
          useConnectionStore.setState({
            activeProxyId: best.id,
            isApplying: true,
            connectionStatus: 'connecting',
            errorMessage: null,
          });
          saveState(useConnectionStore.getState(), ['activeProxyId']);

          const orbita = getOrbitaProxyBridge();
          if (orbita?.setProxy) {
            const applyRes = await orbita.setProxy(buildProxyPayload(best, useConnectionStore.getState().proxyCalls));
            const afterApply = useConnectionStore.getState();
            if (!afterApply.proxyEnabled || afterApply.activeProxyId !== best.id) return;

            if (applyRes?.success) {
              useConnectionStore.setState({
                connectionStatus: 'connected',
                isApplying: false,
                errorMessage: null,
              });
              syncChatStoreProxy(true, best);
              startHealthMonitor();
              return;
            }
          } else {
            useConnectionStore.setState({
              connectionStatus: 'connected',
              isApplying: false,
              errorMessage: null,
            });
            syncChatStoreProxy(true, best);
            startHealthMonitor();
            return;
          }
        }
      }
    }

    const latest = useConnectionStore.getState();
    if (!latest.proxyEnabled) return;

    useConnectionStore.setState({
      connectionStatus: 'error',
      isApplying: false,
      errorMessage: reason,
    });
    syncChatStoreProxy(false, null);

    if (latest.killSwitch) {
      const orbita = getOrbitaProxyBridge();
      if (orbita?.setKillSwitchIsolation) {
        await orbita.setKillSwitchIsolation(true).catch(() => {});
      }
    }
  } finally {
    failoverInFlight = false;
  }
};

const applyActiveProxy = async (verifyAfterApply = true): Promise<boolean> => {
  const state = useConnectionStore.getState();
  const orbita = getOrbitaProxyBridge();

  if (!state.proxyEnabled) {
    stopHealthMonitor();
    if (orbita?.setKillSwitchIsolation) {
      await orbita.setKillSwitchIsolation(false).catch(() => {});
    }
    if (orbita?.clearProxy) {
      await orbita.clearProxy().catch(() => {});
    }
    useConnectionStore.setState({
      connectionStatus: 'disconnected',
      isApplying: false,
      errorMessage: null,
    });
    syncChatStoreProxy(false, null);
    return false;
  }

  let active = state.proxies.find((p) => p.id === state.activeProxyId) || null;
  if (!active && state.proxies.length > 0) {
    active = state.proxies[0];
    useConnectionStore.setState({ activeProxyId: active.id });
    saveState(useConnectionStore.getState(), ['activeProxyId']);
  }

  if (!active) {
    stopHealthMonitor();
    useConnectionStore.setState({
      proxyEnabled: false,
      activeProxyId: null,
      connectionStatus: 'disconnected',
      isApplying: false,
      errorMessage: null,
    });
    saveState(useConnectionStore.getState(), ['proxyEnabled', 'activeProxyId']);
    if (orbita?.setKillSwitchIsolation) {
      await orbita.setKillSwitchIsolation(false).catch(() => {});
    }
    if (orbita?.clearProxy) {
      await orbita.clearProxy().catch(() => {});
    }
    syncChatStoreProxy(false, null);
    return false;
  }

  useConnectionStore.setState({
    isApplying: true,
    connectionStatus: 'connecting',
    errorMessage: null,
  });

  if (!orbita?.setProxy) {
    useConnectionStore.setState({
      connectionStatus: 'connected',
      isApplying: false,
      errorMessage: null,
    });
    syncChatStoreProxy(true, active);
    startHealthMonitor();
    return true;
  }

  try {
    const res = await orbita.setProxy(buildProxyPayload(active, useConnectionStore.getState().proxyCalls));
    const latest = useConnectionStore.getState();
    if (!latest.proxyEnabled || latest.activeProxyId !== active.id) {
      return false;
    }

    if (!res?.success) {
      await handleProxyFailure(active.id, res?.error || 'Failed to apply proxy');
      return false;
    }

    useConnectionStore.setState({
      connectionStatus: 'connected',
      isApplying: false,
      errorMessage: null,
    });
    syncChatStoreProxy(true, active);
    startHealthMonitor();

    if (verifyAfterApply) {
      const checkRes = await testSingleProxy(active, useConnectionStore.getState().proxyCalls, 5000);
      const afterCheck = useConnectionStore.getState();
      if (!afterCheck.proxyEnabled || afterCheck.activeProxyId !== active.id) {
        return true;
      }
      if (!checkRes.success) {
        await handleProxyFailure(active.id, checkRes.error || 'Proxy unreachable');
        return false;
      }
    }

    return true;
  } catch (err: any) {
    await handleProxyFailure(active.id, err?.message || 'Failed to apply proxy');
    return false;
  }
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  proxyEnabled: false,
  activeProxyId: 'default-socks5-1',
  proxies: DEFAULT_PROXIES,
  killSwitch: false,
  proxyCalls: true,
  autoFallback: false,
  isApplying: false,
  connectionStatus: 'disconnected',
  isServerConnected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  errorMessage: null,

  setServerConnected: (connected: boolean) => set({ isServerConnected: connected }),

  initConnection: async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      await hydrationPromise;
      const state = get();
      if (state.proxyEnabled && state.activeProxyId) {
        await applyActiveProxy(true);
      } else {
        const orbita = getOrbitaProxyBridge();
        if (orbita?.setKillSwitchIsolation) {
          await orbita.setKillSwitchIsolation(false).catch(() => {});
        }
        if (orbita?.clearProxy) {
          await orbita.clearProxy().catch(() => {});
        }
        stopHealthMonitor();
        set({ connectionStatus: 'disconnected', isApplying: false, errorMessage: null });
        syncChatStoreProxy(false, null);
      }
    })();
    return initPromise;
  },

  setProxyEnabled: async (enabled: boolean) => {
    if (enabled) {
      const state = get();
      const nextActiveId = state.activeProxyId || state.proxies[0]?.id || null;
      set({
        proxyEnabled: true,
        activeProxyId: nextActiveId,
        errorMessage: null,
      });
      saveState(get(), ['proxyEnabled', 'activeProxyId']);
      await applyActiveProxy(true);
    } else {
      stopHealthMonitor();
      set({
        proxyEnabled: false,
        isApplying: true,
        errorMessage: null,
      });
      saveState(get(), ['proxyEnabled']);

      const orbita = getOrbitaProxyBridge();
      if (orbita?.setKillSwitchIsolation) {
        await orbita.setKillSwitchIsolation(false).catch(() => {});
      }
      if (orbita?.clearProxy) {
        await orbita.clearProxy().catch(() => {});
      }
      set({
        connectionStatus: 'disconnected',
        isApplying: false,
        errorMessage: null,
      });
      syncChatStoreProxy(false, null);
    }
  },

  setActiveProxy: async (id: string) => {
    set({ activeProxyId: id, errorMessage: null });
    saveState(get(), ['activeProxyId']);

    if (get().proxyEnabled) {
      await applyActiveProxy(true);
    }
  },

  addProxy: async (proxyData) => {
    const id = `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newProxy: ProxyProfile = {
      ...proxyData,
      type: normalizeType(proxyData.type),
      id,
      ping: null,
      pingStatus: 'idle',
    };

    set((prev) => {
      const nextProxies = [...prev.proxies, newProxy];
      const activeId = prev.activeProxyId || id;
      return { proxies: nextProxies, activeProxyId: activeId };
    });
    saveState(get(), ['proxies', 'activeProxyId']);

    get().checkPing(id).catch(() => {});
    return id;
  },

  addProxiesBulk: async (list) => {
    if (!Array.isArray(list) || list.length === 0) return [];

    const existingKeys = new Set(get().proxies.map((p) => proxyIdentityKey(p)));
    const added: ProxyProfile[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const normalized: Omit<ProxyProfile, 'id'> = {
        ...item,
        type: normalizeType(item.type),
        host: item.host.trim(),
        port: Number(item.port),
        name: item.name?.trim() || `${item.host.trim()}:${item.port}`,
        ping: null,
        pingStatus: 'idle',
      };
      if (!normalized.host || !Number.isInteger(normalized.port) || normalized.port < 1 || normalized.port > 65535) {
        continue;
      }
      const key = proxyIdentityKey(normalized);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const id = `proxy-${baseTime}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      added.push({
        ...normalized,
        id,
      });
    }

    if (added.length === 0) return [];

    set((prev) => ({
      proxies: [...prev.proxies, ...added],
      activeProxyId: prev.activeProxyId || added[0].id,
    }));
    saveState(get(), ['proxies', 'activeProxyId']);

    const addedIds = added.map((p) => p.id);
    Promise.all(addedIds.map((id) => get().checkPing(id).catch(() => null))).catch(() => {});
    return addedIds;
  },

  updateProxy: async (id: string, updates: Partial<ProxyProfile>) => {
    set((prev) => ({
      proxies: prev.proxies.map((p) =>
        p.id === id
          ? {
              ...p,
              ...updates,
              type: updates.type ? normalizeType(updates.type) : p.type,
            }
          : p
      ),
    }));
    saveState(get(), ['proxies']);

    const state = get();
    if (state.proxyEnabled && state.activeProxyId === id) {
      await applyActiveProxy(true);
    }
  },

  deleteProxy: async (id: string) => {
    const state = get();
    const remaining = state.proxies.filter((p) => p.id !== id);
    const wasActive = state.activeProxyId === id;
    const nextActive = wasActive ? remaining[0]?.id || null : state.activeProxyId;

    set({
      proxies: remaining,
      activeProxyId: nextActive,
    });
    saveState(get(), ['proxies', 'activeProxyId']);

    if (state.proxyEnabled && wasActive) {
      if (nextActive) {
        await get().setActiveProxy(nextActive);
      } else {
        await get().setProxyEnabled(false);
      }
    }
  },

  setKillSwitch: async (enabled: boolean) => {
    set({ killSwitch: enabled });
    saveState(get(), ['killSwitch']);

    const state = get();
    const orbita = getOrbitaProxyBridge();
    if (enabled) {
      if (state.proxyEnabled && state.connectionStatus === 'error' && orbita?.setKillSwitchIsolation) {
        await orbita.setKillSwitchIsolation(true).catch(() => {});
      }
    } else {
      if (orbita?.setKillSwitchIsolation) {
        await orbita.setKillSwitchIsolation(false).catch(() => {});
      }
      if (state.proxyEnabled && state.activeProxyId && state.connectionStatus === 'error') {
        await applyActiveProxy(true);
      }
    }
  },

  setProxyCalls: async (enabled: boolean) => {
    set({ proxyCalls: enabled });
    saveState(get(), ['proxyCalls']);

    const state = get();
    if (state.proxyEnabled && state.activeProxyId) {
      await applyActiveProxy(false);
    }
  },

  setAutoFallback: (enabled: boolean) => {
    set({ autoFallback: enabled });
    saveState(get(), ['autoFallback']);

    const state = get();
    if (enabled && state.proxyEnabled && state.connectionStatus === 'error' && state.activeProxyId) {
      handleProxyFailure(state.activeProxyId, state.errorMessage || 'Proxy connection failed').catch(() => {});
    }
  },

  checkPing: async (id: string) => {
    const target = get().proxies.find((p) => p.id === id);
    if (!target) return null;

    set((prev) => ({
      proxies: prev.proxies.map((p) =>
        p.id === id ? { ...p, pingStatus: 'testing', lastError: undefined } : p
      ),
    }));

    const res = await testSingleProxy(target, get().proxyCalls, 5000);
    const state = get();

    if (state.proxyEnabled && state.activeProxyId === id) {
      if (!res.success) {
        await handleProxyFailure(id, res.error || 'Proxy check failed');
      } else if (state.connectionStatus === 'error') {
        await applyActiveProxy(false);
      }
    }

    return res.ping;
  },

  checkAllPings: async () => {
    const proxies = get().proxies;
    await Promise.all(proxies.map((p) => get().checkPing(p.id)));
  },

  verifyActiveProxy: async () => {
    const state = get();
    const active = state.proxies.find((p) => p.id === state.activeProxyId);
    if (!active) {
      return { success: false, error: 'No active proxy selected' };
    }

    const orbita = getOrbitaProxyBridge();
    if (orbita?.verifyProxyConnection) {
      try {
        const res = await orbita.verifyProxyConnection(buildProxyPayload(active, state.proxyCalls));
        set((prev) => ({
          proxies: prev.proxies.map((p) =>
            p.id === active.id
              ? {
                  ...p,
                  exitIp: res?.success && res.exitIp ? res.exitIp : p.exitIp,
                  ping: res?.success && typeof res.ping === 'number' ? res.ping : p.ping,
                  pingStatus: res?.success ? 'success' : 'error',
                  lastError: res?.success ? undefined : res?.error || 'Verification failed',
                  lastChecked: Date.now(),
                }
              : p
          ),
        }));
        saveState(get(), ['proxies']);
        return res;
      } catch (err: any) {
        const errText = err?.message || 'Verification failed';
        set((prev) => ({
          proxies: prev.proxies.map((p) =>
            p.id === active.id
              ? {
                  ...p,
                  pingStatus: 'error',
                  lastError: errText,
                  lastChecked: Date.now(),
                }
              : p
          ),
        }));
        return { success: false, error: errText };
      }
    }

    const fallback = await testSingleProxy(active, state.proxyCalls, 5000);
    return {
      success: fallback.success,
      ping: fallback.ping ?? undefined,
      error: fallback.error,
    };
  },

  clearError: () => set({ errorMessage: null }),

  parseProxyUrl: (input: string): Partial<ProxyProfile> | null => {
    return parseProxyInput(input);
  },
}));

const hydrationPromise: Promise<void> = sqliteStorage
  .getJson<Partial<PersistedConnectionState> | null>(STORAGE_KEY, null)
  .then((data) => {
    if (data) {
      const loadedProxies =
        Array.isArray(data.proxies) && data.proxies.length > 0
          ? data.proxies.map(normalizeStoredProxy)
          : DEFAULT_PROXIES;
      const requestedActiveId = data.activeProxyId;
      const activeId =
        requestedActiveId && loadedProxies.some((p) => p.id === requestedActiveId)
          ? requestedActiveId
          : loadedProxies[0]?.id ?? null;

      const patch: Partial<PersistedConnectionState> = {};
      if (!preHydrationMutations.has('proxyEnabled')) {
        patch.proxyEnabled = Boolean(data.proxyEnabled);
      }
      if (!preHydrationMutations.has('proxies')) {
        patch.proxies = loadedProxies;
      }
      if (!preHydrationMutations.has('activeProxyId')) {
        patch.activeProxyId = activeId;
      }
      if (!preHydrationMutations.has('killSwitch')) {
        patch.killSwitch = Boolean(data.killSwitch);
      }
      if (!preHydrationMutations.has('proxyCalls')) {
        patch.proxyCalls = data.proxyCalls !== undefined ? Boolean(data.proxyCalls) : true;
      }
      if (!preHydrationMutations.has('autoFallback')) {
        patch.autoFallback = Boolean(data.autoFallback);
      }

      if (Object.keys(patch).length > 0) {
        useConnectionStore.setState(patch);
      }
    }
  })
  .catch(() => {})
  .finally(() => {
    isHydrated = true;
    if (preHydrationMutations.size > 0) {
      preHydrationMutations.clear();
      persistStateNow(useConnectionStore.getState());
    }
  });
