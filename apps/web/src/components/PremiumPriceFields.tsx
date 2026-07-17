import { creatorShareCents, creatorShareCentsIAP, PREMIUM_PRICE_TIERS } from '@sizzle/shared';
import { theme } from '../theme';
import { isNative } from '../lib/native';
import { Button } from './controls';

const accent = theme.accent;

export interface PremiumFieldsValue {
  /** Charge a one-time unlock price. */
  premium: boolean;
  /** Chosen price tier in cents (one of PREMIUM_PRICE_TIERS), or null until picked. */
  priceCents: number | null;
  /** Subscribers-only (an ongoing perk, no per-recipe price). */
  subOnly: boolean;
}

const tierLabel = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Reusable premium-recipe pricing controls, shared by the upload sheet (set at
 * publish) and the edit sheet. Creators pick from a FIXED set of price tiers — Apple
 * requires every purchasable price to be a pre-made In-App Purchase product, so
 * free-text pricing can't map to a purchase. Only a monetization-active creator can
 * price a recipe; otherwise we show a "set up payouts first" nudge (matching the
 * server guard). Purely controlled: the parent owns the value.
 *
 * The take-home line reflects the platform the creator is on: on native, Apple's cut
 * (15% Small Business) then Sizzle's 10%; on web, card processing then Sizzle's 10%.
 */
export function PremiumPriceFields({
  value,
  onChange,
  canMonetize,
  priceErr,
}: {
  value: PremiumFieldsValue;
  onChange: (v: PremiumFieldsValue) => void;
  canMonetize: boolean;
  priceErr?: boolean;
}) {
  if (!canMonetize) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.45 }}>
        💰 Want to charge for this recipe? Set up payouts in <b style={{ color: 'var(--text)' }}>your insights</b> first — then you can make it premium.
      </div>
    );
  }

  const { premium, priceCents, subOnly } = value;
  const takeHome = priceCents != null ? (isNative ? creatorShareCentsIAP(priceCents) : creatorShareCents(priceCents)) : null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ minWidth: 0, paddingRight: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Premium recipe</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.45 }}>Lock the video, ingredients &amp; steps behind a one-time price.</div>
        </div>
        <input type="checkbox" checked={premium} onChange={(e) => onChange({ ...value, premium: e.target.checked })} style={{ width: 20, height: 20, accentColor: accent, flex: 'none', cursor: 'pointer' }} />
      </label>
      {premium && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PREMIUM_PRICE_TIERS.map((t) => {
              const selected = priceCents === t;
              return (
                <Button
                  key={t}
                  onClick={() => onChange({ ...value, priceCents: t })}
                  aria-pressed={selected}
                  style={{
                    flex: 'none', minWidth: 66, height: 40, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 800,
                    border: `1.5px solid ${selected ? accent : priceErr ? 'var(--danger-fg)' : 'var(--line-2)'}`,
                    background: selected ? accent : 'var(--bg)',
                    color: selected ? '#fff' : 'var(--text)',
                    transition: 'background .15s ease, border-color .15s ease',
                  }}
                >
                  {tierLabel(t)}
                </Button>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: priceErr && priceCents == null ? 'var(--danger-fg)' : 'var(--text-faint-2)', fontWeight: priceErr && priceCents == null ? 600 : undefined, marginTop: 9, lineHeight: 1.45 }}>
            {takeHome != null
              ? <>You receive ${(takeHome / 100).toFixed(2)} per unlock, after {isNative ? "Apple’s 15%" : 'card processing'} and Sizzle&rsquo;s 10%.</>
              : <>Pick a price to make this recipe premium.</>}
          </div>
        </div>
      )}
      <div style={{ height: 1, background: 'var(--line)', margin: '14px 0' }} />
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ minWidth: 0, paddingRight: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Subscribers only</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.45 }}>Only your monthly subscribers can watch — everyone else sees a locked teaser inviting them to subscribe.</div>
        </div>
        <input type="checkbox" checked={subOnly} onChange={(e) => onChange({ ...value, subOnly: e.target.checked })} style={{ width: 20, height: 20, accentColor: accent, flex: 'none', cursor: 'pointer' }} />
      </label>
    </div>
  );
}
