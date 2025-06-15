# ElizaOS Ngrok Plugin

This package provides ngrok tunnel integration for the ElizaOS AI agent framework, enabling secure exposure of local services to the internet.

## Features

- **Start/Stop Tunnels**: Easily create and manage ngrok tunnels through natural language commands
- **Status Monitoring**: Check the current status of your tunnel including URL, port, and uptime
- **Secure Tunneling**: Expose local development servers securely to the internet
- **Multiple Regions**: Support for different ngrok regions (us, eu, ap, au, sa, jp, in)
- **Custom Subdomains**: Use custom subdomains with paid ngrok plans

## Prerequisites

- [ngrok](https://ngrok.com/download) installed on your system
- (Optional) An ngrok account and auth token for additional features

### Installing ngrok

#### macOS
```bash
brew install ngrok
```

#### Linux
```bash
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list && sudo apt update && sudo apt install ngrok
```

#### Windows
Download from [https://ngrok.com/download](https://ngrok.com/download)

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Optional - for authenticated features
NGROK_AUTH_TOKEN=your_auth_token_here

# Optional - defaults shown
NGROK_REGION=us
NGROK_TUNNEL_PORT=3000

# Optional - requires paid plan
NGROK_SUBDOMAIN=your-custom-subdomain
```

### Getting an Auth Token

1. Sign up for a free account at [ngrok.com](https://ngrok.com)
2. Go to [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Copy your auth token and add it to your `.env` file

## Usage

### Starting a Tunnel

```
User: Start an ngrok tunnel on port 8080
Assistant: ✅ Ngrok tunnel started successfully!

🌐 Public URL: https://abc123.ngrok.io
🔌 Local Port: 8080

Your local service is now accessible from the internet.
```

### Checking Status

```
User: What's the tunnel status?
Assistant: ✅ Ngrok tunnel is active!

🌐 Public URL: https://abc123.ngrok.io
🔌 Local Port: 8080
⏱️ Uptime: 15 minutes
🏢 Provider: ngrok

Your local service is accessible from the internet.
```

### Stopping a Tunnel

```
User: Stop the tunnel
Assistant: ✅ Ngrok tunnel stopped successfully!

🔌 Was running on port: 8080
🌐 Previous URL: https://abc123.ngrok.io

The tunnel has been closed and is no longer accessible.
```

## Actions

The plugin provides three main actions:

1. **START_TUNNEL** - Start an ngrok tunnel on a specified port
   - Aliases: `OPEN_TUNNEL`, `CREATE_TUNNEL`, `NGROK_START`, `TUNNEL_UP`

2. **STOP_TUNNEL** - Stop the currently running tunnel
   - Aliases: `CLOSE_TUNNEL`, `SHUTDOWN_TUNNEL`, `NGROK_STOP`, `TUNNEL_DOWN`

3. **GET_TUNNEL_STATUS** - Get the current tunnel status
   - Aliases: `TUNNEL_STATUS`, `CHECK_TUNNEL`, `NGROK_STATUS`, `TUNNEL_INFO`

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Development Mode

```bash
npm run dev
```

## Integration

To use this plugin in your ElizaOS agent:

```typescript
import ngrokPlugin from '@elizaos-plugins/plugin-ngrok';

// In your agent configuration
const agent = {
  plugins: [ngrokPlugin],
  // ... other configuration
};
```

## Security Considerations

- Never expose sensitive services through ngrok tunnels
- Be aware that ngrok URLs are publicly accessible
- Use authentication on your local services when exposing them
- Monitor tunnel access through the ngrok dashboard

## License

MIT
