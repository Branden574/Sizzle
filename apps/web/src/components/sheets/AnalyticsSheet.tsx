import { PLATFORM_FEE_PCT, PLATFORM_FEE_RATIONALE } from '@sizzle/shared';
import { useAnalytics, useEarnings, useMonetizationStatus, useStartOnboarding } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { theme } from '../../theme';
import { CloseIcon } from '../icons';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
 * Earnings — tips received, with the 5.5% platform fee broken out on every
 * surface (totals AND each tip) plus the full why-this-is-fair rationale.
 * Creators should never have to wonder where a cent went.
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
            Turn on tips so your followers can support you. You keep {100 - PLATFORM_FEE_PCT}% of every tip.
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
            <Row label={`Tips received (${data?.totals.tipCount ?? 0})`} value={usd(data?.totals.grossCents ?? 0)} />
            <Row label={`Sizzle platform fee (${PLATFORM_FEE_PCT}%)`} value={`− ${usd(data?.totals.feeCents ?? 0)}`} faint />
            <Row label="You keep" value={usd(data?.totals.netCents ?? 0)} bold />
            <div style={{ fontSize: 12, color: 'var(--text-faint-2)', lineHeight: 1.55, marginTop: 10 }}>{PLATFORM_FEE_RATIONALE}</div>
          </div>

          {(data?.tips ?? []).slice(0, 20).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.from?.name ?? 'Someone'}{t.recipeTitle ? ` · ${t.recipeTitle}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>{t.time} · {usd(t.amountCents)} tip − {usd(t.feeCents)} fee</div>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1f9d55' }}>+{usd(t.netCents)}</div>
            </div>
          ))}
        </>
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
