import { useAnalytics } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { CloseIcon } from '../icons';

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
