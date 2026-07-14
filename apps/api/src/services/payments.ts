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

export const paymentsProvider: 'stripe' | 'mock' = stripeConfigured ? 'stripe' : 'mock';

/** Create a Stripe Express account for a creator (returns the account id). */
export async function createConnectAccount(email: string | null): Promise<string> {
  const acct = await stripe<{ id: string }>('/accounts', {
    type: 'express',
    ...(email ? { email } : {}),
    'capabilities[transfers][requested]': 'true',
  });
  return acct.id;
}

/** One-time onboarding link for a connected account. */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const link = await stripe<{ url: string }>('/account_links', {
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${env.APP_ORIGIN}/?payouts=refresh`,
    return_url: `${env.APP_ORIGIN}/?payouts=done`,
  });
  return link.url;
}

/** Whether the connected account has finished onboarding and can receive transfers. */
export async function accountActive(accountId: string): Promise<boolean> {
  const acct = await stripeGet<{ charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean }>(`/accounts/${accountId}`);
  return !!acct.details_submitted && (!!acct.charges_enabled || !!acct.payouts_enabled);
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
