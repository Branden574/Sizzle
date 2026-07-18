import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** True when running inside the Capacitor native shell (iOS/Android), false on web. */
export const isNative = Capacitor.isNativePlatform();

/** The platform: 'ios' | 'android' | 'web'. */
export const platform = Capacitor.getPlatform();

/**
 * FAN-SIDE PURCHASES — tipping, subscribing, unlocking a premium recipe, buying
 * a product. Apple Guideline 3.1.1 and Google Play Billing require their OWN
 * in-app purchase for digital goods bought inside a native app, so every "spend
 * money" surface stays web-only (getsizzle.app) on native. This is the rule that
 * forced Patreon onto IAP — shipping Stripe checkout in-app gets the app pulled.
 *
 * Flip to `true` (or wire to real StoreKit / Play Billing) once IAP is built.
 * See docs/app-store-deployment.md §1.
 */
export const canBuyInApp = !isNative;

/**
 * True only where Apple IAP is actually usable: native AND the RevenueCat
 * ('Purchases') plugin is compiled into THIS binary. An OTA JS bundle can land on
 * an OLDER native build that predates the plugin — there the native purchase bridge
 * doesn't exist, so any in-app Unlock button must hide (falling back to no in-app
 * buy) rather than crash on tap. Build 29+ ships the plugin; earlier builds don't.
 */
export const iapAvailable = isNative && Capacitor.isPluginAvailable('Purchases');

/**
 * CREATOR-SIDE MONEY TOOLING — your own earnings, payout setup, subscription
 * price, tiers, products, goals. Money flowing TO the creator is not a purchase,
 * so the stores don't require IAP here — the same reason TikTok, Instagram and
 * YouTube all show creator earnings inside their native apps. Available on every
 * platform; creators shouldn't need a laptop to run their business.
 */
export const showCreatorMoney = true;

/**
 * Open an external URL correctly per platform: an in-app browser sheet
 * (SFSafariViewController on iOS / Custom Tab on Android) on native, a new tab
 * on web. NEVER navigate the native WebView itself to an external URL — that
 * strands the user outside the app with no way back.
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative) await Browser.open({ url, presentationStyle: 'fullscreen' });
  else window.open(url, '_blank', 'noopener');
}

/**
 * Fires when the in-app browser sheet is dismissed. Returns an unsubscribe fn.
 *
 * Needed because the sheet is presented OVER the WKWebView rather than
 * backgrounding it, so the page underneath may never see visibilitychange or
 * focus when the user comes back — leaving the app showing stale state until it's
 * force-quit. `browserFinished` is the dependable signal on native. No-op on web,
 * where visibilitychange/focus already work.
 */
export function onExternalBrowserClosed(fn: () => void): () => void {
  if (!isNative) return () => {};
  const handle = Browser.addListener('browserFinished', fn);
  return () => { void handle.then((h) => h.remove()).catch(() => {}); };
}
