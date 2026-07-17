import { Hono } from 'hono';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { creatorShareCents, PLATFORM_FEE_PCT, type EarningKind, type EarningsSummary, type TipConfig, type TipDTO } from '@sizzle/shared';
import { requireAuth, requireNotBanned } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { env, stripeConfigured } from '../env';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { canViewCookContent, cookSummary, loadBlockedIds, type ProfileRow } from '../mappers';
import { notify, systemNotify } from '../services/notify';
import { moderate } from '../services/moderation';
import { accountActive, cancelSubscriptionAtPeriodEnd, createConnectAccount, createDashboardLink, createOnboardingLink, createOneOffCheckout, createSubscriptionCheckout, getChargeTransfer, hasTransferInGroup, paymentsProvider, reverseTransfer, stripeBalance, StripeError, transferToCreator, type ChargeTransfer } from '../services/payments';
import { captureException } from '../lib/sentry';
import type { AppEnv } from '../types';

export const monetize = new Hono<AppEnv>();

/** Tip guardrails (cents). The floor keeps small payments worth making: card
 *  processing (~2.9% + 30¢) comes off the top before the 90/10 split, and below
 *  ~$5 the fixed 30¢ eats an outsized share of what the fan pays. Every other
 *  price floor (and the DB CHECKs) matches it. */
const MIN_TIP = 500; // $5
const MAX_TIP = 50_000; // $500
const PRESETS = [500, 1000, 2000, 5000];

type StripeMeta = { tip_id?: string; creator_id?: string; subscriber_id?: string };
interface StripeObj {
  id?: string;
  mode?: string;
  payment_status?: string;
  payment_intent?: string;
  invoice?: string;
  status?: string;
  amount_paid?: number;
  /** Charge only: `amount_refunded` < `amount` means a PARTIAL refund. */
  amount?: number;
  amount_refunded?: number;
  subscription?: string;
  current_period_end?: number;
  period_end?: number;
  /** Dispute only: the charge it's raised against. */
  charge?: string;
  metadata?: StripeMeta;
  subscription_details?: { metadata?: StripeMeta };
  /** Newer API versions nest an invoice's subscription metadata + id under
   *  `parent`; the old top-level `subscription_details`/`subscription` are now
   *  null. Read both — see subMetaOf()/subIdOf(). */
  parent?: { subscription_details?: { metadata?: StripeMeta; subscription?: string } };
  /** current_period_end moved from the subscription onto its ITEMS. */
  items?: { data?: Array<{ price?: { unit_amount?: number }; current_period_end?: number }> };
}

/* Field-location shims. Stripe RELOCATED these without breaking the schema, so
 * the old reads just returned undefined and our guards silently skipped — an
 * active subscription recorded ZERO earnings, with no error to notice. Read the
 * new location first, fall back to the old so replayed/older events still work. */
const subMetaOf = (o: StripeObj): StripeMeta | undefined =>
  o.parent?.subscription_details?.metadata ?? o.subscription_details?.metadata;
const subIdOf = (o: StripeObj): string | undefined =>
  o.parent?.subscription_details?.subscription ?? o.subscription;
const periodEndOf = (o: StripeObj): number | undefined =>
  o.items?.data?.[0]?.current_period_end ?? o.current_period_end;
function mapSubStatus(s?: string): 'active' | 'canceled' | 'past_due' {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'past_due';
  return 'canceled';
}
/** Guard webhook-supplied ids before they reach FK columns (poison-event defence). */
const isUuid = (s?: string): s is string => !!s && /^[0-9a-f-]{36}$/i.test(s);

/**
 * Advance a creator to the `active` Creator tier once payout setup is complete.
 * Idempotent + safe: only transitions from `eligible`/`pending` (an already-active
 * or grandfathered creator, or a suspended one, is left untouched). Stamps
 * creator_since and fires the one-time "you're a Creator" system notification.
 * This is the single choke point that ties Creator activation to finished payouts.
 */
async function activateCreator(userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .update({ creator_status: 'active', creator_since: new Date().toISOString() })
    .eq('id', userId)
    .in('creator_status', ['eligible', 'pending'])
    .select('id')
    .maybeSingle();
  if (data) await systemNotify({ userId, type: 'creator_activated' }).catch(() => {});
}

/** Add net earnings toward the creator's funding goal (no-op if they have no goal). */
async function bumpGoal(creatorId: string, netCents: number): Promise<void> {
  if (netCents > 0) await supabaseAdmin.rpc('bump_goal', { p_creator: creatorId, p_net: netCents }).then(() => {}, () => {});
}

/** Auto-send the creator's welcome/thank-you DM to a brand-new subscriber (if set). */
async function sendWelcomeDm(creatorId: string, subscriberId: string): Promise<void> {
  if (creatorId === subscriberId) return;
  const { data: creator } = await supabaseAdmin.from('profiles').select('welcome_dm').eq('id', creatorId).maybeSingle();
  const text = (creator?.welcome_dm as string | null)?.trim();
  if (!text) return;
  const [a, b] = creatorId < subscriberId ? [creatorId, subscriberId] : [subscriberId, creatorId];
  await supabaseAdmin.from('conversations').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b', ignoreDuplicates: true });
  const { data: conv } = await supabaseAdmin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (!conv) return;
  await supabaseAdmin.from('messages').insert({ conversation_id: conv.id, sender_id: creatorId, text });
  await supabaseAdmin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id).then(() => {}, () => {});
  await notify({ userId: subscriberId, type: 'message', actorId: creatorId }).catch(() => {});
}

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
  // Private creator's monetization is follower-only — a non-follower can't tip.
  if (!(await canViewCookContent(supabaseAdmin, creatorId, userId))) throw notFound('User not found');
  const { data: creator } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, banned, monetization_status, stripe_account_id, creator_status')
    .eq('id', creatorId)
    .maybeSingle();
  if (!creator || creator.banned) throw notFound('User not found');
  // A suspended Creator can't receive money while under review.
  if (creator.creator_status === 'suspended') throw badRequest('This creator isn’t accepting payments right now');
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

  // The ledger row records the exact split. fee_cents carries everything that
  // isn't the creator's — card processing off the top plus Sizzle's share of the
  // rest — so gross − fee is exactly what the creator receives.
  const feeCents = amountCents - creatorShareCents(amountCents);
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
  await notify({ userId: creatorId, type: 'tip', actorId: userId, recipeId: tipRecipeId, amountCents }).catch(() => {});
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
  // Can't buy an unlock for a private creator's recipe you can't even view —
  // gate before probing price so a non-follower can't confirm it exists.
  if (rec.cook_id !== userId && !(await canViewCookContent(supabaseAdmin, rec.cook_id as string, userId))) throw notFound('Recipe not found');
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

  const { data: creator } = await supabaseAdmin.from('profiles').select('display_name, banned, monetization_status, stripe_account_id, creator_status').eq('id', rec.cook_id).maybeSingle();
  if (!creator || creator.banned || creator.creator_status === 'suspended' || creator.monetization_status !== 'active') throw badRequest('This recipe is not available');
  const liveMode = stripeConfigured;
  if (liveMode && !creator.stripe_account_id) throw badRequest('This creator has not finished payout setup');

  const amountCents = rec.price_cents as number;
  const feeCents = amountCents - creatorShareCents(amountCents);
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
  await notify({ userId: rec.cook_id as string, type: 'tip', actorId: userId, recipeId, amountCents }).catch(() => {});
  return c.json({ url: null, status: 'succeeded' as const });
});

/* ─────────────────────────── subscriptions ─────────────────────────── */

const subPriceSchema = z.object({ priceCents: z.number().int().min(500).max(50_000).nullable() });

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

/** GET /monetize/payout — the creator's balance + next payout + dashboard link.
 *  Mock derives the balance from lifetime net earnings; the real Stripe balance
 *  API + Express dashboard link wire up when STRIPE_SECRET_KEY is set. */
monetize.get('/payout', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  // NOTE: no payout DATE is returned. The old "upcoming Friday" estimate was
  // provably wrong (Stripe said Jul 22 where we said Jul 16) because the real date
  // depends on each charge's rolling availability delay, which we can't compute —
  // and a confidently wrong payout date is worse than none. Stripe's Express
  // dashboard knows the real one; we link to it instead.

  // Live: read the creator's actual Stripe balance + mint a dashboard login link.
  // Falls back to the lifetime-net estimate if the balance/link call fails so the
  // payouts screen never hard-errors.
  if (stripeConfigured) {
    const { data: me } = await supabaseAdmin.from('profiles').select('stripe_account_id').eq('id', userId).maybeSingle();
    const accountId = me?.stripe_account_id as string | null;
    if (accountId) {
      try {
        const [{ availableCents, pendingCents }, dashboardUrl] = await Promise.all([
          stripeBalance(accountId),
          createDashboardLink(accountId).catch(() => null),
        ]);
        return c.json({
          provider: paymentsProvider,
          availableCents,
          pendingCents,
          dashboardUrl,
          taxNote: 'You are responsible for taxes on your creator earnings. A 1099-K is issued by our payment processor when thresholds are met.',
        });
      } catch (err) {
        console.error('[monetize] balance fetch failed:', (err as Error).message);
        /* fall through to the estimate below */
      }
    }
  }

  // Mock / fallback: derive the available balance from lifetime net earnings.
  const { data: agg } = await supabaseAdmin.rpc('creator_earnings', { uid: userId });
  const totals = (Array.isArray(agg) ? agg[0] : agg) as { net_cents: number } | null;
  return c.json({
    provider: paymentsProvider,
    availableCents: totals?.net_cents ?? 0,
    pendingCents: 0,
    dashboardUrl: stripeConfigured ? `${env.APP_ORIGIN}/?payouts=dashboard` : null,
    taxNote: 'You are responsible for taxes on your creator earnings. A 1099-K is issued by our payment processor when thresholds are met.',
  });
});

const goalSchema = z.object({
  label: z.string().trim().max(80).nullable(),
  targetCents: z.number().int().min(500).max(100_000_00).nullable(),
});

/** POST /monetize/goal — set (or clear) the creator's funding goal. Clearing resets progress. */
monetize.post('/goal', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const parsed = goalSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid goal');
  const on = parsed.data.targetCents != null && !!parsed.data.label;
  await supabaseAdmin.from('profiles').update({
    goal_cents: on ? parsed.data.targetCents : null,
    goal_label: on ? parsed.data.label : null,
    ...(on ? {} : { goal_raised_cents: 0 }),
  }).eq('id', userId);
  return c.json({ ok: true });
});

const productSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  priceCents: z.number().int().min(500).max(50_000_00),
  fileUrl: z.string().url().max(1000).nullable().optional(),
});

/** POST /monetize/products — create a digital product (creator, payouts active). */
monetize.post('/products', requireAuth, requireNotBanned, async (c) => {
  const userId = c.get('userId')!;
  const parsed = productSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid product');
  const { data: me } = await supabaseAdmin.from('profiles').select('monetization_status').eq('id', userId).maybeSingle();
  if (me?.monetization_status !== 'active') throw badRequest('Set up payouts first');
  const { data, error } = await supabaseAdmin
    .from('creator_products')
    .insert({ creator_id: userId, title: parsed.data.title, description: parsed.data.description ?? null, price_cents: parsed.data.priceCents, file_url: parsed.data.fileUrl ?? null })
    .select('id').single();
  if (error || !data) throw dbFail(error?.message ?? 'Failed to create product');
  return c.json({ id: data.id }, 201);
});

/** GET /monetize/products — the creator's own products (with file URLs). */
monetize.get('/products', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const { data } = await supabaseAdmin.from('creator_products').select('*').eq('creator_id', userId).eq('active', true).order('created_at', { ascending: false });
  return c.json({ products: (data ?? []).map((p) => ({ id: p.id, title: p.title, description: p.description, priceCents: p.price_cents, fileUrl: p.file_url, owned: true })) });
});

/** DELETE /monetize/products/:id — deactivate a product (soft delete). */
monetize.delete('/products/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  await supabaseAdmin.from('creator_products').update({ active: false }).eq('id', id).eq('creator_id', userId);
  return c.json({ ok: true });
});

/** POST /monetize/products/:id/buy — purchase a product (Stripe checkout, or mock instant). */
monetize.post('/products/:id/buy', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 15, name: 'buy-product' }), async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  const { data: prod } = await supabaseAdmin.from('creator_products').select('*').eq('id', id).eq('active', true).maybeSingle();
  if (!prod) throw notFound('Product not found');
  if (prod.creator_id === userId) throw badRequest("You can't buy your own product");
  // Private creator's products are follower-only.
  if (!(await canViewCookContent(supabaseAdmin, prod.creator_id as string, userId))) throw notFound('Product not found');
  // A suspended Creator can't sell while under review.
  const { data: seller } = await supabaseAdmin.from('profiles').select('banned, creator_status').eq('id', prod.creator_id).maybeSingle();
  if (!seller || seller.banned || seller.creator_status === 'suspended') throw badRequest('This product isn’t available right now');
  const { data: already } = await supabaseAdmin.from('product_purchases').select('product_id').eq('user_id', userId).eq('product_id', id).maybeSingle();
  if (already) return c.json({ url: null, status: 'succeeded' as const });

  const priceCents = prod.price_cents as number;
  const feeCents = priceCents - creatorShareCents(priceCents);
  if (!stripeConfigured) {
    // Mock: grant + record instantly.
    await supabaseAdmin.from('product_purchases').upsert({ user_id: userId, product_id: id }, { onConflict: 'user_id,product_id' });
    await supabaseAdmin.from('tips').insert({ tipper_id: userId, creator_id: prod.creator_id, product_id: id, amount_cents: priceCents, fee_cents: feeCents, net_cents: priceCents - feeCents, provider: 'mock', status: 'succeeded', succeeded_at: new Date().toISOString(), kind: 'product' });
    await bumpGoal(prod.creator_id as string, priceCents - feeCents);
    await notify({ userId: prod.creator_id as string, type: 'tip', actorId: userId, amountCents: priceCents }).catch(() => {});
    return c.json({ url: null, status: 'succeeded' as const });
  }
  // One in-flight checkout per (buyer, product) — mirrors the unlock guard so a
  // double-opened checkout can't charge twice (the grant is idempotent, the charge
  // isn't). A partial unique index backstops the race.
  const { data: pendingProduct } = await supabaseAdmin
    .from('tips').select('id')
    .eq('tipper_id', userId).eq('product_id', id).eq('kind', 'product').eq('status', 'pending')
    .maybeSingle();
  if (pendingProduct) throw badRequest('You already have a purchase in progress for this product — finish that checkout, or try again in a few minutes.');

  // Live: pending ledger row + checkout (settled by webhook).
  const { data: creator } = await supabaseAdmin.from('profiles').select('stripe_account_id').eq('id', prod.creator_id).maybeSingle();
  if (!creator?.stripe_account_id) throw badRequest('This creator can’t accept payments yet');
  const { data: row, error } = await supabaseAdmin.from('tips').insert({ tipper_id: userId, creator_id: prod.creator_id, product_id: id, amount_cents: priceCents, fee_cents: feeCents, net_cents: priceCents - feeCents, provider: 'stripe', status: 'pending', kind: 'product' }).select('id').single();
  if (error || !row) throw dbFail(error?.message ?? 'Failed to start purchase');
  try {
    const { url } = await createOneOffCheckout({ ledgerId: row.id, amountCents: priceCents, feeCents, creatorAccountId: creator.stripe_account_id as string, productName: prod.title as string });
    return c.json({ url, status: 'pending' as const });
  } catch (err) {
    // No session was created, so checkout.session.expired never fires to reap this
    // row — leaving it would trip the in-flight guard above on every retry, forever.
    await supabaseAdmin.from('tips').delete().eq('id', row.id);
    console.error('[monetize] product checkout failed:', (err as Error).message);
    throw badRequest('Could not start the payment — please try again');
  }
});

const tierSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceCents: z.number().int().min(500).max(50_000),
  perks: z.string().trim().max(500).nullable().optional(),
});

/** POST /monetize/tiers — create a subscription tier (creator, payouts active). */
monetize.post('/tiers', requireAuth, requireNotBanned, async (c) => {
  const userId = c.get('userId')!;
  const parsed = tierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid tier');
  const { data: me } = await supabaseAdmin.from('profiles').select('monetization_status').eq('id', userId).maybeSingle();
  if (me?.monetization_status !== 'active') throw badRequest('Set up payouts first');
  const { count } = await supabaseAdmin.from('creator_tiers').select('*', { count: 'exact', head: true }).eq('creator_id', userId).eq('active', true);
  const { data, error } = await supabaseAdmin.from('creator_tiers').insert({ creator_id: userId, name: parsed.data.name, price_cents: parsed.data.priceCents, perks: parsed.data.perks ?? null, sort: count ?? 0 }).select('id').single();
  if (error || !data) throw dbFail(error?.message ?? 'Failed to create tier');
  return c.json({ id: data.id }, 201);
});

/** GET /monetize/tiers — the creator's own tiers. */
monetize.get('/tiers', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const { data } = await supabaseAdmin.from('creator_tiers').select('*').eq('creator_id', userId).eq('active', true).order('sort', { ascending: true });
  return c.json({ tiers: (data ?? []).map((t) => ({ id: t.id, name: t.name, priceCents: t.price_cents, perks: t.perks })) });
});

/** DELETE /monetize/tiers/:id — deactivate a tier. */
monetize.delete('/tiers/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  await supabaseAdmin.from('creator_tiers').update({ active: false }).eq('id', c.req.param('id')).eq('creator_id', userId);
  return c.json({ ok: true });
});

const broadcastSchema = z.object({ text: z.string().trim().min(1).max(1000) });

/** POST /monetize/broadcast — send one DM to all of the creator's active subscribers.
 *  A members-only channel: the creator talks to everyone who pays them, at once. */
monetize.post('/broadcast', requireAuth, requireNotBanned, rateLimit({ windowMs: 60 * 60_000, max: 6, name: 'broadcast' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = broadcastSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Message required');
  const mod = await moderate(parsed.data.text);
  if (!mod.ok) throw badRequest(mod.reason!);
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('subscriber_id')
    .eq('creator_id', userId)
    .eq('status', 'active')
    .limit(1000); // cap the fan-out per broadcast
  const ids = [...new Set((subs ?? []).map((s) => s.subscriber_id as string))];
  for (const sid of ids) {
    if (sid === userId) continue;
    const [a, b] = userId < sid ? [userId, sid] : [sid, userId];
    await supabaseAdmin.from('conversations').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b', ignoreDuplicates: true });
    const { data: conv } = await supabaseAdmin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
    if (!conv) continue;
    await supabaseAdmin.from('messages').insert({ conversation_id: conv.id, sender_id: userId, text: parsed.data.text });
    await supabaseAdmin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id).then(() => {}, () => {});
    await notify({ userId: sid, type: 'message', actorId: userId }).catch(() => {});
  }
  return c.json({ ok: true, sent: ids.length });
});

const welcomeSchema = z.object({ text: z.string().trim().max(500).nullable() });

/** POST /monetize/welcome — set (or clear) the auto welcome DM sent to new subscribers. */
monetize.post('/welcome', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const parsed = welcomeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid message');
  await supabaseAdmin.from('profiles').update({ welcome_dm: parsed.data.text || null }).eq('id', userId);
  return c.json({ ok: true });
});

const subscribeSchema = z.object({ creatorId: z.string().uuid(), tierId: z.string().uuid().optional() });

/** POST /monetize/subscribe — start a monthly subscription to a creator. */
monetize.post('/subscribe', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 6, name: 'subscribe' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid');
  const { creatorId } = parsed.data;
  if (creatorId === userId) throw badRequest('You cannot subscribe to yourself');
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(creatorId)) throw notFound('User not found');
  // Private creator: subscriptions are follower-only (matches the hidden UI).
  if (!(await canViewCookContent(supabaseAdmin, creatorId, userId))) throw notFound('User not found');
  const { data: creator } = await supabaseAdmin
    .from('profiles')
    .select('display_name, banned, monetization_status, stripe_account_id, sub_price_cents, creator_status')
    .eq('id', creatorId)
    .maybeSingle();
  if (creator?.creator_status === 'suspended') throw badRequest('This creator isn’t accepting subscriptions right now');
  // A tier sets its own price; otherwise fall back to the creator's base sub price.
  let priceCents = (creator?.sub_price_cents as number | null) ?? null;
  let tierId: string | null = null;
  if (parsed.data.tierId) {
    const { data: tier } = await supabaseAdmin.from('creator_tiers').select('price_cents').eq('id', parsed.data.tierId).eq('creator_id', creatorId).eq('active', true).maybeSingle();
    if (!tier) throw badRequest('That tier is unavailable');
    priceCents = tier.price_cents as number;
    tierId = parsed.data.tierId;
  }
  if (!creator || creator.banned || creator.monetization_status !== 'active' || !priceCents) throw badRequest('This creator does not offer subscriptions');
  // The DB CHECKs enforce the floor; re-assert before checkout as defense in
  // depth so a stale pre-floor price can never be billed monthly.
  if (priceCents < MIN_TIP) throw badRequest('This subscription price is below the minimum — the creator needs to update it');
  const { data: existing } = await supabaseAdmin.from('subscriptions').select('id, status').eq('subscriber_id', userId).eq('creator_id', creatorId).maybeSingle();
  if (existing && existing.status === 'active') return c.json({ url: null, status: 'active' as const });

  if (!stripeConfigured) {
    // Mock: activate + record the first month instantly (no provider_ref → no unique clash on re-sub).
    const feeCents = priceCents - creatorShareCents(priceCents);
    await supabaseAdmin.from('subscriptions').upsert(
      { subscriber_id: userId, creator_id: creatorId, price_cents: priceCents, tier_id: tierId, status: 'active', current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      { onConflict: 'subscriber_id,creator_id' },
    );
    await supabaseAdmin.from('tips').insert({ tipper_id: userId, creator_id: creatorId, amount_cents: priceCents, fee_cents: feeCents, net_cents: priceCents - feeCents, provider: 'mock', status: 'succeeded', succeeded_at: new Date().toISOString(), kind: 'subscription' });
    await bumpGoal(creatorId, priceCents - feeCents);
    await sendWelcomeDm(creatorId, userId);
    await notify({ userId: creatorId, type: 'tip', actorId: userId, amountCents: priceCents }).catch(() => {});
    return c.json({ url: null, status: 'active' as const });
  }
  if (!creator.stripe_account_id) throw badRequest('This creator has not finished payout setup');
  const { url } = await createSubscriptionCheckout({
    creatorAccountId: creator.stripe_account_id as string,
    priceCents,
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
    .select('creator_id, tipper_id, recipe_id, kind, net_cents, amount_cents, product_id')
    .maybeSingle();
  if (error) throw error; // surfaced as 500 so Stripe retries
  if (!settled) return;
  if (settled.kind === 'unlock' && settled.recipe_id && settled.tipper_id) {
    await supabaseAdmin.from('recipe_unlocks').upsert({ user_id: settled.tipper_id, recipe_id: settled.recipe_id }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true });
  }
  if (settled.kind === 'product' && settled.product_id && settled.tipper_id) {
    await supabaseAdmin.from('product_purchases').upsert({ user_id: settled.tipper_id, product_id: settled.product_id }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
  }
  await bumpGoal(settled.creator_id as string, (settled.net_cents as number) ?? 0);
  await notify({
    userId: settled.creator_id as string,
    type: 'tip',
    actorId: (settled.tipper_id as string | null) ?? (settled.creator_id as string),
    recipeId: (settled.recipe_id as string | null) ?? null,
    amountCents: (settled.amount_cents as number | null) ?? null,
  }).catch(() => {});
}

/** Stripe error codes a reversal retry could never get past. `balance_insufficient`
 *  means the creator has already paid the money out — their balance will not refill
 *  because we asked again. Everything else (429, 5xx, network) is worth a retry. */
const PERMANENT_REVERSAL_CODES = new Set(['balance_insufficient']);

/** Terminal dispute statuses where nothing should be revoked: the money came back.
 *  (`warning_closed` is terminal too, but the inquiry gate breaks before this.) */
const DISPUTE_SETTLED_FOR_US = new Set(['won', 'prevented']);

/**
 * Claw back the creator's share of a charge the platform is now out of pocket on.
 * Reverses `lostCents` (CUMULATIVE — see the callers) worth of the destination
 * transfer, PROPORTIONALLY and net of anything already reversed, so a Dashboard
 * refund with "reverse transfer" ticked, a redelivered event, and a partial refund
 * all land on the right number, and forgetting the checkbox costs nothing.
 *
 * Throws on a reversal that a retry could still fix, so the webhook 5xxs and Stripe
 * re-delivers. Returns normally only when the money is genuinely unrecoverable.
 */
async function recoverFromCreator(ct: ChargeTransfer, lostCents: number, keyPrefix: string): Promise<void> {
  if (ct.chargeCents <= 0) return;
  const target = Math.min(Math.floor((ct.transferCents * lostCents) / ct.chargeCents), ct.transferCents);
  const delta = target - ct.reversedCents;
  // Already reversed far enough — by us, or by an operator ticking "reverse
  // transfer" in the Dashboard. NOT HANDLED: a Dashboard reversal done WITHOUT
  // also refunding the application fee settles the creator at minus the fee, and
  // amount_reversed looks identical either way, so this gate cannot see it.
  // Catching it would cost an application-fee lookup on every redelivery of every
  // refund to salvage one operator slip whose real fix is to refund in-app.
  if (delta <= 0) return;
  try {
    // The cumulative TARGET in the key, not the delta: the target is monotonic, so
    // each distinct reversal state gets its own key, while two equal-sized deltas
    // (two identical partial refunds) would share a delta-based key and Stripe
    // would replay the first response — silently skipping the second clawback.
    // Same key with a different amount (an operator reversing mid-flight shifts
    // the delta) is a hard 400 from Stripe, which rethrows below and re-delivers.
    await reverseTransfer(ct.transferId, delta, `${keyPrefix}_${target}`);
  } catch (err) {
    const code = err instanceof StripeError ? err.code : null;
    // Rethrowing a permanent refusal would re-deliver for three days into the same
    // empty balance, and an endpoint that keeps failing gets DISABLED — which would
    // stop settling tips for EVERY creator over one creator's balance. Recovering
    // $9 must never outrank settling everyone's money.
    if (!code || !PERMANENT_REVERSAL_CODES.has(code)) throw err;
    // console.error is the durable record here: captureException is a no-op unless
    // SENTRY_DSN is set, and this is the one path that loses money silently.
    console.error(
      '[monetize] transfer reversal refused — creator share NOT recovered, platform is out of pocket:',
      `transfer=${ct.transferId} destination=${ct.destination} amountCents=${delta}`,
      (err as Error).message,
    );
    await captureException(err, {
      issue: 'transfer reversal failed — creator share NOT recovered, platform is out of pocket',
      transferId: ct.transferId,
      destination: ct.destination,
      amountCents: delta,
    });
  }
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
      case 'charge.dispute.created':
      case 'charge.dispute.updated': {
        const isDispute = event.type !== 'charge.refunded';
        // An INQUIRY (Amex/Discover pre-dispute) also arrives as dispute.created,
        // but debits nothing — the customer still holds a charge they paid for.
        // Reversing or revoking on one would claw back a creator and cut off a
        // paying fan over a question. Stripe marks all three inquiry states
        // warning_* (needs_response / under_review / closed), and that status is the
        // documented signal — the withdrawal balance transaction is not guaranteed
        // to be attached yet when the payload is snapshotted, so gating on that
        // instead would silently never reverse a real chargeback. Escalation to a
        // real chargeback arrives as dispute.UPDATED, never a second created —
        // hence both events.
        if (isDispute && (obj.status ?? '').startsWith('warning_')) break;
        // A dispute already settled in our favour must touch NOTHING — money or
        // rows. The money never left (won) or leaves as its own charge.refunded
        // (prevented, per RDR semantics), so reversing here would claw back a
        // creator on a dispute we didn't lose — and when such an event is the
        // FIRST dispute event we ever see (webhook subscribed mid-dispute), the
        // ledger gate below would skip the flip too, so dispute.closed(won) would
        // find no `refunded` row and never re-pay what this branch just took.
        // (`lost` is deliberately NOT in that set: re-running it is a no-op — the
        // row is already `refunded`, so the guarded update matches nothing —
        // while skipping it would leave a fan with paid access if an `updated`
        // is the FIRST dispute event we ever see.)
        if (isDispute && DISPUTE_SETTLED_FOR_US.has(obj.status ?? '')) break;
        // A Dispute points at its charge; a Charge is one.
        const chargeId = isDispute ? obj.charge : obj.id;
        const ct = chargeId ? await getChargeTransfer(chargeId) : null;
        // Every charge WE create is a destination charge, so ours-but-transferless
        // means Stripe hasn't attached the transfer yet, not that none is coming —
        // a dispute can be raised in the same second as the charge, ahead of
        // transfer.created. Proceeding would flip the ledger below, ack 200, and
        // the clawback would never run: nothing gets redelivered. Throw instead;
        // the transfer is there by the retry. Charges with no ledger row are not
        // ours and fall through — retrying those would hammer the endpoint for
        // days over other people's events.
        if (!ct && chargeId) {
          const oursRefs = [obj.payment_intent, obj.invoice].filter((x): x is string => !!x);
          if (oursRefs.length) {
            const { data: ours, error: oursErr } = await supabaseAdmin.from('tips').select('id').in('provider_ref', oursRefs).limit(1);
            if (oursErr) throw oursErr;
            if (ours?.length) throw new Error(`charge ${chargeId} is ours but its transfer is not attached yet — 5xx so Stripe re-delivers`);
          }
        }
        // What the platform is out, CUMULATIVELY — that is what the proportional
        // target is measured against. `amount_refunded` is already cumulative, but a
        // dispute's `amount` covers only that dispute and STACKS on any refund
        // already given (refund $3 of $10, customer disputes the other $7), so read
        // the refunded total off the charge and add it. Reading the dispute alone
        // would target $7 of a $10 loss and leave the creator holding the rest.
        const lostCents = isDispute ? (ct?.refundedCents ?? 0) + (obj.amount ?? 0) : (obj.amount_refunded ?? 0);
        // MONEY FIRST, and on its own gate. A partial refund leaves the earning
        // standing (below) but still has to claw back its share — otherwise every
        // partial refund quietly leaves the creator's cut on the platform's tab.
        if (ct && lostCents > 0) {
          await recoverFromCreator(ct, lostCents, isDispute ? `rev_${obj.id}` : `rev_${chargeId}`);
        }
        // Reverse the earning this charge paid for. One-off tips/unlocks are keyed
        // by payment_intent; subscription renewals by the invoice's payment_intent —
        // and the charge also carries the invoice id, so match either ref. Read them
        // off the charge: a Dispute has no invoice of its own.
        const refs = [ct?.paymentIntent ?? obj.payment_intent, ct?.invoice ?? obj.invoice].filter((x): x is string => !!x);
        // charge.refunded ALSO fires for partial refunds, where the earning stands:
        // a $1 goodwill refund on a $50 tip must not erase the $50. Only a fully
        // refunded charge reverses. A dispute carries no amount_refunded (and its
        // `amount` is the disputed amount, not the charge's), so it never takes the
        // ratio path — a chargeback always reverses in full (won/prevented broke
        // out above, before any money moved).
        const fullReversal = isDispute || (obj.amount_refunded ?? 0) >= (obj.amount ?? 0);
        if (refs.length && fullReversal) {
          const { data: reversed, error: revErr } = await supabaseAdmin
            .from('tips')
            .update({ status: 'refunded' })
            .in('provider_ref', refs)
            .eq('status', 'succeeded')
            .select('tipper_id, creator_id, recipe_id, product_id, kind');
          if (revErr) throw revErr;
          // Withdraw what the money bought alongside the ledger reversal: a refunded
          // or charged-back purchase must not keep granting access.
          for (const row of reversed ?? []) {
            if (row.kind === 'unlock' && row.tipper_id && row.recipe_id) {
              await supabaseAdmin.from('recipe_unlocks').delete().eq('user_id', row.tipper_id).eq('recipe_id', row.recipe_id);
            }
            if (row.kind === 'product' && row.tipper_id && row.product_id) {
              await supabaseAdmin.from('product_purchases').delete().eq('user_id', row.tipper_id).eq('product_id', row.product_id);
            }
            // Subscription access is keyed on status alone, so canceling the row
            // (the one status the schema has for "over") ends it immediately.
            if (row.kind === 'subscription' && row.tipper_id) {
              await supabaseAdmin.from('subscriptions').update({ status: 'canceled' }).eq('subscriber_id', row.tipper_id).eq('creator_id', row.creator_id);
            }
          }
        }
        break;
      }
      case 'charge.dispute.closed': {
        // Only a WIN needs undoing: Stripe returns the disputed amount and the
        // dispute fee, so the earning we reversed and the access we revoked were
        // both taken back in error. `lost` needs nothing (the reversal already ran
        // when the dispute opened — waiting until now to claw back would find the
        // creator's balance long since paid out); warning_closed/prevented never
        // moved money or touched a row in the first place.
        if (obj.status !== 'won' || !obj.charge) break;
        const ct = await getChargeTransfer(obj.charge);
        // Same ours-but-transferless guard as the refund/dispute branch: flipping
        // the row with ct null would skip the repay silently and permanently.
        if (!ct) {
          const oursRefs = [obj.payment_intent].filter((x): x is string => !!x);
          if (oursRefs.length) {
            const { data: ours, error: oursErr } = await supabaseAdmin.from('tips').select('id').in('provider_ref', oursRefs).limit(1);
            if (oursErr) throw oursErr;
            if (ours?.length) throw new Error(`charge ${obj.charge} is ours but its transfer is not attached yet — 5xx so Stripe re-delivers`);
          }
        }
        // A fully refunded charge's dispute win undoes nothing: the fan was made
        // whole by the REFUND, which stands (winning only returns the dispute's
        // debit), so the row stays `refunded`, access stays revoked, and the
        // reversal that ran was the refund's — not ours to repay. The modal case
        // is refund → fan disputes anyway → we submit the refund as evidence and
        // win: repaying here would pay the creator for a sale that was returned.
        if (ct && ct.chargeCents > 0 && ct.refundedCents >= ct.chargeCents) break;
        const refs = [ct?.paymentIntent ?? obj.payment_intent, ct?.invoice].filter((x): x is string => !!x);
        if (!refs.length) break;
        // Only the reversal issued FOR THIS DISPUTE is owed back. amount_reversed
        // is cumulative across refund-driven reversals too, so subtract the
        // refund's proportional share (the same target the refund path aims at):
        // repaying off the raw total would also hand back a partial refund's
        // clawback — e.g. $3 refunded of a $10 tip, the $7 dispute won, must
        // repay the $7 share only; the $3 refund still stands.
        const refundReversedCents = ct && ct.chargeCents > 0
          ? Math.min(Math.floor((ct.transferCents * ct.refundedCents) / ct.chargeCents), ct.transferCents)
          : 0;
        const disputeReversedCents = Math.max(0, (ct?.reversedCents ?? 0) - refundReversedCents);
        // Every DB error below is checked and thrown: supabase-js RESOLVES errors
        // into { data: null, error }, so an unchecked read would yield no rows, ack
        // 200, and Stripe would never re-deliver — leaving the won dispute forever
        // unpaid and the fan locked out, which is the bug this branch exists to fix.
        const { data: rows, error: selErr } = await supabaseAdmin
          .from('tips')
          .select('id, tipper_id, creator_id, recipe_id, product_id, kind, amount_cents, net_cents')
          .in('provider_ref', refs)
          .eq('status', 'refunded');
        if (selErr) throw selErr;
        for (const row of rows ?? []) {
          const amountCents = (row.amount_cents as number | null) ?? 0;
          const netCents = (row.net_cents as number | null) ?? 0;
          // A row missing its split can't be re-paid correctly. Leave it
          // `refunded` — visible to a redelivery or a human — rather than flip it
          // to `succeeded` with the creator silently never re-paid.
          if (amountCents <= 0 || netCents <= 0) {
            console.error(`[monetize] dispute ${obj.id} won but tips row ${row.id} has no amount/net split — left refunded for manual reconciliation`);
            continue;
          }
          // Re-pay BEFORE flipping the row. A transfer failure then 5xxs with the
          // row still reading `refunded`, so the redelivery retries it; flipping
          // first would leave nothing to match and strand the creator unpaid.
          // Only re-pay what was genuinely clawed back FOR THE DISPUTE, capped at
          // its own amount — when the reversal failed (creator already paid out)
          // they never lost it, and paying now would hand them the money a second
          // time out of the platform's pocket.
          // Scale it to the NET share: reversing gross R also handed the creator
          // back the fee on R, so they were only ever out R × net/amount. Re-paying
          // R would leave them up by that fee, out of the platform's pocket.
          const grossOwedCents = Math.min(obj.amount ?? 0, disputeReversedCents);
          const repayCents = Math.min(netCents, Math.floor((grossOwedCents * netCents) / amountCents));
          if (ct && repayCents > 0) {
            // Stripe replays a key's FIRST response — including errors — for the
            // key's 24h TTL, so a fixed key that once captured balance_insufficient
            // poisons every redelivery even after the balance refills (observed
            // live). The hour bucket gives each retry epoch a fresh key; the
            // transfer_group lookup is the durable double-pay guard across epochs,
            // covering a transfer that succeeded but whose row flip below failed.
            const repayGroup = `won_${obj.id}_${row.id}`;
            if (!(await hasTransferInGroup(repayGroup))) {
              await transferToCreator({
                destination: ct.destination,
                amountCents: repayCents,
                transferGroup: repayGroup,
                idempotencyKey: `${repayGroup}_h${Math.floor(Date.now() / 3_600_000)}`,
              });
            }
          }
          const { error: updErr } = await supabaseAdmin.from('tips').update({ status: 'succeeded' }).eq('id', row.id).eq('status', 'refunded');
          if (updErr) throw updErr;
          if (row.kind === 'unlock' && row.tipper_id && row.recipe_id) {
            const { error: unlockErr } = await supabaseAdmin.from('recipe_unlocks').upsert({ user_id: row.tipper_id, recipe_id: row.recipe_id }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true });
            if (unlockErr) throw unlockErr;
          }
          if (row.kind === 'product' && row.tipper_id && row.product_id) {
            const { error: purchErr } = await supabaseAdmin.from('product_purchases').upsert({ user_id: row.tipper_id, product_id: row.product_id }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
            if (purchErr) throw purchErr;
          }
          // Subscriptions are NOT resurrected: customer.subscription.* owns that
          // row and Stripe may have genuinely canceled the sub during the weeks a
          // dispute takes, so forcing it back to active here could hand out access
          // Stripe is no longer billing for. The fan re-subscribes.
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
              // Lives on the ITEM now, not the subscription (see periodEndOf).
              current_period_end: (() => { const pe = periodEndOf(obj); return pe ? new Date(pe * 1000).toISOString() : null; })(),
            },
            { onConflict: 'subscriber_id,creator_id' },
          );
          // Welcome the fan the first time a subscription is created + active.
          if (event.type === 'customer.subscription.created' && status === 'active') {
            await sendWelcomeDm(meta!.creator_id, meta!.subscriber_id);
          }
        }
        break;
      }
      case 'invoice.paid': {
        // Each paid invoice = one subscription-renewal earning. provider_ref =
        // invoice id makes it idempotent (Stripe retries), and lets us record the
        // row even if it arrives before customer.subscription.created.
        const invoiceId = obj.id;
        const amount = obj.amount_paid ?? 0;
        // Nested under `parent` on current API versions — reading the old
        // top-level path returned undefined and skipped the earning entirely.
        const meta = subMetaOf(obj);
        // Key the earning by the invoice's payment_intent so a later refund or
        // dispute (which reference the payment_intent, not the invoice id) can
        // reverse it. Fall back to the invoice id when there's no PI (e.g. a
        // balance-funded renewal); either way it's unique per invoice, so a
        // retried invoice.paid still dedupes on the unique provider_ref index.
        const ref = obj.payment_intent ?? invoiceId;
        if (ref && amount > 0 && isUuid(meta?.creator_id) && isUuid(meta?.subscriber_id)) {
          // The exact Model B split from the invoice amount — NOT the decimal
          // percent Stripe applied (that one can drift a cent; the ledger is the
          // number both sides were shown).
          const feeCents = amount - creatorShareCents(amount);
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
          if (!insErr) {
            await bumpGoal(meta!.creator_id, amount - feeCents);
            await notify({ userId: meta!.creator_id, type: 'tip', actorId: meta!.subscriber_id, amountCents: amount }).catch(() => {});
          }
          // Same relocation: the invoice's subscription id is under `parent` now.
          const subId = subIdOf(obj);
          if (subId) {
            // ONLY status here. We used to also write current_period_end from the
            // invoice's period_end — but that's the INVOICE's window, not the
            // subscription's, and on a first invoice it's a zero-length window at
            // signup (period_start === period_end === now). It overwrote the real
            // renewal date (a month out) with today, which would expire a fan's
            // access the moment they paid. customer.subscription.* owns that field.
            await supabaseAdmin.from('subscriptions').update({ status: 'active' }).eq('stripe_subscription_id', subId);
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
  const body = z.object({ acceptTerms: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('monetization_status, stripe_account_id, creator_status, creator_terms_accepted_at, handle')
    .eq('id', userId)
    .maybeSingle();
  if (!me) throw notFound('Profile not found');

  // Monetization is Creator-gated: only an eligible (or already-in-flight/active)
  // account can set up payouts. A `regular` user hasn't crossed the eligibility
  // bar yet; a `suspended` one is under review.
  const cs = (me.creator_status as string) ?? 'regular';
  if (cs === 'regular') throw badRequest("You're not eligible to become a Creator yet — keep growing your followers and views.");
  if (cs === 'suspended') throw badRequest('Your Creator account is under review.');

  // Creator terms must be accepted before activating (either previously, or in
  // this request). Reject rather than silently activating without a terms record.
  const termsOk = !!me.creator_terms_accepted_at || (body.success && body.data.acceptTerms === true);
  if (!termsOk) throw badRequest('Please accept the Creator Terms to continue.');
  if (!me.creator_terms_accepted_at) {
    await supabaseAdmin.from('profiles').update({ creator_terms_accepted_at: new Date().toISOString(), creator_terms_version: '1.0' }).eq('id', userId);
  }
  // Reflect that activation is in progress (eligible → pending) so the UI can
  // show a "finishing setup" state; leaves active/pending as-is.
  if (cs === 'eligible') await supabaseAdmin.from('profiles').update({ creator_status: 'pending' }).eq('id', userId);

  if (!stripeConfigured) {
    // Mock: payouts "complete" instantly → activate monetization AND the Creator tier.
    await supabaseAdmin.from('profiles').update({ monetization_status: 'active' }).eq('id', userId);
    await activateCreator(userId);
    return c.json({ url: null, status: 'active' as const });
  }

  // Stripe failures here used to bubble up as a bare 500 "Something went wrong",
  // which told the creator nothing and hid the real cause (a Stripe 400) behind
  // the generic handler. Surface an actionable message; log the detail server-side.
  try {
    let accountId = me.stripe_account_id as string | null;
    if (!accountId) {
      const { data: auth } = await supabaseAdmin.auth.admin.getUserById(userId);
      // Pass this creator's public profile page (getsizzle.app/u/<handle>) so
      // Stripe can review their content — required for content-platform Connect
      // accounts (the "unique creator URLs via the API" diligence item).
      const handle = (me.handle as string | null) ?? null;
      const profileUrl = handle ? `${env.APP_ORIGIN.replace(/\/$/, '')}/u/${handle}` : null;
      accountId = await createConnectAccount(auth?.user?.email ?? null, profileUrl);
      await supabaseAdmin.from('profiles').update({ stripe_account_id: accountId, monetization_status: 'pending' }).eq('id', userId);
    }
    const url = await createOnboardingLink(accountId);
    return c.json({ url, status: 'pending' as const });
  } catch (err) {
    const detail = (err as Error).message;
    console.error('[monetize] payout onboarding failed:', detail);
    throw badRequest(`Could not start payout setup — ${detail}`);
  }
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
        // Payouts are live → activate the Creator tier (idempotent) + notify.
        await activateCreator(userId);
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
  const [{ data: me }, { data: rows }, { data: agg }, { data: byPostRows }, { data: activeSubRows }, { data: topRows }] = await Promise.all([
    supabaseAdmin.from('profiles').select('monetization_status, sub_price_cents, goal_cents, goal_label, goal_raised_cents, welcome_dm').eq('id', userId).maybeSingle(),
    supabaseAdmin
      .from('tips')
      .select('*')
      .eq('creator_id', userId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(100),
    // Lifetime totals over ALL succeeded tips, not just the newest 100.
    supabaseAdmin.rpc('creator_earnings', { uid: userId }),
    // Net earnings attributed to each recipe (which content actually earns).
    supabaseAdmin.rpc('creator_revenue_by_post', { uid: userId }),
    // Active subscriptions → MRR + subscriber count.
    supabaseAdmin.from('subscriptions').select('price_cents').eq('creator_id', userId).eq('status', 'active'),
    // Biggest supporters by net contribution.
    supabaseAdmin.rpc('creator_top_supporters', { uid: userId }),
  ]);
  const tips = (rows ?? []) as TipRow[];
  const totalsRow = (Array.isArray(agg) ? agg[0] : agg) as { gross_cents: number; fee_cents: number; net_cents: number; tip_count: number } | null;

  // MRR as what the creator receives, computed per-sub (matches how each
  // renewal is split: processing off the top, then the platform share).
  const activeSubList = (activeSubRows ?? []) as { price_cents: number }[];
  const activeSubs = activeSubList.length;
  const mrrCents = activeSubList.reduce((n, s) => n + creatorShareCents(s.price_cents), 0);
  const byPostRaw = (byPostRows ?? []) as { recipe_id: string; net_cents: number; earn_count: number }[];
  const topRaw = (topRows ?? []) as { supporter_id: string; net_cents: number; cnt: number }[];

  const tipperIds = [...new Set([...tips.map((t) => t.tipper_id), ...topRaw.map((t) => t.supporter_id)].filter((x): x is string => !!x))];
  const recipeIds = [...new Set([...tips.map((t) => t.recipe_id), ...byPostRaw.map((b) => b.recipe_id)].filter((x): x is string => !!x))];
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
    mrrCents,
    activeSubs,
    byPost: byPostRaw
      .map((b) => ({ recipeId: b.recipe_id, title: titleMap.get(b.recipe_id) ?? 'Untitled', netCents: Number(b.net_cents), count: Number(b.earn_count) }))
      .sort((a, b) => b.netCents - a.netCents),
    goal: me?.goal_cents != null
      ? { label: (me.goal_label as string) ?? '', targetCents: me.goal_cents as number, raisedCents: (me.goal_raised_cents as number) ?? 0 }
      : null,
    welcomeDm: (me?.welcome_dm as string | null) ?? null,
    topSupporters: topRaw.map((t) => {
      const p = tipperMap.get(t.supporter_id);
      return { user: p ? cookSummary(p) : null, netCents: Number(t.net_cents), count: Number(t.cnt) };
    }),
    tips: dto,
  });
});
