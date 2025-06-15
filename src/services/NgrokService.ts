import {
  Service,
  type IAgentRuntime,
  logger,
  elizaLogger,
} from '@elizaos/core';
import type { ITunnelService, TunnelStatus, TunnelConfig } from '../types/tunnel-types';
import { spawn, type ChildProcess } from 'child_process';
import * as http from 'http';

export class NgrokService extends Service implements ITunnelService {
  static serviceType = 'tunnel';
  readonly capabilityDescription = 'Provides secure tunnel functionality using ngrok for exposing local services to the internet';
  
  private ngrokProcess: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private tunnelPort: number | null = null;
  private startedAt: Date | null = null;
  private tunnelConfig: TunnelConfig;

  constructor(runtime: IAgentRuntime, config?: TunnelConfig) {
    super(runtime);
    this.tunnelConfig = config || { provider: 'ngrok' };
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    elizaLogger.info('🚇 Initializing Ngrok tunnel service...');
    
    // Check if ngrok is installed
    const isInstalled = await this.checkNgrokInstalled();
    if (!isInstalled) {
      throw new Error(
        'ngrok is not installed. Please install it from https://ngrok.com/download or run: brew install ngrok'
      );
    }

    // Set auth token if provided
    if (this.tunnelConfig.authToken || runtime.getSetting('NGROK_AUTH_TOKEN')) {
      await this.setAuthToken(this.tunnelConfig.authToken || runtime.getSetting('NGROK_AUTH_TOKEN'));
    }
  }

  async start(port: number): Promise<string> {
    if (this.isActive()) {
      elizaLogger.warn('Ngrok tunnel is already running');
      return this.tunnelUrl!;
    }

    elizaLogger.info(`🚀 Starting ngrok tunnel on port ${port}...`);

    return new Promise((resolve, reject) => {
      const args = ['http', port.toString()];
      
      // Add optional configuration
      if (this.tunnelConfig.region) {
        args.push('--region', this.tunnelConfig.region);
      }
      if (this.tunnelConfig.subdomain) {
        args.push('--subdomain', this.tunnelConfig.subdomain);
      }

      this.ngrokProcess = spawn('ngrok', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.ngrokProcess.on('error', (error) => {
        elizaLogger.error('Failed to start ngrok:', error);
        reject(new Error(`Failed to start ngrok: ${error.message}`));
      });

      this.ngrokProcess.stderr?.on('data', (data) => {
        const message = data.toString();
        elizaLogger.error('Ngrok error:', message);
      });

      // Give ngrok time to start, then fetch the tunnel URL
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
      }, 2000); // Wait 2 seconds for ngrok to start
    });
  }

  async stop(): Promise<void> {
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
        
        // Force kill after 5 seconds if it doesn't exit gracefully
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
      const checkProcess = spawn('which', ['ngrok']);
      checkProcess.on('exit', (code) => {
        resolve(code === 0);
      });
      checkProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  private async setAuthToken(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const authProcess = spawn('ngrok', ['config', 'add-authtoken', token]);
      
      authProcess.on('exit', (code) => {
        if (code === 0) {
          elizaLogger.info('✅ Ngrok auth token configured');
          resolve();
        } else {
          reject(new Error('Failed to set ngrok auth token'));
        }
      });

      authProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async fetchTunnelUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      // Ngrok exposes a local API on port 4040
      http.get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const tunnels = JSON.parse(data);
            const httpsTunnel = tunnels.tunnels?.find(
              (t: any) => t.proto === 'https'
            );
            
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
      }).on('error', (error) => {
        elizaLogger.error('Failed to connect to ngrok API:', error);
        resolve(null);
      });
    });
  }
} 