import { Hono } from 'hono';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PLATFORM_FEE_PCT, platformFeeCents, type EarningKind, type EarningsSummary, type TipConfig, type TipDTO } from '@sizzle/shared';
import { requireAuth, requireNotBanned } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { env, stripeConfigured } from '../env';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { cookSummary, loadBlockedIds, type ProfileRow } from '../mappers';
import { notify } from '../services/notify';
import { accountActive, cancelSubscriptionAtPeriodEnd, createConnectAccount, createOnboardingLink, createOneOffCheckout, createSubscriptionCheckout, paymentsProvider } from '../services/payments';
import type { AppEnv } from '../types';

export const monetize = new Hono<AppEnv>();

/** Tip guardrails (cents). */
const MIN_TIP = 100; // $1
const MAX_TIP = 50_000; // $500
const PRESETS = [100, 300, 500, 1000];

type StripeMeta = { tip_id?: string; creator_id?: string; subscriber_id?: string };
interface StripeObj {
  id?: string;
  mode?: string;
  payment_status?: string;
  payment_intent?: string;
  invoice?: string;
  status?: string;
  amount_paid?: number;
  subscription?: string;
  current_period_end?: number;
  period_end?: number;
  metadata?: StripeMeta;
  subscription_details?: { metadata?: StripeMeta };
  items?: { data?: Array<{ price?: { unit_amount?: number } }> };
}
function mapSubStatus(s?: string): 'active' | 'canceled' | 'past_due' {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'past_due';
  return 'canceled';
}
/** Guard webhook-supplied ids before they reach FK columns (poison-event defence). */
const isUuid = (s?: string): s is string => !!s && /^[0-9a-f-]{36}$/i.test(s);

interface TipRow {
  id: string;
  kind?: string;
  tipper_id: string | null;
  creator_id: string;
  recipe_id: string | null;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  status: 'pending' | 'succeeded' | 'refunded';
  created_at: string;
}

/** GET /monetize/config — how tipping works right now (provider + fee + limits). */
monetize.get('/config', (c) => {
  return c.json<TipConfig>({
    provider: paymentsProvider,
    feePct: PLATFORM_FEE_PCT,
    minCents: MIN_TIP,
    maxCents: MAX_TIP,
    presetsCents: PRESETS,
  });
});

const tipSchema = z.object({
  creatorId: z.string().uuid(),
  recipeId: z.string().uuid().optional(),
  amountCents: z.number().int().min(MIN_TIP).max(MAX_TIP),
});

/**
 * POST /monetize/tip — start a tip. Stripe: returns a hosted-checkout URL (the
 * ledger row stays pending until the webhook confirms). Mock: succeeds
 * instantly so the flow is testable without keys.
 */
monetize.post('/tip', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 10, name: 'tip' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = tipSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid tip');
  const { creatorId, recipeId, amountCents } = parsed.data;
  if (creatorId === userId) throw badRequest('You cannot tip yourself');

  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(creatorId)) throw notFound('User not found');
  const { data: creator } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, banned, monetization_status, stripe_account_id')
    .eq('id', creatorId)
    .maybeSingle();
  if (!creator || creator.banned) throw notFound('User not found');
  if (creator.monetization_status !== 'active') throw badRequest("This creator hasn't set up payouts yet");

  // The settle path is keyed STRICTLY on the running mode, never on the creator's
  // per-row state — so real keys can never fall through to the instant-settle
  // path and record a paid tip with no money moving.
  const liveMode = stripeConfigured;
  if (liveMode && !creator.stripe_account_id) throw badRequest("This creator hasn't finished setting up payouts");

  // Only attribute a tip to a recipe that's actually this creator's.
  let tipRecipeId: string | null = null;
  if (recipeId) {
    const { data: rec } = await supabaseAdmin.from('recipes').select('id').eq('id', recipeId).eq('cook_id', creatorId).maybeSingle();
    tipRecipeId = rec ? recipeId : null;
  }

  // The ledger row records the exact split: gross = platform fee + creator net.
  const feeCents = platformFeeCents(amountCents);
  const netCents = amountCents - feeCents;
  const { data: tip, error } = await supabaseAdmin
    .from('tips')
    .insert({
      tipper_id: userId,
      creator_id: creatorId,
      recipe_id: tipRecipeId,
      amount_cents: amountCents,
      fee_cents: feeCents,
      net_cents: netCents,
      provider: liveMode ? 'stripe' : 'mock',
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !tip) throw dbFail(error?.message ?? 'Could not create tip');

  if (liveMode) {
    try {
      const { sessionId, url } = await createOneOffCheckout({
        ledgerId: tip.id as string,
        amountCents,
        feeCents,
        creatorAccountId: creator.stripe_account_id as string,
        productName: `Support ${(creator.display_name as string) || 'a Sizzle creator'}`,
      });
      await supabaseAdmin.from('tips').update({ provider_ref: sessionId }).eq('id', tip.id);
      return c.json({ url, status: 'pending' as const });
    } catch (err) {
      // Couldn't start checkout — drop the pending row so the ledger stays clean.
      await supabaseAdmin.from('tips').delete().eq('id', tip.id);
      console.error('[monetize] checkout failed:', (err as Error).message);
      throw badRequest('Could not start the payment — please try again');
    }
  }

  // Mock provider (no Stripe keys): settle instantly. The client shows a clear
  // "test mode — no real money moves" banner because /config reports provider=mock.
  await supabaseAdmin
    .from('tips')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), provider_ref: `mock_${tip.id}` })
    .eq('id', tip.id);
  await notify({ userId: creatorId, type: 'tip', actorId: userId, recipeId: tipRecipeId }).catch(() => {});
  return c.json({ url: null, status: 'succeeded' as const });
});

/* ─────────────────────────── paid premium recipes ─────────────────────────── */

const unlockSchema = z.object({ recipeId: z.string().uuid() });

/** POST /monetize/unlock — buy access to a premium recipe (one-off). */
monetize.post('/unlock', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 20, name: 'unlock' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = unlockSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid');
  const { recipeId } = parsed.data;

  const { data: rec } = await supabaseAdmin.from('recipes').select('id, cook_id, title, price_cents, status').eq('id', recipeId).maybeSingle();
  if (!rec || rec.status !== 'published') throw notFound('Recipe not found');
  if (!rec.price_cents) throw badRequest('This recipe is free');
  if (rec.cook_id === userId) throw badRequest('You already own this recipe');
  const { data: already } = await supabaseAdmin.from('recipe_unlocks').select('recipe_id').eq('user_id', userId).eq('recipe_id', recipeId).maybeSingle();
  if (already) return c.json({ url: null, status: 'succeeded' as const });

  // One in-flight checkout per (buyer, recipe): otherwise a user could open two
  // sessions and complete both, paying twice for the same recipe (the grant is
  // idempotent but the charge isn't). A partial unique index backstops the race;
  // abandoned checkouts expire in 30 min and free this up automatically.
  const { data: pendingUnlock } = await supabaseAdmin
    .from('tips').select('id')
    .eq('tipper_id', userId).eq('recipe_id', recipeId).eq('kind', 'unlock').eq('status', 'pending')
    .maybeSingle();
  if (pendingUnlock) throw badRequest('You already have an unlock in progress for this recipe — finish that checkout, or try again in a few minutes.');

  const { data: creator } = await supabaseAdmin.from('profiles').select('display_name, banned, monetization_status, stripe_account_id').eq('id', rec.cook_id).maybeSingle();
  if (!creator || creator.banned || creator.monetization_status !== 'active') throw badRequest('This recipe is not available');
  const liveMode = stripeConfigured;
  if (liveMode && !creator.stripe_account_id) throw badRequest('This creator has not finished payout setup');

  const amountCents = rec.price_cents as number;
  const feeCents = platformFeeCents(amountCents);
  const { data: ledger, error } = await supabaseAdmin
    .from('tips')
    .insert({ tipper_id: userId, creator_id: rec.cook_id, recipe_id: recipeId, amount_cents: amountCents, fee_cents: feeCents, net_cents: amountCents - feeCents, provider: liveMode ? 'stripe' : 'mock', status: 'pending', kind: 'unlock' })
    .select('id')
    .single();
  if (error || !ledger) throw dbFail(error?.message ?? 'Could not start unlock');

  if (liveMode) {
    try {
      const { sessionId, url } = await createOneOffCheckout({ ledgerId: ledger.id as string, amountCents, feeCents, creatorAccountId: creator.stripe_account_id as string, productName: `Unlock: ${rec.title as string}` });
      await supabaseAdmin.from('tips').update({ provider_ref: sessionId }).eq('id', ledger.id);
      return c.json({ url, status: 'pending' as const });
    } catch (err) {
      await supabaseAdmin.from('tips').delete().eq('id', ledger.id);
      console.error('[monetize] unlock checkout failed:', (err as Error).message);
      throw badRequest('Could not start the payment — please try again');
    }
  }
  // Mock: settle + grant access instantly.
  await supabaseAdmin.from('tips').update({ status: 'succeeded', succeeded_at: new Date().toISOString(), provider_ref: `mock_${ledger.id}` }).eq('id', ledger.id);
  await supabaseAdmin.from('recipe_unlocks').upsert({ user_id: userId, recipe_id: recipeId }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true });
  await notify({ userId: rec.cook_id as string, type: 'tip', actorId: userId, recipeId }).catch(() => {});
  return c.json({ url: null, status: 'succeeded' as const });
});

/* ─────────────────────────── subscriptions ─────────────────────────── */

const subPriceSchema = z.object({ priceCents: z.number().int().min(100).max(50_000).nullable() });

/** POST /monetize/sub-price — the creator sets (or clears) their monthly price. */
monetize.post('/sub-price', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const parsed = subPriceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid price');
  const { data: me } = await supabaseAdmin.from('profiles').select('monetization_status').eq('id', userId).maybeSingle();
  if (parsed.data.priceCents != null && me?.monetization_status !== 'active') throw badRequest('Set up payouts first');
  await supabaseAdmin.from('profiles').update({ sub_price_cents: parsed.data.priceCents }).eq('id', userId);
  return c.json({ ok: true });
});

const subscribeSchema = z.object({ creatorId: z.string().uuid() });

/** POST /monetize/subscribe — start a monthly subscription to a creator. */
monetize.post('/subscribe', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 6, name: 'subscribe' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid');
  const { creatorId } = parsed.data;
  if (creatorId === userId) throw badRequest('You cannot subscribe to yourself');
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(creatorId)) throw notFound('User not found');
  const { data: creator } = await supabaseAdmin
    .from('profiles')
    .select('display_name, banned, monetization_status, stripe_account_id, sub_price_cents')
    .eq('id', creatorId)
    .maybeSingle();
  if (!creator || creator.banned || creator.monetization_status !== 'active' || !creator.sub_price_cents) throw badRequest('This creator does not offer subscriptions');
  const { data: existing } = await supabaseAdmin.from('subscriptions').select('id, status').eq('subscriber_id', userId).eq('creator_id', creatorId).maybeSingle();
  if (existing && existing.status === 'active') return c.json({ url: null, status: 'active' as const });

  const priceCents = creator.sub_price_cents as number;
  if (!stripeConfigured) {
    // Mock: activate + record the first month instantly (no provider_ref → no unique clash on re-sub).
    const feeCents = platformFeeCents(priceCents);
    await supabaseAdmin.from('subscriptions').upsert(
      { subscriber_id: userId, creator_id: creatorId, price_cents: priceCents, status: 'active', current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      { onConflict: 'subscriber_id,creator_id' },
    );
    await supabaseAdmin.from('tips').insert({ tipper_id: userId, creator_id: creatorId, amount_cents: priceCents, fee_cents: feeCents, net_cents: priceCents - feeCents, provider: 'mock', status: 'succeeded', succeeded_at: new Date().toISOString(), kind: 'subscription' });
    await notify({ userId: creatorId, type: 'tip', actorId: userId }).catch(() => {});
    return c.json({ url: null, status: 'active' as const });
  }
  if (!creator.stripe_account_id) throw badRequest('This creator has not finished payout setup');
  const { url } = await createSubscriptionCheckout({
    creatorAccountId: creator.stripe_account_id as string,
    priceCents,
    feePct: PLATFORM_FEE_PCT,
    creatorName: (creator.display_name as string) || 'a Sizzle creator',
    creatorId,
    subscriberId: userId,
  });
  return c.json({ url, status: 'pending' as const });
});

/** POST /monetize/subscribe/cancel — cancel at period end (keeps access until then). */
monetize.post('/subscribe/cancel', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid');
  const { data: sub } = await supabaseAdmin.from('subscriptions').select('id, stripe_subscription_id').eq('subscriber_id', userId).eq('creator_id', parsed.data.creatorId).maybeSingle();
  if (!sub) throw notFound('Not subscribed');
  if (stripeConfigured && sub.stripe_subscription_id) {
    try { await cancelSubscriptionAtPeriodEnd(sub.stripe_subscription_id as string); } catch (err) { console.error('[monetize] cancel failed:', (err as Error).message); }
  } else {
    await supabaseAdmin.from('subscriptions').update({ status: 'canceled' }).eq('id', sub.id);
  }
  return c.json({ ok: true });
});

/** Mark a one-off ledger row succeeded (idempotent — only a pending row settles),
 *  grant recipe access if it's an unlock, and notify the creator. */
async function settleTip(tipId: string, paymentIntent: string | null): Promise<void> {
  const { data: settled, error } = await supabaseAdmin
    .from('tips')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), provider_ref: paymentIntent ?? undefined })
    .eq('id', tipId)
    .eq('status', 'pending')
    .select('creator_id, tipper_id, recipe_id, kind')
    .maybeSingle();
  if (error) throw error; // surfaced as 500 so Stripe retries
  if (!settled) return;
  if (settled.kind === 'unlock' && settled.recipe_id && settled.tipper_id) {
    await supabaseAdmin.from('recipe_unlocks').upsert({ user_id: settled.tipper_id, recipe_id: settled.recipe_id }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true });
  }
  await notify({
    userId: settled.creator_id as string,
    type: 'tip',
    actorId: (settled.tipper_id as string | null) ?? (settled.creator_id as string),
    recipeId: (settled.recipe_id as string | null) ?? null,
  }).catch(() => {});
}

/**
 * POST /monetize/webhook/stripe — settle / void / refund tips from Stripe events.
 * Signature + timestamp verified (replay window ±5 min). Returns 5xx on a DB
 * failure so Stripe re-delivers (settlement is idempotent).
 */
monetize.post('/webhook/stripe', async (c) => {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured || !secret) {
    return c.json({ error: { code: 'forbidden', message: 'Webhook not enabled' } }, 403);
  }

  // Stripe signs with header "Stripe-Signature: t=<ts>,v1=<hmac>[,v1=…]".
  const raw = await c.req.text();
  const header = c.req.header('stripe-signature') ?? '';
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find((p) => p[0] === 't')?.[1] ?? '';
  const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]).filter((v): v is string => !!v);
  // Reject stale/forged timestamps (replay protection).
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return c.json({ error: { code: 'unauthorized', message: 'Stale or missing timestamp' } }, 401);
  }
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const valid = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!valid) return c.json({ error: { code: 'unauthorized', message: 'Bad signature' } }, 401);

  const event = JSON.parse(raw) as { type?: string; data?: { object?: StripeObj } };
  const obj = event.data?.object ?? {};
  const tipId = obj.metadata?.tip_id;
  const validTipId = tipId && /^[0-9a-f-]{36}$/i.test(tipId) ? tipId : null;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        // Subscription checkouts are settled by invoice.paid + subscription events;
        // one-off (support/unlock) sessions settle here when genuinely PAID.
        if (obj.mode !== 'subscription' && validTipId && obj.payment_status === 'paid') {
          await settleTip(validTipId, obj.payment_intent ?? null);
        }
        break;
      case 'checkout.session.async_payment_succeeded':
        if (obj.mode !== 'subscription' && validTipId) await settleTip(validTipId, obj.payment_intent ?? null);
        break;
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        if (validTipId) await supabaseAdmin.from('tips').delete().eq('id', validTipId).eq('status', 'pending');
        break;
      case 'charge.refunded':
      case 'charge.dispute.created': {
        // Reverse the earning this charge paid for. One-off tips/unlocks are keyed
        // by payment_intent; subscription renewals by the invoice's payment_intent —
        // and charge.refunded also carries the invoice id, so match either ref.
        const refs = [obj.payment_intent, obj.invoice].filter((x): x is string => !!x);
        if (refs.length) {
          const { data: reversed } = await supabaseAdmin
            .from('tips')
            .update({ status: 'refunded' })
            .in('provider_ref', refs)
            .eq('status', 'succeeded')
            .select('tipper_id, recipe_id, kind');
          // Withdraw premium access alongside the ledger reversal: a refunded or
          // charged-back unlock must no longer grant the recipe.
          for (const row of reversed ?? []) {
            if (row.kind === 'unlock' && row.tipper_id && row.recipe_id) {
              await supabaseAdmin.from('recipe_unlocks').delete().eq('user_id', row.tipper_id).eq('recipe_id', row.recipe_id);
            }
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // The subscription object is the source of truth for the row (metadata,
        // status, period end). Upsert on the stripe id.
        const subId = obj.id;
        const meta = obj.metadata;
        if (subId && isUuid(meta?.creator_id) && isUuid(meta?.subscriber_id)) {
          const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapSubStatus(obj.status);
          const price = obj.items?.data?.[0]?.price?.unit_amount ?? 0;
          await supabaseAdmin.from('subscriptions').upsert(
            {
              subscriber_id: meta!.subscriber_id,
              creator_id: meta!.creator_id,
              stripe_subscription_id: subId,
              price_cents: price,
              status,
              current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
            },
            { onConflict: 'subscriber_id,creator_id' },
          );
        }
        break;
      }
      case 'invoice.paid': {
        // Each paid invoice = one subscription-renewal earning. provider_ref =
        // invoice id makes it idempotent (Stripe retries), and lets us record the
        // row even if it arrives before customer.subscription.created.
        const invoiceId = obj.id;
        const amount = obj.amount_paid ?? 0;
        const meta = obj.subscription_details?.metadata;
        // Key the earning by the invoice's payment_intent so a later refund or
        // dispute (which reference the payment_intent, not the invoice id) can
        // reverse it. Fall back to the invoice id when there's no PI (e.g. a
        // balance-funded renewal); either way it's unique per invoice, so a
        // retried invoice.paid still dedupes on the unique provider_ref index.
        const ref = obj.payment_intent ?? invoiceId;
        if (ref && amount > 0 && isUuid(meta?.creator_id) && isUuid(meta?.subscriber_id)) {
          const feeCents = platformFeeCents(amount);
          const { error: insErr } = await supabaseAdmin.from('tips').insert({
            tipper_id: meta!.subscriber_id,
            creator_id: meta!.creator_id,
            amount_cents: amount,
            fee_cents: feeCents,
            net_cents: amount - feeCents,
            provider: 'stripe',
            status: 'succeeded',
            succeeded_at: new Date().toISOString(),
            kind: 'subscription',
            provider_ref: ref,
          });
          // Duplicate (unique provider_ref) → already recorded; not an error.
          if (insErr && !/duplicate key|unique/i.test(insErr.message)) throw insErr;
          if (!insErr) await notify({ userId: meta!.creator_id, type: 'tip', actorId: meta!.subscriber_id }).catch(() => {});
          if (obj.subscription) {
            await supabaseAdmin.from('subscriptions').update({ status: 'active', ...(obj.period_end ? { current_period_end: new Date(obj.period_end * 1000).toISOString() } : {}) }).eq('stripe_subscription_id', obj.subscription);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[monetize] webhook error:', (err as Error).message);
    return c.json({ error: { code: 'db_error', message: 'retry' } }, 500);
  }
  return c.json({ received: true });
});

/**
 * POST /monetize/onboard — set up payouts. Stripe: create the Express account
 * (once) and return an onboarding link. Mock: activates instantly.
 */
monetize.post('/onboard', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 6, name: 'onboard' }), async (c) => {
  const userId = c.get('userId')!;
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('monetization_status, stripe_account_id')
    .eq('id', userId)
    .maybeSingle();
  if (!me) throw notFound('Profile not found');

  if (!stripeConfigured) {
    await supabaseAdmin.from('profiles').update({ monetization_status: 'active' }).eq('id', userId);
    return c.json({ url: null, status: 'active' as const });
  }

  let accountId = me.stripe_account_id as string | null;
  if (!accountId) {
    const { data: auth } = await supabaseAdmin.auth.admin.getUserById(userId);
    accountId = await createConnectAccount(auth?.user?.email ?? null);
    await supabaseAdmin.from('profiles').update({ stripe_account_id: accountId, monetization_status: 'pending' }).eq('id', userId);
  }
  const url = await createOnboardingLink(accountId);
  return c.json({ url, status: 'pending' as const });
});

/** GET /monetize/status — payout state (refreshes pending Stripe accounts). */
monetize.get('/status', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('monetization_status, stripe_account_id')
    .eq('id', userId)
    .maybeSingle();
  if (!me) throw notFound('Profile not found');
  let status = (me.monetization_status as string) ?? 'none';
  // In live mode an 'active' status with no connected account is stale (e.g. it
  // was activated in mock mode before keys were added) — treat as not set up.
  if (stripeConfigured && status === 'active' && !me.stripe_account_id) status = 'none';
  // A pending Stripe account may have finished onboarding since we last looked.
  if (status === 'pending' && stripeConfigured && me.stripe_account_id) {
    try {
      if (await accountActive(me.stripe_account_id as string)) {
        status = 'active';
        await supabaseAdmin.from('profiles').update({ monetization_status: 'active' }).eq('id', userId);
      }
    } catch {
      /* keep pending on provider errors */
    }
  }
  return c.json({ status });
});

/** GET /monetize/earnings — the creator's ledger: totals + recent tips, fee split explicit. */
monetize.get('/earnings', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const [{ data: me }, { data: rows }, { data: agg }] = await Promise.all([
    supabaseAdmin.from('profiles').select('monetization_status, sub_price_cents').eq('id', userId).maybeSingle(),
    supabaseAdmin
      .from('tips')
      .select('*')
      .eq('creator_id', userId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(100),
    // Lifetime totals over ALL succeeded tips, not just the newest 100.
    supabaseAdmin.rpc('creator_earnings', { uid: userId }),
  ]);
  const tips = (rows ?? []) as TipRow[];
  const totalsRow = (Array.isArray(agg) ? agg[0] : agg) as { gross_cents: number; fee_cents: number; net_cents: number; tip_count: number } | null;

  const tipperIds = [...new Set(tips.map((t) => t.tipper_id).filter((x): x is string => !!x))];
  const recipeIds = [...new Set(tips.map((t) => t.recipe_id).filter((x): x is string => !!x))];
  const [{ data: tippers }, { data: recipes }] = await Promise.all([
    tipperIds.length ? supabaseAdmin.from('profiles').select('*').in('id', tipperIds) : Promise.resolve({ data: [] }),
    recipeIds.length ? supabaseAdmin.from('recipes').select('id, title').in('id', recipeIds) : Promise.resolve({ data: [] }),
  ]);
  const tipperMap = new Map((tippers ?? []).map((p) => [p.id as string, p as ProfileRow]));
  const titleMap = new Map((recipes ?? []).map((r) => [r.id as string, r.title as string]));

  const dto: TipDTO[] = tips.map((t) => {
    const from = t.tipper_id ? tipperMap.get(t.tipper_id) : undefined;
    return {
      id: t.id,
      kind: (t.kind as EarningKind) ?? 'support',
      from: from ? cookSummary(from) : null,
      recipeId: t.recipe_id,
      recipeTitle: t.recipe_id ? titleMap.get(t.recipe_id) ?? null : null,
      amountCents: t.amount_cents,
      feeCents: t.fee_cents,
      netCents: t.net_cents,
      status: t.status,
      createdAt: t.created_at,
      time: relativeTime(new Date(t.created_at)),
    };
  });
  return c.json<EarningsSummary>({
    monetization: ((me?.monetization_status as string) ?? 'none') as EarningsSummary['monetization'],
    feePct: PLATFORM_FEE_PCT,
    subPriceCents: (me?.sub_price_cents as number | null) ?? null,
    totals: {
      grossCents: totalsRow?.gross_cents ?? 0,
      feeCents: totalsRow?.fee_cents ?? 0,
      netCents: totalsRow?.net_cents ?? 0,
      tipCount: totalsRow?.tip_count ?? 0,
    },
    tips: dto,
  });
});
