import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail } from '../lib/errors';
import { rateLimit } from '../middleware/rateLimit';
import { requireAuth, requireNotBanned } from '../middleware/auth';
import type { AppEnv } from '../types';

export const support = new Hono<AppEnv>();

/** Privacy-request types offered on the public contact form. */
const KINDS = ['access', 'delete', 'correct', 'optout', 'general'] as const;

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  kind: z.enum(KINDS).default('general'),
  message: z.string().trim().min(1).max(5000),
  // Honeypot — real users leave this empty; bots tend to fill every field. Accept
  // any value here (don't 400 on it) so the silent-drop below actually runs.
  company: z.string().max(200).optional(),
});

/**
 * Public privacy / support request intake (getsizzle.app/contact). No auth —
 * anyone (user or not) may exercise a privacy right. A dedicated per-IP limit
 * (plus the honeypot) keeps bots from flooding the compliance channel past the
 * admin view's window.
 */
support.post('/requests', rateLimit({ windowMs: 60_000, max: 4, name: 'support' }), async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Please provide your name, a valid email, and a message.');
  const { company, ...row } = parsed.data;
  if (company) return c.json({ ok: true }); // honeypot tripped — pretend success
  const { error } = await supabaseAdmin.from('support_requests').insert(row);
  if (error) throw dbFail(error.message);
  return c.json({ ok: true });
});

/** In-app ticket types (report a problem / request a feature). */
const ticketSchema = z.object({
  type: z.enum(['problem', 'feature']),
  message: z.string().trim().min(1).max(5000),
});

/**
 * Authenticated in-app support ticket. Reuses the same support_requests pipeline
 * (and admin view) as the public form, but the reporter's identity is derived
 * server-side from the session — unspoofable, so a signed-in user can't file a
 * ticket as someone else. Stored on user_id (added in
 * 20260713130000_support_requests_user.sql) so admins can link back to the profile.
 */
support.post(
  '/tickets',
  requireAuth,
  requireNotBanned,
  rateLimit({ windowMs: 60_000, max: 4, name: 'support' }),
  async (c) => {
    const parsed = ticketSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw badRequest('Please describe the problem or feature you have in mind.');
    const { type, message } = parsed.data;
    const userId = c.get('userId')!;

    // Identity comes from the session, never the request body.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, handle')
      .eq('id', userId)
      .maybeSingle();
    const name = profile?.display_name || profile?.handle || 'Sizzle user';

    // Real address for the reply — the userEmail() helper returns null without a
    // Resend key, so read it straight from the auth admin API instead.
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? 'unknown';

    const { error } = await supabaseAdmin
      .from('support_requests')
      .insert({ name, email, kind: type, message, user_id: userId });
    if (error) throw dbFail(error.message);
    return c.json({ ok: true });
  },
);
