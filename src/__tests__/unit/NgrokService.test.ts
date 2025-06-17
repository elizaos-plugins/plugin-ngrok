import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NgrokService } from '../../services/NgrokService';
import type { IAgentRuntime } from '@elizaos/core';
import { spawn } from 'child_process';
import * as http from 'http';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));
vi.mock('http');

class MockChildProcess extends EventEmitter {
  killed = false;
  stderr = new EventEmitter();
  kill = vi.fn((signal?: string) => {
    this.killed = true;
    setImmediate(() => this.emit('exit', 0));
  });
}

describe('NgrokService', () => {
  let mockRuntime: IAgentRuntime;
  let service: NgrokService;
  let mockChildProcess: MockChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChildProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

    mockRuntime = {
      getSetting: vi.fn((key: string) => {
        if (key === 'NGROK_AUTH_TOKEN') return 'test-auth-token';
        return undefined;
      }),
    } as unknown as IAgentRuntime;

    service = new NgrokService(mockRuntime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('start', () => {
    it('should start a tunnel successfully', async () => {
      const mockResponse = new EventEmitter();
      const mockRequest = new EventEmitter();
      vi.mocked(http.get).mockImplementation((_url, cb: any) => {
        cb(mockResponse);
        return mockRequest as any;
      });

      const startPromise = service.startTunnel(3000);

      // a little later, after the current macrotask, emit the response
      setTimeout(() => {
        mockResponse.emit(
          'data',
          JSON.stringify({ tunnels: [{ proto: 'https', public_url: 'https://test.ngrok.io' }] })
        );
        mockResponse.emit('end');
      }, 100);

      const url = await startPromise;
      expect(url).toBe('https://test.ngrok.io');
      expect(service.isActive()).toBe(true);
    }, 180000);
  });

  describe('stop', () => {
    it('should stop an active tunnel', async () => {
      (service as any).ngrokProcess = mockChildProcess;
      (service as any).tunnelUrl = 'https://fake.ngrok.io';

      await service.stopTunnel();
      expect(mockChildProcess.kill).toHaveBeenCalled();
      expect(service.isActive()).toBe(false);
    });
  });
});
