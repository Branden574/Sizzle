import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './env';
import { onError } from './lib/errors';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/security';
import type { AppEnv } from './types';
import { health } from './routes/health';
import { me } from './routes/me';
import { feed } from './routes/feed';
import { recipes } from './routes/recipes';
import { cooks } from './routes/cooks';
import { search } from './routes/search';
import { uploads } from './routes/uploads';
import { admin } from './routes/admin';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', logger());
  app.use('*', securityHeaders);
  // Allow the configured web origin plus the origins native (Capacitor) shells and
  // local/LAN dev hosts use, so the iOS/Android apps and emulators can call the API.
  const nativeOrigins = new Set(['capacitor://localhost', 'http://localhost', 'https://localhost', 'ionic://localhost']);
  const lanOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.[\d.]+)(?::\d+)?$/;
  // Any Vercel deployment (production alias + preview URLs) of the web app, so the
  // hosted site works without re-pinning WEB_ORIGIN on every rename/preview.
  const vercelOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  // The production custom domain (apex + www) — the site users actually visit.
  const siteOrigin = /^https:\/\/(www\.)?getsizzle\.app$/;
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return env.WEB_ORIGIN;
        if (origin === env.WEB_ORIGIN || nativeOrigins.has(origin) || lanOrigin.test(origin) || vercelOrigin.test(origin) || siteOrigin.test(origin)) return origin;
        return env.WEB_ORIGIN;
      },
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );
  // Reject oversized bodies and throttle abusive clients.
  app.use('*', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: { code: 'too_large', message: 'Request body too large' } }, 413) }));
  app.use('*', rateLimit({ windowMs: 60_000, max: 300 }));

  app.onError(onError);
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));

  app.route('/health', health);
  app.route('/me', me);
  app.route('/feed', feed);
  app.route('/recipes', recipes);
  app.route('/cooks', cooks);
  app.route('/search', search);
  app.route('/uploads', uploads);
  app.route('/admin', admin);

  return app;
}
