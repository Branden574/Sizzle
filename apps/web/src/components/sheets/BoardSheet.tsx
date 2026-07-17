import { Button } from '../controls';
import { useBoard } from '../../data/queries';
import { boardShareUrl, nativeShare } from '../../lib/share';
import { useSizzle } from '../../store';
import { ChevronLeftIcon, ShareIcon } from '../icons';
import { PosterImg } from '../PosterImg';

/**
 * A shared PUBLIC board — someone's curated collection, opened from a /b/:id
 * link (or anywhere a board is referenced). Read-only for viewers: tap a tile
 * to open the recipe, tap the owner to visit their profile.
 */
export function BoardSheet() {
  const openBoard = useSizzle((s) => s.openBoard);
  const setOpenBoard = useSizzle((s) => s.setOpenBoard);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const { data: board, isLoading, isError } = useBoard(openBoard);

  if (!openBoard) return null;
  const close = () => setOpenBoard(null);

  const onShare = () => {
    if (!board) return;
    const url = boardShareUrl(board.id);
    void nativeShare({ title: `${board.name} · Sizzle`, url }).then((r) => {
      if (r === 'unavailable') void navigator.clipboard?.writeText(url).catch(() => {});
    });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 86, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(54px + var(--sat, 0px)) 16px 6px' }}>
        <Button onClick={close} aria-label="Back" style={{ flex: 'none', width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="var(--text)" strokeWidth={2.2} />
        </Button>
        <div style={{ flex: 1 }} />
        {board && (
          <Button onClick={onShare} aria-label="Share board" style={{ flex: 'none', width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ShareIcon size={18} stroke="var(--text)" strokeWidth={2} />
          </Button>
        )}
      </div>

      {isLoading && <div style={{ padding: '60px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>Loading board…</div>}
      {isError && <div style={{ padding: '60px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>This board is private or gone.</div>}

      {board && (
        <div style={{ padding: '4px 22px 110px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Board</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 34, lineHeight: 1.05, color: 'var(--text)', marginTop: 4 }}>{board.name}</div>
          <Button onClick={() => setOpenCook(board.owner.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: board.owner.avatarColor, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 13, color: '#fff' }}>
              {board.owner.avatarUrl ? <img src={board.owner.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : board.owner.init}
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-muted)' }}>by @{board.owner.handle} · {board.recipes.length} recipe{board.recipes.length === 1 ? '' : 's'}</span>
          </Button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
            {board.recipes.map((r) => (
              <Button key={r.id} onClick={() => setOpenRecipe(r.id)} style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 18, overflow: 'hidden', position: 'relative', aspectRatio: '3 / 4', background: r.bg, textAlign: 'left' }}>
                {(r.video?.posterUrl || r.images[0]) && <PosterImg src={(r.video?.posterUrl || r.images[0])!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.7))' }} />
                <div style={{ position: 'absolute', left: 12, right: 12, bottom: 11, fontFamily: "'Instrument Serif',serif", fontSize: 18, lineHeight: 1.08, color: '#fff' }}>{r.title}</div>
              </Button>
            ))}
          </div>
          {board.recipes.length === 0 && (
            <div style={{ marginTop: 26, padding: 28, textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--line-2)', borderRadius: 20, color: 'var(--text-faint-2)', fontSize: 14 }}>
              This board is empty so far.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
