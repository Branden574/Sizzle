import { useRequireAuth } from '../../auth/useRequireAuth';
import { useCook, useToggleFollow } from '../../data/queries';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { formatCount } from '../../lib/format';
import { ChevronLeftIcon } from '../icons';
import { pressVars } from '../ui';

const accent = theme.accent;

export function CookSheet() {
  const openCook = useSizzle((s) => s.openCook);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const requireAuth = useRequireAuth();
  const follow = useToggleFollow();

  const { data: ck, isLoading } = useCook(openCook);

  if (!openCook) return null;
  const close = () => setOpenCook(null);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 85, background: '#faf3ea', overflowY: 'auto', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ height: 170, background: ck?.bannerUrl ? `url(${ck.bannerUrl}) center/cover no-repeat` : ck?.avatarColor ?? 'linear-gradient(135deg,#3a2a22,#1b1512)', position: 'relative' }}>
        {!ck?.bannerUrl && <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />}
        <button onClick={close} style={{ position: 'absolute', top: 54, left: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="#fff" strokeWidth={2.2} />
        </button>
      </div>

      {!ck ? (
        <div style={{ padding: '60px 22px', textAlign: 'center', color: '#a99c90', fontSize: 15 }}>{isLoading ? 'Loading…' : 'Cook not found'}</div>
      ) : (
        <div style={{ padding: '0 22px 60px', marginTop: -44, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: ck.avatarUrl ? `url(${ck.avatarUrl}) center/cover` : ck.avatarColor, border: '4px solid #faf3ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 36, color: '#fff', overflow: 'hidden' }}>{ck.avatarUrl ? '' : ck.init}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#1b1512' }}>{ck.name}</div>
              <div style={{ color: '#8a7c70', fontSize: 14.5 }}>@{ck.handle}</div>
            </div>
            <button
              onClick={() => {
                if (!requireAuth()) return;
                follow.mutate({ cookId: ck.id, following: ck.viewer.following });
              }}
              className="sz-press"
              style={{ ...pressVars(0.94), padding: '12px 24px', borderRadius: 15, border: `1.5px solid ${ck.viewer.following ? '#1b1512' : accent}`, background: ck.viewer.following ? '#1b1512' : accent, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
            >
              {ck.viewer.following ? 'Following' : 'Follow'}
            </button>
          </div>
          <p style={{ color: '#5c5048', fontSize: 15, lineHeight: 1.5, margin: '14px 0 0' }}>{ck.bio}</p>

          <div style={{ display: 'flex', marginTop: 18, background: '#fff', border: '1px solid #ece1d4', borderRadius: 18, overflow: 'hidden' }}>
            <CookStat value={formatCount(ck.counts.followers)} label="Followers" border />
            <CookStat value={formatCount(ck.counts.following)} label="Following" border />
            <CookStat value={formatCount(ck.counts.likes)} label="Likes" border />
            <CookStat value={String(ck.counts.recipes)} label="Recipes" />
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: '#1b1512', margin: '24px 0 12px' }}>Recipes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {ck.recipes.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpenRecipe(d.id)}
                style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 18, overflow: 'hidden', position: 'relative', height: 180, background: d.bg, textAlign: 'left' }}
              >
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 42%, rgba(0,0,0,.72))' }} />
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

function CookStat({ value, label, border }: { value: string; label: string; border?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderRight: border ? '1px solid #f0e7da' : undefined }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: '#1b1512', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8a7c70', marginTop: 2 }}>{label}</div>
    </div>
  );
}
