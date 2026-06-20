import { useRequireAuth } from '../../auth/useRequireAuth';
import { useRecipe, useToggleDownload, useToggleSave } from '../../data/queries';
import { getOffline } from '../../lib/offline';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { BookmarkIcon, CloseIcon, DownloadIcon } from '../icons';
import { pressVars } from '../ui';

const accent = theme.accent;

export function RecipeSheet() {
  const openRecipe = useSizzle((s) => s.openRecipe);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const requireAuth = useRequireAuth();
  const save = useToggleSave();
  const download = useToggleDownload();

  const { data, isLoading } = useRecipe(openRecipe);
  // Offline fallback: if the fetch hasn't landed, use the locally cached copy.
  const r = data ?? getOffline(openRecipe);

  if (!openRecipe) return null;
  const close = () => setOpenRecipe(null);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 44, background: '#faf3ea', borderRadius: '30px 30px 0 0', overflow: 'hidden', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', height: 230, flex: 'none', background: r?.bg ?? 'linear-gradient(165deg,#2a160e,#b5471f)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 60% at 70% 20%, rgba(244,165,44,.5), transparent 70%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, #faf3ea)' }} />
          <button onClick={close} style={{ position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon size={20} stroke="#fff" strokeWidth={2.2} />
          </button>
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.6)' }} />
        </div>

        {!r ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a99c90', fontSize: 15 }}>
            {isLoading ? 'Loading recipe…' : 'Recipe not found'}
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 130px', marginTop: -46, position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'inline-block', background: accent, color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 9 }}>{r.cuisine}</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, lineHeight: 1.02, color: '#1b1512', marginTop: 12 }}>{r.title}</div>
              <button
                onClick={() => {
                  setOpenCook(r.cook.id);
                  setOpenRecipe(null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: r.cook.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17, color: '#fff' }}>{r.cook.init}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1b1512' }}>{r.cook.name}</div>
                  <div style={{ fontSize: 12.5, color: '#8a7c70' }}>@{r.cook.handle}</div>
                </div>
              </button>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <StatCard label="Time" value={r.time} />
                <StatCard label="Serves" value={String(r.servings)} />
                <StatCard label="Level" value={r.level} />
              </div>

              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#1b1512', margin: '26px 0 12px' }}>Ingredients</div>
              <div style={{ background: '#fff', border: '1px solid #ece1d4', borderRadius: 18, overflow: 'hidden' }}>
                {r.ingredients.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #f3ebe0' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flex: 'none' }} />
                    <span style={{ fontSize: 15.5, color: '#3a322c' }}>{ing}</span>
                  </div>
                ))}
              </div>

              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#1b1512', margin: '26px 0 12px' }}>Method</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {r.steps.map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 11, background: '#1b1512', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17 }}>{i + 1}</div>
                    <div style={{ fontSize: 15.5, lineHeight: 1.5, color: '#3a322c', paddingTop: 4 }}>{text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 24px 30px', background: 'linear-gradient(180deg, transparent, #faf3ea 30%)', display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  if (!requireAuth()) return;
                  save.mutate(r.id);
                }}
                className="sz-press"
                style={{ ...pressVars(0.97), flex: 1, height: 56, border: 'none', borderRadius: 17, background: r.viewer.saved ? '#fff' : '#1b1512', color: r.viewer.saved ? '#1b1512' : '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'transform .2s' }}
              >
                <BookmarkIcon size={19} fill={r.viewer.saved ? accent : '#fff'} stroke={r.viewer.saved ? accent : '#fff'} strokeWidth={2} />
                {r.viewer.saved ? 'Saved' : 'Save recipe'}
              </button>
              <button
                onClick={() => {
                  if (!requireAuth()) return;
                  download.mutate({ recipeId: r.id, downloaded: r.viewer.downloaded });
                }}
                className="sz-press"
                title={r.viewer.downloaded ? 'Downloaded for offline' : 'Save for offline'}
                style={{ ...pressVars(0.93), width: 56, height: 56, flex: 'none', border: `1.5px solid ${r.viewer.downloaded ? accent : '#e3d6c8'}`, borderRadius: 17, background: r.viewer.downloaded ? accent : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .2s' }}
              >
                <DownloadIcon size={22} stroke={r.viewer.downloaded ? '#fff' : '#5c5048'} strokeWidth={2.2} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: '#fff', border: '1px solid #ece1d4', borderRadius: 16, padding: 14 }}>
      <div style={{ fontSize: 12, color: '#8a7c70', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1b1512', marginTop: 2 }}>{value}</div>
    </div>
  );
}
