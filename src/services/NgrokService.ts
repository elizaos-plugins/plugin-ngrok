import { Service, type IAgentRuntime, elizaLogger } from '@elizaos/core';
import type { ITunnelService, TunnelStatus, TunnelConfig } from '@elizaos/core';
import { spawn, type ChildProcess } from 'child_process';
import * as http from 'http';

export class NgrokService extends Service implements ITunnelService {
  static serviceType = 'tunnel';
  readonly capabilityDescription =
    'Provides secure tunnel functionality using ngrok for exposing local services to the internet';

  private ngrokProcess: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private tunnelPort: number | null = null;
  private startedAt: Date | null = null;
  private tunnelConfig: TunnelConfig;

  constructor(runtime: IAgentRuntime, config?: TunnelConfig) {
    super(runtime);
    this.tunnelConfig = config || { provider: 'ngrok' };
  }

  static async start(runtime: IAgentRuntime, config?: TunnelConfig): Promise<Service> {
    const service = new NgrokService(runtime, config);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = new NgrokService(runtime);
    return service.stop();
  }

  // Base Service lifecycle methods
  async start(): Promise<void> {
    elizaLogger.info('NgrokService started');
  }

  async stop(): Promise<void> {
    await this.stopTunnel();
  }

  // ITunnelService implementation
  async startTunnel(port?: number): Promise<string | void> {
    if (this.isActive()) {
      elizaLogger.warn('Ngrok tunnel is already running');
      return this.tunnelUrl as string;
    }

    if (typeof port !== 'number') {
      elizaLogger.warn(
        'NgrokService.start() called without a port. The service will be active but no tunnel will be started.'
      );
      return;
    }

    elizaLogger.info('🚇 Initializing Ngrok tunnel service...');
    const isInstalled = await this.checkNgrokInstalled();
    if (!isInstalled) {
      throw new Error(
        'ngrok is not installed. Please install it from https://ngrok.com/download or run: brew install ngrok'
      );
    }
    if (this.tunnelConfig.authToken || this.runtime.getSetting('NGROK_AUTH_TOKEN')) {
      await this.setAuthToken(
        this.tunnelConfig.authToken || this.runtime.getSetting('NGROK_AUTH_TOKEN')
      );
    }

    elizaLogger.info(`🚀 Starting ngrok tunnel on port ${port}...`);

    return new Promise((resolve, reject) => {
      const args = ['http', port.toString()];
      if (this.tunnelConfig.region) args.push('--region', this.tunnelConfig.region);
      if (this.runtime.getSetting('NGROK_DOMAIN')) {
        args.push('--domain', this.runtime.getSetting('NGROK_DOMAIN') as string);
      } else if (this.tunnelConfig.subdomain) {
        args.push('--subdomain', this.tunnelConfig.subdomain);
      }

      this.ngrokProcess = spawn('ngrok', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      this.ngrokProcess.on('error', (error) => {
        elizaLogger.error('Failed to start ngrok:', error);
        reject(new Error(`Failed to start ngrok: ${error.message}`));
      });

      this.ngrokProcess.stderr?.on('data', (data) => {
        const message = data.toString();
        elizaLogger.error('Ngrok error:', message);
        if (message.includes('invalid port')) {
          reject(new Error(message));
        }
      });

      setTimeout(async () => {
        try {
          const url = await this.fetchTunnelUrl();
          if (url) {
            this.tunnelUrl = url;
            this.tunnelPort = port;
            this.startedAt = new Date();
            elizaLogger.success(`✅ Ngrok tunnel started: ${url}`);
            resolve(url);
          } else {
            reject(new Error('Failed to get tunnel URL from ngrok'));
          }
        } catch (error) {
          reject(error);
        }
      }, 2000);
    });
  }

  async stopTunnel(): Promise<void> {
    if (!this.ngrokProcess) {
      elizaLogger.warn('Ngrok tunnel is not running');
      return;
    }
    elizaLogger.info('🛑 Stopping ngrok tunnel...');
    return new Promise((resolve) => {
      if (this.ngrokProcess) {
        this.ngrokProcess.on('exit', () => {
          this.cleanup();
          elizaLogger.info('✅ Ngrok tunnel stopped');
          resolve();
        });
        this.ngrokProcess.kill();
        setTimeout(() => {
          if (this.ngrokProcess && !this.ngrokProcess.killed) {
            this.ngrokProcess.kill('SIGKILL');
          }
          this.cleanup();
          resolve();
        }, 5000);
      } else {
        resolve();
      }
    });
  }

  getUrl(): string | null {
    return this.tunnelUrl;
  }

  isActive(): boolean {
    return this.ngrokProcess !== null && !this.ngrokProcess.killed && this.tunnelUrl !== null;
  }

  getStatus(): TunnelStatus {
    return {
      active: this.isActive(),
      url: this.tunnelUrl,
      port: this.tunnelPort,
      startedAt: this.startedAt,
      provider: 'ngrok',
    };
  }

  private cleanup(): void {
    this.ngrokProcess = null;
    this.tunnelUrl = null;
    this.tunnelPort = null;
    this.startedAt = null;
  }

  private async checkNgrokInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('which', ['ngrok']);
      proc.on('exit', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  private async setAuthToken(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ngrok', ['config', 'add-authtoken', token]);
      proc.on('exit', (code) => {
        if (code === 0) {
          elizaLogger.info('✅ Ngrok auth token configured');
          resolve();
        } else {
          reject(new Error('Failed to set ngrok auth token'));
        }
      });
      proc.on('error', reject);
    });
  }

  private async fetchTunnelUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      http
        .get('http://localhost:4040/api/tunnels', (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const tunnels = JSON.parse(data);
              const httpsTunnel = tunnels.tunnels?.find((t: any) => t.proto === 'https');
              if (httpsTunnel?.public_url) {
                resolve(httpsTunnel.public_url);
              } else {
                elizaLogger.warn('No HTTPS tunnel found in ngrok response');
                resolve(null);
              }
            } catch (error) {
              elizaLogger.error('Failed to parse ngrok API response:', error);
              resolve(null);
            }
          });
        })
        .on('error', (error) => {
          elizaLogger.error('Failed to connect to ngrok API:', error);
          resolve(null);
        });
    });
  }
}
