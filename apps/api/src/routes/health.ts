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
 *  Distinguishes "backlog is zero" from "the DB probe itself failed" (null). */
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

/** Count media deletions that exhausted their retry budget (attempts >= 10) —
 *  media we PROMISED to delete (GDPR/account erasure) and still haven't.
 *  The finalize cron already logs + Sentry-reports this every run, but that path
 *  is only visible to whoever watches Sentry; the daily ops sweep reads /health.
 *  Deliberately NOT added to `problems`: a parked row is a reconciliation task,
 *  not downtime, and 503-ing the API (and every uptime monitor with it) over one
 *  undeleted object would be a self-inflicted outage. null = the probe failed. */
async function parkedMediaDeletions(): Promise<number | null> {
  try {
    const { count, error } = await supabaseAdmin
      .from('pending_media_deletions')
      .select('id', { count: 'exact', head: true })
      .gte('attempts', 10);
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

/** Age (seconds) since each cron's last SUCCESSFUL run, from the cron_runs
 *  heartbeat table. A job with no row yet reports null and does NOT degrade
 *  health (bootstrap-safe: the table starts empty on first deploy). */
const CRON_STALE_SECONDS: Record<string, number> = {
  // 1-minute jobs: alert past 10 min of silence.
  'finalize-videos': 600,
  'publish-scheduled': 600,
  // every 15 min / twice hourly: alert past 2h.
  'rollup-hashtag-trends': 7_200,
  'rollup-watch-ratios': 7_200,
  // daily at 21:00: alert past 26h.
  'save-nudges': 93_600,
};
async function cronAges(): Promise<{ ages: Record<string, number | null>; stale: string[] } | null> {
  try {
    const { data, error } = await supabaseAdmin.from('cron_runs').select('job, last_success_at');
    if (error) return null;
    const byJob = new Map((data ?? []).map((r) => [r.job as string, r.last_success_at as string | null]));
    const ages: Record<string, number | null> = {};
    const stale: string[] = [];
    for (const [job, limit] of Object.entries(CRON_STALE_SECONDS)) {
      const last = byJob.get(job);
      const age = last ? Math.round((Date.now() - new Date(last).getTime()) / 1000) : null;
      ages[job] = age;
      if (age !== null && age > limit) stale.push(job);
    }
    return { ages, stale };
  } catch {
    return null;
  }
}

health.get('/', async (c) => {
  const [backlog, crons, parked] = await Promise.all([stuckVideoBacklog(), cronAges(), parkedMediaDeletions()]);

  // Honest liveness: 'ok' only when the DB answers and nothing tracked is stale.
  // 'degraded' → HTTP 503 so a dumb uptime monitor alerts on status code alone.
  // (Config booleans below stay informational — missing config isn't downtime.)
  const problems: string[] = [];
  if (backlog === null && crons === null) problems.push('database-unreachable');
  if (backlog !== null && backlog > 25) problems.push('finalize-backlog');
  if (crons && crons.stale.length) problems.push(...crons.stale.map((j) => `cron-stale:${j}`));
  const status = problems.length ? 'degraded' : 'ok';

  return c.json(
    {
      status,
      problems,
      service: 'sizzle-api',
      // Which commit is actually serving — the deploy-verification anchor
      // (Vercel injects it at build; null = local dev).
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      videoProvider: env.VIDEO_PROVIDER,
      cloudflareConfigured,
      // Videos stuck in a non-ready state past the point they should have finalized.
      // Growing = the finalize cron/webhook is failing; uptime alerting keys on it.
      stuckVideoBacklog: backlog,
      // Media deletions parked past their retry budget — non-zero means media we
      // promised to erase is still live and needs manual reconciliation.
      parkedMediaDeletions: parked,
      // Seconds since each cron's last successful run (null = no heartbeat yet).
      cronAges: crons?.ages ?? null,
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
    },
    status === 'ok' ? 200 : 503,
  );
});
