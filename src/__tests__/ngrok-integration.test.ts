import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { NgrokService } from '../services/NgrokService';
import type { IAgentRuntime } from '@elizaos/core';
import * as http from 'http';
import * as https from 'https';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Helper to check if we have ngrok credentials
const hasNgrokCredentials = () => {
  return !!process.env.NGROK_AUTH_TOKEN;
};

// Helper to check if ngrok is installed
const isNgrokInstalled = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const checkProcess = spawn('which', ['ngrok']);
    checkProcess.on('exit', (code) => {
      resolve(code === 0);
    });
    checkProcess.on('error', () => {
      resolve(false);
    });
  });
};

describe('Ngrok Integration Tests', () => {
  let service: NgrokService;
  let runtime: IAgentRuntime;
  let testServer: http.Server;
  let testServerPort: number;
  let skipTests = false;
  let ngrokInstalled = false;

  beforeAll(async () => {
    // Check if we should skip tests
    const hasAuthToken = Boolean(process.env.NGROK_AUTH_TOKEN);
    const skipEnvVar = process.env.SKIP_NGROK_TESTS === 'true';
    
    console.log('Ngrok integration test environment check:');
    console.log('- NGROK_AUTH_TOKEN:', hasAuthToken ? 'Set' : 'Not set');
    console.log('- NGROK_DOMAIN:', process.env.NGROK_DOMAIN || 'Not set');
    console.log('- SKIP_NGROK_TESTS:', skipEnvVar);
    
    if (!hasAuthToken || skipEnvVar) {
      skipTests = true;
      console.log('⚠️  Skipping ngrok integration tests');
      return;
    }

    // Check prerequisites
    ngrokInstalled = await isNgrokInstalled();
    if (!ngrokInstalled) {
      console.log('⚠️  Skipping integration tests - ngrok is not installed');
      console.log('   Please install ngrok: brew install ngrok');
      skipTests = true;
      return;
    }

    if (!hasNgrokCredentials()) {
      console.log('⚠️  Running integration tests without auth token');
      console.log('   Some features may be limited. Set NGROK_AUTH_TOKEN for full functionality');
    }

    // Create mock runtime that passes all env vars
    runtime = {
      agentId: 'test-agent-123',
      getSetting: (key: string) => process.env[key],
    } as unknown as IAgentRuntime;

    // Create a test HTTP server
    testServer = http.createServer((req, res) => {
      const body: any[] = [];
      req.on('data', (chunk) => body.push(chunk));
      req.on('end', () => {
        const data = Buffer.concat(body).toString();

        // Echo back request details
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: data,
            timestamp: new Date().toISOString(),
          })
        );
      });
    });

    // Start test server on random port
    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        const address = testServer.address();
        if (address && typeof address === 'object') {
          testServerPort = address.port;
        }
        console.log(`✅ Test server started on port ${testServerPort}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up test server
    if (testServer) {
      await new Promise<void>((resolve) => {
        testServer.close(() => {
          console.log('✅ Test server stopped');
          resolve();
        });
      });
    }
  });

  beforeEach(() => {
    // Create fresh service instance for each test
    service = new NgrokService(runtime);
  });

  afterEach(async () => {
    if (service && service.isActive()) {
      await service.stopTunnel();
    }
  });

  describe('Basic Tunnel Operations', () => {
    it('should start and stop a tunnel successfully', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      // Start tunnel
      const url = await service.startTunnel(testServerPort);

      expect(url).toBeDefined();
      expect(url).toMatch(/^https:\/\/.*\.ngrok.*\.(io|app)$/);
      console.log(`✅ Tunnel started: ${url}`);

      // Verify tunnel is active
      expect(service.isActive()).toBe(true);
      expect(service.getUrl()).toBe(url);

      const status = service.getStatus();
      expect(status.active).toBe(true);
      expect(status.port).toBe(testServerPort);
      expect(status.url).toBe(url);
      expect(status.startedAt).toBeInstanceOf(Date);

      // Stop tunnel
      await service.stopTunnel();

      expect(service.isActive()).toBe(false);
      expect(service.getUrl()).toBe(null);
      console.log('✅ Tunnel stopped');
    }, 30000); // 30 second timeout for tunnel operations

    it('should handle multiple start/stop cycles', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      for (let i = 0; i < 3; i++) {
        console.log(`\n🔄 Cycle ${i + 1}/3`);

        const url = await service.startTunnel(testServerPort);
        expect(url).toBeDefined();
        expect(service.isActive()).toBe(true);

        await service.stopTunnel();
        expect(service.isActive()).toBe(false);
      }
    }, 60000); // 60 second timeout
  });

  describe('Webhook Testing', () => {
    it('should receive webhook calls through ngrok tunnel', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      // Start tunnel
      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      console.log(`\n🌐 Testing webhook at: ${tunnelUrl}`);

      // Test webhook with different HTTP methods
      const testCases = [
        { method: 'GET', path: '/webhook/test' },
        { method: 'POST', path: '/webhook/event', body: { event: 'test', data: { foo: 'bar' } } },
        { method: 'PUT', path: '/webhook/update', body: { id: 123, status: 'active' } },
        { method: 'DELETE', path: '/webhook/delete/123' },
      ];

      for (const testCase of testCases) {
        console.log(`\n📤 Testing ${testCase.method} ${testCase.path}`);

        const response = await makeHttpRequest(
          tunnelUrl + testCase.path,
          testCase.method,
          testCase.body
        );

        expect(response.method).toBe(testCase.method);
        expect(response.url).toBe(testCase.path);

        if (testCase.body) {
          expect(JSON.parse(response.body)).toEqual(testCase.body);
        }

        console.log(`✅ ${testCase.method} request successful`);
      }

      // Clean up
      await service.stopTunnel();
    }, 45000);

    it('should handle concurrent webhook requests', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      console.log(`\n🌐 Testing concurrent webhooks at: ${tunnelUrl}`);

      // Send multiple concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) =>
        makeHttpRequest(`${tunnelUrl}/concurrent/${i}`, 'POST', {
          requestId: i,
          timestamp: Date.now(),
        })
      );

      const responses = await Promise.all(requests);

      // Verify all requests were received
      expect(responses).toHaveLength(10);
      responses.forEach((response, i) => {
        expect(response.method).toBe('POST');
        expect(response.url).toBe(`/concurrent/${i}`);
        const body = JSON.parse(response.body);
        expect(body.requestId).toBe(i);
      });

      console.log('✅ All concurrent requests processed successfully');

      await service.stopTunnel();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle tunnel start failure gracefully', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      // Test with port number out of valid range (> 65535)
      await expect(service.startTunnel(70000)).rejects.toThrow('Invalid port number');
      
      // Test with negative port
      await expect(service.startTunnel(-1)).rejects.toThrow('Invalid port number');
      
      // Test with zero port
      await expect(service.startTunnel(0)).rejects.toThrow('Invalid port number');
    });

    it('should handle network interruptions', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      const tunnelUrl = await service.startTunnel(testServerPort);

      // Simulate network request with timeout
      try {
        await makeHttpRequest(tunnelUrl + '/test', 'GET', null, 5000);
      } catch (error: any) {
        // Network errors are expected in some cases
        console.log('⚠️  Network request failed (expected in some test scenarios)');
      }

      // Tunnel should still be active
      expect(service.isActive()).toBe(true);

      await service.stopTunnel();
    }, 30000);
  });

  describe('Real-world Scenarios', () => {
    it('should handle a simulated GitHub webhook', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      console.log(`\n🐙 Simulating GitHub webhook at: ${tunnelUrl}/github/webhook`);

      // Simulate GitHub push event
      const githubPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
        },
        pusher: {
          name: 'test-user',
          email: 'test@example.com',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Test commit',
            author: {
              name: 'Test User',
              email: 'test@example.com',
            },
          },
        ],
      };

      const response = await makeHttpRequest(
        `${tunnelUrl}/github/webhook`,
        'POST',
        githubPayload,
        10000,
        {
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': 'test-delivery-id',
          'Content-Type': 'application/json',
        }
      );

      expect(response.method).toBe('POST');
      expect(response.headers['x-github-event']).toBe('push');

      const receivedPayload = JSON.parse(response.body);
      expect(receivedPayload.repository.name).toBe('test-repo');
      expect(receivedPayload.commits).toHaveLength(1);

      console.log('✅ GitHub webhook simulation successful');

      await service.stopTunnel();
    }, 30000);

    it('should handle a simulated Stripe webhook', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      console.log(`\n💳 Simulating Stripe webhook at: ${tunnelUrl}/stripe/webhook`);

      // Simulate Stripe payment event
      const stripePayload = {
        id: 'evt_test_123',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 2000,
            currency: 'usd',
            status: 'succeeded',
            customer: 'cus_test_123',
          },
        },
      };

      const response = await makeHttpRequest(
        `${tunnelUrl}/stripe/webhook`,
        'POST',
        stripePayload,
        10000,
        {
          'Stripe-Signature': 'test-signature',
          'Content-Type': 'application/json',
        }
      );

      expect(response.method).toBe('POST');
      expect(response.headers['stripe-signature']).toBe('test-signature');

      const receivedPayload = JSON.parse(response.body);
      expect(receivedPayload.type).toBe('payment_intent.succeeded');
      expect(receivedPayload.data.object.amount).toBe(2000);

      console.log('✅ Stripe webhook simulation successful');

      await service.stopTunnel();
    }, 30000);
  });

  describe('Performance Testing', () => {
    it('should handle sustained traffic', async () => {
      if (skipTests) return;
      if (!ngrokInstalled) {
        return;
      }

      const tunnelUrl = (await service.startTunnel(testServerPort)) as string;
      console.log(`\n📊 Performance testing at: ${tunnelUrl}`);

      const startTime = Date.now();
      const duration = 10000; // 10 seconds
      let requestCount = 0;
      let errorCount = 0;

      // Send requests continuously for duration
      while (Date.now() - startTime < duration) {
        try {
          await makeHttpRequest(
            `${tunnelUrl}/perf/${requestCount}`,
            'GET',
            null,
            1000 // 1 second timeout per request
          );
          requestCount++;
        } catch (error) {
          errorCount++;
        }

        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const rps = requestCount / elapsed;

      console.log(`\n📈 Performance Results:`);
      console.log(`   - Duration: ${elapsed.toFixed(1)}s`);
      console.log(`   - Requests: ${requestCount}`);
      console.log(`   - Errors: ${errorCount}`);
      console.log(`   - RPS: ${rps.toFixed(1)}`);

      expect(requestCount).toBeGreaterThan(0);
      expect(errorCount / requestCount).toBeLessThan(0.1); // Less than 10% error rate

      await service.stopTunnel();
    }, 30000);
  });
});

// Helper function to make HTTP requests
async function makeHttpRequest(
  url: string,
  method: string,
  body: any,
  timeout: number = 10000,
  headers: Record<string, string> = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestHeaders: Record<string, string> = {
      ...headers,
      'User-Agent': 'ElizaOS-Ngrok-Test',
      'ngrok-skip-browser-warning': 'true',
    };
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: requestHeaders,
      timeout: timeout,
    };

    if (body && method !== 'GET') {
      const bodyStr = JSON.stringify(body);
      requestHeaders['Content-Type'] = options.headers['Content-Type'] || 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const responseBody = Buffer.concat(chunks).toString();
          const response = JSON.parse(responseBody);
          resolve(response);
        } catch (error: any) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body && method !== 'GET') {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}
