import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateNgrokConfig, ngrokEnvSchema } from '../../environment';
import type { IAgentRuntime } from '@elizaos/core';
import { z } from 'zod';

describe('Ngrok Environment Configuration', () => {
  let mockRuntime: IAgentRuntime;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Clear relevant env vars
    delete process.env.NGROK_AUTH_TOKEN;
    delete process.env.NGROK_REGION;
    delete process.env.NGROK_SUBDOMAIN;
    delete process.env.NGROK_DEFAULT_PORT;

    // Setup mock runtime
    mockRuntime = {
      getSetting: vi.fn((key: string) => {
        const settings: Record<string, string> = {};
        return settings[key];
      }),
    } as unknown as IAgentRuntime;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('ngrokEnvSchema', () => {
    it('should accept valid configuration', () => {
      const validConfig = {
        NGROK_AUTH_TOKEN: 'test-token',
        NGROK_REGION: 'eu',
        NGROK_SUBDOMAIN: 'my-subdomain',
        NGROK_DEFAULT_PORT: '8080',
      };

      const result = ngrokEnvSchema.parse(validConfig);

      expect(result.NGROK_AUTH_TOKEN).toBe('test-token');
      expect(result.NGROK_REGION).toBe('eu');
      expect(result.NGROK_SUBDOMAIN).toBe('my-subdomain');
      expect(result.NGROK_DEFAULT_PORT).toBe(8080);
    });

    it('should use defaults for optional fields', () => {
      const minimalConfig = {};

      const result = ngrokEnvSchema.parse(minimalConfig);

      expect(result.NGROK_AUTH_TOKEN).toBeUndefined();
      expect(result.NGROK_REGION).toBe('us');
      expect(result.NGROK_SUBDOMAIN).toBeUndefined();
      expect(result.NGROK_DEFAULT_PORT).toBe(3000);
    });

    it('should transform port string to number', () => {
      const config = {
        NGROK_DEFAULT_PORT: '5000',
      };

      const result = ngrokEnvSchema.parse(config);

      expect(result.NGROK_DEFAULT_PORT).toBe(5000);
      expect(typeof result.NGROK_DEFAULT_PORT).toBe('number');
    });

    it('should handle empty port string', () => {
      const config = {
        NGROK_DEFAULT_PORT: '',
      };

      const result = ngrokEnvSchema.parse(config);

      expect(result.NGROK_DEFAULT_PORT).toBe(3000); // Default
    });
  });

  describe('validateNgrokConfig', () => {
    it('should validate configuration from runtime settings', async () => {
      (mockRuntime.getSetting as any).mockImplementation((key: string) => {
        const settings: Record<string, string> = {
          NGROK_AUTH_TOKEN: 'runtime-token',
          NGROK_REGION: 'ap',
          NGROK_SUBDOMAIN: 'runtime-subdomain',
          NGROK_DEFAULT_PORT: '4000',
        };
        return settings[key];
      });

      const config = await validateNgrokConfig(mockRuntime);

      expect(config.NGROK_AUTH_TOKEN).toBe('runtime-token');
      expect(config.NGROK_REGION).toBe('ap');
      expect(config.NGROK_SUBDOMAIN).toBe('runtime-subdomain');
      expect(config.NGROK_DEFAULT_PORT).toBe(4000);
    });

    it('should fall back to process.env if runtime setting is not available', async () => {
      process.env.NGROK_AUTH_TOKEN = 'env-token';
      process.env.NGROK_REGION = 'sa';

      (mockRuntime.getSetting as any).mockReturnValue(undefined);

      const config = await validateNgrokConfig(mockRuntime);

      expect(config.NGROK_AUTH_TOKEN).toBe('env-token');
      expect(config.NGROK_REGION).toBe('sa');
    });

    it('should prefer runtime settings over process.env', async () => {
      process.env.NGROK_AUTH_TOKEN = 'env-token';

      (mockRuntime.getSetting as any).mockImplementation((key: string) => {
        if (key === 'NGROK_AUTH_TOKEN') {
          return 'runtime-token';
        }
        return undefined;
      });

      const config = await validateNgrokConfig(mockRuntime);

      expect(config.NGROK_AUTH_TOKEN).toBe('runtime-token');
    });

    it('should handle validation errors gracefully', async () => {
      // Mock invalid data that will fail zod validation - now NGROK_REGION accepts numbers
      (mockRuntime.getSetting as any).mockImplementation((key: string) => {
        if (key === 'NGROK_DEFAULT_PORT') {
          return 'invalid-port'; // This will fail parsing
        }
        return undefined;
      });

      await expect(validateNgrokConfig(mockRuntime)).resolves.toEqual(
        expect.objectContaining({
          NGROK_DEFAULT_PORT: 3000, // Falls back to default on invalid input
        })
      );
    });

    it('should handle number inputs by converting them', async () => {
      const mockRuntime = {
        getSetting: vi.fn((key: string) => {
          const settings: Record<string, any> = {
            NGROK_REGION: 123, // Will be converted to '123'
            NGROK_DEFAULT_PORT: 'invalid', // Will use default 3000
          };
          return settings[key];
        }),
      } as unknown as IAgentRuntime;

      const config = await validateNgrokConfig(mockRuntime);
      expect(config.NGROK_REGION).toBe('123'); // Number converted to string
      expect(config.NGROK_DEFAULT_PORT).toBe(3000); // Invalid string uses default
    });

    it('should handle all supported regions', async () => {
      const regions = ['us', 'eu', 'ap', 'au', 'sa', 'jp', 'in'];

      for (const region of regions) {
        (mockRuntime.getSetting as any).mockImplementation((key: string) => {
          if (key === 'NGROK_REGION') {
            return region;
          }
          return undefined;
        });

        const config = await validateNgrokConfig(mockRuntime);
        expect(config.NGROK_REGION).toBe(region);
      }
    });

    it('should handle port zero', async () => {
      const mockRuntime = {
        getSetting: vi.fn((key: string) => {
          const settings: Record<string, any> = {
            NGROK_DEFAULT_PORT: '0',
          };
          return settings[key];
        }),
      } as unknown as IAgentRuntime;

      const config = await validateNgrokConfig(mockRuntime);
      expect(config.NGROK_DEFAULT_PORT).toBe(3000); // Should use default instead of 0
    });

    it('should handle very large port numbers', async () => {
      (mockRuntime.getSetting as any).mockImplementation((key: string) => {
        if (key === 'NGROK_DEFAULT_PORT') {
          return '65535';
        }
        return undefined;
      });

      const config = await validateNgrokConfig(mockRuntime);

      expect(config.NGROK_DEFAULT_PORT).toBe(65535);
    });
  });

  describe('Edge cases', () => {
    it('should handle null values from runtime settings', async () => {
      (mockRuntime.getSetting as any).mockReturnValue(null as any);

      const config = await validateNgrokConfig(mockRuntime);

      // Should use defaults
      expect(config.NGROK_AUTH_TOKEN).toBeUndefined();
      expect(config.NGROK_REGION).toBe('us');
      expect(config.NGROK_DEFAULT_PORT).toBe(3000);
    });

    it('should handle undefined runtime', async () => {
      const undefinedRuntime = {
        getSetting: () => undefined,
      } as unknown as IAgentRuntime;

      const config = await validateNgrokConfig(undefinedRuntime);

      // Should use defaults
      expect(config.NGROK_REGION).toBe('us');
      expect(config.NGROK_DEFAULT_PORT).toBe(3000);
    });
  });
});
