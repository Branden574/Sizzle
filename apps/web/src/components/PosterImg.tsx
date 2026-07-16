import { useEffect, useRef, useState } from 'react';

/**
 * Poster/thumbnail <img> that survives transient failures. A Cloudflare Stream
 * thumbnail can 404 for a few seconds right after a video flips ready (the
 * encoder publishes the still slightly later) — a plain <img> fails once and
 * shows a permanent broken-image icon. This retries with backoff (cache-busted
 * so the webview doesn't replay the cached failure) and, if the image truly
 * can't load, renders nothing so the card's gradient shows instead.
 */
export function PosterImg({ src, ...rest }: { src: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>) {
  const [attempt, setAttempt] = useState(0);
  const [dead, setDead] = useState(false);
  const timer = useRef<number | null>(null);

  // A new src is a new image — reset the retry state.
  useEffect(() => {
    setAttempt(0);
    setDead(false);
  }, [src]);
  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current); }, []);

  if (!src || dead) return null;

  const onError = () => {
    if (attempt >= 3) {
      setDead(true);
      return;
    }
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAttempt((a) => a + 1), 1500 * (attempt + 1));
  };

  const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`;
  return <img key={url} src={url} onError={onError} {...rest} />;
}
