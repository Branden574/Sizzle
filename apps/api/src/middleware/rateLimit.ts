import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

interface Bucket {
  count: number;
  reset: number;
}

// In-memory fixed-window counter. Fine for a single instance (Railway/Fly);
// swap for Redis/Upstash if horizontally scaled.
const buckets = new Map<string, Bucket>();

function identity(c: Context): string {
  return c.get('userId') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
}

/** Fixed-window rate limit, keyed by user id (or IP) + an optional bucket name. */
export function rateLimit(opts: { windowMs: number; max: number; name?: string }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = `${opts.name ?? 'global'}:${identity(c)}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset < now) {
      b = { count: 0, reset: now + opts.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > opts.max) {
      c.header('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      throw new AppError(429, 'rate_limited', 'Too many requests — slow down a moment.');
    }
    await next();
  });
}

// Evict expired buckets periodically so the map doesn't grow unbounded.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000);
sweep.unref?.();
