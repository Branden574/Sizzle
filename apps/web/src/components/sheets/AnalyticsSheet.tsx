import { useState } from 'react';
import { PLATFORM_FEE_PCT, PLATFORM_FEE_RATIONALE, type EarningKind, type EarningsSummary } from '@sizzle/shared';
import { useAnalytics, useEarnings, useMonetizationStatus, useSetSubPrice, useStartOnboarding } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { theme } from '../../theme';
import { CloseIcon } from '../icons';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Short label for a ledger row by earning type. */
const KIND_LABEL: Record<EarningKind, string> = { support: 'Support', subscription: 'Subscription', unlock: 'Recipe unlock' };

/** Creator insights — totals + per-post engagement. Opened from your profile. */
export function AnalyticsSheet() {
  const setShowAnalytics = useSizzle((s) => s.setShowAnalytics);
  const { data, isLoading } = useAnalytics(true);
  const close = () => setShowAnalytics(false);
  const t = data?.totals;
  const cards = [
    { label: 'Followers', value: t?.followers ?? 0 },
    { label: 'Posts', value: t?.recipes ?? 0 },
    { label: 'Likes', value: t?.likes ?? 0 },
    { label: 'Comments', value: t?.comments ?? 0 },
    { label: 'Saves', value: t?.saves ?? 0 },
    { label: 'Shares', value: t?.shares ?? 0 },
  ];
  const posts = data?.posts ?? [];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '86%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Your insights</div>
          <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 30px' }}>
          {isLoading ? (
            <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16 }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                {cards.map((c) => (
                  <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 12px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)' }}>{formatCount(c.value)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              <Earnings />

              <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Per post</div>
              {posts.length === 0 ? (
                <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16, textAlign: 'center' }}>Post a recipe to see its stats here.</div>
              ) : (
                posts.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    <PostStat glyph="♥" n={p.likes} />
                    <PostStat glyph="💬" n={p.comments} />
                    <PostStat glyph="🔖" n={p.saves} />
                    <PostStat glyph="↗" n={p.shares} />
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PostStat({ glyph, n }: { glyph: string; n: number }) {
  return <div style={{ minWidth: 46, textAlign: 'right', fontSize: 13, color: 'var(--text-faint)' }}>{glyph} {formatCount(n)}</div>;
}

/**
 * Earnings — support, subscriptions, and recipe unlocks, with the 10% platform
 * fee broken out on every surface (totals AND each earning) plus the full
 * why-this-is-fair rationale. Creators should never wonder where a cent went.
 */
function Earnings() {
  const status = useMonetizationStatus(true);
  const { data } = useEarnings(status.data?.status === 'active');
  const onboard = useStartOnboarding();
  const st = status.data?.status ?? 'none';

  const startPayouts = () => {
    if (onboard.isPending) return;
    onboard.mutate(undefined, {
      onSuccess: (res) => { if (res.url) window.open(res.url, '_blank', 'noopener'); },
    });
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Earnings</div>

      {st !== 'active' ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Get paid for your cooking</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 10px', lineHeight: 1.5 }}>
            Turn on payouts to earn from monthly subscriptions, premium recipes, and one-off support. You keep {100 - PLATFORM_FEE_PCT}% of everything.
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint-2)', lineHeight: 1.55, marginBottom: 12 }}>{PLATFORM_FEE_RATIONALE}</div>
          <button
            onClick={startPayouts}
            disabled={onboard.isPending || st === 'pending'}
            style={{ width: '100%', height: 48, border: 'none', borderRadius: 14, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 800, cursor: 'pointer', opacity: onboard.isPending ? 0.7 : 1 }}
          >
            {st === 'pending' ? 'Finishing setup… (complete the Stripe form)' : onboard.isPending ? 'Starting…' : 'Set up payouts'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>You've earned</span>
              <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)' }}>{usd(data?.totals.netCents ?? 0)}</span>
            </div>
            <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
            <Row label={`Payments received (${data?.totals.tipCount ?? 0})`} value={usd(data?.totals.grossCents ?? 0)} />
            <Row label={`Sizzle platform fee (${PLATFORM_FEE_PCT}%)`} value={`− ${usd(data?.totals.feeCents ?? 0)}`} faint />
            <Row label="You keep" value={usd(data?.totals.netCents ?? 0)} bold />
            <div style={{ fontSize: 12, color: 'var(--text-faint-2)', lineHeight: 1.55, marginTop: 10 }}>{PLATFORM_FEE_RATIONALE}</div>
          </div>

          <SubPriceEditor data={data} />

          {(data?.tips ?? []).slice(0, 20).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.from?.name ?? 'Someone'}{t.recipeTitle ? ` · ${t.recipeTitle}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>{KIND_LABEL[t.kind]} · {t.time} · {usd(t.amountCents)} − {usd(t.feeCents)} fee</div>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1f9d55' }}>+{usd(t.netCents)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Set (or clear) your monthly subscription price. $0/blank turns subscriptions off. */
function SubPriceEditor({ data }: { data: EarningsSummary | undefined }) {
  const setSubPrice = useSetSubPrice();
  const current = data?.subPriceCents ?? null;
  const [editing, setEditing] = useState(false);
  const [dollars, setDollars] = useState('');

  const open = () => { setDollars(current != null ? (current / 100).toFixed(2) : ''); setEditing(true); };
  const save = () => {
    const n = Math.round(parseFloat(dollars) * 100);
    const priceCents = Number.isFinite(n) && n >= 100 ? Math.min(n, 50_000) : null;
    setSubPrice.mutate(priceCents, { onSuccess: () => setEditing(false) });
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Monthly subscription</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>
            {current != null ? `Fans can subscribe for ${usd(current)}/mo — you keep ${usd(current - Math.floor((current * PLATFORM_FEE_PCT) / 100))}.` : 'Off — set a price to let fans subscribe monthly.'}
          </div>
        </div>
        {!editing && (
          <button onClick={open} style={{ flex: 'none', height: 36, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>
            {current != null ? 'Edit' : 'Set price'}
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, background: 'var(--bg)', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '0 12px' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-faint)' }}>$</span>
              <input
                value={dollars}
                onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))}
                inputMode="decimal"
                placeholder="4.99"
                autoFocus
                style={{ flex: 1, height: 44, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, outline: 'none', padding: '0 6px' }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-faint-2)' }}>/mo</span>
            </div>
            <button onClick={save} disabled={setSubPrice.isPending} style={{ flex: 'none', height: 44, padding: '0 16px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: setSubPrice.isPending ? 0.7 : 1 }}>
              {setSubPrice.isPending ? '…' : 'Save'}
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button onClick={() => setSubPrice.mutate(null, { onSuccess: () => setEditing(false) })} style={{ background: 'none', border: 'none', color: 'var(--danger-fg)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Turn off subscriptions</button>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, faint, bold }: { label: string; value: string; faint?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: faint ? 'var(--text-faint)' : 'var(--text)', fontWeight: bold ? 800 : 500 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
