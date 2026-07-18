import { useState } from 'react';
import type { RecipeCard } from '@sizzle/shared';
import { Button } from '../controls';
import { discoverHeights } from '../../data';
import { useHashtag, useHashtagContent, useSetHashtagPref } from '../../data/queries';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { ChevronLeftIcon, HeartIcon } from '../icons';
import { PosterImg } from '../PosterImg';

/** A hashtag's page: counts, follow/mute, trend status, related tags, and Top/Recent content. */
export function HashtagSheet() {
  const tag = useSizzle((s) => s.openTag);
  const setOpenTag = useSizzle((s) => s.setOpenTag);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const requireAuth = useRequireAuth();
  const [sort, setSort] = useState<'top' | 'recent'>('top');

  const { data: detail } = useHashtag(tag);
  const { data: content, isLoading } = useHashtagContent(tag, sort);
  const setPref = useSetHashtagPref();

  if (!tag) return null;
  const tiles = content?.items ?? [];
  const following = detail?.following ?? false;
  const muted = detail?.muted ?? false;

  const toggleFollow = () => { if (requireAuth()) setPref.mutate({ tag, state: following ? 'neutral' : 'following' }); };
  const toggleMute = () => { if (requireAuth()) setPref.mutate({ tag, state: muted ? 'neutral' : 'muted' }); };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 91, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '52px 18px 6px' }}>
        <Button onClick={() => setOpenTag(null)} style={{ width: 38, height: 38, flex: 'none', border: 'none', background: 'var(--surface)', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeftIcon size={22} stroke="var(--text)" />
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)', lineHeight: 1 }}>#{detail?.displayName ?? tag}</div>
            {detail?.trending && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg,#f9a825,#ff5a36)', padding: '3px 9px', borderRadius: 999 }}>🔥 Trending</span>}
            {detail?.featured && <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent,#ff5a36)' }}>Official</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
            {formatCount(detail?.posts ?? tiles.length)} post{(detail?.posts ?? tiles.length) === 1 ? '' : 's'}
            {detail?.creators ? ` · ${formatCount(detail.creators)} creator${detail.creators === 1 ? '' : 's'}` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 18px 4px' }}>
        <Button onClick={toggleFollow} disabled={setPref.isPending} style={{ flex: 1, height: 42, borderRadius: 13, border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', color: following ? 'var(--text)' : '#fff', background: following ? 'var(--surface-2)' : 'var(--accent,#ff5a36)' }}>
          {following ? 'Following' : 'Follow'}
        </Button>
        <Button onClick={toggleMute} disabled={setPref.isPending} aria-label={muted ? 'Unmute hashtag' : 'Mute hashtag'} style={{ width: 46, height: 42, borderRadius: 13, border: '1px solid var(--line-2)', background: muted ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', fontSize: 17 }}>
          {muted ? '🔕' : '🔔'}
        </Button>
      </div>

      {!!detail?.related?.length && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 18px 2px' }}>
          {detail.related.map((r) => (
            <Button key={r} onClick={() => setOpenTag(r)} style={{ flex: 'none', padding: '7px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--text-faint)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>#{r}</Button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, padding: '14px 18px 4px', borderBottom: '1px solid var(--line-2)', margin: '8px 0 0' }}>
        {(['top', 'recent'] as const).map((s) => (
          <Button key={s} onClick={() => setSort(s)} aria-pressed={sort === s} style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', borderBottom: sort === s ? '2px solid var(--text)' : '2px solid transparent', marginBottom: -1, cursor: 'pointer', fontSize: 14, fontWeight: 800, color: sort === s ? 'var(--text)' : 'var(--text-faint-2)' }}>
            {s === 'top' ? 'Top' : 'Recent'}
          </Button>
        ))}
      </div>

      {isLoading && tiles.length === 0 && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 14 }}>Loading…</div>
      )}
      {!isLoading && tiles.length === 0 && (
        <div style={{ padding: '50px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>No posts with #{tag} yet.</div>
      )}

      <div style={{ padding: '12px 18px 110px', columns: 2, columnGap: 14 }}>
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
