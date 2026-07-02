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
  tipper_id: string;
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

  // The ledger row records the exact split: gross = fee (5.5%, Sizzle) + net (creator).
  const feeCents = platformFeeCents(amountCents);
  const netCents = amountCents - feeCents;
  const { data: tip, error } = await supabaseAdmin
    .from('tips')
    .insert({
      tipper_id: userId,
      creator_id: creatorId,
      recipe_id: recipeId ?? null,
      amount_cents: amountCents,
      fee_cents: feeCents,
      net_cents: netCents,
      provider: paymentsProvider,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !tip) throw dbFail(error?.message ?? 'Could not create tip');

  if (stripeConfigured && creator.stripe_account_id) {
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

  // Mock provider: settle instantly (test mode — no real money moves).
  await supabaseAdmin
    .from('tips')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), provider_ref: `mock_${tip.id}` })
    .eq('id', tip.id);
  await notify({ userId: creatorId, type: 'tip', actorId: userId, recipeId: recipeId ?? null }).catch(() => {});
  return c.json({ url: null, status: 'succeeded' as const });
});

/** POST /monetize/webhook/stripe — checkout.session.completed settles the tip. */
monetize.post('/webhook/stripe', async (c) => {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured || !secret) {
    return c.json({ error: { code: 'forbidden', message: 'Webhook not enabled' } }, 403);
  }

  // Stripe signs with header "Stripe-Signature: t=<ts>,v1=<hmac>[,v1=…]".
  const raw = await c.req.text();
  const header = c.req.header('stripe-signature') ?? '';
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1] ?? '';
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const valid = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!valid) return c.json({ error: { code: 'unauthorized', message: 'Bad signature' } }, 401);

  const event = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string; metadata?: { tip_id?: string } } } };
  if (event.type === 'checkout.session.completed') {
    const tipId = event.data?.object?.metadata?.tip_id;
    if (tipId && /^[0-9a-f-]{36}$/i.test(tipId)) {
      // Idempotent: only a pending row settles (Stripe retries webhooks).
      const { data: settled } = await supabaseAdmin
        .from('tips')
        .update({ status: 'succeeded', succeeded_at: new Date().toISOString() })
        .eq('id', tipId)
        .eq('status', 'pending')
        .select('creator_id, tipper_id, recipe_id')
        .maybeSingle();
      if (settled) {
        await notify({
          userId: settled.creator_id as string,
          type: 'tip',
          actorId: settled.tipper_id as string,
          recipeId: (settled.recipe_id as string | null) ?? null,
        }).catch(() => {});
      }
    }
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
  const [{ data: me }, { data: rows }] = await Promise.all([
    supabaseAdmin.from('profiles').select('monetization_status').eq('id', userId).maybeSingle(),
    supabaseAdmin
      .from('tips')
      .select('*')
      .eq('creator_id', userId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const tips = (rows ?? []) as TipRow[];

  const tipperIds = [...new Set(tips.map((t) => t.tipper_id))];
  const recipeIds = [...new Set(tips.map((t) => t.recipe_id).filter((x): x is string => !!x))];
  const [{ data: tippers }, { data: recipes }] = await Promise.all([
    tipperIds.length ? supabaseAdmin.from('profiles').select('*').in('id', tipperIds) : Promise.resolve({ data: [] }),
    recipeIds.length ? supabaseAdmin.from('recipes').select('id, title').in('id', recipeIds) : Promise.resolve({ data: [] }),
  ]);
  const tipperMap = new Map((tippers ?? []).map((p) => [p.id as string, p as ProfileRow]));
  const titleMap = new Map((recipes ?? []).map((r) => [r.id as string, r.title as string]));

  const dto: TipDTO[] = tips.map((t) => {
    const from = tipperMap.get(t.tipper_id);
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
  const sum = (k: 'amount_cents' | 'fee_cents' | 'net_cents') => tips.reduce((n, t) => n + t[k], 0);
  return c.json<EarningsSummary>({
    monetization: ((me?.monetization_status as string) ?? 'none') as EarningsSummary['monetization'],
    feePct: PLATFORM_FEE_PCT,
    totals: { grossCents: sum('amount_cents'), feeCents: sum('fee_cents'), netCents: sum('net_cents'), tipCount: tips.length },
    tips: dto,
  });
});
