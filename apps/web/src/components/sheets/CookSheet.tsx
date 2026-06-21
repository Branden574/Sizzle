import { useRequireAuth } from '../../auth/useRequireAuth';
import { useCook, useToggleFollow } from '../../data/queries';
import { useSizzle } from '../../store';
import { VerifiedBadge } from '../VerifiedBadge';
import { SocialLinks } from '../SocialLinks';
import { theme } from '../../theme';
import { formatCount } from '../../lib/format';
import { ChevronLeftIcon } from '../icons';
import { pressVars } from '../ui';

const accent = theme.accent;

export function CookSheet() {
  const openCook = useSizzle((s) => s.openCook);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setFollowList = useSizzle((s) => s.setFollowList);
  const requireAuth = useRequireAuth();
  const follow = useToggleFollow();

  const { data: ck, isLoading } = useCook(openCook);

  if (!openCook) return null;
  const close = () => setOpenCook(null);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 85, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ height: 170, background: ck?.bannerUrl ? `url(${ck.bannerUrl}) center/cover no-repeat` : ck?.avatarColor ?? 'linear-gradient(135deg,#3a2a22,#1b1512)', position: 'relative' }}>
        {!ck?.bannerUrl && <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />}
        <button onClick={close} style={{ position: 'absolute', top: 54, left: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="#fff" strokeWidth={2.2} />
        </button>
      </div>

      {!ck ? (
        <div style={{ padding: '60px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>{isLoading ? 'Loading…' : 'Cook not found'}</div>
      ) : (
        <div style={{ padding: '0 22px 60px', marginTop: -44, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: ck.avatarUrl ? `url(${ck.avatarUrl}) center/cover` : ck.avatarColor, border: '4px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 36, color: '#fff', overflow: 'hidden' }}>{ck.avatarUrl ? '' : ck.init}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)' }}>{ck.name}</span>
                <VerifiedBadge tier={ck.verifiedTier} size={20} />
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 14.5 }}>@{ck.handle}</div>
            </div>
            <button
              onClick={() => {
                if (!requireAuth()) return;
                follow.mutate({ cookId: ck.id, following: ck.viewer.following });
              }}
              className="sz-press"
              style={{ ...pressVars(0.94), padding: '12px 24px', borderRadius: 15, border: `1.5px solid ${ck.viewer.following ? 'var(--invert-bg)' : accent}`, background: ck.viewer.following ? 'var(--invert-bg)' : accent, color: ck.viewer.following ? 'var(--invert-fg)' : '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
            >
              {ck.viewer.following ? 'Following' : 'Follow'}
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.5, margin: '14px 0 0' }}>{ck.bio}</p>
          <SocialLinks links={ck.links} size={34} />

          <div style={{ display: 'flex', marginTop: 18, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
            <CookStat value={formatCount(ck.counts.followers)} label="Followers" border onClick={() => setFollowList({ id: ck.id, mode: 'followers', name: ck.name })} />
            <CookStat value={formatCount(ck.counts.following)} label="Following" border onClick={() => setFollowList({ id: ck.id, mode: 'following', name: ck.name })} />
            <CookStat value={formatCount(ck.counts.likes)} label="Likes" border />
            <CookStat value={String(ck.counts.recipes)} label="Recipes" />
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '24px 0 12px' }}>Recipes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {ck.recipes.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpenRecipe(d.id)}
                style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 18, overflow: 'hidden', position: 'relative', height: 180, background: d.bg, textAlign: 'left' }}
              >
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 42%, rgba(0,0,0,.72))' }} />
                {d.removed ? (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,12,.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ff8a6b' }}>Video removed</div>
                    {d.removalReason && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>{d.removalReason}</div>}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 8 }}>{d.appealStatus === 'pending' ? 'Appeal under review' : d.appealStatus === 'denied' ? 'Appeal denied' : 'Tap to appeal'}</div>
                  </div>
                ) : d.autoHidden ? (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,12,.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#f0c674' }}>Under review</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>Hidden while we review reports</div>
                  </div>
                ) : null}
                <div style={{ position: 'absolute', left: 12, right: 12, bottom: 11 }}>
                  <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, fontWeight: 600 }}>{d.time}</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, lineHeight: 1.05, color: '#fff', marginTop: 2 }}>{d.title}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CookStat({ value, label, border, onClick }: { value: string; label: string; border?: boolean; onClick?: () => void }) {
  const style = { flex: 1, padding: '14px 8px', textAlign: 'center' as const, borderRight: border ? '1px solid var(--line)' : undefined };
  const inner = (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </>
  );
  if (!onClick) return <div style={style}>{inner}</div>;
  return <button onClick={onClick} style={{ ...style, background: 'none', border: 'none', borderRight: style.borderRight, cursor: 'pointer' }}>{inner}</button>;
}
