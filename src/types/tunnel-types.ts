import type { Service } from '@elizaos/core';

export interface ITunnelService extends Service {
  startTunnel(port?: number): Promise<string | void>;
  stopTunnel(): Promise<void>;
  getUrl(): string | null;
  isActive(): boolean;
  getStatus(): TunnelStatus;
}

export interface TunnelStatus {
  active: boolean;
  url: string | null;
  port: number | null;
  startedAt: Date | null;
  provider: string;
}

export interface TunnelConfig {
  provider?: 'ngrok' | 'cloudflare' | 'localtunnel';
  authToken?: string;
  region?: string;
  subdomain?: string;
}

export const TUNNEL_SERVICE_TYPE = 'tunnel';
