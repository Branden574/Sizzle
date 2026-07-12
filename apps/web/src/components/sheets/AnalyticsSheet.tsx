import { useState } from 'react';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { showMonetization } from '../../lib/native';
import { PLATFORM_FEE_PCT, PLATFORM_FEE_RATIONALE, type CreatorAnalytics, type EarningKind, type EarningsSummary } from '@sizzle/shared';
import { useAnalytics, useBroadcast, useCreateProduct, useCreateTier, useDeleteProduct, useDeleteTier, useEarnings, useMonetizationStatus, useMyProducts, useMyTiers, usePayout, useSetGoal, useSetSubPrice, useSetWelcomeDm, useStartOnboarding } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { theme } from '../../theme';
import { CloseIcon } from '../icons';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** ms → "0:12" (mm:ss) or "12s" watch-time label. */
const fmtWatch = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
};

/** Short label for a ledger row by earning type. */
const KIND_LABEL: Record<EarningKind, string> = { support: 'Support', subscription: 'Subscription', unlock: 'Recipe unlock', product: 'Product' };

/** Creator insights — totals + per-post engagement. Opened from your profile. */
export function AnalyticsSheet() {
  const setShowAnalytics = useSizzle((s) => s.setShowAnalytics);
  const { data, isLoading } = useAnalytics(true);
  const close = () => setShowAnalytics(false);
  const swipe = useSwipeDismiss(close);
  const t = data?.totals;
  // Watch metrics lead — they're what a video creator optimizes against.
  const cards = [
    { label: 'Views', value: formatCount(t?.views ?? 0) },
    { label: 'Avg watch', value: fmtWatch(t?.avgWatchMs ?? 0) },
    { label: 'Completion', value: `${t?.completionPct ?? 0}%` },
    { label: 'Followers', value: formatCount(t?.followers ?? 0) },
    { label: 'Posts', value: formatCount(t?.recipes ?? 0) },
    { label: 'Likes', value: formatCount(t?.likes ?? 0) },
    { label: 'Comments', value: formatCount(t?.comments ?? 0) },
    { label: 'Saves', value: formatCount(t?.saves ?? 0) },
    { label: 'Shares', value: formatCount(t?.shares ?? 0) },
  ];
  const posts = data?.posts ?? [];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '86%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' , ...swipe.handlers.style}}>
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
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)' }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              <TrendSparkline data={data} />
              <Funnels data={data} />

              {/* The whole earnings + payouts + price/tier/product center is hidden
                  on native (Apple 3.1.1 / Play Billing) — creators manage money on
                  the web. Insights below stay visible. */}
              {showMonetization && <Earnings />}

              <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Per post</div>
              {posts.length === 0 ? (
                <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16, textAlign: 'center' }}>Post a recipe to see its stats here.</div>
              ) : (
                posts.map((p) => (
                  <div key={p.id} style={{ padding: '11px 4px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div style={{ flex: 'none', fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>👁 {formatCount(p.views)}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12.5, color: 'var(--text-faint)' }}>
                      <span>{p.completionPct}% finished</span>
                      <span>{fmtWatch(p.avgWatchMs)} avg</span>
                      <span>♥ {formatCount(p.likes)}</span>
                      <span>💬 {formatCount(p.comments)}</span>
                      <span>🔖 {formatCount(p.saves)}</span>
                      <span>↗ {formatCount(p.shares)}</span>
                    </div>
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
            {(data?.activeSubs ?? 0) > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
                <Row label={`Recurring / month (${data?.activeSubs} subscriber${data?.activeSubs === 1 ? '' : 's'})`} value={usd(data?.mrrCents ?? 0)} bold />
                <div style={{ fontSize: 11.5, color: 'var(--text-faint-2)', marginTop: 2 }}>≈ {usd((data?.mrrCents ?? 0) * 12)}/yr at today's subscriber count</div>
              </>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-faint-2)', lineHeight: 1.55, marginTop: 10 }}>{PLATFORM_FEE_RATIONALE}</div>
          </div>

          <PayoutCard />
          <ProductsManager />
          <SubPriceEditor data={data} />
          <TiersManager />
          {(data?.activeSubs ?? 0) > 0 && <BroadcastComposer count={data!.activeSubs} />}
          <GoalEditor data={data} />
          <WelcomeDmEditor data={data} />

          {(data?.topSupporters?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '2px 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Top supporters</div>
              {data!.topSupporters.slice(0, 8).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ width: 22, textAlign: 'center', fontSize: 14, fontWeight: 800, color: i === 0 ? '#e0a92e' : 'var(--text-faint)' }}>{i === 0 ? '🏆' : i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user?.name ?? 'Someone'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>{s.count}×</div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1f9d55', minWidth: 60, textAlign: 'right' }}>{usd(s.netCents)}</div>
                </div>
              ))}
            </div>
          )}

          {(data?.byPost.length ?? 0) > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '2px 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Top earning recipes</div>
              {data!.byPost.slice(0, 8).map((p) => (
                <div key={p.recipeId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>{p.count}×</div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1f9d55', minWidth: 60, textAlign: 'right' }}>{usd(p.netCents)}</div>
                </div>
              ))}
            </div>
          )}

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

/** Retention (started→kept→finished) + premium save→unlock funnel as bar rows. */
function Funnels({ data }: { data: CreatorAnalytics | undefined }) {
  const r = data?.retention;
  const f = data?.unlockFunnel ?? null;
  const showRetention = r && r.started > 0;
  if (!showRetention && !f) return null;
  const bar = (label: string, value: number, base: number, note?: string) => {
    const pct = base > 0 ? Math.round((value / base) * 100) : 0;
    return (
      <div key={label} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 3 }}>
          <span>{label}</span><span>{formatCount(value)} · {pct}%{note ? ` ${note}` : ''}</span>
        </div>
        <div style={{ height: 8, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${theme.accent},#e23a18)`, borderRadius: 4 }} />
        </div>
      </div>
    );
  };
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
      {showRetention && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Retention <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint-2)' }}>(estimated)</span></div>
          {bar('Started', r!.started, r!.started)}
          {bar('Kept watching', r!.kept, r!.started)}
          {bar('Finished', r!.finished, r!.started)}
        </>
      )}
      {f && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: `${showRetention ? '16px' : '0'} 0 10px` }}>Premium funnel</div>
          {bar('Viewed', f.views, f.views)}
          {bar('Saved', f.saves, f.views)}
          {bar('Unlocked', f.unlocks, f.views)}
        </>
      )}
    </div>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

/** 28-day view trend as a mini bar chart + best-time-to-post callout. */
function TrendSparkline({ data }: { data: CreatorAnalytics | undefined }) {
  const trend = data?.trend ?? [];
  if (trend.length === 0) return null;
  const max = Math.max(1, ...trend.map((t) => t.views));
  const best = data?.bestTime ?? null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Views · last 28 days</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{formatCount(trend.reduce((n, t) => n + t.views, 0))} total</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
        {trend.map((t) => (
          <div key={t.day} title={`${t.day}: ${t.views}`} style={{ flex: 1, height: `${Math.max(4, (t.views / max) * 100)}%`, background: `linear-gradient(180deg,${theme.accent},#e23a18)`, borderRadius: 2, opacity: t.views ? 1 : 0.25 }} />
        ))}
      </div>
      {best && best.views > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 10 }}>⏰ Best time to post: <b style={{ color: 'var(--text)' }}>{DOW[best.dow]} around {hourLabel(best.hour)}</b></div>
      )}
    </div>
  );
}

/** Manage subscription tiers (e.g. Home Cook / Sous Chef / Pro). */
function TiersManager() {
  const { data } = useMyTiers(true);
  const create = useCreateTier();
  const del = useDeleteTier();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [perks, setPerks] = useState('');
  const tiers = data?.tiers ?? [];
  const save = () => {
    const cents = Math.round(parseFloat(price) * 100);
    if (!name.trim() || !(cents >= 100)) return;
    create.mutate({ name: name.trim(), priceCents: Math.min(cents, 50_000), perks: perks.trim() || null }, { onSuccess: () => { setName(''); setPrice(''); setPerks(''); setAdding(false); } });
  };
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Subscription tiers</div>
        {!adding && <button onClick={() => setAdding(true)} style={{ height: 34, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add</button>}
      </div>
      {tiers.length === 0 && !adding && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>Optional — offer multiple tiers (e.g. Home Cook / Pro) with different perks.</div>}
      {tiers.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
            {t.perks && <div style={{ fontSize: 12, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.perks}</div>}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>{usd(t.priceCents)}/mo</div>
          <button onClick={() => { if (window.confirm(`Remove "${t.name}"?`)) del.mutate(t.id); }} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--danger-fg)', cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>✕</button>
        </div>
      ))}
      {adding && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Tier name" style={{ flex: 1, height: 44, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, outline: 'none', padding: '0 12px', minWidth: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', width: 100, background: 'var(--bg)', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '0 10px' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-faint)' }}>$</span>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} inputMode="decimal" placeholder="9.99" style={{ flex: 1, height: 44, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, outline: 'none', padding: '0 4px', minWidth: 0 }} />
            </div>
          </div>
          <input value={perks} onChange={(e) => setPerks(e.target.value.slice(0, 200))} placeholder="Perks (e.g. all premium recipes + monthly Q&A)" style={{ height: 44, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, outline: 'none', padding: '0 12px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={save} disabled={create.isPending} style={{ height: 40, padding: '0 18px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: create.isPending ? 0.7 : 1 }}>{create.isPending ? '…' : 'Add tier'}</button>
            <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Manage digital products — cookbooks, meal plans, guides. */
function ProductsManager() {
  const { data } = useMyProducts(true);
  const create = useCreateProduct();
  const del = useDeleteProduct();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const products = data?.products ?? [];
  const save = () => {
    const cents = Math.round(parseFloat(price) * 100);
    if (!title.trim() || !(cents >= 100)) return;
    create.mutate({ title: title.trim(), priceCents: Math.min(cents, 50_000_00), fileUrl: fileUrl.trim() || null }, { onSuccess: () => { setTitle(''); setPrice(''); setFileUrl(''); setAdding(false); } });
  };
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Digital products</div>
        {!adding && <button onClick={() => setAdding(true)} style={{ height: 34, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add</button>}
      </div>
      {products.length === 0 && !adding && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>Sell a cookbook, meal plan, or guide — you keep {100 - PLATFORM_FEE_PCT}%.</div>}
      {products.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>{usd(p.priceCents)}</div>
          <button onClick={() => { if (window.confirm(`Remove "${p.title}"?`)) del.mutate(p.id); }} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--danger-fg)', cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>✕</button>
        </div>
      ))}
      {adding && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Title (e.g. 30-Day Meal Plan)" style={{ height: 44, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, outline: 'none', padding: '0 12px' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', width: 110, background: 'var(--bg)', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '0 12px' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-faint)' }}>$</span>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} inputMode="decimal" placeholder="9.99" style={{ flex: 1, height: 44, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, outline: 'none', padding: '0 4px', minWidth: 0 }} />
            </div>
            <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Download URL (optional)" style={{ flex: 1, height: 44, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, outline: 'none', padding: '0 12px', minWidth: 0 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={save} disabled={create.isPending} style={{ height: 40, padding: '0 18px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: create.isPending ? 0.7 : 1 }}>{create.isPending ? '…' : 'Add product'}</button>
            <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Payout & tax center — balance, next payout date, dashboard link, tax note. */
function PayoutCard() {
  const { data } = usePayout(true);
  if (!data) return null;
  const next = new Date(data.nextPayoutDate);
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Payouts</span>
        <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: 'var(--text)' }}>{usd(data.availableCents)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>
        Available balance · next payout {next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </div>
      {data.dashboardUrl && (
        <button onClick={() => window.open(data.dashboardUrl!, '_blank', 'noopener')} style={{ marginTop: 10, height: 38, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Open payout dashboard →</button>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-faint-2)', lineHeight: 1.5, marginTop: 10 }}>{data.taxNote}</div>
    </div>
  );
}

/** Broadcast a single DM to every active subscriber — a members-only channel. */
function BroadcastComposer({ count }: { count: number }) {
  const broadcast = useBroadcast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const send = () => {
    if (!text.trim() || broadcast.isPending) return;
    broadcast.mutate(text.trim(), { onSuccess: (r) => { setSent(r.sent); setText(''); setOpen(false); } });
  };
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Message your subscribers</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{sent != null ? `Sent to ${sent} subscriber${sent === 1 ? '' : 's'} 🎉` : `Send one DM to all ${count} of your subscribers.`}</div>
        </div>
        {!open && <button onClick={() => { setOpen(true); setSent(null); }} style={{ flex: 'none', height: 34, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Compose</button>}
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={3} placeholder="New drop this week, subscribers get it first…" style={{ width: '100%', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, outline: 'none', padding: 12, resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button onClick={send} disabled={broadcast.isPending || !text.trim()} style={{ height: 40, padding: '0 18px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: broadcast.isPending || !text.trim() ? 0.6 : 1 }}>{broadcast.isPending ? 'Sending…' : `Send to ${count}`}</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Funding goal — a live progress bar plus an inline editor (label + target). */
function GoalEditor({ data }: { data: EarningsSummary | undefined }) {
  const setGoal = useSetGoal();
  const goal = data?.goal ?? null;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const open = () => { setLabel(goal?.label ?? ''); setTarget(goal ? (goal.targetCents / 100).toFixed(0) : ''); setEditing(true); };
  const save = () => {
    const t = Math.round(parseFloat(target) * 100);
    setGoal.mutate({ label: label.trim() || null, targetCents: Number.isFinite(t) && t >= 500 ? t : null }, { onSuccess: () => setEditing(false) });
  };
  const pct = goal && goal.targetCents > 0 ? Math.min(100, Math.round((goal.raisedCents / goal.targetCents) * 100)) : 0;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>{goal ? goal.label : 'Funding goal'}</div>
        {!editing && (
          <button onClick={open} style={{ flex: 'none', height: 34, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{goal ? 'Edit' : 'Set a goal'}</button>
        )}
      </div>
      {goal && !editing && (
        <>
          <div style={{ height: 10, background: 'var(--track)', borderRadius: 6, overflow: 'hidden', margin: '10px 0 6px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${theme.accent},#e23a18)`, borderRadius: 6, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{usd(goal.raisedCents)} of {usd(goal.targetCents)} · {pct}%</div>
        </>
      )}
      {editing && (
        <div style={{ marginTop: 12 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 80))} placeholder="e.g. New camera" style={{ width: '100%', height: 44, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, outline: 'none', padding: '0 12px', marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, background: 'var(--bg)', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '0 12px' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-faint)' }}>$</span>
              <input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" placeholder="500" style={{ flex: 1, height: 44, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, outline: 'none', padding: '0 6px' }} />
            </div>
            <button onClick={save} disabled={setGoal.isPending} style={{ flex: 'none', height: 44, padding: '0 16px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: setGoal.isPending ? 0.7 : 1 }}>{setGoal.isPending ? '…' : 'Save'}</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {goal && <button onClick={() => setGoal.mutate({ label: null, targetCents: null }, { onSuccess: () => setEditing(false) })} style={{ background: 'none', border: 'none', color: 'var(--danger-fg)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Remove goal</button>}
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Auto welcome/thank-you DM to new subscribers. */
function WelcomeDmEditor({ data }: { data: EarningsSummary | undefined }) {
  const setWelcome = useSetWelcomeDm();
  const current = data?.welcomeDm ?? null;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const open = () => { setText(current ?? ''); setEditing(true); };
  const save = () => setWelcome.mutate(text.trim() || null, { onSuccess: () => setEditing(false) });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Welcome DM</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{current ? 'Auto-sent to every new subscriber.' : 'Off — auto-thank new subscribers with a DM.'}</div>
        </div>
        {!editing && <button onClick={open} style={{ flex: 'none', height: 34, padding: '0 14px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{current ? 'Edit' : 'Set'}</button>}
      </div>
      {editing && (
        <div style={{ marginTop: 12 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={3} placeholder="Thanks so much for subscribing! 🧡" style={{ width: '100%', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, outline: 'none', padding: 12, resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button onClick={save} disabled={setWelcome.isPending} style={{ height: 40, padding: '0 18px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: setWelcome.isPending ? 0.7 : 1 }}>{setWelcome.isPending ? '…' : 'Save'}</button>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
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
