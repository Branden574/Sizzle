import { Hono } from 'hono';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PLATFORM_FEE_PCT, platformFeeCents, type EarningsSummary, type TipConfig, type TipDTO } from '@sizzle/shared';
import { requireAuth, requireNotBanned } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { env, stripeConfigured } from '../env';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { cookSummary, loadBlockedIds, type ProfileRow } from '../mappers';
import { notify } from '../services/notify';
import { accountActive, createConnectAccount, createOnboardingLink, createTipCheckout, paymentsProvider } from '../services/payments';
import type { AppEnv } from '../types';

export const monetize = new Hono<AppEnv>();

/** Tip guardrails (cents). */
const MIN_TIP = 100; // $1
const MAX_TIP = 50_000; // $500
const PRESETS = [100, 300, 500, 1000];

interface TipRow {
  id: string;
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
      const { sessionId, url } = await createTipCheckout({
        tipId: tip.id as string,
        amountCents,
        feeCents,
        creatorAccountId: creator.stripe_account_id as string,
        creatorName: (creator.display_name as string) || 'a Sizzle creator',
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

/** Mark a tip succeeded (idempotent — only a pending row settles) + notify. */
async function settleTip(tipId: string, paymentIntent: string | null): Promise<void> {
  const { data: settled, error } = await supabaseAdmin
    .from('tips')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), provider_ref: paymentIntent ?? undefined })
    .eq('id', tipId)
    .eq('status', 'pending')
    .select('creator_id, tipper_id, recipe_id')
    .maybeSingle();
  if (error) throw error; // surfaced as 500 so Stripe retries
  if (settled) {
    await notify({
      userId: settled.creator_id as string,
      type: 'tip',
      actorId: (settled.tipper_id as string | null) ?? settled.creator_id as string,
      recipeId: (settled.recipe_id as string | null) ?? null,
    }).catch(() => {});
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

  const event = JSON.parse(raw) as {
    type?: string;
    data?: { object?: { id?: string; payment_status?: string; payment_intent?: string; metadata?: { tip_id?: string } } };
  };
  const obj = event.data?.object;
  const tipId = obj?.metadata?.tip_id;
  const validTipId = tipId && /^[0-9a-f-]{36}$/i.test(tipId) ? tipId : null;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        // Only settle a genuinely PAID session (async methods complete later).
        if (validTipId && obj?.payment_status === 'paid') await settleTip(validTipId, obj?.payment_intent ?? null);
        break;
      case 'checkout.session.async_payment_succeeded':
        if (validTipId) await settleTip(validTipId, obj?.payment_intent ?? null);
        break;
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        // Never paid → drop the pending row so it can't linger or mis-count.
        if (validTipId) await supabaseAdmin.from('tips').delete().eq('id', validTipId).eq('status', 'pending');
        break;
      case 'charge.refunded':
      case 'charge.dispute.created':
        // Map back via the payment_intent we stored at settle time.
        if (obj?.payment_intent) {
          await supabaseAdmin
            .from('tips')
            .update({ status: 'refunded' })
            .eq('provider_ref', obj.payment_intent)
            .eq('status', 'succeeded');
        }
        break;
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
    supabaseAdmin.from('profiles').select('monetization_status').eq('id', userId).maybeSingle(),
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
    totals: {
      grossCents: totalsRow?.gross_cents ?? 0,
      feeCents: totalsRow?.fee_cents ?? 0,
      netCents: totalsRow?.net_cents ?? 0,
      tipCount: totalsRow?.tip_count ?? 0,
    },
    tips: dto,
  });
});
