import { useState } from 'react';
import type { RecipeCard } from '@sizzle/shared';
import { discoverHeights, trendChips } from '../data';
import { useForYouFeed, useSearch } from '../data/queries';
import { useSizzle } from '../store';
import { formatCount } from '../lib/format';
import { HeartIcon, SearchIcon } from './icons';

export function Discover() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);

  const [q, setQ] = useState('');
  const query = q.trim();
  const { data: feed } = useForYouFeed();
  const { data: results, isFetching } = useSearch(q);

  const tiles = query ? results?.recipes ?? [] : feed?.items ?? [];
  const cooks = query ? results?.cooks ?? [] : [];

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ padding: '62px 22px 14px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, color: '#1b1512' }}>Discover</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, background: '#fff', border: '1.5px solid #ece1d4', borderRadius: 16, padding: '12px 16px' }}>
          <SearchIcon size={20} stroke="#a99c90" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes, cooks, cuisines"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontFamily: "'Hanken Grotesk'", fontSize: 16, color: '#1b1512' }}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a99c90', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
        {!query && (
          <div style={{ display: 'flex', gap: 9, marginTop: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {trendChips.map((t) => (
              <button key={t} onClick={() => setQ(t.replace(/^[^\w]+\s*/, ''))} style={{ flex: 'none', padding: '9px 15px', borderRadius: 13, background: '#fff', border: '1px solid #ece1d4', fontSize: 14, fontWeight: 600, color: '#5c5048', cursor: 'pointer' }}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* cook results */}
      {query && cooks.length > 0 && (
        <div style={{ padding: '4px 22px 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#8a7c70', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>Cooks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cooks.map((ck) => (
              <button key={ck.id} onClick={() => setOpenCook(ck.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #ece1d4', borderRadius: 18, padding: 12, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 14, background: ck.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 18, color: '#fff' }}>{ck.init}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1b1512' }}>{ck.name}</div>
                  <div style={{ fontSize: 13, color: '#8a7c70' }}>@{ck.handle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {query && tiles.length === 0 && !isFetching && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: '#a99c90', fontSize: 15 }}>No recipes match “{query}”.</div>
      )}

      <div style={{ padding: '6px 18px 110px', columns: 2, columnGap: 14 }}>
        {tiles.map((r: RecipeCard, i: number) => (
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
