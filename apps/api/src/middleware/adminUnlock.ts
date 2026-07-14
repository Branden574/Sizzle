/**
 * requireAdminUnlock — the passphrase gate. Runs AFTER requireAdmin on every
 * admin route except the three bootstrap/unlock endpoints. It performs only a
 * cheap indexed lookup of the unlock token's SHA-256 (scrypt already ran once at
 * /admin/unlock), and FAILS CLOSED: if the admin hasn't set a passphrase yet,
 * all gated routes are blocked until they bootstrap one via /admin/passphrase.
 */
import type { MiddlewareHandler } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { sha256 } from '../services/adminAuth';
import { forbidden, unauthorized } from '../lib/errors';
import type { AppEnv } from '../types';

// Reachable with a valid admin session but no unlock token (still admin-gated by
// the requireAdmin ahead of this): set the passphrase, unlock, or read whether
// one is set. `security-status` returns only a boolean, never any secret.
const EXEMPT = new Set(['/admin/unlock', '/admin/passphrase', '/admin/security-status']);

export const requireAdminUnlock: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (EXEMPT.has(c.req.path)) return next();
  const userId = c.get('userId')!;

  // Fail closed: no credential row => no passphrase set yet => block everything
  // gated until one exists (a stolen session can't act before setup).
  const { data: cred } = await supabaseAdmin.from('admin_credentials').select('user_id').eq('user_id', userId).maybeSingle();
  if (!cred) throw forbidden('Set your admin passphrase to continue');

  const token = c.req.header('x-admin-unlock');
  if (!token) throw unauthorized('Admin unlock required');
  const { data: sess } = await supabaseAdmin
    .from('admin_sessions')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('token_sha256', sha256(token))
    .maybeSingle();
  if (!sess || new Date(sess.expires_at as string).getTime() <= Date.now()) throw unauthorized('Admin session expired — unlock again');
  return next();
};
