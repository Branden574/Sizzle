/**
 * Creator payments (tips) via Stripe Connect. Sizzle keeps PLATFORM_FEE_PCT
 * (5.5%) of every tip as an application fee — disclosed to both sides in the
 * UI — and the rest transfers to the creator's connected account.
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

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
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

/**
 * Stripe Checkout session for a tip: the tipper pays `amountCents`, Sizzle
 * keeps `feeCents` as the application fee, the rest lands in the creator's
 * connected account (destination charge). Returns the hosted checkout URL.
 */
export async function createTipCheckout(opts: {
  tipId: string;
  amountCents: number;
  feeCents: number;
  creatorAccountId: string;
  creatorName: string;
}): Promise<{ sessionId: string; url: string }> {
  const session = await stripe<{ id: string; url: string }>('/checkout/sessions', {
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(opts.amountCents),
    'line_items[0][price_data][product_data][name]': `Tip for ${opts.creatorName} on Sizzle`,
    'line_items[0][quantity]': '1',
    'payment_intent_data[application_fee_amount]': String(opts.feeCents),
    'payment_intent_data[transfer_data][destination]': opts.creatorAccountId,
    'metadata[tip_id]': opts.tipId,
    success_url: `${env.APP_ORIGIN}/?tip=thanks`,
    cancel_url: `${env.APP_ORIGIN}/?tip=cancelled`,
  });
  return { sessionId: session.id, url: session.url };
}
