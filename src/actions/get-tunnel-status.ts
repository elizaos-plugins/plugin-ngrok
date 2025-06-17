import {
  elizaLogger,
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type ITunnelService,
  type Memory,
  type State,
} from '@elizaos/core';

export const getTunnelStatusAction: Action = {
  name: 'GET_TUNNEL_STATUS',
  similes: ['TUNNEL_STATUS', 'CHECK_TUNNEL', 'NGROK_STATUS', 'TUNNEL_INFO'],
  description: 'Get the current status of the ngrok tunnel',
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
    try {
      elizaLogger.info('Getting ngrok tunnel status...');

      const tunnelService = runtime.getService('tunnel') as ITunnelService;
      const status = tunnelService.getStatus();

      let responseText: string;
      const response = {
        ...status,
        uptime: 'N/A',
      };

      if (status.active) {
        if (status.startedAt) {
          const uptimeMs = Date.now() - new Date(status.startedAt).getTime();
          const minutes = Math.floor(uptimeMs / 60000);
          const hours = Math.floor(minutes / 60);

          if (hours > 0) {
            response.uptime = `${hours} hour${hours > 1 ? 's' : ''}, ${minutes % 60} minute${
              minutes % 60 !== 1 ? 's' : ''
            }`;
          } else {
            response.uptime = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
          }
        }

        responseText = `✅ Ngrok tunnel is active!\n\n🌐 Public URL: ${status.url}\n🔌 Local Port: ${status.port}\n⏱️ Uptime: ${response.uptime}\n🏢 Provider: ${status.provider}\n\nYour local service is accessible from the internet.`;
      } else {
        responseText = `❌ No active ngrok tunnel.\n\nTo start a tunnel, say "start ngrok tunnel on port [PORT]"`;
      }

      if (callback) {
        await callback({
          text: responseText,
          metadata: {
            ...response,
            action: 'tunnel_status',
          },
        });
      }

      return true;
    } catch (error: any) {
      elizaLogger.error('Failed to get tunnel status:', error);

      if (callback) {
        await callback({
          text: `❌ Failed to get tunnel status: ${error.message}`,
          metadata: {
            error: error.message,
            action: 'tunnel_status_failed',
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
          text: 'What is the tunnel status?',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Ngrok tunnel is active!\n\n🌐 Public URL: https://abc123.ngrok.io\n🔌 Local Port: 3000\n⏱️ Uptime: 15 minutes\n🏢 Provider: ngrok\n\nYour local service is accessible from the internet.',
          action: 'GET_TUNNEL_STATUS',
        },
      },
    ],
    [
      {
        name: 'user',
        content: {
          text: 'Check ngrok status',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '❌ No active ngrok tunnel.\n\nTo start a tunnel, say "start ngrok tunnel on port [PORT]"',
          action: 'GET_TUNNEL_STATUS',
        },
      },
    ],
  ],
};

export default getTunnelStatusAction;
