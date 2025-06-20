import type { HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTunnelStatusAction } from '../../actions/get-tunnel-status';
import { startTunnelAction } from '../../actions/start-tunnel';
import { stopTunnelAction } from '../../actions/stop-tunnel';
import { MockNgrokService } from '../mocks/NgrokServiceMock';

describe('Ngrok Actions', () => {
  let mockRuntime: IAgentRuntime;
  let mockTunnelService: MockNgrokService;
  let mockCallback: HandlerCallback;
  let mockMemory: Memory;
  let mockState: State;

  beforeEach(() => {
    mockRuntime = {
      getService: vi.fn(),
      getSetting: vi.fn(),
      useModel: vi.fn(),
    } as unknown as IAgentRuntime;

    mockTunnelService = new MockNgrokService(mockRuntime);
    (mockRuntime.getService as any).mockReturnValue(mockTunnelService);

    mockCallback = vi.fn();
    mockMemory = {} as Memory;
    mockState = {} as State;
  });

  afterEach(() => {
    vi.clearAllMocks();
    });

  describe('startTunnelAction', () => {
    it('should start a tunnel with a specified port', async () => {
      mockMemory.content = { text: 'start tunnel on port 8080' };
      (mockRuntime.useModel as any).mockResolvedValue('{"port": 8080}');
      mockTunnelService.startTunnel.mockResolvedValue('https://test.ngrok.io');

        const result = await startTunnelAction.handler(
          mockRuntime,
          mockMemory,
          mockState,
          {},
          mockCallback
        );

        expect(result).toBe(true);
        expect(mockTunnelService.startTunnel).toHaveBeenCalledWith(8080);
    });
  });

  describe('stopTunnelAction', () => {
    it('should stop an active tunnel', async () => {
      const tunnelStartTime = new Date();
      
      // Set up the service to simulate an active tunnel
      mockTunnelService.isActive.mockReturnValue(true);
      mockTunnelService.getStatus.mockReturnValue({
          active: true,
        url: 'https://fake.ngrok.io',
        port: 8080,
        startedAt: tunnelStartTime,
          provider: 'ngrok',
        });

      const result = await stopTunnelAction.handler(mockRuntime, mockMemory, mockState, {}, mockCallback);

        expect(result).toBe(true);
      expect(mockTunnelService.stopTunnel).toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining('stopped successfully'),
          metadata: expect.objectContaining({
            previousUrl: 'https://fake.ngrok.io',
            previousPort: 8080,
            action: 'tunnel_stopped',
          }),
        })
      );
    });
  });

  describe('getTunnelStatusAction', () => {
    it('should report status of an active tunnel', async () => {
      mockTunnelService.getStatus.mockReturnValue({
          active: true,
        url: 'https://fake.ngrok.io',
        port: 8080,
        startedAt: new Date(),
          provider: 'ngrok',
      });

      await getTunnelStatusAction.handler(mockRuntime, mockMemory, mockState, {}, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('✅ Ngrok tunnel is active!'),
        })
      );
      });

      it('should report inactive tunnel status', async () => {
      mockTunnelService.getStatus.mockReturnValue({
          active: false,
          url: null,
          port: null,
          startedAt: null,
          provider: 'ngrok',
      });

        await getTunnelStatusAction.handler(mockRuntime, mockMemory, mockState, {}, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('❌ No active ngrok tunnel'),
        })
      );
    });
  });
});
