import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { AppError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import type { AppEnv } from '../types';

function identity(c: Context): string {
  return c.get('userId') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
}

/**
 * Durable fixed-window rate limit, keyed by user id (or IP) + an optional bucket
 * name. Backed by a Postgres counter (rate_limit_hit) so it survives serverless
 * cold starts — an in-memory Map reset on every Vercel invocation and barely
 * limited anything. Fails OPEN if the store is unreachable, so a DB hiccup can't
 * take an endpoint offline.
 */
export function rateLimit(opts: { windowMs: number; max: number; name?: string }) {
  const windowSeconds = Math.max(1, Math.round(opts.windowMs / 1000));
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = `${opts.name ?? 'global'}:${identity(c)}`;
    let allowed = true;
    try {
      const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', {
        p_key: key,
        p_window_seconds: windowSeconds,
        p_max: opts.max,
      });
      if (!error) allowed = data !== false;
    } catch (e) {
      // Store unreachable → fail open (allow) rather than 500 the endpoint.
      console.error('rateLimit store error:', e instanceof Error ? e.message : e);
    }
    if (!allowed) {
      c.header('Retry-After', String(windowSeconds));
      throw new AppError(429, 'rate_limited', 'Too many requests — slow down a moment.');
    }
    await next();
  });
}
