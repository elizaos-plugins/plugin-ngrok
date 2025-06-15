import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NgrokService } from '../../services/NgrokService';
import type { IAgentRuntime } from '@elizaos/core';
import { spawn } from 'child_process';
import * as http from 'http';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('child_process');
vi.mock('http');

// Mock child process
class MockChildProcess extends EventEmitter {
  killed = false;
  stderr = new EventEmitter();
  
  kill(signal?: string) {
    this.killed = true;
    if (signal === 'SIGKILL') {
      this.emit('exit', 0);
    }
  }
}

describe('NgrokService', () => {
  let mockRuntime: IAgentRuntime;
  let service: NgrokService;
  let mockChildProcess: MockChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock runtime
    mockRuntime = {
      getSetting: vi.fn((key: string) => {
        const settings: Record<string, string> = {
          NGROK_AUTH_TOKEN: 'test-auth-token',
          NGROK_REGION: 'us',
        };
        return settings[key];
      }),
    } as unknown as IAgentRuntime;

    // Setup mock child process
    mockChildProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

    service = new NgrokService(mockRuntime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      // Mock which command to check ngrok installation
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });

      await service.initialize(mockRuntime);
      
      expect(vi.mocked(spawn)).toHaveBeenCalledWith('which', ['ngrok']);
    });

    it('should throw error if ngrok is not installed', async () => {
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 1), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });

      await expect(service.initialize(mockRuntime)).rejects.toThrow(
        'ngrok is not installed'
      );
    });

    it('should set auth token if provided', async () => {
      const mockWhichProcess = new MockChildProcess();
      const mockAuthProcess = new MockChildProcess();
      
      vi.mocked(spawn).mockImplementation((command: string, args?: any[]) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        if (command === 'ngrok' && args?.[0] === 'config') {
          setTimeout(() => mockAuthProcess.emit('exit', 0), 10);
          return mockAuthProcess as any;
        }
        return mockChildProcess as any;
      });

      await service.initialize(mockRuntime);
      
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'ngrok',
        ['config', 'add-authtoken', 'test-auth-token']
      );
    });

    it('should handle auth token configuration failure', async () => {
      const mockWhichProcess = new MockChildProcess();
      const mockAuthProcess = new MockChildProcess();
      
      vi.mocked(spawn).mockImplementation((command: string, args?: any[]) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        if (command === 'ngrok' && args?.[0] === 'config') {
          setTimeout(() => mockAuthProcess.emit('exit', 1), 10);
          return mockAuthProcess as any;
        }
        return mockChildProcess as any;
      });

      await expect(service.initialize(mockRuntime)).rejects.toThrow(
        'Failed to set ngrok auth token'
      );
    });
  });

  describe('start', () => {
    beforeEach(async () => {
      // Initialize service first
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });
      await service.initialize(mockRuntime);
    });

    it('should start tunnel successfully', async () => {
      // Mock HTTP get for tunnel URL
      const mockResponse = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'data') {
            callback(JSON.stringify({
              tunnels: [{
                proto: 'https',
                public_url: 'https://test.ngrok.io'
              }]
            }));
          }
          if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'error') {
            // Don't trigger error
          }
          return mockRequest;
        })
      };

      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        callback(mockResponse);
        return mockRequest as any;
      });

      const urlPromise = service.start(3000);
      
      // Wait for the timeout in start method
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      const url = await urlPromise;
      
      expect(url).toBe('https://test.ngrok.io');
      expect(service.isActive()).toBe(true);
      expect(service.getUrl()).toBe('https://test.ngrok.io');
      
      const status = service.getStatus();
      expect(status.active).toBe(true);
      expect(status.port).toBe(3000);
      expect(status.url).toBe('https://test.ngrok.io');
    });

    it('should return existing URL if already active', async () => {
      // First start
      const mockResponse = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'data') {
            callback(JSON.stringify({
              tunnels: [{
                proto: 'https',
                public_url: 'https://test.ngrok.io'
              }]
            }));
          }
          if (event === 'end') {
            callback();
          }
        })
      };

      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        callback(mockResponse);
        return { on: vi.fn() } as any;
      });

      const urlPromise = service.start(3000);
      await new Promise(resolve => setTimeout(resolve, 2100));
      const url1 = await urlPromise;

      // Second start should return same URL
      const url2 = await service.start(3000);
      expect(url2).toBe(url1);
    });

    it('should handle ngrok process spawn error', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const proc = new MockChildProcess();
        setTimeout(() => proc.emit('error', new Error('Spawn failed')), 10);
        return proc as any;
      });

      await expect(service.start(3000)).rejects.toThrow('Failed to start ngrok: Spawn failed');
    });

    it('should handle ngrok stderr output', async () => {
      const stderrMessage = 'Some error from ngrok';
      
      const startPromise = service.start(3000);
      
      // Emit stderr data
      setTimeout(() => {
        mockChildProcess.stderr.emit('data', Buffer.from(stderrMessage));
      }, 100);

      // Mock successful tunnel URL fetch
      const mockResponse = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'data') {
            callback(JSON.stringify({
              tunnels: [{
                proto: 'https',
                public_url: 'https://test.ngrok.io'
              }]
            }));
          }
          if (event === 'end') {
            callback();
          }
        })
      };

      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        callback(mockResponse);
        return { on: vi.fn() } as any;
      });

      await new Promise(resolve => setTimeout(resolve, 2100));
      await startPromise;
    });

    it('should handle failure to get tunnel URL', async () => {
      // Mock HTTP get failure
      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, cb: Function) => {
            if (event === 'data') cb('{}');
            if (event === 'end') cb();
          })
        };
        callback(mockResponse);
        return { on: vi.fn() } as any;
      });

      await expect(service.start(3000)).rejects.toThrow('Failed to get tunnel URL from ngrok');
    });

    it('should include region in spawn args if configured', async () => {
      const serviceWithRegion = new NgrokService(mockRuntime, { 
        provider: 'ngrok',
        region: 'eu' 
      });

      // Initialize
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });
      await serviceWithRegion.initialize(mockRuntime);

      // Reset mock to capture start call
      vi.mocked(spawn).mockClear();
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

      const startPromise = serviceWithRegion.start(3000);
      
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'ngrok',
        ['http', '3000', '--region', 'eu'],
        expect.any(Object)
      );

      // Clean up
      mockChildProcess.emit('error', new Error('Test cleanup'));
      await expect(startPromise).rejects.toThrow();
    });

    it('should include subdomain in spawn args if configured', async () => {
      const serviceWithSubdomain = new NgrokService(mockRuntime, { 
        provider: 'ngrok',
        subdomain: 'my-custom-domain' 
      });

      // Initialize
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });
      await serviceWithSubdomain.initialize(mockRuntime);

      // Reset mock to capture start call
      vi.mocked(spawn).mockClear();
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

      const startPromise = serviceWithSubdomain.start(3000);
      
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'ngrok',
        ['http', '3000', '--subdomain', 'my-custom-domain'],
        expect.any(Object)
      );

      // Clean up
      mockChildProcess.emit('error', new Error('Test cleanup'));
      await expect(startPromise).rejects.toThrow();
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      // Initialize and start service
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });
      await service.initialize(mockRuntime);

      // Start tunnel
      const mockResponse = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'data') {
            callback(JSON.stringify({
              tunnels: [{
                proto: 'https',
                public_url: 'https://test.ngrok.io'
              }]
            }));
          }
          if (event === 'end') {
            callback();
          }
        })
      };

      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        callback(mockResponse);
        return { on: vi.fn() } as any;
      });

      const urlPromise = service.start(3000);
      await new Promise(resolve => setTimeout(resolve, 2100));
      await urlPromise;
    });

    it('should stop tunnel successfully', async () => {
      expect(service.isActive()).toBe(true);

      const stopPromise = service.stop();
      
      // Simulate process exit
      setTimeout(() => mockChildProcess.emit('exit', 0), 100);
      
      await stopPromise;
      
      expect(service.isActive()).toBe(false);
      expect(service.getUrl()).toBe(null);
      expect(mockChildProcess.killed).toBe(true);
    });

    it('should handle stop when not running', async () => {
      // Stop first
      const stopPromise = service.stop();
      setTimeout(() => mockChildProcess.emit('exit', 0), 100);
      await stopPromise;

      // Try to stop again
      await service.stop(); // Should not throw
    });

    it('should force kill after timeout', async () => {
      const stopPromise = service.stop();
      
      // Don't emit exit event, let timeout occur
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      await stopPromise;
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  describe('status methods', () => {
    it('should return correct status when inactive', () => {
      expect(service.isActive()).toBe(false);
      expect(service.getUrl()).toBe(null);
      
      const status = service.getStatus();
      expect(status).toEqual({
        active: false,
        url: null,
        port: null,
        startedAt: null,
        provider: 'ngrok'
      });
    });
  });

  describe('fetchTunnelUrl', () => {
    it('should handle HTTP request error', async () => {
      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        const mockRequest = {
          on: vi.fn((event: string, cb: Function) => {
            if (event === 'error') {
              cb(new Error('Network error'));
            }
            return mockRequest;
          })
        };
        return mockRequest as any;
      });

      // Access private method through reflection for testing
      const fetchUrl = (service as any).fetchTunnelUrl.bind(service);
      const result = await fetchUrl();
      
      expect(result).toBe(null);
    });

    it('should handle invalid JSON response', async () => {
      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, cb: Function) => {
            if (event === 'data') cb('invalid json');
            if (event === 'end') cb();
          })
        };
        callback(mockResponse);
        return { on: vi.fn() } as any;
      });

      const fetchUrl = (service as any).fetchTunnelUrl.bind(service);
      const result = await fetchUrl();
      
      expect(result).toBe(null);
    });

    it('should handle missing HTTPS tunnel', async () => {
      vi.mocked(http.get).mockImplementation((url: any, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, cb: Function) => {
            if (event === 'data') {
              cb(JSON.stringify({
                tunnels: [{
                  proto: 'http',
                  public_url: 'http://test.ngrok.io'
                }]
              }));
            }
            if (event === 'end') cb();
          })
        };
        callback(mockResponse);
        return { on: vi.fn() } as any;
      });

      const fetchUrl = (service as any).fetchTunnelUrl.bind(service);
      const result = await fetchUrl();
      
      expect(result).toBe(null);
    });
  });

  describe('edge cases', () => {
    it('should handle which command error', async () => {
      const mockWhichProcess = new MockChildProcess();
      vi.mocked(spawn).mockImplementation((command: string) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('error', new Error('Which failed')), 10);
          return mockWhichProcess as any;
        }
        return mockChildProcess as any;
      });

      await expect(service.initialize(mockRuntime)).rejects.toThrow(
        'ngrok is not installed'
      );
    });

    it('should handle auth process error', async () => {
      const mockWhichProcess = new MockChildProcess();
      const mockAuthProcess = new MockChildProcess();
      
      vi.mocked(spawn).mockImplementation((command: string, args?: any[]) => {
        if (command === 'which') {
          setTimeout(() => mockWhichProcess.emit('exit', 0), 10);
          return mockWhichProcess as any;
        }
        if (command === 'ngrok' && args?.[0] === 'config') {
          setTimeout(() => mockAuthProcess.emit('error', new Error('Auth failed')), 10);
          return mockAuthProcess as any;
        }
        return mockChildProcess as any;
      });

      await expect(service.initialize(mockRuntime)).rejects.toThrow('Auth failed');
    });
  });
}); 