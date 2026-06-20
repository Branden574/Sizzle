import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

/** Baseline security response headers. */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cross-Origin-Resource-Policy', 'same-site');
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
});
