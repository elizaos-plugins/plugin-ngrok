# Ngrok Plugin Testing Guide

## Overview

The ngrok plugin test suite includes unit tests, integration tests, and e2e tests. Due to ngrok's rate limiting and domain conflicts, special care must be taken when running tests.

## Free vs Paid Ngrok Accounts

### Free Account Limitations
- **No custom subdomains**: Cannot use `--subdomain` flag
- **No custom domains**: Cannot use `--domain` flag  
- **Random URLs only**: Each tunnel gets a random URL like `https://abc123.ngrok-free.app`
- **Rate limits**: Stricter limits on tunnel creation frequency
- **Single tunnel**: Can only run one tunnel at a time

### Paid Account Features
- Custom subdomains (`--subdomain myapp`)
- Reserved domains (`--domain myapp.ngrok.io`)
- Multiple concurrent tunnels
- Higher rate limits

## Known Issues & Solutions

### 1. "You must reserve a custom hostname" Error
**Problem**: This error occurs when trying to use `--subdomain` with a free account.

**Solution**: 
- The plugin automatically detects this and falls back to random URLs
- Tests are configured to NOT use subdomains
- Your production domain is NOT used in tests

### 2. Domain Already in Use Error  
**Problem**: When using a fixed domain (e.g., `special-gnu-valid.ngrok-free.app`), ngrok returns an error if the domain is already bound to another tunnel.

**Solution**: 
- Tests use randomly generated URLs from ngrok
- Each test gets a unique URL automatically
- No domain conflicts between tests

### 3. Rate Limiting
**Problem**: Ngrok has rate limits on how quickly you can start/stop tunnels.

**Solution**:
- Tests include automatic delays between operations
- Retry logic with exponential backoff is built into the service
- Tests run sequentially instead of in parallel

### 4. Authentication Errors
**Problem**: Tests fail if `NGROK_AUTH_TOKEN` is not set.

**Solution**:
- Ensure your `.env` file contains: `NGROK_AUTH_TOKEN=your_token_here`
- Do NOT commit your auth token to git

## Running Tests

### Quick Start
```bash
# Run all tests with proper delays
./scripts/test-ngrok.sh
```

### Individual Test Suites
```bash
# Unit tests only (fast, no ngrok required)
bun test src/__tests__/unit --run

# Integration tests (requires ngrok)
bun test src/__tests__/integration --run

# E2E tests (requires ngrok, slower)
bun test src/__tests__/e2e --run
```

### Skip Ngrok Tests
If you're having persistent issues:
```bash
export SKIP_NGROK_TESTS=true
bun test
```

## Test Configuration

The test suite uses these configurations:

### Delays
- 3 seconds between test suites
- 1 second between individual tests
- 2 seconds after stopping a tunnel

### Timeouts
- Unit tests: 30 seconds
- Integration tests: 60 seconds
- E2E tests: 90 seconds

### Environment Variables for Tests
- `NGROK_AUTH_TOKEN` - Your ngrok authentication token (required)
- `SKIP_NGROK_TESTS=true` - Skip all ngrok-related tests
- Tests automatically clear `NGROK_DOMAIN` to avoid conflicts

## Best Practices

1. **Don't use production domains in tests** - Tests use random ngrok URLs
2. **Run tests sequentially** - Avoid parallel execution to prevent rate limiting
3. **Use the test script** - `./scripts/test-ngrok.sh` includes proper delays
4. **Monitor ngrok dashboard** - Check https://dashboard.ngrok.com for active tunnels
5. **Free account users** - Expect random URLs like `https://abc123.ngrok-free.app`

## Troubleshooting

### "Failed to start tunnel - domain might already be in use"
- Check https://dashboard.ngrok.com and stop any active tunnels
- Wait a few minutes and try again
- Ensure you're not trying to use custom domains with a free account

### "You must reserve a custom hostname"
- This means you have a free account
- The plugin will automatically use random URLs
- Upgrade to a paid account if you need custom domains

### "Rate limit exceeded"
- Use the test script which includes delays
- Reduce the number of test cycles
- Consider upgrading your ngrok plan for higher limits

### "NGROK_AUTH_TOKEN not found"
- Create a `.env` file in the plugin root
- Add: `NGROK_AUTH_TOKEN=your_token_here`
- Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken

## CI/CD Considerations

For CI/CD pipelines:
1. Use a dedicated ngrok account for CI (preferably paid)
2. Set `NGROK_AUTH_TOKEN` as a secret
3. Never use custom domains in CI tests
4. Add longer delays between tests
5. Consider running ngrok tests separately from other tests

## Production Usage

For production use with custom domains:
1. Upgrade to a paid ngrok account
2. Reserve your custom domain at https://dashboard.ngrok.com/domains/new
3. Set `NGROK_DOMAIN=your-domain.ngrok-free.app` in your `.env`
4. The plugin will automatically use your custom domain 