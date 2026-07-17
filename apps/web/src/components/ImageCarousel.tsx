import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Full-bleed, horizontally-swipeable photo carousel for image recipe posts.
 *
 * IMPORTANT (iOS WKWebView): this deliberately does NOT use a native
 * overflow-x scroller. On iOS a nested `-webkit-overflow-scrolling:touch` /
 * `overflow-x:auto` element becomes a UIScrollView that CLAIMS the whole touch
 * sequence at touchstart and will not hand an orthogonal (vertical) pan back to
 * the parent feed scroller — which locked the TikTok feed on a photo card.
 *
 * Instead the track is moved with `transform: translateX()` and we decide the
 * dominant axis on the first significant move:
 *   - horizontal  -> lock horizontal, preventDefault, drag the track
 *   - vertical    -> do NOTHING (never preventDefault) so the pan bubbles to the
 *                    parent feed's native snap-scroll
 * `touch-action: pan-y` tells iOS up-front that vertical belongs to scrolling,
 * so it routes vertical gestures to the feed immediately without waiting on JS.
 * Single-image posts render a plain <img> with no gesture handling at all.
 */
export function ImageCarousel({ images }: { images: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;

  const count = images.length;
  // Primary pointer is touch? (phones / native app). Arrows only render for
  // fine pointers (mouse/trackpad) so desktop stays navigable.
  const [coarse] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
  );

  const SETTLE = 'transform .3s cubic-bezier(.22,1,.36,1)';

  const applyTransform = (i: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? SETTLE : 'none';
    track.style.transform = `translate3d(${-i * 100}%,0,0)`;
  };

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(count - 1, i));
    applyTransform(clamped, true);
    setIdx(clamped);
  };

  // Initial position (and re-sync if the image count changes).
  useEffect(() => {
    const next = Math.min(idxRef.current, Math.max(0, count - 1));
    applyTransform(next, false);
    if (next !== idxRef.current) setIdx(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Direction-locked touch swiper. Listeners are attached non-passively so we
  // can preventDefault a horizontal pan; a vertical pan is never touched, so it
  // falls through to the parent feed scroller.
  useEffect(() => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track || count <= 1) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let dx = 0;
    let locked: 'x' | 'y' | null = null;
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { active = false; locked = null; return; }
      const t = e.touches[0]!;
      startX = t.clientX;
      startY = t.clientY;
      startT = e.timeStamp;
      dx = 0;
      locked = null;
      active = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      if (!t) return;
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (locked === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; // wait for intent
        locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
        if (locked === 'y') { active = false; return; } // hand vertical to the feed
      }
      if (locked === 'x') {
        e.preventDefault();  // own the horizontal pan
        e.stopPropagation(); // keep the feed's pull-to-refresh out of a diagonal swipe
        dx = mx;
        // Rubber-band at the first/last image so the edges feel bounded.
        const atStart = idxRef.current === 0 && dx > 0;
        const atEnd = idxRef.current === count - 1 && dx < 0;
        const move = atStart || atEnd ? dx * 0.35 : dx;
        track.style.transition = 'none';
        track.style.transform = `translate3d(calc(${-idxRef.current * 100}% + ${move}px),0,0)`;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (locked !== 'x') { active = false; locked = null; return; }
      const width = el.clientWidth || 1;
      const elapsed = e.timeStamp - startT;
      const flick = Math.abs(dx) > 40 && elapsed < 250;
      let next = idxRef.current;
      if (dx <= -width * 0.2 || (flick && dx < 0)) next = idxRef.current + 1;
      else if (dx >= width * 0.2 || (flick && dx > 0)) next = idxRef.current - 1;
      next = Math.max(0, Math.min(count - 1, next));
      applyTransform(next, true);
      if (next !== idxRef.current) setIdx(next);
      active = false;
      locked = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Single image: no swiper, no gesture capture — a plain full-bleed photo.
  if (count <= 1) {
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {count === 1 && (
          <img
            src={images[0]}
            alt=""
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'pan-y' }}
    >
      <div
        ref={trackRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          willChange: 'transform',
          transform: `translate3d(${-idx * 100}%,0,0)`,
          backfaceVisibility: 'hidden',
        }}
      >
        {images.map((src, i) => (
          <div key={i} style={{ flex: '0 0 100%', width: '100%', height: '100%' }}>
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
            />
          </div>
        ))}
      </div>

      {/* Prev / next arrows for pointer devices (mouse/trackpad). Hidden on
          touch, where swiping is the interaction. */}
      {!coarse && (
        <>
          {idx > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => { e.stopPropagation(); goTo(idx - 1); }}
              style={arrowStyle('left')}
            >
              <Chevron dir="left" />
            </button>
          )}
          {idx < count - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); goTo(idx + 1); }}
              style={arrowStyle('right')}
            >
              <Chevron dir="right" />
            </button>
          )}
        </>
      )}

      {/* Page dots. Offset by the safe-area top so they clear the notch/Dynamic
          Island on the full-bleed feed (where top:14 hid them entirely), and sit
          in a subtle pill so white dots stay visible over a bright photo. */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 5, zIndex: 6, pointerEvents: 'none', padding: '5px 8px', borderRadius: 100, background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(4px)' }}>
        {images.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === idx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i === idx ? '#fff' : 'rgba(255,255,255,.55)',
              boxShadow: '0 1px 3px rgba(0,0,0,.4)',
              transition: 'width .2s ease, background .2s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function arrowStyle(side: 'left' | 'right'): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 10,
    transform: 'translateY(-50%)',
    zIndex: 7,
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    background: 'rgba(0,0,0,.4)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
  };
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}
