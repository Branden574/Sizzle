import { Hono } from 'hono';
import { env, cloudflareConfigured } from '../env';
import type { AppEnv } from '../types';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({
    status: 'ok',
    service: 'sizzle-api',
    videoProvider: env.VIDEO_PROVIDER,
    cloudflareConfigured,
    time: new Date().toISOString(),
  }),
);
