import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { NgrokService } from '../../services/NgrokService';
import { startTunnelAction } from '../../actions/start-tunnel';
import { stopTunnelAction } from '../../actions/stop-tunnel';
import { getTunnelStatusAction } from '../../actions/get-tunnel-status';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import * as http from 'http';
import * as https from 'https';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

describe('Real ngrok API E2E Tests', () => {
  let runtime: IAgentRuntime;
  let service: NgrokService;
  let testServer: http.Server;
  let testServerPort: number;

  beforeAll(async () => {
    // Verify we have auth token
    const authToken = process.env.NGROK_AUTH_TOKEN;
    if (!authToken) {
      console.log('⚠️  Skipping E2E tests - NGROK_AUTH_TOKEN not found in environment');
      return;
    }

    // Create a test HTTP server
    testServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();

        // Log the request for debugging
        console.log(`Received ${req.method} request to ${req.url}`);

        // Handle different endpoints
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
        } else if (req.url === '/webhook') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              received: true,
              method: req.method,
              headers: req.headers,
              body: body ? JSON.parse(body) : null,
            })
          );
        } else if (req.url === '/echo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(body || JSON.stringify({ echo: 'empty' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    // Start server on random port
    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        const address = testServer.address();
        if(address && typeof address === 'object') {
            testServerPort = address.port;
        }
        console.log(`✅ Test server started on port ${testServerPort}`);
        resolve();
      });
    });

    // Create runtime with real environment
    runtime = {
      agentId: 'test-agent',
      getSetting: (key: string) => process.env[key],
      getService: (name: string) => (name === 'tunnel' ? service : undefined),
      registerService: (service: any) => {},
      useModel: async (model: string, params: any) => {
        // Mock model response for actions
        return {
          text: 'Mock response',
          metadata: {},
        };
      },
    } as unknown as IAgentRuntime;

    // Initialize service
    service = new NgrokService(runtime);
  }, 30000);

  afterAll(async () => {
    // Clean up any active tunnels
    if (service && service.isActive()) {
      await service.stopTunnel();
    }

    // Stop test server
    if (testServer) {
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    // Ensure clean state before each test
    if (service && service.isActive()) {
      return service.stopTunnel();
    }
  });

  // Helper function for making requests through ngrok
  async function fetchWithNgrokHeaders(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        'ngrok-skip-browser-warning': 'true',
      },
    });
  }

  describe('Basic Tunnel Operations', () => {
    it('should start a tunnel with real ngrok', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const url = await service.startTunnel(testServerPort);

      expect(url).toBeTruthy();
      expect(url).toMatch(/^https:\/\/[a-zA-Z0-9-]+\.ngrok(-free)?\.app$/);
      expect(service.isActive()).toBe(true);

      const status = service.getStatus();
      expect(status.active).toBe(true);
      expect(status.url).toBe(url);
      expect(status.port).toBe(testServerPort);
      expect(status.provider).toBe('ngrok');

      console.log(`✅ Tunnel created: ${url}`);
    }, 30000);

    it('should stop a tunnel', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      // Start tunnel first
      const url = await service.startTunnel(testServerPort);
      expect(service.isActive()).toBe(true);

      // Stop tunnel
      await service.stopTunnel();
      expect(service.isActive()).toBe(false);
      expect(service.getUrl()).toBeNull();

      const status = service.getStatus();
      expect(status.active).toBe(false);
      expect(status.url).toBeNull();
      expect(status.port).toBeNull();
    }, 30000);

    it('should handle multiple start/stop cycles', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      for (let i = 0; i < 3; i++) {
        const url = await service.startTunnel(testServerPort);
        expect(url).toBeTruthy();
        expect(service.isActive()).toBe(true);

        await service.stopTunnel();
        expect(service.isActive()).toBe(false);

        // Small delay between cycles
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }, 45000);
  });

  describe('Action Integration Tests', () => {
    it('should start tunnel via action', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const message: Memory = {
        id: '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
        agentId: runtime.agentId,
        roomId:
          '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
        content: { text: `start tunnel on port ${testServerPort}` },
        createdAt: Date.now(),
      } as Memory;

      const callback = vi.fn().mockResolvedValue([]);
      const result = await startTunnelAction.handler(runtime, message, {} as State, {}, callback);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('started successfully'),
          content: expect.objectContaining({
            url: expect.stringMatching(/^https:\/\/[a-zA-Z0-9-]+\.ngrok(-free)?\.app$/),
            port: testServerPort,
          }),
        })
      );

      expect(service.isActive()).toBe(true);
    }, 30000);

    it('should get tunnel status via action', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      // Start tunnel first
      await service.startTunnel(testServerPort);
      const tunnelUrl = service.getUrl();

      const message: Memory = {
        id: '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
        agentId: runtime.agentId,
        roomId:
          '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
        content: { text: 'tunnel status' },
        createdAt: Date.now(),
      } as Memory;

      const callback = vi.fn().mockResolvedValue([]);
      const result = await getTunnelStatusAction.handler(
        runtime,
        message,
        {} as State,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Tunnel is active'),
          content: expect.objectContaining({
            active: true,
            url: tunnelUrl,
            port: testServerPort,
            uptime: expect.any(String),
          }),
        })
      );
    }, 30000);

    it('should stop tunnel via action', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      // Start tunnel first
      const url = await service.startTunnel(testServerPort);
      expect(service.isActive()).toBe(true);

      const message: Memory = {
        id: '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
        agentId: runtime.agentId,
        roomId:
          '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
        content: { text: 'stop tunnel' },
        createdAt: Date.now(),
      } as Memory;

      const callback = vi.fn().mockResolvedValue([]);
      const result = await stopTunnelAction.handler(runtime, message, {} as State, {}, callback);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('stopped successfully'),
          metadata: expect.objectContaining({
            previousUrl: url,
            previousPort: testServerPort,
          }),
        })
      );

      expect(service.isActive()).toBe(false);
    }, 30000);
  });

  describe('Real HTTP Traffic Tests', () => {
    it('should handle real HTTP requests through tunnel', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;

      // Test health endpoint
      const healthResponse = await fetchWithNgrokHeaders(`${tunnelUrl}/health`);
      const healthData = await healthResponse.json();

      expect(healthResponse.status).toBe(200);
      expect(healthData.status).toBe('healthy');
      expect(healthData.timestamp).toBeTruthy();
    }, 30000);

    it('should handle webhook requests through tunnel', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;

      // Send webhook request
      const webhookPayload = {
        event: 'test.webhook',
        timestamp: new Date().toISOString(),
        data: {
          message: 'Hello from ngrok tunnel',
          testId: Math.random().toString(36),
        },
      };

      const response = await fetchWithNgrokHeaders(`${tunnelUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'test-signature',
        },
        body: JSON.stringify(webhookPayload),
      });

      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.received).toBe(true);
      expect(responseData.method).toBe('POST');
      expect(responseData.headers['x-webhook-signature']).toBe('test-signature');
      expect(responseData.body).toEqual(webhookPayload);
    }, 30000);

    it('should handle multiple concurrent requests', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;

      // Send 10 concurrent requests
      const requests = Array.from({ length: 10 }, async (_, i) => {
        const response = await fetchWithNgrokHeaders(`${tunnelUrl}/echo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: i, timestamp: Date.now() }),
        });
        return response.json();
      });

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(10);
      responses.forEach((response, i) => {
        expect(response.requestId).toBe(i);
        expect(response.timestamp).toBeTruthy();
      });
    }, 30000);
  });

  describe('Error Handling with Real API', () => {
    it('should handle port already in use', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      // Start first tunnel
      const url1 = await service.startTunnel(testServerPort);
      expect(url1).toBeTruthy();

      // Try to start another tunnel on same port (should replace)
      const url2 = await service.startTunnel(testServerPort);
      expect(url2).toBeTruthy();
      expect(url2).toBe(url1); // Should be the same tunnel
    }, 30000);

    it('should handle invalid port gracefully', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      try {
        await service.startTunnel(99999);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
        expect(service.isActive()).toBe(false);
      }
    }, 30000);

    it('should recover from network interruption', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      // Start tunnel
      const url = await service.startTunnel(testServerPort);
      expect(url).toBeTruthy();

      // Stop and restart quickly
      await service.stopTunnel();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const newUrl = await service.startTunnel(testServerPort);
      expect(newUrl).toBeTruthy();
      expect(service.isActive()).toBe(true);
    }, 30000);
  });

  describe('Slack Agent Use Cases', () => {
    it('should handle Slack webhook verification', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;

      // Simulate Slack URL verification
      const verificationPayload = {
        token: 'test-token',
        challenge: 'test_challenge_string',
        type: 'url_verification',
      };

      const response = await fetchWithNgrokHeaders(`${tunnelUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verificationPayload),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.body.challenge).toBe('test-challenge-string');
    }, 30000);

    it('should handle Slack event subscriptions', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;

      // Simulate Slack event
      const slackEvent = {
        token: 'test-token',
        team_id: 'T123456',
        api_app_id: 'A123456',
        event: {
          type: 'message',
          channel: 'C123456',
          user: 'U123456',
          text: 'Hello bot!',
          ts: '1234567890.123456',
        },
        type: 'event_callback',
        event_id: 'Ev123456',
        event_time: Math.floor(Date.now() / 1000),
      };

      const response = await fetchWithNgrokHeaders(`${tunnelUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Slack-Signature': 'v0=test-signature',
          'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
        },
        body: JSON.stringify(slackEvent),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.body.event.type).toBe('message');
      expect(data.body.event.text).toBe('Hello bot!');
    }, 30000);

    it('should provide stable URL for Slack app configuration', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      // Start tunnel
      const url1 = await service.startTunnel(testServerPort);

      // Verify URL format is suitable for Slack
      expect(url1).toMatch(/^https:\/\//); // Must be HTTPS
      expect(url1).not.toContain('localhost'); // Must be public

      // Stop and restart - URL might change but format should be consistent
      await service.stopTunnel();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const url2 = await service.startTunnel(testServerPort);
      expect(url2).toMatch(/^https:\/\//);
      expect(url2).not.toContain('localhost');

      console.log(`URLs for Slack configuration:\n  First: ${url1}\n  Second: ${url2}`);
    }, 45000);
  });

  describe('Performance and Reliability', () => {
    it('should handle sustained traffic', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      const startTime = Date.now();
      const duration = 5000; // 5 seconds
      let requestCount = 0;
      let errorCount = 0;

      // Send requests continuously for 5 seconds
      while (Date.now() - startTime < duration) {
        try {
          const response = await fetchWithNgrokHeaders(`${tunnelUrl}/health`);
          if (response.status === 200) {
            requestCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }

        // Small delay to avoid overwhelming
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(`Performance test: ${requestCount} successful requests, ${errorCount} errors`);

      expect(requestCount).toBeGreaterThan(20); // Adjusted for free tier limits
      expect(errorCount).toBeLessThan(10); // Allow some errors due to rate limiting
    }, 30000);

    it('should maintain tunnel stability over time', async () => {
      const authToken = process.env.NGROK_AUTH_TOKEN;
      if (!authToken) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      const checks = 5;
      const interval = 2000; // 2 seconds between checks

      for (let i = 0; i < checks; i++) {
        const response = await fetchWithNgrokHeaders(`${tunnelUrl}/health`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe('healthy');

        if (i < checks - 1) {
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      }

      // Verify tunnel is still active
      expect(service.isActive()).toBe(true);
      expect(service.getUrl()).toBe(tunnelUrl);
    }, 30000);
  });
}); 