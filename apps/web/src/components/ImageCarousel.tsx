import { useRef, useState } from 'react';

/**
 * Full-bleed, horizontally-swipeable photo carousel for image recipe posts.
 * Scroll-snaps between photos; dots show the current one. `touch-action: pan-x`
 * keeps horizontal swipes here while the feed still scrolls vertically.
 */
export function ImageCarousel({ images }: { images: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(Math.max(0, Math.min(images.length - 1, i)));
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="sz-hscroll"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {images.map((src, i) => (
          <div key={i} style={{ flex: '0 0 100%', width: '100%', height: '100%', scrollSnapAlign: 'center' }}>
            <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, zIndex: 6, pointerEvents: 'none' }}>
          {images.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === idx ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === idx ? '#fff' : 'rgba(255,255,255,.5)',
                boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                transition: 'width .2s ease, background .2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
