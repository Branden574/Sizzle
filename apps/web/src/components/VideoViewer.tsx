import { useLayoutEffect, useRef } from 'react';
import { useSizzle } from '../store';
import { ErrorBoundary } from './ErrorBoundary';
import { FeedCard } from './Feed';

/**
 * Full-screen, swipeable feed-style player (TikTok-style). Opened from a profile
 * grid (the whole tab's videos) or the recipe view (a single clip). Reuses the
 * exact feed card and a vertical snap-scroll, so swiping up/down moves between
 * posts. Sits at z-80 — below the rail's comment/repost/more sheets.
 */
export function VideoViewer() {
  const viewer = useSizzle((s) => s.viewer);
  const setViewer = useSizzle((s) => s.setViewer);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Jump to the tapped item when the viewer opens (before paint, no flash).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && viewer) el.scrollTop = viewer.index * el.clientHeight;
  }, [viewer]);

  if (!viewer) return null;
  const close = () => setViewer(null);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: '#0c0a09', animation: 'sz-fadeIn .2s' }}>
      <div ref={scrollRef} style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory' }}>
        {viewer.items.map((card) => (
          <ErrorBoundary key={card.id}>
            <FeedCard card={card} onClose={close} />
          </ErrorBoundary>
        ))}
      </div>
    </div>
  );
}
