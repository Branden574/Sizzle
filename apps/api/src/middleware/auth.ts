import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { unauthorized } from '../lib/errors';
import type { AppEnv } from '../types';

function extractToken(c: Context): string | null {
  const header = c.req.header('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]! : null;
}

async function resolveUser(c: Context, token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return false;
  c.set('userId', data.user.id);
  c.set('accessToken', token);
  return true;
}

/** Populates userId/accessToken when a valid token is present; never blocks. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);
  if (token) await resolveUser(c, token);
  await next();
});

/** Requires a valid Supabase session; 401s otherwise. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);
  if (!token) throw unauthorized();
  const ok = await resolveUser(c, token);
  if (!ok) throw unauthorized('Invalid or expired session');
  await next();
});
