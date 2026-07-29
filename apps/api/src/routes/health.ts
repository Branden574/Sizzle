import { Hono } from 'hono';
import { env, cloudflareConfigured, stripeConfigured } from '../env';
import { moderationConfigured } from '../services/moderation';
import { emailConfigured } from '../services/email';
import { sentryConfigured } from '../lib/sentry';
import { pushStatus } from '../services/push';
import { supabaseAdmin } from '../lib/supabase';
import type { AppEnv } from '../types';

export const health = new Hono<AppEnv>();

/** Count Cloudflare assets that should have finalized by now but haven't — a
 *  non-zero, growing value means the finalize pipeline (cron/webhook) is stalled.
 *  Best-effort: never fail the health check on a DB hiccup. */
async function stuckVideoBacklog(): Promise<number | null> {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count, error } = await supabaseAdmin
      .from('video_assets')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'cloudflare')
      .in('status', ['pending', 'uploading', 'processing'])
      .lt('created_at', fifteenMinAgo);
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

health.get('/', async (c) =>
  c.json({
    status: 'ok',
    service: 'sizzle-api',
    videoProvider: env.VIDEO_PROVIDER,
    cloudflareConfigured,
    // Videos stuck in a non-ready state past the point they should have finalized.
    // Growing = the finalize cron/webhook is failing; point uptime alerting here.
    stuckVideoBacklog: await stuckVideoBacklog(),
    // UGC filtering (Guideline 1.2) must never silently degrade: when this is
    // false in production, only the tiny local blocklist is filtering content.
    moderationConfigured,
    // Same reasoning. `invalid_service_account` means FCM_SERVICE_ACCOUNT is set
    // but unparseable, so every push is a silent no-op while in-app notification
    // rows keep appearing — the app looks fine and nobody notices. Checkable here
    // instead of only in the runtime logs.
    push: pushStatus(),
    // 'mock' means no real money moves, however live the rest of the app looks.
    payments: stripeConfigured ? 'stripe' : 'mock',
    // Which Stripe keys are loaded. `payments` says 'stripe' for test and live
    // alike, so without this there is no way to tell from outside whether a real
    // card would be charged — and card 4242 unlocking paid content looks exactly
    // like a working checkout.
    paymentsKeyMode: !env.STRIPE_SECRET_KEY ? 'none' : env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test',
    // NOTE: the ALLOW_SANDBOX_IAP state is deliberately NOT reported here. /health is
    // unauthenticated, and `true` would advertise to any scanner that a sandbox Apple ID
    // can unlock premium content for $0. It's exposed on GET /admin/security-status
    // (admin-gated) and rendered in the dashboard's Security tab instead, where it stays
    // auditable without being a beacon. paymentsKeyMode stays here: 'test' means no real
    // money moves, which is an uptime signal, not an exploitable one.
    // Both fail silently by design: email.ts and sentry.ts no-op without a key,
    // so a moderated user gets no explanation and a 5xx alerts nobody, while the
    // app keeps reporting healthy. Same reasoning as `push` above.
    emailConfigured,
    sentryConfigured,
    time: new Date().toISOString(),
  }),
);
