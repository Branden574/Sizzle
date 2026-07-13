import { Hono } from 'hono';
import { env, cloudflareConfigured } from '../env';
import { moderationConfigured } from '../services/moderation';
import type { AppEnv } from '../types';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({
    status: 'ok',
    service: 'sizzle-api',
    videoProvider: env.VIDEO_PROVIDER,
    cloudflareConfigured,
    // UGC filtering (Guideline 1.2) must never silently degrade: when this is
    // false in production, only the tiny local blocklist is filtering content.
    moderationConfigured,
    time: new Date().toISOString(),
  }),
);
