import { type Plugin, logger } from '@elizaos/core';
import { NgrokService } from './services/NgrokService';
import { NgrokTestSuite } from './__tests__/NgrokTestSuite';
import startTunnel from './actions/start-tunnel';
import stopTunnel from './actions/stop-tunnel';
import getTunnelStatus from './actions/get-tunnel-status';

// Export NgrokService for direct usage
export { NgrokService } from './services/NgrokService';
export type { ITunnelService, TunnelStatus, TunnelConfig } from './types/tunnel-types';

const ngrokPlugin: Plugin = {
  name: 'ngrok',
  description: 'Ngrok tunnel integration plugin for ElizaOS',
  services: [NgrokService],
  actions: [startTunnel, stopTunnel, getTunnelStatus],
  providers: [],
  tests: [new NgrokTestSuite()],
  init: async (config, runtime) => {
    logger.info('Initializing Ngrok plugin');
    const authToken = runtime.getSetting('NGROK_AUTH_TOKEN');

    if (!authToken) {
      logger.warn(
        'Ngrok Auth Token not provided - Ngrok plugin is loaded but may have limited functionality'
      );
      logger.warn(
        'To enable full Ngrok functionality, please provide NGROK_AUTH_TOKEN in your .env file'
      );
      logger.warn(
        'Get your auth token from: https://dashboard.ngrok.com/get-started/your-authtoken'
      );
    }
  },
};

export default ngrokPlugin;
