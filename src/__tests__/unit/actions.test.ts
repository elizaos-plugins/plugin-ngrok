import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { startTunnelAction } from '../../actions/start-tunnel';
import { stopTunnelAction } from '../../actions/stop-tunnel';
import { getTunnelStatusAction } from '../../actions/get-tunnel-status';
import type { ITunnelService } from '../../types/tunnel-types';

describe('Ngrok Actions', () => {
  let mockRuntime: IAgentRuntime;
  let mockTunnelService: ITunnelService;
  let mockCallback: HandlerCallback;
  let mockMemory: Memory;
  let mockState: State;

  beforeEach(() => {
    mockTunnelService = {
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn(),
      isActive: vi.fn(),
      getUrl: vi.fn(),
    } as unknown as ITunnelService;

    mockRuntime = {
      getService: vi.fn().mockReturnValue(mockTunnelService),
      getSetting: vi.fn(),
      useModel: vi.fn(),
    } as unknown as IAgentRuntime;

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
      vi.mocked(mockRuntime.useModel).mockResolvedValue('{"port": 8080}');
      vi.mocked(mockTunnelService.startTunnel).mockResolvedValue('https://test.ngrok.io');

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
      vi.mocked(mockTunnelService.isActive).mockReturnValue(true);
      vi.mocked(mockTunnelService.getStatus).mockReturnValue({
        active: true,
        url: 'https://fake.ngrok.io',
        port: 8080,
        startedAt: new Date(),
        provider: 'ngrok',
      });

      await stopTunnelAction.handler(mockRuntime, mockMemory, mockState, {}, mockCallback);

      expect(mockTunnelService.stop).toHaveBeenCalled();
    });
  });

  describe('getTunnelStatusAction', () => {
    it('should report status of an active tunnel', async () => {
      vi.mocked(mockTunnelService.getStatus).mockReturnValue({
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
      vi.mocked(mockTunnelService.getStatus).mockReturnValue({
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
