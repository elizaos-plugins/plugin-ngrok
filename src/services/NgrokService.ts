import { Service, elizaLogger } from '@elizaos/core';
import type { IAgentRuntime, ITunnelService, TunnelStatus, TunnelConfig } from '@elizaos/core';
import { spawn, type ChildProcess } from 'child_process';
import * as http from 'http';
import { validateNgrokConfig } from '../environment';

export class NgrokService extends Service implements ITunnelService {
  static serviceType = 'tunnel';
  readonly capabilityDescription =
    'Provides secure tunnel functionality using ngrok for exposing local services to the internet';

  private static readonly MIN_TUNNEL_INTERVAL = 2000; // 2 seconds minimum between tunnel starts
  private static readonly CLEANUP_TIMEOUT = 5000; // 5 seconds max for cleanup
  
  private ngrokProcess: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private tunnelPort: number | null = null;
  private startedAt: Date | null = null;
  private lastStartTime = 0;
  private tunnelConfig: TunnelConfig;
  private isShuttingDown = false;
  
  constructor(runtime: IAgentRuntime) {
    super();
    this.runtime = runtime;
    this.tunnelConfig = {
      provider: 'ngrok',
      authToken: runtime.getSetting('NGROK_AUTH_TOKEN') || process.env.NGROK_AUTH_TOKEN,
    };
  }

  protected runtime: IAgentRuntime;

  async initialize(): Promise<void> {
    elizaLogger.info('🚇 Initializing Ngrok tunnel service...');
    const isInstalled = await this.checkNgrokInstalled();
    if (!isInstalled) {
      throw new Error(
        'ngrok is not installed. Please install it from https://ngrok.com/download or run: brew install ngrok'
      );
    }

    const authToken = this.tunnelConfig.authToken || 
                      this.runtime.getSetting('NGROK_AUTH_TOKEN') || 
                      process.env.NGROK_AUTH_TOKEN;
    
    if (authToken) {
      await this.setAuthToken(authToken);
      elizaLogger.info('Setting ngrok auth token');
    } else {
      elizaLogger.warn('No ngrok auth token found - running in limited mode');
    }
  }

  static async start(runtime: IAgentRuntime, config?: TunnelConfig): Promise<Service> {
    const service = new NgrokService(runtime);
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
      return this.tunnelUrl || undefined;
    }

    if (port === undefined || port === null) {
      elizaLogger.warn(
        'NgrokService.start() called without a port. The service will be active but no tunnel will be started.'
      );
      return;
    }

    // Validate port range
    if (port < 1 || port > 65535) {
      throw new Error('Invalid port number');
    }

    // Validate environment
    try {
      await validateNgrokConfig(this.runtime);
    } catch (error: any) {
      throw new Error(`Ngrok environment validation failed: ${error.message}`);
    }

    // Enforce rate limiting
    const now = Date.now();
    if (this.lastStartTime && now - this.lastStartTime < NgrokService.MIN_TUNNEL_INTERVAL) {
      const waitTime = NgrokService.MIN_TUNNEL_INTERVAL - (now - this.lastStartTime);
      elizaLogger.warn(`Rate limiting: waiting ${waitTime}ms before starting tunnel`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastStartTime = Date.now();

    elizaLogger.info(`🚀 Starting ngrok tunnel on port ${port}...`);

    try {
      const tunnelUrl = await this.attemptStartTunnel(port);
      this.tunnelUrl = tunnelUrl;
      this.tunnelPort = port;
      this.startedAt = new Date();
      elizaLogger.success(`✅ Ngrok tunnel started: ${tunnelUrl}`);
      return tunnelUrl;
    } catch (error: any) {
      elizaLogger.error('Failed to start ngrok tunnel:', error);
      throw error;
    }
  }

  private async attemptStartTunnel(port: number): Promise<string> {
    let attempts = 0;
    const maxAttempts = 3;
    const baseDelay = 2000;

    while (attempts < maxAttempts) {
      try {
        return await this.startTunnelInternal(port);
      } catch (error: any) {
        attempts++;
        
        if (error.message && (
          error.message.includes('domain might already be in use') ||
          error.message.includes('ERR_NGROK_334') ||
          error.message.includes('already online')
        )) {
          if (attempts < maxAttempts) {
            elizaLogger.warn(`Domain conflict detected, retrying in ${baseDelay * attempts}ms (attempt ${attempts}/${maxAttempts})`);
            await new Promise((resolve) => setTimeout(resolve, baseDelay * attempts));
            
            // Try to stop any existing process just in case
            if (this.ngrokProcess) {
              await this.forceKillProcess();
            }
            continue;
          }
        }
        
        throw error;
      }
    }
    
    throw new Error(`Failed to start tunnel after ${maxAttempts} attempts`);
  }

  private async startTunnelInternal(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      // Clean up any existing process first
      if (this.ngrokProcess) {
        this.ngrokProcess.kill();
        this.ngrokProcess = null;
      }
      
      const args = ['http', port.toString()];
      
      if (this.tunnelConfig.region) args.push('--region', this.tunnelConfig.region);
      
      // Check for domain configuration
      const domain = this.runtime.getSetting('NGROK_DOMAIN') || process.env.NGROK_DOMAIN;
      const useRandomSubdomain = this.runtime.getSetting('NGROK_USE_RANDOM_SUBDOMAIN') === 'true';
      
      if (domain && !useRandomSubdomain) {
        args.push('--domain', domain);
        elizaLogger.info(`Using ngrok domain: ${domain}`);
      } else if (this.tunnelConfig.subdomain && !useRandomSubdomain) {
        // Only use subdomain if explicitly configured
        // Note: Subdomains require a paid ngrok account
        args.push('--subdomain', this.tunnelConfig.subdomain);
        elizaLogger.info(`Using configured subdomain: ${this.tunnelConfig.subdomain}`);
      }
      // For free accounts or when random subdomain is requested, 
      // don't specify any domain/subdomain - let ngrok generate a random URL

      this.ngrokProcess = spawn('ngrok', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let errorOccurred = false;
      let processStarted = false;

      this.ngrokProcess.on('error', (error) => {
        errorOccurred = true;
        elizaLogger.error('Failed to start ngrok:', error);
        reject(new Error(`Failed to start ngrok: ${error.message}`));
      });

      this.ngrokProcess.stderr?.on('data', (data) => {
        const message = data.toString();
        elizaLogger.error('Ngrok error:', message);
        
        if (!errorOccurred) {
          errorOccurred = true;
          // Kill the process to clean up
          if (this.ngrokProcess && !this.ngrokProcess.killed) {
            this.ngrokProcess.kill();
          }
          
          // Handle specific error cases
          if (message.includes('invalid port')) {
            reject(new Error('Invalid port specified'));
          } else if (message.includes('address already in use')) {
            reject(new Error('Port is already in use'));
          } else if (message.includes('ERR_NGROK_15002') || message.includes('Pay-as-you-go')) {
            // Pay-as-you-go account requires domain
            if (!domain) {
              reject(new Error('Pay-as-you-go ngrok account requires NGROK_DOMAIN to be set. Please set NGROK_DOMAIN=your-domain.ngrok-free.app in your .env file'));
            } else {
              reject(new Error('Failed to start tunnel with pay-as-you-go account. Ensure your domain is registered at https://dashboard.ngrok.com/domains'));
            }
          } else if (message.includes('ERR_NGROK_334') || 
                     message.includes('already online') ||
                     message.includes('failed to start tunnel') || 
                     message.includes('is already bound to another tunnel') ||
                     message.includes('tunnel session failed')) {
            // This might happen if the domain is already in use
            reject(new Error('Failed to start tunnel - domain might already be in use'));
          } else {
            reject(new Error(`Ngrok error: ${message}`));
          }
        }
      });

      // Give ngrok more time to start and handle multiple retry attempts
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 2000;
      
      const tryFetchUrl = async () => {
        if (errorOccurred || this.isShuttingDown) {
          return; // Don't try to fetch URL if we already have an error
        }
        
        try {
          const url = await this.fetchTunnelUrl();
          if (url) {
            processStarted = true;
            this.tunnelUrl = url;
            this.tunnelPort = port;
            this.startedAt = new Date();
            resolve(url);
          } else if (retryCount < maxRetries) {
            retryCount++;
            elizaLogger.warn(`Retrying to fetch tunnel URL (attempt ${retryCount}/${maxRetries})...`);
            setTimeout(tryFetchUrl, retryDelay);
          } else {
            reject(new Error('Failed to get tunnel URL from ngrok after multiple attempts'));
          }
        } catch (error) {
          if (retryCount < maxRetries && !errorOccurred) {
            retryCount++;
            elizaLogger.warn(`Retrying to fetch tunnel URL (attempt ${retryCount}/${maxRetries})...`);
            setTimeout(tryFetchUrl, retryDelay);
          } else {
            reject(error);
          }
        }
      };
      
      this.ngrokProcess.on('exit', (code) => {
        elizaLogger.warn(`Ngrok process exited with code ${code}`);
        this.ngrokProcess = null;
        
        // Only reject if we haven't successfully started
        if (!processStarted && !errorOccurred) {
          reject(new Error(`Ngrok process exited unexpectedly with code ${code}`));
        }
      });

      // Wait a bit for ngrok to start before trying to fetch URL
      setTimeout(tryFetchUrl, 3000); // Increased from whatever it was before
    });
  }

  async stopTunnel(): Promise<void> {
    if (!this.isActive() && !this.ngrokProcess) {
      elizaLogger.warn('No active tunnel to stop');
      return;
    }

    this.isShuttingDown = true;
    elizaLogger.info('🛑 Stopping ngrok tunnel...');

    if (this.ngrokProcess) {
      await this.forceKillProcess();
    }

    this.cleanup();
    this.isShuttingDown = false;

    // Add a small delay to ensure ngrok fully releases resources
    await new Promise((resolve) => setTimeout(resolve, 1000));

    elizaLogger.info('✅ Ngrok tunnel stopped');
  }

  private async forceKillProcess(): Promise<void> {
    if (!this.ngrokProcess) return;
    
    const process = this.ngrokProcess;
    const pid = process.pid;
    
    // First try SIGTERM
    process.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      let resolved = false;
      
      const checkInterval = setInterval(() => {
        if (!process.killed && process.exitCode === null) {
          // Still running, try SIGKILL
          try {
            process.kill('SIGKILL');
          } catch (e) {
            // Process might already be dead
          }
        } else {
          if (!resolved) {
            resolved = true;
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }
      }, 100);
      
      // Timeout after CLEANUP_TIMEOUT
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearInterval(checkInterval);
          
          // Last resort: try to kill by PID
          if (pid) {
            try {
              spawn('kill', ['-9', pid.toString()]);
            } catch (e) {
              // Ignore errors
            }
          }
          
          resolve();
        }
      }, NgrokService.CLEANUP_TIMEOUT);
    });
    
    this.ngrokProcess = null;
  }

  getUrl(): string | null {
    return this.tunnelUrl;
  }

  isActive(): boolean {
    return this.ngrokProcess !== null && !this.ngrokProcess.killed && this.tunnelUrl !== null && !this.isShuttingDown;
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
