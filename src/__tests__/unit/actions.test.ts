import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { startTunnelAction } from '../../actions/start-tunnel';
import { stopTunnelAction } from '../../actions/stop-tunnel';
import { getTunnelStatusAction } from '../../actions/get-tunnel-status';
import type { ITunnelService, TunnelStatus } from '../../types/tunnel-types';

describe('Ngrok Actions', () => {
  let mockRuntime: IAgentRuntime;
  let mockTunnelService: ITunnelService;
  let mockMemory: Memory;
  let mockState: State;
  let mockCallback: HandlerCallback;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock tunnel service
    mockTunnelService = {
      start: vi.fn(),
      stop: vi.fn(),
      getUrl: vi.fn(),
      isActive: vi.fn(),
      getStatus: vi.fn(),
      initialize: vi.fn(),
    } as unknown as ITunnelService;

    // Setup mock runtime
    mockRuntime = {
      getService: vi.fn((name: string) => {
        if (name === 'tunnel') return mockTunnelService;
        return null;
      }),
      useModel: vi.fn(),
    } as unknown as IAgentRuntime;

    // Setup mock memory
    mockMemory = {
      content: {
        text: 'test message',
      },
    } as Memory;

    // Setup mock state
    mockState = {} as State;

    // Setup mock callback
    mockCallback = vi.fn();
  });

  describe('START_TUNNEL Action', () => {
    it('should have correct metadata', () => {
      expect(startTunnelAction.name).toBe('START_TUNNEL');
      expect(startTunnelAction.similes).toContain('OPEN_TUNNEL');
      expect(startTunnelAction.similes).toContain('CREATE_TUNNEL');
      expect(startTunnelAction.description).toBeDefined();
    });

    describe('validate', () => {
      it('should return false if tunnel service is not available', async () => {
        vi.mocked(mockRuntime.getService).mockReturnValue(null);
        
        const result = await startTunnelAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(false);
      });

      it('should return false if tunnel is already active', async () => {
        vi.mocked(mockTunnelService.isActive).mockReturnValue(true);
        
        const result = await startTunnelAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(false);
      });

      it('should return true if tunnel service exists and is not active', async () => {
        vi.mocked(mockTunnelService.isActive).mockReturnValue(false);
        
        const result = await startTunnelAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(true);
      });
    });

    describe('handler', () => {
      it('should start tunnel with default port', async () => {
        mockMemory.content.text = 'Start a tunnel';
        vi.mocked(mockRuntime.useModel).mockResolvedValue('{"port": 3000}');
        vi.mocked(mockTunnelService.start).mockResolvedValue('https://test.ngrok.io');

        const result = await startTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(true);
        expect(mockTunnelService.start).toHaveBeenCalledWith(3000);
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('✅ Ngrok tunnel started successfully!'),
          metadata: {
            tunnelUrl: 'https://test.ngrok.io',
            port: 3000,
            action: 'tunnel_started',
          },
        });
      });

      it('should start tunnel with specified port', async () => {
        mockMemory.content.text = 'Start ngrok on port 8080';
        vi.mocked(mockRuntime.useModel).mockResolvedValue('{"port": 8080}');
        vi.mocked(mockTunnelService.start).mockResolvedValue('https://test.ngrok.io');

        await startTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(mockTunnelService.start).toHaveBeenCalledWith(8080);
      });

      it('should handle invalid JSON response from model', async () => {
        mockMemory.content.text = 'Start a tunnel';
        vi.mocked(mockRuntime.useModel).mockResolvedValue('invalid json');
        vi.mocked(mockTunnelService.start).mockResolvedValue('https://test.ngrok.io');

        await startTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        // Should use default port
        expect(mockTunnelService.start).toHaveBeenCalledWith(3000);
      });

      it('should handle tunnel start failure', async () => {
        mockMemory.content.text = 'Start a tunnel';
        vi.mocked(mockRuntime.useModel).mockResolvedValue('{"port": 3000}');
        vi.mocked(mockTunnelService.start).mockRejectedValue(new Error('Failed to start'));

        const result = await startTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(false);
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('❌ Failed to start ngrok tunnel'),
          metadata: {
            error: 'Failed to start',
            action: 'tunnel_failed',
          },
        });
      });

      it('should work without callback', async () => {
        mockMemory.content.text = 'Start a tunnel';
        vi.mocked(mockRuntime.useModel).mockResolvedValue('{"port": 3000}');
        vi.mocked(mockTunnelService.start).mockResolvedValue('https://test.ngrok.io');

        const result = await startTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {}
        );

        expect(result).toBe(true);
      });
    });

    it('should have valid examples', () => {
      expect(startTunnelAction.examples).toBeDefined();
      expect(startTunnelAction.examples.length).toBeGreaterThan(0);
      
      // Check first example
      const firstExample = startTunnelAction.examples[0];
      expect(firstExample[0].name).toBe('user');
      expect(firstExample[1].name).toBe('assistant');
      expect(firstExample[1].content.action).toBe('START_TUNNEL');
    });
  });

  describe('STOP_TUNNEL Action', () => {
    it('should have correct metadata', () => {
      expect(stopTunnelAction.name).toBe('STOP_TUNNEL');
      expect(stopTunnelAction.similes).toContain('CLOSE_TUNNEL');
      expect(stopTunnelAction.similes).toContain('SHUTDOWN_TUNNEL');
      expect(stopTunnelAction.description).toBeDefined();
    });

    describe('validate', () => {
      it('should return false if tunnel service is not available', async () => {
        vi.mocked(mockRuntime.getService).mockReturnValue(null);
        
        const result = await stopTunnelAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(false);
      });

      it('should return false if tunnel is not active', async () => {
        vi.mocked(mockTunnelService.isActive).mockReturnValue(false);
        
        const result = await stopTunnelAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(false);
      });

      it('should return true if tunnel is active', async () => {
        vi.mocked(mockTunnelService.isActive).mockReturnValue(true);
        
        const result = await stopTunnelAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(true);
      });
    });

    describe('handler', () => {
      it('should stop tunnel successfully', async () => {
        const mockStatus: TunnelStatus = {
          active: true,
          url: 'https://test.ngrok.io',
          port: 3000,
          startedAt: new Date(),
          provider: 'ngrok',
        };
        vi.mocked(mockTunnelService.getStatus).mockReturnValue(mockStatus);
        vi.mocked(mockTunnelService.stop).mockResolvedValue();

        const result = await stopTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(true);
        expect(mockTunnelService.stop).toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('✅ Ngrok tunnel stopped successfully!'),
          metadata: {
            previousUrl: 'https://test.ngrok.io',
            previousPort: 3000,
            action: 'tunnel_stopped',
          },
        });
      });

      it('should handle stop failure', async () => {
        const mockStatus: TunnelStatus = {
          active: true,
          url: 'https://test.ngrok.io',
          port: 3000,
          startedAt: new Date(),
          provider: 'ngrok',
        };
        vi.mocked(mockTunnelService.getStatus).mockReturnValue(mockStatus);
        vi.mocked(mockTunnelService.stop).mockRejectedValue(new Error('Failed to stop'));

        const result = await stopTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(false);
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('❌ Failed to stop ngrok tunnel'),
          metadata: {
            error: 'Failed to stop',
            action: 'tunnel_stop_failed',
          },
        });
      });
    });
  });

  describe('GET_TUNNEL_STATUS Action', () => {
    it('should have correct metadata', () => {
      expect(getTunnelStatusAction.name).toBe('GET_TUNNEL_STATUS');
      expect(getTunnelStatusAction.similes).toContain('TUNNEL_STATUS');
      expect(getTunnelStatusAction.similes).toContain('CHECK_TUNNEL');
      expect(getTunnelStatusAction.description).toBeDefined();
    });

    describe('validate', () => {
      it('should return false if tunnel service is not available', async () => {
        vi.mocked(mockRuntime.getService).mockReturnValue(null);
        
        const result = await getTunnelStatusAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(false);
      });

      it('should return true if tunnel service exists', async () => {
        const result = await getTunnelStatusAction.validate(mockRuntime, mockMemory);
        
        expect(result).toBe(true);
      });
    });

    describe('handler', () => {
      it('should report active tunnel status', async () => {
        const startedAt = new Date();
        const mockStatus: TunnelStatus = {
          active: true,
          url: 'https://test.ngrok.io',
          port: 3000,
          startedAt,
          provider: 'ngrok',
        };
        vi.mocked(mockTunnelService.getStatus).mockReturnValue(mockStatus);

        const result = await getTunnelStatusAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(true);
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('✅ Ngrok tunnel is active!'),
          metadata: {
            ...mockStatus,
            action: 'tunnel_status',
          },
        });
        expect((mockCallback as any).mock.calls[0][0].text).toContain('https://test.ngrok.io');
        expect((mockCallback as any).mock.calls[0][0].text).toContain('3000');
      });

      it('should report inactive tunnel status', async () => {
        const mockStatus: TunnelStatus = {
          active: false,
          url: null,
          port: null,
          startedAt: null,
          provider: 'ngrok',
        };
        vi.mocked(mockTunnelService.getStatus).mockReturnValue(mockStatus);

        const result = await getTunnelStatusAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(true);
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('❌ No active ngrok tunnel'),
          metadata: {
            ...mockStatus,
            action: 'tunnel_status',
          },
        });
      });

      it('should calculate uptime correctly', async () => {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const mockStatus: TunnelStatus = {
          active: true,
          url: 'https://test.ngrok.io',
          port: 3000,
          startedAt: fifteenMinutesAgo,
          provider: 'ngrok',
        };
        vi.mocked(mockTunnelService.getStatus).mockReturnValue(mockStatus);

        await getTunnelStatusAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        const callText = (mockCallback as any).mock.calls[0][0].text;
        expect(callText).toMatch(/Uptime: 1[45] minutes/); // Allow for slight timing differences
      });

      it('should handle status check failure', async () => {
        vi.mocked(mockTunnelService.getStatus).mockImplementation(() => {
          throw new Error('Service error');
        });

        const result = await getTunnelStatusAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(false);
        expect(mockCallback).toHaveBeenCalledWith({
          text: expect.stringContaining('❌ Failed to get tunnel status'),
          metadata: {
            error: 'Service error',
            action: 'tunnel_status_failed',
          },
        });
      });
    });
  });
}); 