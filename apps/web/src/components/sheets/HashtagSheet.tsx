import type { RecipeCard } from '@sizzle/shared';
import { Button } from '../controls';
import { discoverHeights } from '../../data';
import { useHashtagFeed } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { ChevronLeftIcon, HeartIcon } from '../icons';
import { PosterImg } from '../PosterImg';

/** Full-screen feed of every recipe carrying a hashtag. */
export function HashtagSheet() {
  const tag = useSizzle((s) => s.openTag);
  const setOpenTag = useSizzle((s) => s.setOpenTag);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const { data, isLoading } = useHashtagFeed(tag);

  if (!tag) return null;
  const tiles = data?.items ?? [];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 91, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '52px 18px 10px' }}>
        <Button onClick={() => setOpenTag(null)} style={{ width: 38, height: 38, border: 'none', background: 'var(--surface)', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeftIcon size={22} stroke="var(--text)" />
        </Button>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)', lineHeight: 1 }}>#{tag}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 3 }}>{isLoading ? 'Loading…' : `${formatCount(tiles.length)}${data?.nextCursor ? '+' : ''} recipe${tiles.length === 1 ? '' : 's'}`}</div>
        </div>
      </div>

      {!isLoading && tiles.length === 0 && (
        <div style={{ padding: '50px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>No recipes with #{tag} yet.</div>
      )}

      <div style={{ padding: '8px 18px 110px', columns: 2, columnGap: 14 }}>
        {tiles.map((r: RecipeCard, i: number) => (
          <Button
            key={r.id}
            onClick={() => setOpenRecipe(r.id)}
            style={{ breakInside: 'avoid', width: '100%', marginBottom: 14, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: discoverHeights[i % discoverHeights.length], background: r.bg, display: 'block', textAlign: 'left' }}
          >
            {r.video?.posterUrl && <PosterImg src={r.video.posterUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.7))' }} />
            <div style={{ position: 'absolute', left: 13, right: 13, bottom: 12 }}>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 19, lineHeight: 1.05, color: '#fff' }}>{r.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <HeartIcon width={12} height={12} fill="#fff" />
                <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: 600 }}>{formatCount(r.counts.likes)}</span>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
