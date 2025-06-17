import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { NgrokService } from '../../services/NgrokService';
import express from 'express';
import type { Server } from 'http';
import { spawn } from 'child_process';
import * as https from 'https';

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

describe('Webhook Integration Scenarios', () => {
  let service: NgrokService;
  let app: express.Application;
  let server: Server;
  let webhookUrl: string;
  let webhookPort: number;
  let receivedWebhooks: any[] = [];

  beforeAll(async () => {
    // Setup webhook server
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Generic webhook handler
    app.all('/webhook/*', (req, res) => {
      receivedWebhooks.push({
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body,
        query: req.query,
      });
      res.status(200).json({ received: true });
    });

    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          webhookPort = address.port;
        }
        console.log(`✅ Webhook server started on port ${webhookPort}`);
        resolve();
      });
    });

    // Initialize ngrok service
    const runtime = {
      getSetting: (key: string) => {
        if (key === 'NGROK_AUTH_TOKEN') {
          return process.env.NGROK_AUTH_TOKEN;
        }
        return undefined;
      },
    } as any;
    
    service = new NgrokService(runtime);

    // Start tunnel
    webhookUrl = (await service.startTunnel(webhookPort)) as string;
  }, 30000);

  afterEach(() => {
    receivedWebhooks = [];
  });

  afterAll(async () => {
    // Stop tunnel first
    if (service) {
      await service.stopTunnel();
    }
    
    // Then stop server
    await new Promise<void>((resolve, reject) => {
      if (server) {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }, 30000);
});

// Helper function to send webhooks
async function sendWebhook(
  url: string,
  payload: any,
  headers: Record<string, string> = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = JSON.stringify(payload);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'ngrok-skip-browser-warning': 'true',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          resolve(JSON.parse(body));
        } catch (error: any) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
} 