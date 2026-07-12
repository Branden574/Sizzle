import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (iOS/Android), false on web. */
export const isNative = Capacitor.isNativePlatform();

/** The platform: 'ios' | 'android' | 'web'. */
export const platform = Capacitor.getPlatform();

/**
 * Master switch for in-app payments. Apple Guideline 3.1.1 and Google Play
 * Billing forbid selling digital goods (subscriptions, recipe unlocks, tips,
 * products) through Stripe inside the native app. For v1 we hide every purchase
 * and creator-payout surface on native and let the web app (getsizzle.app)
 * handle money — creators keep the full 90% with no store cut.
 *
 * This is the single flag that gates all of it. Flip it back to `true` (or wire
 * `!isNative` to real StoreKit / Play Billing) once in-app purchase is built.
 * See docs/app-store-deployment.md §1.
 */
export const showMonetization = !isNative;
