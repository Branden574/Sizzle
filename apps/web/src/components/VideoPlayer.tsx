import { useEffect, useRef, useState } from 'react';
import { useSizzle } from '../store';
import { PlayIcon, RotateIcon, SpeakerIcon, SpeakerOffIcon } from './icons';

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Plays a recipe clip. MP4 (uploads) plays natively; HLS uses hls.js where the
 * browser lacks native support. Autoplays (looped) the active card when the
 * Autoplay pref is on; tap toggles play/pause; a draggable progress bar (above
 * the nav) seeks. Audio is global-muted by default with an unmute control.
 */
export function VideoPlayer({ src, poster, active, immersive = false }: { src: string; poster?: string | null; active: boolean; immersive?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // True once the user manually pauses this clip, so a later 'canplay' (from a
  // buffer stall or seek) doesn't silently resume it against their intent.
  const userPausedRef = useRef(false);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [aspect, setAspect] = useState(0); // intrinsic width / height
  const [rotated, setRotated] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const muted = useSizzle((s) => s.muted);
  // Data saver suppresses autoplay (tap to play) to spare mobile bandwidth.
  const autoplay = useSizzle((s) => s.autoplay && !s.dataSaver);
  const toggleMuted = useSizzle((s) => s.toggleMuted);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;

    if (src.includes('.m3u8') && !v.canPlayType('application/vnd.apple.mpegurl')) {
      void import('hls.js').then(({ default: Hls }) => {
        if (destroyed) return;
        if (Hls.isSupported()) {
          // Mobile-friendly tuning: cap decode resolution to the player size
          // (don't software-decode 4K on a phone) and keep buffers small so a
          // feed of clips doesn't pile up memory — smoother on Android WebView.
          const h = new Hls({
            enableWorker: true,
            capLevelToPlayerSize: true,
            maxBufferLength: 10,
            maxMaxBufferLength: 20,
            backBufferLength: 10,
          });
          h.loadSource(src);
          h.attachMedia(v);
          hls = h;
        } else {
          v.src = src;
        }
      });
    } else {
      v.src = src;
    }
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  // Start playback whenever the card becomes active OR the source (re)loads.
  // Keying only on [active, autoplay] raced the src/HLS assignment: play() could
  // be called before the source was ready (and aborted by it), with nothing to
  // retry afterwards — so the active card sat paused on a black frame. We now
  // also depend on `src` and retry on 'canplay', muting first so autoplay is
  // allowed by browser policy.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!(active && autoplay)) {
      v.pause();
      return;
    }
    userPausedRef.current = false; // a freshly-active clip (or new src) autoplays
    // muted is kept in sync by its own effect; don't depend on it here, or
    // toggling sound would re-run this and resume a manually-paused clip.
    const tryPlay = () => { if (!userPausedRef.current) void v.play().catch(() => {}); };
    tryPlay();
    v.addEventListener('canplay', tryPlay);
    return () => v.removeEventListener('canplay', tryPlay);
  }, [active, autoplay, src]);

  // Un-rotate when the card scrolls out of view so each clip starts upright.
  useEffect(() => {
    if (!active && rotated) setRotated(false);
  }, [active, rotated]);

  // Measure the player box so a rotated (landscape) video can be sized to fill it.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isLandscape = aspect > 1.05;

  const togglePlay = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { userPausedRef.current = false; void v.play().catch(() => {}); }
    else { userPausedRef.current = true; v.pause(); }
  };

  // Seek from a pointer x within the progress bar.
  const seekFromX = (clientX: number) => {
    const v = ref.current;
    const bar = barRef.current;
    if (!v || !bar || !Number.isFinite(v.duration) || v.duration === 0) return;
    const rect = bar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setProgress(frac);
    v.currentTime = frac * v.duration;
  };

  const onBarDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    barRef.current?.setPointerCapture(e.pointerId);
    setScrubbing(true);
    seekFromX(e.clientX);
  };
  const onBarMove = (e: React.PointerEvent) => {
    if (!scrubbing) return;
    e.stopPropagation();
    seekFromX(e.clientX);
  };
  const onBarUp = (e: React.PointerEvent) => {
    if (!scrubbing) return;
    e.stopPropagation();
    barRef.current?.releasePointerCapture(e.pointerId);
    setScrubbing(false);
  };

  const cur = duration * progress;

  // In immersive (hold-to-hide) mode the player chrome fades out too.
  const chromeFade: React.CSSProperties = {
    opacity: immersive ? 0 : 1,
    pointerEvents: immersive ? 'none' : 'auto',
    transition: 'opacity .28s ease',
  };

  // In the vertical feed every clip fills edge-to-edge ('cover') for a full-bleed
  // look — portrait and landscape alike (landscape is center-cropped, like TikTok;
  // the rotate button reveals the whole frame). Rotated landscape fills the box
  // with axes swapped to simulate turning the phone.
  const videoStyle: React.CSSProperties =
    rotated && box
      ? { position: 'absolute', top: '50%', left: '50%', width: box.h, height: box.w, transform: 'translate(-50%,-50%) rotate(90deg)', objectFit: 'cover' }
      : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };

  return (
    <div ref={wrapRef} onClick={togglePlay} style={{ position: 'absolute', inset: 0, cursor: 'pointer', background: rotated ? '#000' : 'transparent' }}>
      <video
        ref={ref}
        poster={poster ?? undefined}
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration || 0);
          if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
        }}
        onTimeUpdate={(e) => { if (!scrubbing) { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); } }}
        style={videoStyle}
      />
      {paused && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PlayIcon size={26} />
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); toggleMuted(); }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        style={{ position: 'absolute', top: 96, left: 16, zIndex: 25, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...chromeFade }}
      >
        {muted ? <SpeakerOffIcon size={20} /> : <SpeakerIcon size={20} />}
      </button>

      {/* Landscape clips can be rotated to a phone-turned full-screen view. */}
      {isLandscape && (
        <button
          onClick={(e) => { e.stopPropagation(); setRotated((r) => !r); }}
          aria-label={rotated ? 'Exit full screen' : 'Rotate to full screen'}
          style={{ position: 'absolute', top: 140, left: 16, zIndex: 25, width: 38, height: 38, borderRadius: '50%', border: 'none', background: rotated ? 'rgba(226,58,24,.85)' : 'rgba(0,0,0,.28)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...chromeFade }}
        >
          <RotateIcon size={20} stroke="#fff" strokeWidth={2} />
        </button>
      )}

      {/* Scrubber — just above the bottom nav. Tall transparent hit area, thin visible track. */}
      <div
        ref={barRef}
        onPointerDown={onBarDown}
        onPointerMove={onBarMove}
        onPointerUp={onBarUp}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 10, right: 10, bottom: 'calc(60px + max(var(--sab, 0px), 24px))', height: 22, zIndex: 22, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', ...chromeFade }}
      >
        <div style={{ position: 'relative', width: '100%', height: scrubbing ? 6 : 3, borderRadius: 3, background: 'rgba(255,255,255,.3)', transition: 'height .15s' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: '#fff', borderRadius: 3 }} />
          {scrubbing && <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }} />}
        </div>
        {scrubbing && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(cur)} / {fmt(duration)}
          </div>
        )}
      </div>
    </div>
  );
}
