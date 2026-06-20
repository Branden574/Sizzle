import { discoverHeights, trendChips } from '../data';
import { useForYouFeed } from '../data/queries';
import { useSizzle } from '../store';
import { formatCount } from '../lib/format';
import { HeartIcon, SearchIcon } from './icons';

export function Discover() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const { data } = useForYouFeed();
  const tiles = data?.items ?? [];

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ padding: '62px 22px 14px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, color: '#1b1512' }}>Discover</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, background: '#fff', border: '1.5px solid #ece1d4', borderRadius: 16, padding: '14px 16px' }}>
          <SearchIcon size={20} stroke="#a99c90" strokeWidth={2} />
          <span style={{ color: '#a99c90', fontSize: 16 }}>Search recipes, cooks, cuisines</span>
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {trendChips.map((t) => (
            <div key={t} style={{ flex: 'none', padding: '9px 15px', borderRadius: 13, background: '#fff', border: '1px solid #ece1d4', fontSize: 14, fontWeight: 600, color: '#5c5048' }}>
              {t}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '6px 18px 110px', columns: 2, columnGap: 14 }}>
        {tiles.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setOpenRecipe(r.id)}
            style={{ breakInside: 'avoid', width: '100%', marginBottom: 14, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: discoverHeights[i % discoverHeights.length], background: r.bg, display: 'block', textAlign: 'left' }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.7))' }} />
            <div style={{ position: 'absolute', left: 13, right: 13, bottom: 12 }}>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 19, lineHeight: 1.05, color: '#fff' }}>{r.title}</div>
              {r.controls.countsVisible && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <HeartIcon width={12} height={12} fill="#fff" />
                  <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: 600 }}>{formatCount(r.counts.likes)}</span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
