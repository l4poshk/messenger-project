// ──────────────────────────────────────────────
// Environment validation via Zod (fails fast)
// ──────────────────────────────────────────────

import { serverEnvSchema } from '@messenger/shared';
import { logger } from './logger';

function validateEnv() {
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    logger.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      logger.error(`  → ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
