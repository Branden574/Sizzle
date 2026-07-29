import { env } from '../env';

const RC_BASE = 'https://api.revenuecat.com/v1';

/** One consumable (non-subscription) purchase as RevenueCat reports it. */
export interface RCNonSubscription {
  /** RevenueCat's transaction id (fallback idempotency key). */
  id: string;
  /** Apple's store transaction id — the idempotency key we prefer + the refund
   *  webhook matches on. */
  store_transaction_id?: string;
  purchase_date: string;
  store?: string;
  is_sandbox?: boolean;
}

/** fetch with an AbortController timeout — RevenueCat must never stall a purchase confirm. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a subscriber's non-subscription (consumable) purchases from RevenueCat,
 * keyed by product id, using the SECRET v1 REST key. This is the server-authoritative
 * proof that a purchase actually happened (RevenueCat has already validated the Apple
 * receipt) — the confirm endpoint never trusts the client that a purchase occurred.
 * Returns {} when RevenueCat isn't configured.
 */
export async function fetchNonSubscriptions(appUserId: string): Promise<Record<string, RCNonSubscription[]>> {
  if (!env.REVENUECAT_API_KEY) return {};
  const res = await fetchWithTimeout(
    `${RC_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}` } },
    8_000,
  );
  if (!res.ok) throw new Error(`RevenueCat subscriber fetch → HTTP ${res.status}`);
  const json = (await res.json()) as { subscriber?: { non_subscriptions?: Record<string, RCNonSubscription[]> } };
  return json.subscriber?.non_subscriptions ?? {};
}

// NOTE: there is deliberately no shared `txnId(p)` helper here. The idempotency key for a
// consumable purchase is Apple's `store_transaction_id` and ONLY that: routes/monetize.ts
// filters out any purchase lacking one (:335) rather than falling back to RevenueCat's own
// id, because that fallback would let a purchase with no Apple transaction id unlock content
// and would not match the refund webhook, which keys off the same Apple id.
