import { sqliteStorage } from './sqliteStorage';
import { networkManager } from './networkManager';

export interface GatewayEndpoint {
  id: string;
  name: string;
  provider: 'custom';
  url: string;
  ping: number | null;
  status: 'healthy' | 'unhealthy' | 'testing' | 'idle';
  lastChecked: number | null;
}

export function getVercelFallbackUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin.startsWith('http') &&
    !window.location.origin.includes('127.0.0.1') &&
    !window.location.origin.includes('localhost')
  ) {
    return window.location.origin;
  }
  const custom = import.meta.env.VITE_VERCEL_URL;
  if (custom) {
    return custom.startsWith('http') ? custom : `https://${custom}`;
  }
  return 'https://orbitad.vercel.app';
}

export function getCloudflareWorkerUrl(): string {
  const custom = import.meta.env.VITE_WORKER_URL;
  if (custom) {
    return custom.startsWith('http') ? custom : `https://${custom}`;
  }
  return 'https://orbita.ypgreg78.workers.dev';
}

const DEFAULT_GATEWAYS: GatewayEndpoint[] = [
  {
    id: 'vercel-edge',
    name: 'Vercel Serverless Gateway',
    provider: 'custom',
    url: getVercelFallbackUrl(),
    ping: null,
    status: 'healthy',
    lastChecked: null,
  },
  {
    id: 'cloudflare-worker',
    name: 'Cloudflare Edge Worker',
    provider: 'custom',
    url: getCloudflareWorkerUrl(),
    ping: null,
    status: 'healthy',
    lastChecked: null,
  },
];

class GatewayManager {
  private gateways: GatewayEndpoint[] = [...DEFAULT_GATEWAYS];
  private activeGatewayId: string = 'vercel-edge';

  constructor() {
    sqliteStorage.getJson<GatewayEndpoint[]>('orbita_custom_gateways', []).then((saved) => {
      if (Array.isArray(saved) && saved.length > 0) {
        const filtered = saved.filter(
          (g) => g && g.url && !g.url.includes('workers.dev') && !g.url.includes('a.run.app') && !g.url.includes('google')
        );
        if (filtered.length > 0) {
          this.gateways = filtered;
        } else {
          sqliteStorage.remove('orbita_custom_gateways').catch(() => {});
          this.gateways = [...DEFAULT_GATEWAYS];
        }
      }
    }).catch(() => {});
  }

  public getGateways(): GatewayEndpoint[] {
    return this.gateways;
  }

  public getActiveGateway(): GatewayEndpoint {
    const found = this.gateways.find((g) => g.id === this.activeGatewayId && g.status === 'healthy');
    return found || this.gateways.find((g) => g.id === this.activeGatewayId) || this.gateways[0];
  }

  public getBaseUrl(): string {
    return this.getActiveGateway().url.replace(/\/+$/, '');
  }

  public getUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.getBaseUrl()}${cleanPath}`;
  }

  public async selectFastestGateway(_force = false): Promise<GatewayEndpoint> {
    return this.getActiveGateway();
  }

  private resolvePathForGateway(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    const isGet = !options?.method || options.method.toUpperCase() === 'GET';
    const executeFetch = async () => {
      const primary = this.getActiveGateway();
      const primaryPath = this.resolvePathForGateway(path);
      const url = `${primary.url.replace(/\/+$/, '')}${primaryPath}`;
      try {
        const res = await networkManager.safeFetch(url, options, 8000, 1);
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          return res;
        }
        throw new Error(`Primary gateway returned ${res.status}`);
      } catch (err) {
        const fallback = this.gateways.find((g) => g.id !== primary.id) || DEFAULT_GATEWAYS[1];
        if (fallback) {
          const fallbackUrl = `${fallback.url.replace(/\/+$/, '')}${primaryPath}`;
          return networkManager.safeFetch(fallbackUrl, options, 8000, 1);
        }
        throw err;
      }
    };

    if (isGet) {
      return networkManager.deduplicateRequest(`gw:${path}`, executeFetch);
    }
    return executeFetch();
  }
}

export const gatewayManager = new GatewayManager();

export function getVercelBaseUrl(): string {
  return getVercelFallbackUrl();
}
