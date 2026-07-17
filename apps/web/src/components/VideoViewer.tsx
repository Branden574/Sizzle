import { useLayoutEffect, useRef, useState } from 'react';
import { useSizzle } from '../store';
import { ErrorBoundary } from './ErrorBoundary';
import { FeedCard } from './Feed';

/**
 * Full-screen, swipeable feed-style player (TikTok-style). Opened from a profile
 * grid (the whole tab's videos) or the recipe view (a single clip). Reuses the
 * exact feed card and a vertical snap-scroll, so swiping up/down moves between
 * posts. Sits at z-80 — below the rail's comment/repost/more sheets.
 *
 * Dismissal: the ✕ button, or DRAG DOWN on the top bar — the sheet follows the
 * finger (TikTok-style) and closes past a threshold, springs back otherwise.
 * The drag zone is only the top strip, so vertical swipes on the video itself
 * keep navigating between posts.
 */
export function VideoViewer() {
  const viewer = useSizzle((s) => s.viewer);
  const setViewer = useSizzle((s) => s.setViewer);
  // Pause the viewer's video when a full-screen sheet opens OVER it (tapping a
  // creator's name/avatar opens their profile above this viewer — the clip must
  // stop, not keep playing audio underneath). Mirrors the feed's suppression;
  // partial sheets (comments/share) intentionally let playback continue.
  const suppressed = useSizzle((s) => !!(s.openRecipe || s.openCook || s.cookFor || s.showUpload));
  const scrollRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);

  // Drag-to-dismiss on the top strip.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ y0: number; moved: boolean } | null>(null);

  // Jump to the tapped item ONCE when the viewer opens (before paint, no flash).
  // Guarded so optimistic patches to viewer.items (like/save/follow now update the
  // snapshot live) don't re-fire this and yank the user back to the tapped index.
  // Clamp the index so a delete/refresh that shrank the list can't blank the view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!viewer || !viewer.items.length) {
      positioned.current = false; // reset for the next time the viewer opens
      return;
    }
    if (positioned.current) return;
    positioned.current = true;
    if (el) {
      const idx = Math.min(viewer.index, viewer.items.length - 1);
      el.scrollTop = idx * el.clientHeight;
    }
  }, [viewer]);

  if (!viewer || viewer.items.length === 0) return null;
  const close = () => setViewer(null);

  const onStripDown = (e: React.PointerEvent) => {
    dragState.current = { y0: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onStripMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && dy > 8) { d.moved = true; setDragging(true); }
    if (d.moved) setDragY(Math.max(0, dy));
  };
  const onStripUp = (e: React.PointerEvent) => {
    const d = dragState.current;
    dragState.current = null;
    if (d?.moved) {
      setDragging(false);
      if (dragY > 110) { setDragY(0); close(); return; }
      setDragY(0);
    } else if (d) {
      // Clean tap: the strip covers the card's ✕ (top-left) — forward it.
      if (e.clientX < 74 && e.clientY > 36 && e.clientY < 104) close();
    }
  };

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 80, background: '#0c0a09', animation: 'sz-fadeIn .2s',
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? 'none' : 'transform .22s ease',
        borderRadius: dragY > 0 ? 18 : 0,
        overflow: 'hidden',
      }}
    >
      <div ref={scrollRef} style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory', overscrollBehaviorY: 'contain' }}>
        {viewer.items.map((card) => (
          <ErrorBoundary key={card.id}>
            <FeedCard card={card} onClose={close} suppressed={suppressed} />
          </ErrorBoundary>
        ))}
      </div>
      {/* Top drag strip — swipe down here to dismiss (touchAction none so the
          gesture doesn't fight the snap scroller underneath). */}
      <div
        onPointerDown={onStripDown}
        onPointerMove={onStripMove}
        onPointerUp={onStripUp}
        onPointerCancel={onStripUp}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'calc(env(safe-area-inset-top, 0px) + 96px)', zIndex: 40, touchAction: 'none' }}
      />
    </div>
  );
}
