import { describe, it, expect, vi } from 'vitest';
import ngrokPlugin from '../../index';
import { NgrokService } from '../../services/NgrokService';
import type { IAgentRuntime, Plugin } from '@elizaos/core';

describe('Ngrok Plugin', () => {
    it('should have correct metadata', () => {
      expect(ngrokPlugin.name).toBe('ngrok');
    if (ngrokPlugin.services) {
      expect(ngrokPlugin.services[0]).toBe(NgrokService);
    }
  });

  it('should have tests', () => {
    expect(ngrokPlugin.tests).toBeDefined();
    if (ngrokPlugin.tests) {
      expect(ngrokPlugin.tests.length).toBeGreaterThan(0);
    }
  });
});
