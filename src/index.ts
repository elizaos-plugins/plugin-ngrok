import { type Plugin, type IAgentRuntime, elizaLogger } from '@elizaos/core';
import { NgrokService } from './services/NgrokService';
import { startTunnelAction } from './actions/start-tunnel';
import { stopTunnelAction } from './actions/stop-tunnel';
import { getTunnelStatusAction } from './actions/get-tunnel-status';
import { NgrokTestSuite } from './__tests__/NgrokTestSuite';

export const ngrokPlugin: Plugin = {
  name: 'ngrok',
  description: 'Ngrok tunnel integration plugin for ElizaOS',
  services: [NgrokService],
  actions: [startTunnelAction, stopTunnelAction, getTunnelStatusAction],
  tests: [new NgrokTestSuite()],
};

export default ngrokPlugin;

export * from './services/NgrokService';
