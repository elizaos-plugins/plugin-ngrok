import { describe, it, expect, vi, beforeEach } from 'vitest';
import ngrokPlugin from '../../index';
import type { IAgentRuntime, Plugin } from '@elizaos/core';
import { NgrokService } from '../../services/NgrokService';
import startTunnelAction from '../../actions/start-tunnel';
import stopTunnelAction from '../../actions/stop-tunnel';
import getTunnelStatusAction from '../../actions/get-tunnel-status';

// Mock logger
vi.mock('@elizaos/core', async () => {
  const actual = await vi.importActual('@elizaos/core');
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('Ngrok Plugin', () => {
  let mockRuntime: IAgentRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRuntime = {
      getSetting: vi.fn(),
    } as unknown as IAgentRuntime;
  });

  describe('Plugin Structure', () => {
    it('should have correct metadata', () => {
      expect(ngrokPlugin.name).toBe('ngrok');
      expect(ngrokPlugin.description).toBe('Ngrok tunnel integration plugin for ElizaOS');
    });

    it('should register NgrokService', () => {
      expect(ngrokPlugin.services).toBeDefined();
      expect(ngrokPlugin.services).toContain(NgrokService);
      expect(ngrokPlugin.services).toHaveLength(1);
    });

    it('should register all actions', () => {
      expect(ngrokPlugin.actions).toBeDefined();
      expect(ngrokPlugin.actions).toHaveLength(3);
      expect(ngrokPlugin.actions).toContain(startTunnelAction);
      expect(ngrokPlugin.actions).toContain(stopTunnelAction);
      expect(ngrokPlugin.actions).toContain(getTunnelStatusAction);
    });

    it('should have no providers', () => {
      expect(ngrokPlugin.providers).toBeDefined();
      expect(ngrokPlugin.providers).toHaveLength(0);
    });

    it('should have test suite', () => {
      expect(ngrokPlugin.tests).toBeDefined();
      expect(ngrokPlugin.tests).toHaveLength(1);
      expect(ngrokPlugin.tests[0].name).toBe('ngrok');
    });

    it('should have init function', () => {
      expect(ngrokPlugin.init).toBeDefined();
      expect(typeof ngrokPlugin.init).toBe('function');
    });
  });

  describe('Plugin Initialization', () => {
    it('should initialize successfully with auth token', async () => {
      vi.mocked(mockRuntime.getSetting).mockReturnValue('test-auth-token');

      await ngrokPlugin.init!({}, mockRuntime);

      expect(mockRuntime.getSetting).toHaveBeenCalledWith('NGROK_AUTH_TOKEN');
      
      // Should only log info, not warnings
      const { logger } = await import('@elizaos/core');
      expect(logger.info).toHaveBeenCalledWith('Initializing Ngrok plugin');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should warn when auth token is not provided', async () => {
      vi.mocked(mockRuntime.getSetting).mockReturnValue(undefined);

      await ngrokPlugin.init!({}, mockRuntime);

      const { logger } = await import('@elizaos/core');
      expect(logger.info).toHaveBeenCalledWith('Initializing Ngrok plugin');
      expect(logger.warn).toHaveBeenCalledWith(
        'Ngrok Auth Token not provided - Ngrok plugin is loaded but may have limited functionality'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'To enable full Ngrok functionality, please provide NGROK_AUTH_TOKEN in your .env file'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Get your auth token from: https://dashboard.ngrok.com/get-started/your-authtoken'
      );
    });

    it('should handle empty string auth token', async () => {
      vi.mocked(mockRuntime.getSetting).mockReturnValue('');

      await ngrokPlugin.init!({}, mockRuntime);

      const { logger } = await import('@elizaos/core');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw errors during initialization', async () => {
      // Test with various runtime configurations
      const testCases = [
        { authToken: 'valid-token' },
        { authToken: undefined },
        { authToken: null },
        { authToken: '' },
      ];

      for (const testCase of testCases) {
        vi.mocked(mockRuntime.getSetting).mockReturnValue(testCase.authToken as any);
        
        await expect(ngrokPlugin.init!({}, mockRuntime)).resolves.not.toThrow();
      }
    });
  });

  describe('Plugin Exports', () => {
    it('should export NgrokService', async () => {
      const { NgrokService: ExportedService } = await import('../../index');
      expect(ExportedService).toBe(NgrokService);
    });

    it('should export tunnel types', async () => {
      const types = await import('../../index');
      
      // Check that types are exported (they will be undefined at runtime but TypeScript will validate)
      expect(types).toHaveProperty('default');
      expect(types.default).toBe(ngrokPlugin);
    });
  });

  describe('Action Validation', () => {
    it('should have valid START_TUNNEL action', () => {
      const action = ngrokPlugin.actions![0];
      expect(action.name).toBe('START_TUNNEL');
      expect(action.description).toBeDefined();
      expect(action.handler).toBeDefined();
      expect(action.validate).toBeDefined();
      expect(action.examples).toBeDefined();
      expect(action.examples.length).toBeGreaterThan(0);
    });

    it('should have valid STOP_TUNNEL action', () => {
      const action = ngrokPlugin.actions![1];
      expect(action.name).toBe('STOP_TUNNEL');
      expect(action.description).toBeDefined();
      expect(action.handler).toBeDefined();
      expect(action.validate).toBeDefined();
      expect(action.examples).toBeDefined();
      expect(action.examples.length).toBeGreaterThan(0);
    });

    it('should have valid GET_TUNNEL_STATUS action', () => {
      const action = ngrokPlugin.actions![2];
      expect(action.name).toBe('GET_TUNNEL_STATUS');
      expect(action.description).toBeDefined();
      expect(action.handler).toBeDefined();
      expect(action.validate).toBeDefined();
      expect(action.examples).toBeDefined();
      expect(action.examples.length).toBeGreaterThan(0);
    });
  });

  describe('Plugin Configuration', () => {
    it('should accept custom configuration', async () => {
      const customConfig = {
        someOption: 'value',
      };

      await ngrokPlugin.init!(customConfig, mockRuntime);

      // Plugin should not throw with custom config
      const { logger } = await import('@elizaos/core');
      expect(logger.info).toHaveBeenCalledWith('Initializing Ngrok plugin');
    });

    it('should work with minimal runtime', async () => {
      const minimalRuntime = {
        getSetting: () => undefined,
      } as unknown as IAgentRuntime;

      await expect(ngrokPlugin.init!({}, minimalRuntime)).resolves.not.toThrow();
    });
  });
}); 