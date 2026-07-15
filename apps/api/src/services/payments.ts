/**
 * Creator payments (tips) via Stripe Connect. Sizzle keeps PLATFORM_FEE_PCT of
 * every tip as an application fee — disclosed to both sides in the UI — and the
 * rest transfers to the creator's connected account. Card processing comes out
 * of the platform fee (destination charge), not the creator's share.
 *
 * Provider selection mirrors video hosting: real Stripe when STRIPE_SECRET_KEY
 * is set, otherwise a mock that succeeds instantly (clearly labelled test mode)
 * so the whole flow works in dev without keys. Stripe is called with plain
 * fetch (form-encoded), consistent with the OpenAI/FCM/Cloudflare services.
 */
import { env, stripeConfigured } from '../env';

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`stripe ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

/** Cancel a subscription at period end (the fan keeps access until they've used the month). */
export async function cancelSubscriptionAtPeriodEnd(subId: string): Promise<void> {
  await stripe(`/subscriptions/${subId}`, { cancel_at_period_end: 'true' });
}

async function stripeGet<T>(path: string, account?: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      // Act on behalf of a connected account (Connect) when given one.
      ...(account ? { 'stripe-account': account } : {}),
    },
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`stripe ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

/* ───────────────────────────── Stripe API v2 ─────────────────────────────
 * Accounts moved to a v2 namespace: platforms created after Accounts v2 went GA
 * (ours was) get a hard 400 from POST /v1/accounts — "Stripe no longer
 * recommends Accounts v1 for new Connect integrations". Only ACCOUNT
 * management moves; the money path (Checkout + destination charges) stays on v1
 * because a v2 account is still an ordinary `acct_*` that v1 accepts verbatim as
 * transfer_data[destination].
 *
 * v2 is JSON on a different base URL and needs real nested objects + booleans,
 * which URLSearchParams can't express — hence a separate helper rather than
 * bending stripe(). Keeping v2 isolated here caps the blast radius if the
 * contract shifts.
 */
const STRIPE_V2_API = 'https://api.stripe.com/v2';

/** Pinned + env-overridable on purpose: sources disagree on whether Accounts v2
 *  needs the GA (`.dahlia`) or a `.preview` version string. If Stripe 400s asking
 *  for a preview version, set STRIPE_V2_API_VERSION — no code change needed. */
const STRIPE_V2_VERSION = env.STRIPE_V2_API_VERSION ?? '2026-06-24.dahlia';

/** v2 surfaces errors as top-level {type,code,message}, not v1's {error:{message}}. */
type StripeV2Err = { type?: string; code?: string; message?: string; error?: { message?: string } };

async function stripeV2<T>(path: string, body?: unknown, method: 'POST' | 'GET' = 'POST'): Promise<T> {
  const res = await fetch(`${STRIPE_V2_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_V2_VERSION,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const data = (await res.json()) as T & StripeV2Err;
  // Handle BOTH envelope shapes or v2 failures degrade to a bare status code.
  if (!res.ok) {
    const msg = data.message ?? data.error?.message ?? [data.type, data.code].filter(Boolean).join(' ');
    throw new Error(`stripe v2 ${path}: ${msg || res.status}`);
  }
  return data;
}

export const paymentsProvider: 'stripe' | 'mock' = stripeConfigured ? 'stripe' : 'mock';

/**
 * Create a connected account for a creator (returns the account id).
 *
 * Accounts v2. The id is an ordinary `acct_*` and is still handed verbatim to the
 * v1 Checkout calls below as transfer_data[destination] — the destination-charge
 * model is unchanged.
 *
 * `recipient` is the right configuration: Sizzle takes the charge on the PLATFORM
 * and transfers out, so creators receive funds but are never merchant of record.
 * (`merchant` would only be needed if we passed on_behalf_of.)
 */
export async function createConnectAccount(email: string | null): Promise<string> {
  // contact_email is MANDATORY whenever configuration.recipient is supplied —
  // verified against the live API, which rejects with "If configuration.recipient
  // is supplied, the Account must have a contact email". Fail with something the
  // creator can act on rather than letting Stripe return an opaque 400.
  if (!email) throw new Error('We need an email address on your account before you can set up payouts.');
  const acct = await stripeV2<{ id: string }>('/core/accounts', {
    contact_email: email,
    // Replaces v1 `type: 'express'` — gives creators the Express hosted dashboard
    // and is what makes /v1/accounts/{id}/login_links eligible below.
    dashboard: 'express',
    identity: { country: 'us' },
    defaults: {
      currency: 'usd',
      // REQUIRED and PERMANENT — cannot be changed after creation. 'application'
      // = Sizzle pays Stripe's fees and eats chargebacks / fraud / negative
      // balances. That matches this file's model (processing comes out of our
      // platform fee, not the creator's share) and is Stripe's own guidance for
      // destination charges. It's also what we're already liable for today: with
      // destination charges the platform is merchant of record either way.
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
    },
    configuration: {
      recipient: {
        capabilities: {
          // Replaces v1 capabilities[transfers][requested]. This exact path is the
          // ONLY requestable capability under recipient — do NOT add `payouts` or
          // `bank_accounts`: payouts is response-side only (Stripe derives it) and
          // requesting it 400s. Bank details are collected by hosted onboarding.
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    // v2 returns null for any sub-object not named here — only `id` is safe without it.
    include: ['configuration.recipient', 'identity', 'requirements'],
  });
  return acct.id;
}

/**
 * One-time hosted-onboarding link for a connected account. Tries the v2 endpoint
 * and falls back to v1: the docs conflict on whether /v2/core/account_links is
 * live yet, and v1 /account_links still accepts a v2 account id — so we try the
 * forward-looking path but never strand a creator if it 404s.
 */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const refresh_url = `${env.APP_ORIGIN}/?payouts=refresh`;
  const return_url = `${env.APP_ORIGIN}/?payouts=done`;
  try {
    const link = await stripeV2<{ url: string }>('/core/account_links', {
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        // NB: refresh/return are nested under use_case in v2, not top-level as in v1.
        account_onboarding: { configurations: ['recipient'], refresh_url, return_url },
      },
    });
    if (link.url) return link.url;
    throw new Error('v2 account_links returned no url');
  } catch (err) {
    console.warn('[payments] v2 account_links failed, falling back to v1:', (err as Error).message);
    const link = await stripe<{ url: string }>('/account_links', {
      account: accountId,
      type: 'account_onboarding',
      refresh_url,
      return_url,
    });
    return link.url;
  }
}

/**
 * Whether the connected account finished onboarding and can receive transfers.
 *
 * Reads the v2 capability status rather than v1's details_submitted/charges_enabled
 * booleans: a recipient-only account is never merchant of record, so charges_enabled
 * is not a meaningful signal for it. `stripe_transfers.status === 'active'` is the
 * thing that actually gates money reaching the creator.
 *
 * The include[] params are load-bearing: without them v2 nulls out
 * configuration.recipient and this silently returns false forever.
 */
export async function accountActive(accountId: string): Promise<boolean> {
  const acct = await stripeV2<{
    configuration?: { recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } } };
  }>(`/core/accounts/${accountId}?include[0]=configuration.recipient&include[1]=requirements`, undefined, 'GET');
  return acct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active';
}

/** The connected account's live balance (USD cents), summed across the currency
 *  buckets Stripe returns. `available` can be paid out now; `pending` is still
 *  clearing. Queried on the connected account so it reflects the creator's own
 *  Stripe balance, not the platform's. */
export async function stripeBalance(accountId: string): Promise<{ availableCents: number; pendingCents: number }> {
  const bal = await stripeGet<{ available?: Array<{ amount: number }>; pending?: Array<{ amount: number }> }>('/balance', accountId);
  const sum = (arr?: Array<{ amount: number }>) => (arr ?? []).reduce((n, b) => n + (b.amount || 0), 0);
  return { availableCents: sum(bal.available), pendingCents: sum(bal.pending) };
}

/** A single-use login link to the creator's Stripe Express dashboard (where they
 *  manage bank details, see payouts, and download tax forms). */
export async function createDashboardLink(accountId: string): Promise<string> {
  const link = await stripe<{ url: string }>(`/accounts/${accountId}/login_links`, {});
  return link.url;
}

/**
 * Stripe Checkout session for a tip: the tipper pays `amountCents`, Sizzle
 * keeps `feeCents` as the application fee, the rest lands in the creator's
 * connected account (destination charge). Returns the hosted checkout URL.
 */
export async function createOneOffCheckout(opts: {
  ledgerId: string;
  amountCents: number;
  feeCents: number;
  creatorAccountId: string;
  productName: string;
}): Promise<{ sessionId: string; url: string }> {
  const session = await stripe<{ id: string; url: string }>('/checkout/sessions', {
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(opts.amountCents),
    'line_items[0][price_data][product_data][name]': opts.productName,
    'line_items[0][quantity]': '1',
    'payment_intent_data[application_fee_amount]': String(opts.feeCents),
    'payment_intent_data[transfer_data][destination]': opts.creatorAccountId,
    'metadata[tip_id]': opts.ledgerId,
    // 30 min (Stripe's minimum): an abandoned checkout expires quickly, which
    // fires checkout.session.expired → we drop the pending row, so the buyer can
    // start a fresh unlock instead of being blocked by the in-flight guard.
    expires_at: String(Math.floor(Date.now() / 1000) + 1800),
    success_url: `${env.APP_ORIGIN}/?tip=thanks`,
    cancel_url: `${env.APP_ORIGIN}/?tip=cancelled`,
  });
  return { sessionId: session.id, url: session.url };
}

/**
 * Recurring subscription Checkout: the fan is billed `priceCents`/month, Sizzle
 * keeps `feePct`% of each renewal as the application fee, the rest transfers to
 * the creator's connected account. Metadata links the sub back to our rows.
 */
export async function createSubscriptionCheckout(opts: {
  creatorAccountId: string;
  priceCents: number;
  feePct: number;
  creatorName: string;
  creatorId: string;
  subscriberId: string;
}): Promise<{ url: string }> {
  const session = await stripe<{ url: string }>('/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(opts.priceCents),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': `${opts.creatorName} — monthly on Sizzle`,
    'line_items[0][quantity]': '1',
    'subscription_data[application_fee_percent]': String(opts.feePct),
    'subscription_data[transfer_data][destination]': opts.creatorAccountId,
    'subscription_data[metadata][creator_id]': opts.creatorId,
    'subscription_data[metadata][subscriber_id]': opts.subscriberId,
    'metadata[creator_id]': opts.creatorId,
    'metadata[subscriber_id]': opts.subscriberId,
    success_url: `${env.APP_ORIGIN}/?sub=thanks`,
    cancel_url: `${env.APP_ORIGIN}/?sub=cancelled`,
  });
  return { url: session.url };
}
