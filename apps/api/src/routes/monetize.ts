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
import { canViewCookContent, cookSummary, loadBlockedIds, type ProfileRow } from '../mappers';
import { notify, systemNotify } from '../services/notify';
import { moderate } from '../services/moderation';
import { accountActive, cancelSubscriptionAtPeriodEnd, createConnectAccount, createDashboardLink, createOnboardingLink, createOneOffCheckout, createSubscriptionCheckout, paymentsProvider, stripeBalance } from '../services/payments';
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

/** GET /monetize/payout — the creator's balance + next payout + dashboard link.
 *  Mock derives the balance from lifetime net earnings; the real Stripe balance
 *  API + Express dashboard link wire up when STRIPE_SECRET_KEY is set. */
monetize.get('/payout', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  // Next automatic payout: the upcoming Friday (Stripe's default weekly schedule).
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));

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
          nextPayoutDate: next.toISOString(),
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
    nextPayoutDate: next.toISOString(),
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
  priceCents: z.number().int().min(100).max(50_000_00),
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
  const feeCents = platformFeeCents(priceCents);
  if (!stripeConfigured) {
    // Mock: grant + record instantly.
    await supabaseAdmin.from('product_purchases').upsert({ user_id: userId, product_id: id }, { onConflict: 'user_id,product_id' });
    await supabaseAdmin.from('tips').insert({ tipper_id: userId, creator_id: prod.creator_id, product_id: id, amount_cents: priceCents, fee_cents: feeCents, net_cents: priceCents - feeCents, provider: 'mock', status: 'succeeded', succeeded_at: new Date().toISOString(), kind: 'product' });
    await bumpGoal(prod.creator_id as string, priceCents - feeCents);
    await notify({ userId: prod.creator_id as string, type: 'tip', actorId: userId }).catch(() => {});
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
  const { url } = await createOneOffCheckout({ ledgerId: row.id, amountCents: priceCents, feeCents, creatorAccountId: creator.stripe_account_id as string, productName: prod.title as string });
  return c.json({ url, status: 'pending' as const });
});

const tierSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceCents: z.number().int().min(100).max(50_000),
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
  const { data: existing } = await supabaseAdmin.from('subscriptions').select('id, status').eq('subscriber_id', userId).eq('creator_id', creatorId).maybeSingle();
  if (existing && existing.status === 'active') return c.json({ url: null, status: 'active' as const });

  if (!stripeConfigured) {
    // Mock: activate + record the first month instantly (no provider_ref → no unique clash on re-sub).
    const feeCents = platformFeeCents(priceCents);
    await supabaseAdmin.from('subscriptions').upsert(
      { subscriber_id: userId, creator_id: creatorId, price_cents: priceCents, tier_id: tierId, status: 'active', current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      { onConflict: 'subscriber_id,creator_id' },
    );
    await supabaseAdmin.from('tips').insert({ tipper_id: userId, creator_id: creatorId, amount_cents: priceCents, fee_cents: feeCents, net_cents: priceCents - feeCents, provider: 'mock', status: 'succeeded', succeeded_at: new Date().toISOString(), kind: 'subscription' });
    await bumpGoal(creatorId, priceCents - feeCents);
    await sendWelcomeDm(creatorId, userId);
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
    .select('creator_id, tipper_id, recipe_id, kind, net_cents, product_id')
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
          if (!insErr) {
            await bumpGoal(meta!.creator_id, amount - feeCents);
            await notify({ userId: meta!.creator_id, type: 'tip', actorId: meta!.subscriber_id }).catch(() => {});
          }
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
  const body = z.object({ acceptTerms: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('monetization_status, stripe_account_id, creator_status, creator_terms_accepted_at')
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
      accountId = await createConnectAccount(auth?.user?.email ?? null);
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

  // MRR net of the platform fee, computed per-sub (matches how each charge is split).
  const activeSubList = (activeSubRows ?? []) as { price_cents: number }[];
  const activeSubs = activeSubList.length;
  const mrrCents = activeSubList.reduce((n, s) => n + (s.price_cents - Math.floor((s.price_cents * PLATFORM_FEE_PCT) / 100)), 0);
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
