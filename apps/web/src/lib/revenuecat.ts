import { iapAvailable } from './native';

/**
 * RevenueCat (Apple In-App Purchase) wrapper for premium recipe unlocks.
 *
 * All calls are native-only and dynamically import the plugin, so the web bundle
 * never loads StoreKit code and web keeps its Stripe flow untouched. The public SDK
 * key is safe to embed — RevenueCat public keys are designed to ship in the binary;
 * the receipt is validated server-side (the /iap/confirm endpoint verifies the
 * purchase against RevenueCat before granting anything).
 */
const APPLE_SDK_KEY = 'appl_jDBNTyaLxRLTrUVzHrQRoFoAyQJ';

let configuredFor: string | null = null;

/** Configure RevenueCat for the signed-in user (idempotent; re-logins on user change).
 *  No-op on web. Tying the RevenueCat app-user-id to our user id is what lets the
 *  server map a purchase back to the buyer. */
export async function initRevenueCat(userId: string): Promise<void> {
  if (!iapAvailable || !userId || configuredFor === userId) return;
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    if (configuredFor === null) {
      await Purchases.configure({ apiKey: APPLE_SDK_KEY, appUserID: userId });
    } else {
      await Purchases.logIn({ appUserID: userId });
    }
    configuredFor = userId;
  } catch (err) {
    console.warn('[revenuecat] configure/login failed', err);
  }
}

/** Detach the RevenueCat user on logout so the next account's purchases don't merge. */
export async function logoutRevenueCat(): Promise<void> {
  if (!iapAvailable || configuredFor === null) return;
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await Purchases.logOut();
  } catch (err) {
    console.warn('[revenuecat] logout failed', err);
  }
  configuredFor = null;
}

export type PurchaseOutcome = 'purchased' | 'cancelled';

/**
 * Buy a premium-unlock consumable by product id. Resolves 'purchased' on success,
 * 'cancelled' if the buyer backed out of the Apple sheet, and throws on a real store
 * error. Native only — the caller then calls /iap/confirm so the SERVER verifies the
 * purchase and grants the unlock (never trust this client result alone).
 */
export async function purchaseUnlock(productId: string): Promise<PurchaseOutcome> {
  if (!iapAvailable) throw new Error('In-app purchases aren’t available in this version of the app.');
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
  const product = products[0];
  if (!product) throw new Error('This unlock is temporarily unavailable — try again shortly.');
  try {
    await Purchases.purchaseStoreProduct({ product });
    return 'purchased';
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return 'cancelled';
    throw err;
  }
}
