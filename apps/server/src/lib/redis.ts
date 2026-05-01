// ──────────────────────────────────────────────
// Redis client (ioredis)
// Used for: sessions, online status, typing, pub-sub
// ──────────────────────────────────────────────

import Redis from 'ioredis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    logger.warn(`Redis reconnecting... attempt #${times}, delay ${delay}ms`);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('error', (err) => {
  logger.error('❌ Redis connection error:', err.message);
});
