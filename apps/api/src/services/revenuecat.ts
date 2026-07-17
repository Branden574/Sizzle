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

/** The idempotency key for a consumable purchase — Apple's store transaction id
 *  when present, else RevenueCat's transaction id. */
export function txnId(p: RCNonSubscription): string {
  return p.store_transaction_id ?? p.id;
}
