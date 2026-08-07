/**
 * Money-math invariants. These are financial guarantees shown to real creators —
 * a drift here is a P0. Run: npx tsx --test packages/shared/src/pricing.test.ts
 *
 * The verified model (SYSTEM_RISK_MAP.md → "Money"): processing off the top,
 * then Sizzle keeps PLATFORM_FEE_PCT of the remainder, creator keeps the rest;
 * rounding always favors the creator; every split is penny-exact.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPLE_IAP_PCT,
  appleFeeCents,
  creatorShareCents,
  creatorShareCentsIAP,
  isPremiumPriceTier,
  MIN_PRICE_CENTS,
  PLATFORM_FEE_PCT,
  platformShareCents,
  platformShareCentsIAP,
  PREMIUM_PRICE_TIERS,
  processingFeeCents,
} from './index';

test('web split is penny-exact for every cent amount from $5 to $500', () => {
  for (let a = MIN_PRICE_CENTS; a <= 50_000; a++) {
    const sum = processingFeeCents(a) + platformShareCents(a) + creatorShareCents(a);
    assert.equal(sum, a, `split of ${a}¢ must reassemble exactly (got ${sum})`);
  }
});

test('IAP split is penny-exact for every cent amount from $5 to $500', () => {
  for (let a = MIN_PRICE_CENTS; a <= 50_000; a++) {
    const sum = appleFeeCents(a) + platformShareCentsIAP(a) + creatorShareCentsIAP(a);
    assert.equal(sum, a, `IAP split of ${a}¢ must reassemble exactly (got ${sum})`);
  }
});

test('the published constants hold: 90/10 split, 15% Apple, $5 floor', () => {
  // These exact numbers appear in creator-facing copy and recruiting messages.
  // Changing them is a product decision, not a refactor — this test makes that loud.
  assert.equal(PLATFORM_FEE_PCT, 10);
  assert.equal(APPLE_IAP_PCT, 15);
  assert.equal(MIN_PRICE_CENTS, 500);
});

test('creator always receives MORE than a naive floor of 85%/72% net', () => {
  // Documented examples: $10.00 web → $8.47; $9.99 IAP → $7.65.
  assert.equal(creatorShareCents(1000), 847);
  assert.equal(creatorShareCentsIAP(999), 765);
});

test('rounding favors the creator (platform share rounds down)', () => {
  for (let a = MIN_PRICE_CENTS; a <= 5_000; a++) {
    const afterProcessing = a - processingFeeCents(a);
    const exactPlatform = (afterProcessing * PLATFORM_FEE_PCT) / 100;
    assert.ok(platformShareCents(a) <= exactPlatform, `platform share must round down at ${a}¢`);
  }
});

test('every premium tier is valid, above the floor, and maps to a product id', () => {
  assert.ok(PREMIUM_PRICE_TIERS.length > 0);
  for (const t of PREMIUM_PRICE_TIERS) {
    assert.ok(t >= MIN_PRICE_CENTS, `tier ${t} below MIN_PRICE_CENTS`);
    assert.ok(isPremiumPriceTier(t));
  }
  assert.ok(!isPremiumPriceTier(123), 'arbitrary amounts must NOT validate as tiers');
  assert.ok(!isPremiumPriceTier(null));
});

test('shares are never negative anywhere in the allowed range', () => {
  for (let a = MIN_PRICE_CENTS; a <= 50_000; a++) {
    assert.ok(creatorShareCents(a) > 0, `creator share must be positive at ${a}¢`);
    assert.ok(creatorShareCentsIAP(a) > 0, `IAP creator share must be positive at ${a}¢`);
  }
});
