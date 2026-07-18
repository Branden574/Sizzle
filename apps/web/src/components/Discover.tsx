import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, FilterChip, IconButton } from './controls';
import type { RecipeCard } from '@sizzle/shared';
import { discoverHeights } from '../data';
import { useForYouFeed, usePantrySearch, useSearch, useTrendingTags } from '../data/queries';
import { useSizzle } from '../store';
import { formatCount } from '../lib/format';
import { HeartIcon, SearchIcon } from './icons';
import { PosterImg } from './PosterImg';
import { PullToRefreshView } from './PullToRefresh';

export function Discover() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setOpenTag = useSizzle((s) => s.setOpenTag);

  const [q, setQ] = useState('');
  const query = q.trim();
  // Recent searches (client-only, last 8). Recorded on submit-ish signals:
  // picking a result would be ideal; recording on 1.2s settled input is enough.
  const [recents, setRecents] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sz-recent-searches') ?? '[]') as string[]; } catch { return []; }
  });
  useEffect(() => {
    if (query.length < 3) return;
    const t = window.setTimeout(() => {
      setRecents((prev) => {
        const next = [query, ...prev.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8);
        try { localStorage.setItem('sz-recent-searches', JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [query]);
  const clearRecents = () => { setRecents([]); try { localStorage.removeItem('sz-recent-searches'); } catch { /* ignore */ } };
  const { data: feed, hasNextPage, isFetchingNextPage, fetchNextPage } = useForYouFeed();
  const { data: results, isFetching } = useSearch(q);
  const { data: trending } = useTrendingTags();

  // Pantry search: "what can I make with what I have" — ingredient chips +
  // a time filter, ranked by how many of your ingredients each recipe uses.
  const [pantry, setPantry] = useState<string[]>([]);
  const [pantryInput, setPantryInput] = useState('');
  const [maxTime, setMaxTime] = useState(0);
  const pantryActive = !query && pantry.length > 0;
  const pantryQuery = usePantrySearch(pantryActive ? pantry : [], { maxTime: maxTime || undefined });
  const addPantry = () => {
    const t = pantryInput.trim().toLowerCase().replace(/[%_(),.#]/g, '').slice(0, 40);
    setPantryInput('');
    if (t.length >= 2 && !pantry.includes(t) && pantry.length < 8) setPantry((prev) => [...prev, t]);
  };

  const tiles = query
    ? results?.recipes ?? []
    : pantryActive
      ? pantryQuery.data?.recipes ?? []
      : feed?.pages.flatMap((p) => p.items) ?? [];
  const cooks = query ? results?.cooks ?? [] : [];
  const pantryMatched = pantryActive ? pantryQuery.data?.matched ?? {} : {};

  // Infinite scroll for the default (non-search) grid — load the next page when
  // the sentinel nears the viewport, mirroring the Feed. Search results aren't paged.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useEffect(() => {
    if (query || pantryActive) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage(); },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <PullToRefreshView onRefresh={() => qc.refetchQueries({ type: 'active' }, { throwOnError: true })} label="discover" style={{ position: 'absolute', inset: 0, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ padding: '62px 22px 14px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, color: 'var(--text)' }}>Discover</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 16, padding: '12px 16px' }}>
          <SearchIcon size={20} stroke="var(--text-faint-2)" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes, cooks, cuisines"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontFamily: "'Hanken Grotesk'", fontSize: 16, color: 'var(--text)' }}
          />
          {q && (
            <IconButton label="Clear search" variant="text" size="sm" onClick={() => setQ('')}>×</IconButton>
          )}
        </div>
        {!query && recents.length > 0 && pantry.length === 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '18px 0 10px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint-2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Recent</span>
              <Button onClick={clearRecents} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-faint-2)' }}>Clear</Button>
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {recents.map((rq) => (
                <FilterChip key={rq} onClick={() => setQ(rq)}>{rq}</FilterChip>
              ))}
            </div>
          </>
        )}
        {!query && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint-2)', textTransform: 'uppercase', letterSpacing: '.4px', margin: '18px 0 10px' }}>What&apos;s in your kitchen?</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 16, padding: '10px 14px' }}>
              <span aria-hidden="true" style={{ fontSize: 16 }}>🥕</span>
              <input
                value={pantryInput}
                onChange={(e) => setPantryInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addPantry(); } }}
                onBlur={() => { if (pantryInput.trim()) addPantry(); }}
                placeholder={pantry.length ? 'Add another ingredient…' : 'chicken, rice, gochujang…'}
                aria-label="Add an ingredient you have"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)' }}
              />
              {pantryInput.trim().length >= 2 && (
                <Button onClick={addPantry} style={{ flex: 'none', border: 'none', background: 'var(--accent,#ff5a36)', color: '#fff', borderRadius: 10, padding: '6px 12px', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Add</Button>
              )}
            </div>
            {pantry.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {pantry.map((t) => (
                  <FilterChip key={t} selected onClick={() => setPantry((prev) => prev.filter((x) => x !== t))}>{t} ✕</FilterChip>
                ))}
                <FilterChip selected={maxTime === 30} onClick={() => setMaxTime(maxTime === 30 ? 0 : 30)}>≤ 30 min</FilterChip>
                <FilterChip selected={maxTime === 60} onClick={() => setMaxTime(maxTime === 60 ? 0 : 60)}>≤ 60 min</FilterChip>
              </div>
            )}
          </>
        )}
        {!query && !pantryActive && (trending?.length ?? 0) > 0 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint-2)', textTransform: 'uppercase', letterSpacing: '.4px', margin: '18px 0 10px' }}>Trending</div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {trending!.map((t) => (
                <FilterChip key={t.tag} onClick={() => setOpenTag(t.tag)} count={t.count}>#{t.tag}</FilterChip>
              ))}
            </div>
          </>
        )}
      </div>

      {/* people results */}
      {query && cooks.length > 0 && (
        <div style={{ padding: '4px 22px 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>People</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cooks.map((ck) => (
              <Button key={ck.id} onClick={() => setOpenCook(ck.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, width: '100%', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 12, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 14, background: ck.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 18, color: '#fff', overflow: 'hidden' }}>
                  {ck.avatarUrl ? <img src={ck.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ck.init}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ck.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>@{ck.handle}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {pantryActive && pantryQuery.isFetching && tiles.length === 0 && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>Finding what you can make…</div>
      )}
      {pantryActive && !pantryQuery.isFetching && tiles.length === 0 && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>Nothing matches those ingredients yet — try removing one.</div>
      )}

      {query && isFetching && tiles.length === 0 && cooks.length === 0 && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>Searching…</div>
      )}

      {query && tiles.length === 0 && cooks.length === 0 && !isFetching && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>No results for “{query}”.</div>
      )}

      <div style={{ padding: '6px 18px 110px', columns: 2, columnGap: 14 }}>
        {tiles.map((r: RecipeCard, i: number) => (
          <Button
            key={r.id}
            onClick={() => setOpenRecipe(r.id)}
            style={{ breakInside: 'avoid', width: '100%', marginBottom: 14, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: discoverHeights[i % discoverHeights.length], background: r.bg, display: 'block', textAlign: 'left' }}
          >
            {(r.images[0] || r.video?.posterUrl) && <PosterImg src={r.images[0] || r.video?.posterUrl || ''} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.7))' }} />
            <div style={{ position: 'absolute', left: 13, right: 13, bottom: 12 }}>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 19, lineHeight: 1.05, color: '#fff' }}>{r.title}</div>
              {pantryActive && (pantryMatched[r.id]?.length ?? 0) > 0 && (
                <div style={{ display: 'inline-block', marginTop: 6, background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '3px 8px', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                  ✓ {pantryMatched[r.id]!.length} of {pantry.length} ingredient{pantry.length === 1 ? '' : 's'}
                </div>
              )}
              {r.controls.countsVisible && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <HeartIcon width={12} height={12} fill="#fff" />
                  <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: 600 }}>{formatCount(r.counts.likes)}</span>
                </div>
              )}
            </div>
          </Button>
        ))}
      </div>
      {/* Infinite-scroll sentinel for the default grid. */}
      {!query && !pantryActive && <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />}
    </PullToRefreshView>
  );
}
