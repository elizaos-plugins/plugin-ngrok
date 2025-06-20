import { Service, type IAgentRuntime } from '@elizaos/core';
import type { ITunnelService, TunnelStatus } from '@elizaos/core';
import { vi } from 'vitest';

export class MockNgrokService extends Service implements ITunnelService {
  static serviceType = 'tunnel';
  readonly capabilityDescription = 'Mock tunnel service for testing';

  private mockUrl: string | null = null;
  private mockPort: number | null = null;
  private mockStartedAt: Date | null = null;
  private mockActive = false;

  // Mock functions to track calls
  startTunnel = vi.fn().mockImplementation(async (port?: number) => {
    if (typeof port !== 'number') {
      return;
    }
    this.mockActive = true;
    this.mockPort = port;
    this.mockStartedAt = new Date();
    this.mockUrl = `https://mock-tunnel-${port}.ngrok.io`;
    return this.mockUrl;
  });

  stopTunnel = vi.fn().mockImplementation(async () => {
    this.mockActive = false;
    this.mockUrl = null;
    this.mockPort = null;
    this.mockStartedAt = null;
  });

  getUrl = vi.fn().mockImplementation(() => this.mockUrl);

  isActive = vi.fn().mockImplementation(() => this.mockActive);

  getStatus = vi.fn().mockImplementation((): TunnelStatus => ({
    active: this.mockActive,
    url: this.mockUrl,
    port: this.mockPort,
    startedAt: this.mockStartedAt,
    provider: 'ngrok',
  }));

  // Base Service methods
  async start(): Promise<void> {}
  async stop(): Promise<void> {
    await this.stopTunnel();
  }
}

export function createMockNgrokService(runtime: IAgentRuntime): MockNgrokService {
  return new MockNgrokService(runtime);
} 