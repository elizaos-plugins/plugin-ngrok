import { defineConfig } from 'vitest/config';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before vitest starts
const envPath = path.resolve(__dirname, '.env');
const result = dotenv.config({ path: envPath });

console.log('Vitest config loading environment:');
console.log('- NGROK_AUTH_TOKEN:', process.env.NGROK_AUTH_TOKEN ? 'Set' : 'Not set');
console.log('- NGROK_DOMAIN:', process.env.NGROK_DOMAIN || 'Not set');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/test-setup.ts'],
    env: {
      // Preserve the loaded environment variables
      NGROK_AUTH_TOKEN: process.env.NGROK_AUTH_TOKEN || '',
      NGROK_DOMAIN: process.env.NGROK_DOMAIN || '',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        '**/__tests__/**',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 120000, // 2 minutes default timeout
    hookTimeout: 30000,  // 30 seconds for hooks
    // Use threads pool to avoid esbuild service issues
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run all tests sequentially in a single thread
        isolate: true,      // Isolate each test file
      },
    },
    // Retry configuration for flaky tests
    retry: 1,
    // Reporter configuration
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
