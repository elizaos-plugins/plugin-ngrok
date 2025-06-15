import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  elizaLogger,
} from '@elizaos/core';
import type { ITunnelService } from '../types/tunnel-types';

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
    state: State,
    options: any,
    callback?: HandlerCallback
  ) => {
    elizaLogger.info('Getting ngrok tunnel status...');
    
    try {
      const tunnelService = runtime.getService('tunnel') as ITunnelService;
      const status = tunnelService.getStatus();
      
      let responseText: string;
      
      if (status.active) {
        const uptime = status.startedAt ? 
          Math.floor((Date.now() - status.startedAt.getTime()) / 1000 / 60) : 0;
        
        responseText = `✅ Ngrok tunnel is active!\n\n🌐 Public URL: ${status.url}\n🔌 Local Port: ${status.port}\n⏱️ Uptime: ${uptime} minutes\n🏢 Provider: ${status.provider}\n\nYour local service is accessible from the internet.`;
      } else {
        responseText = `❌ No active ngrok tunnel.\n\nTo start a tunnel, say "start ngrok tunnel on port [PORT]"`;
      }
      
      if (callback) {
        await callback({
          text: responseText,
          metadata: {
            ...status,
            action: 'tunnel_status',
          },
        });
      }
      
      return true;
    } catch (error) {
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