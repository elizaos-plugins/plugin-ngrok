import { type ITunnelService, type TunnelConfig, type TunnelStatus } from '@elizaos/core';
import { describe, expect, it } from 'vitest';

describe('Tunnel Types', () => {
  describe('TunnelStatus interface', () => {
    it('should accept valid status object', () => {
      const validStatus: TunnelStatus = {
        active: true,
        url: 'https://test.ngrok.io',
        port: 3000,
        startedAt: new Date(),
        provider: 'ngrok',
      };

      expect(validStatus.active).toBe(true);
      expect(validStatus.url).toMatch(/^https:\/\//);
      expect(validStatus.port).toBeGreaterThan(0);
      expect(validStatus.startedAt).toBeInstanceOf(Date);
      expect(validStatus.provider).toBe('ngrok');
    });

    it('should accept inactive status', () => {
      const inactiveStatus: TunnelStatus = {
        active: false,
        url: null,
        port: null,
        startedAt: null,
        provider: 'ngrok',
      };

      expect(inactiveStatus.active).toBe(false);
      expect(inactiveStatus.url).toBeNull();
      expect(inactiveStatus.port).toBeNull();
      expect(inactiveStatus.startedAt).toBeNull();
    });
  });

  describe('TunnelConfig interface', () => {
    it('should accept minimal config', () => {
      const minimalConfig: TunnelConfig = {};

      expect(minimalConfig.provider).toBeUndefined();
      expect(minimalConfig.authToken).toBeUndefined();
      expect(minimalConfig.region).toBeUndefined();
      expect(minimalConfig.subdomain).toBeUndefined();
    });

    it('should accept full config', () => {
      const fullConfig: TunnelConfig = {
        provider: 'ngrok',
        authToken: 'test-token',
        region: 'eu',
        subdomain: 'my-subdomain',
      };

      expect(fullConfig.provider).toBe('ngrok');
      expect(fullConfig.authToken).toBe('test-token');
      expect(fullConfig.region).toBe('eu');
      expect(fullConfig.subdomain).toBe('my-subdomain');
    });

    it('should accept different provider types', () => {
      const providers: TunnelConfig['provider'][] = ['ngrok', 'cloudflare', 'localtunnel'];

      providers.forEach((provider) => {
        const config: TunnelConfig = { provider };
        expect(config.provider).toBe(provider);
      });
    });
  });

  describe('ITunnelService interface', () => {
    it('should define all required methods', () => {
      const mockService = {
        startTunnel: () => {},
        stopTunnel: () => {},
        getUrl: () => null,
        isActive: () => false,
        getStatus: () => ({
          active: false,
          url: null,
          port: null,
          startedAt: null,
          provider: 'ngrok',
        }),
      } as unknown as ITunnelService;

      expect(typeof mockService.startTunnel).toBe('function');
      expect(typeof mockService.stopTunnel).toBe('function');
      expect(typeof mockService.getUrl).toBe('function');
      expect(typeof mockService.isActive).toBe('function');
      expect(typeof mockService.getStatus).toBe('function');
    });
  });

  describe('Type guards and validation', () => {
    it('should validate tunnel URL format', () => {
      const isValidTunnelUrl = (url: string): boolean => {
        return /^https:\/\/[a-zA-Z0-9-]+\.(ngrok|cloudflare|localtunnel)\.(io|com|app)$/.test(url);
      };

      expect(isValidTunnelUrl('https://test.ngrok.io')).toBe(true);
      expect(isValidTunnelUrl('https://my-app.ngrok.io')).toBe(true);
      expect(isValidTunnelUrl('http://test.ngrok.io')).toBe(false);
      expect(isValidTunnelUrl('https://test.com')).toBe(false);
    });

    it('should validate port numbers', () => {
      const isValidPort = (port: number): boolean => {
        return Number.isInteger(port) && port > 0 && port <= 65535;
      };

      expect(isValidPort(3000)).toBe(true);
      expect(isValidPort(80)).toBe(true);
      expect(isValidPort(65535)).toBe(true);
      expect(isValidPort(0)).toBe(false);
      expect(isValidPort(65536)).toBe(false);
      expect(isValidPort(-1)).toBe(false);
      expect(isValidPort(3.14)).toBe(false);
    });

    it('should validate region codes', () => {
      const validRegions = ['us', 'eu', 'ap', 'au', 'sa', 'jp', 'in'];
      const isValidRegion = (region: string): boolean => {
        return validRegions.includes(region);
      };

      validRegions.forEach((region) => {
        expect(isValidRegion(region)).toBe(true);
      });

      expect(isValidRegion('invalid')).toBe(false);
      expect(isValidRegion('')).toBe(false);
    });
  });
});
