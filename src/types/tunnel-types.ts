import type { Service } from '@elizaos/core';

export interface ITunnelService extends Service {
  /**
   * Start the tunnel service
   * @param port The local port to tunnel
   * @returns The public URL of the tunnel
   */
  start(port: number): Promise<string>;

  /**
   * Stop the tunnel service
   */
  stop(): Promise<void>;

  /**
   * Get the current tunnel URL
   * @returns The public URL or null if not running
   */
  getUrl(): string | null;

  /**
   * Check if the tunnel is currently active
   */
  isActive(): boolean;

  /**
   * Get tunnel status information
   */
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