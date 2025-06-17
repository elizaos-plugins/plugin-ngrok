import type { IAgentRuntime } from '@elizaos/core';
import { elizaLogger } from '@elizaos/core';
import { z } from 'zod';

export const ngrokEnvSchema = z.object({
  NGROK_AUTH_TOKEN: z.string().optional(),
  NGROK_REGION: z.string().optional().default('us'),
  NGROK_SUBDOMAIN: z.string().optional(),
  NGROK_DOMAIN: z.string().optional(),
  NGROK_DEFAULT_PORT: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return 3000;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      // If port is 0 or invalid, use default
      if (isNaN(num) || num <= 0 || num > 65535) return 3000;
      return num;
    })
    .default(3000),
});

export type NgrokConfig = z.infer<typeof ngrokEnvSchema>;

export async function validateNgrokConfig(runtime: IAgentRuntime): Promise<NgrokConfig> {
  try {
    elizaLogger.debug('Validating Ngrok configuration with runtime settings');
    const config = {
      NGROK_AUTH_TOKEN: runtime.getSetting('NGROK_AUTH_TOKEN') || process.env.NGROK_AUTH_TOKEN,
      NGROK_REGION: runtime.getSetting('NGROK_REGION') || process.env.NGROK_REGION,
      NGROK_SUBDOMAIN: runtime.getSetting('NGROK_SUBDOMAIN') || process.env.NGROK_SUBDOMAIN,
      NGROK_DOMAIN: runtime.getSetting('NGROK_DOMAIN') || process.env.NGROK_DOMAIN,
      NGROK_DEFAULT_PORT:
        runtime.getSetting('NGROK_DEFAULT_PORT') ||
        process.env.NGROK_DEFAULT_PORT ||
        process.env.NGROK_TUNNEL_PORT,
    };

    elizaLogger.debug('Parsing configuration with schema', config);
    const validated = ngrokEnvSchema.parse(config);
    elizaLogger.debug('Configuration validated successfully');
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      elizaLogger.error('Configuration validation failed:', errorMessages);
      throw new Error(`Ngrok configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}
