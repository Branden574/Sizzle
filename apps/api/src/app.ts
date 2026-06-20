import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './env';
import { onError } from './lib/errors';
import type { AppEnv } from './types';
import { health } from './routes/health';
import { me } from './routes/me';
import { feed } from './routes/feed';
import { recipes } from './routes/recipes';
import { cooks } from './routes/cooks';
import { search } from './routes/search';
import { uploads } from './routes/uploads';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: env.WEB_ORIGIN,
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  app.onError(onError);
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));

  app.route('/health', health);
  app.route('/me', me);
  app.route('/feed', feed);
  app.route('/recipes', recipes);
  app.route('/cooks', cooks);
  app.route('/search', search);
  app.route('/uploads', uploads);

  return app;
}
