import { Hono } from 'hono';
import { env, cloudflareConfigured, stripeConfigured } from '../env';
import { moderationConfigured } from '../services/moderation';
import { emailConfigured } from '../services/email';
import { sentryConfigured } from '../lib/sentry';
import { pushStatus } from '../services/push';
import type { AppEnv } from '../types';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({
    status: 'ok',
    service: 'sizzle-api',
    videoProvider: env.VIDEO_PROVIDER,
    cloudflareConfigured,
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
    // Both fail silently by design: email.ts and sentry.ts no-op without a key,
    // so a moderated user gets no explanation and a 5xx alerts nobody, while the
    // app keeps reporting healthy. Same reasoning as `push` above.
    emailConfigured,
    sentryConfigured,
    time: new Date().toISOString(),
  }),
);
