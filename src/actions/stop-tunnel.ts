import type { ITunnelService } from '@elizaos/core';
import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  elizaLogger,
} from '@elizaos/core';

export const stopTunnelAction: Action = {
  name: 'STOP_TUNNEL',
  similes: ['CLOSE_TUNNEL', 'SHUTDOWN_TUNNEL', 'NGROK_STOP', 'TUNNEL_DOWN'],
  description: 'Stop the running ngrok tunnel',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const tunnelService = runtime.getService('tunnel') as ITunnelService;
    return !!tunnelService;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    const tunnelService = runtime.getService('tunnel') as ITunnelService;
    if (!tunnelService) {
      elizaLogger.error('Tunnel service is not available');
      if (callback) {
        await callback({
          text: 'Tunnel service is not available. Please ensure the ngrok plugin is properly configured.',
        });
      }
      return false;
    }

    if (!tunnelService.isActive()) {
      elizaLogger.warn('No active tunnel to stop');
      if (callback) {
        await callback({
          text: 'No tunnel is currently running.',
          metadata: {
            action: 'tunnel_not_active',
          },
        });
      }
      return true;
    }

    elizaLogger.info('Stopping ngrok tunnel...');

    try {
      const status = tunnelService.getStatus();
      const previousUrl = status.url;
      const previousPort = status.port;

      await tunnelService.stopTunnel();

      const responseText = `✅ Ngrok tunnel stopped successfully!\n\n🔌 Was running on port: ${previousPort}\n🌐 Previous URL: ${previousUrl}\n\nThe tunnel has been closed and is no longer accessible.`;

      if (callback) {
        await callback({
          text: responseText,
          metadata: {
            previousUrl,
            previousPort,
            action: 'tunnel_stopped',
          },
        });
      }

      return true;
    } catch (error: any) {
      elizaLogger.error('Failed to stop tunnel:', error);

      if (callback) {
        await callback({
          text: `❌ Failed to stop ngrok tunnel: ${error.message}`,
          metadata: {
            error: error.message,
            action: 'tunnel_stop_failed',
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
          text: 'Stop the ngrok tunnel',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Ngrok tunnel stopped successfully!\n\n🔌 Was running on port: 3000\n🌐 Previous URL: https://abc123.ngrok.io\n\nThe tunnel has been closed and is no longer accessible.',
          action: 'STOP_TUNNEL',
        },
      },
    ],
    [
      {
        name: 'user',
        content: {
          text: 'Please close the tunnel',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Ngrok tunnel stopped successfully!\n\n🔌 Was running on port: 8080\n🌐 Previous URL: https://xyz789.ngrok.io\n\nThe tunnel has been closed and is no longer accessible.',
          action: 'STOP_TUNNEL',
        },
      },
    ],
  ],
};

export default stopTunnelAction;
