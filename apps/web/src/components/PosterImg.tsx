import { useEffect, useRef, useState } from 'react';

/**
 * Poster/thumbnail <img> that survives transient failures. A Cloudflare Stream
 * thumbnail can 404 for a few seconds right after a video flips ready (the
 * encoder publishes the still slightly later) — a plain <img> fails once and
 * shows a permanent broken-image icon. This retries with backoff (cache-busted
 * so the webview doesn't replay the cached failure) and, if the image truly
 * can't load, renders nothing so the card's gradient shows instead.
 *
 * Smoothness details (the "flicker for a frame" fixes):
 * - ONE persistent <img> whose src mutates — no key={url}. A keyed remount destroys
 *   the current bitmap, guaranteeing a blank frame; mutating src keeps showing the
 *   previous bitmap until the replacement finishes decoding.
 * - Retry state resets SYNCHRONOUSLY during render when src changes (React's
 *   render-time derived-state pattern), not in an effect — the effect version
 *   composed the new src with the STALE attempt for one frame, firing a
 *   cache-busted fetch of the wrong URL and then a second fetch after reset.
 */
export function PosterImg({ src, ...rest }: { src: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>) {
  const [st, setSt] = useState({ src, attempt: 0, dead: false });
  const timer = useRef<number | null>(null);

  // A new src is a new image — reset retry state before this render commits.
  if (st.src !== src) setSt({ src, attempt: 0, dead: false });

  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current); }, []);

  if (!src || (st.src === src && st.dead)) return null;

  const onError = () => {
    if (st.src !== src) return; // stale error from a prior src
    if (st.attempt >= 3) {
      setSt({ src, attempt: st.attempt, dead: true });
      return;
    }
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setSt((cur) => (cur.src === src ? { ...cur, attempt: cur.attempt + 1 } : cur)),
      1500 * (st.attempt + 1),
    );
  };

  const attempt = st.src === src ? st.attempt : 0;
  const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`;
  return <img src={url} onError={onError} decoding="async" {...rest} />;
}
