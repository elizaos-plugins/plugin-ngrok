import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  ModelType,
  elizaLogger,
} from '@elizaos/core';
import type { ITunnelService } from '../types/tunnel-types';

const startTunnelTemplate = `
Respond with a JSON object containing the port number to start the ngrok tunnel on.
The user said: "{{userMessage}}"

Extract the port number from their message, or use the default port 3000 if not specified.

Response format:
\`\`\`json
{
  "port": 3000
}
\`\`\`
`;

export const startTunnelAction: Action = {
  name: 'START_TUNNEL',
  similes: ['OPEN_TUNNEL', 'CREATE_TUNNEL', 'NGROK_START', 'TUNNEL_UP'],
  description: 'Start an ngrok tunnel to expose a local port to the internet',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const tunnelService = runtime.getService('tunnel') as ITunnelService;
    if (!tunnelService) {
      return false;
    }
    
    // Check if tunnel is already active
    if (tunnelService.isActive()) {
      elizaLogger.warn('Tunnel is already active');
      return false;
    }
    
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback?: HandlerCallback
  ) => {
    elizaLogger.info('Starting ngrok tunnel...');
    
    try {
      // Extract port from message
      const context = {
        userMessage: message.content.text,
      };
      
      const portResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: startTunnelTemplate,
        context,
        temperature: 0.3,
      }) as string;
      
      let port = 3000; // default
      try {
        const parsed = JSON.parse(portResponse);
        if (parsed.port && typeof parsed.port === 'number') {
          port = parsed.port;
        }
      } catch (e) {
        elizaLogger.warn('Failed to parse port from response, using default 3000');
      }
      
      const tunnelService = runtime.getService('tunnel') as ITunnelService;
      const url = await tunnelService.start(port);
      
      const responseText = `✅ Ngrok tunnel started successfully!\n\n🌐 Public URL: ${url}\n🔌 Local Port: ${port}\n\nYour local service is now accessible from the internet.`;
      
      if (callback) {
        await callback({
          text: responseText,
          metadata: {
            tunnelUrl: url,
            port: port,
            action: 'tunnel_started',
          },
        });
      }
      
      return true;
    } catch (error) {
      elizaLogger.error('Failed to start tunnel:', error);
      
      if (callback) {
        await callback({
          text: `❌ Failed to start ngrok tunnel: ${error.message}\n\nPlease make sure ngrok is installed and configured properly.`,
          metadata: {
            error: error.message,
            action: 'tunnel_failed',
          },
        });
      }
      
      return false;
    }
  },
  examples: [
    [
      {
        name: 'user',
        content: {
          text: 'Start an ngrok tunnel on port 8080',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Ngrok tunnel started successfully!\n\n🌐 Public URL: https://abc123.ngrok.io\n🔌 Local Port: 8080\n\nYour local service is now accessible from the internet.',
          action: 'START_TUNNEL',
        },
      },
    ],
    [
      {
        name: 'user',
        content: {
          text: 'Can you create a tunnel for my local server?',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Ngrok tunnel started successfully!\n\n🌐 Public URL: https://xyz789.ngrok.io\n🔌 Local Port: 3000\n\nYour local service is now accessible from the internet.',
          action: 'START_TUNNEL',
        },
      },
    ],
  ],
};

export default startTunnelAction; 