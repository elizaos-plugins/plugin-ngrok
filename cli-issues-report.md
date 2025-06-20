# CLI Issues Report for ElizaOS

## Environment Variable Loading Issue

The ElizaOS CLI test runner has an issue with environment variable handling for plugins:

### Problem
When running `elizaos test` or `bun test`, the CLI doesn't properly load the `.env` file from the plugin directory. This causes integration tests that rely on environment variables (like `NGROK_AUTH_TOKEN` and `NGROK_DOMAIN`) to fail.

### Current Behavior
1. The test runner executes tests without loading the plugin's local `.env` file
2. This results in missing credentials for services that require authentication
3. Tests fail with authentication/authorization errors

### Expected Behavior
1. The CLI should load `.env` files from the plugin directory before running tests
2. Environment variables should be available to all test types (unit, integration, e2e)
3. The test runner should respect the plugin's local configuration

### Workaround
Currently, the plugin's test setup manually loads the `.env` file using:
```typescript
beforeAll(() => {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
});
```

### Recommended Fix
The CLI should automatically load `.env` files in this order:
1. Plugin directory `.env` (e.g., `packages/plugin-ngrok/.env`)
2. Monorepo root `.env` 
3. User-provided environment variables

This would ensure consistent behavior between development and testing environments.