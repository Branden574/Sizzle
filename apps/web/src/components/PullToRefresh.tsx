import { useEffect, useRef, useState } from 'react';

/**
 * TikTok-style pull-to-refresh for any vertically-scrolling container. Pass the
 * scroll element's ref; when it's scrolled to the very top, dragging DOWN past a
 * threshold spins a loader and runs onRefresh. The touchmove listener is attached
 * non-passively so it can hold native scroll while we rubber-band the content.
 *
 * Extracted verbatim from the feed's proven implementation (Feed.tsx `FeedList`)
 * so every surface shares identical native-gesture handling instead of drifting.
 * The caller applies `offset`/`dragging` as a translateY transform on the scroll
 * element and renders <PullToRefreshSpinner> as an absolutely-positioned sibling.
 */
export function usePullToRefresh<T extends HTMLElement>(
  scrollRef: React.RefObject<T | null>,
  onRefresh: () => Promise<unknown> | unknown,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const THRESH = 64;
  const MAX = 92;
  const REST = 52;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const drag = { startY: 0, active: false };
    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      drag.active = el.scrollTop <= 0;
      drag.startY = e.touches[0]?.clientY ?? 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!drag.active || refreshingRef.current) return;
      if (el.scrollTop > 0) { drag.active = false; setDragging(false); setPull(0); return; }
      const dy = (e.touches[0]?.clientY ?? 0) - drag.startY;
      if (dy <= 0) { setDragging(false); setPull(0); return; }
      e.preventDefault(); // hold the native scroll while we rubber-band
      setDragging(true);
      setPull(Math.min(MAX, dy * 0.5)); // damped
    };
    const onEnd = () => {
      if (!drag.active) return;
      drag.active = false;
      setDragging(false);
      setPull((p) => {
        if (p >= THRESH && !refreshingRef.current) {
          refreshingRef.current = true;
          setRefreshing(true);
          Promise.resolve(onRefreshRef.current())
            .catch(() => {})
            .finally(() => {
              refreshingRef.current = false;
              setRefreshing(false);
              setPull(0);
            });
          return REST; // hold while the spinner runs
        }
        return 0;
      });
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef]);

  const offset = refreshing ? REST : pull;
  const progress = Math.min(1, pull / THRESH);
  const showIndicator = pull > 0 || refreshing;
  return { offset, dragging, refreshing, progress, showIndicator };
}

/** The rubber-band spinner shown at the top of a pull-to-refresh container. */
export function PullToRefreshSpinner({ show, progress, refreshing }: { show: boolean; progress: number; refreshing: boolean }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none', opacity: show ? 1 : 0, transition: 'opacity .2s ease' }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2.5px solid var(--line-2, rgba(128,128,128,.25))',
          borderTopColor: 'var(--accent,#ff5a36)',
          transform: refreshing ? undefined : `rotate(${progress * 300}deg)`,
          animation: refreshing ? 'sz-spin .7s linear infinite' : undefined,
          opacity: refreshing ? 1 : 0.35 + progress * 0.65,
        }}
      />
    </div>
  );
}
