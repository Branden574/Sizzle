import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail } from '../lib/errors';
import { rateLimit } from '../middleware/rateLimit';
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
