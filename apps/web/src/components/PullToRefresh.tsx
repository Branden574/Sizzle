import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { hapticArm, hapticError, hapticSuccess } from '../lib/haptics';

export type RefreshPhase = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'success' | 'failed';

/**
 * TikTok-style pull-to-refresh for any vertically-scrolling container. Pass the scroll
 * element's ref; when it's at the top, dragging DOWN past a threshold arms the gesture
 * (one light haptic + "Release to refresh"), and releasing runs onRefresh. Success and
 * failure each get their own subtle haptic + a brief visible result ("Refreshed" /
 * "Couldn't refresh"); existing content stays visible throughout and a failed refresh
 * keeps it. Arming has hysteresis so a trembling finger at the threshold can't retrigger.
 *
 * IMPORTANT: onRefresh must REJECT on failure for the failed state to show — TanStack
 * Query's refetch/refetchQueries swallow errors unless you pass { throwOnError: true }.
 *
 * The touchmove listener is non-passive so it can hold native scroll while we rubber-band.
 * One reusable system across every surface (feeds, profiles, saved, notifications) so the
 * feel never drifts. Pair with <PullToRefreshSpinner> as an absolutely-positioned sibling.
 */
export function usePullToRefresh<T extends HTMLElement>(
  scrollRef: React.RefObject<T | null>,
  onRefresh: () => Promise<unknown> | unknown,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<RefreshPhase>('idle');
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const refreshingRef = useRef(false);
  const armedRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const THRESH = 64;
  const DISARM = 52; // hysteresis floor: once armed, stay armed until the pull drops below this
  const MAX = 92;
  const REST = 52;

  // The actual refresh run — shared by the release gesture AND the accessible non-gesture
  // trigger. Stored in a ref so the touch handler (bound once) always calls the latest onRefresh.
  const runRefreshRef = useRef<() => void>(() => {});
  runRefreshRef.current = () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPhase('refreshing');
    setPull(REST);
    Promise.resolve(onRefreshRef.current())
      .then(() => { setPhase('success'); hapticSuccess(); })
      .catch(() => { setPhase('failed'); hapticError(); })
      .finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        setPull(0);
        if (resetTimer.current) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setPhase('idle'), 750);
      });
  };
  // Accessible non-gesture refresh: an SR-only button in the indicator calls this, for
  // VoiceOver/switch users who can't perform the pull gesture.
  const refresh = useCallback(() => runRefreshRef.current(), []);

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
      if (el.scrollTop > 0) { drag.active = false; setDragging(false); setPull(0); armedRef.current = false; setPhase('idle'); return; }
      const dy = (e.touches[0]?.clientY ?? 0) - drag.startY;
      if (dy <= 0) { setDragging(false); setPull(0); armedRef.current = false; setPhase('idle'); return; }
      e.preventDefault(); // hold native scroll while we rubber-band
      setDragging(true);
      const next = Math.min(MAX, dy * 0.5); // damped
      setPull(next);
      // Hysteresis: arm at THRESH, but once armed only disarm below DISARM — so a finger
      // hovering at the exact threshold can't machine-gun the arm haptic.
      const nowArmed = armedRef.current ? next >= DISARM : next >= THRESH;
      if (nowArmed && !armedRef.current) { armedRef.current = true; setPhase('armed'); hapticArm(); }
      else if (!nowArmed && armedRef.current) { armedRef.current = false; setPhase('pulling'); }
      else if (!armedRef.current) setPhase('pulling');
    };
    const onEnd = () => {
      if (!drag.active) return;
      drag.active = false;
      setDragging(false);
      const wasArmed = armedRef.current;
      armedRef.current = false;
      if (wasArmed) {
        runRefreshRef.current(); // holds at REST, runs onRefresh, shows the result, settles
      } else {
        setPull(0);
        setPhase('idle');
      }
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
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [scrollRef]);

  const resting = phase === 'success' || phase === 'failed';
  const offset = refreshing || resting ? REST : pull;
  const progress = Math.min(1, pull / THRESH);
  const armed = pull >= THRESH;
  const showIndicator = pull > 0 || refreshing || resting;
  // Centralized settle transition so every caller honors reduced-motion identically.
  const settleTransition = dragging || reducedMotion ? 'none' : 'transform .34s cubic-bezier(.16,1,.3,1)';
  return { offset, dragging, refreshing, progress, armed, phase, showIndicator, settleTransition, reducedMotion, refresh };
}

/**
 * Drop-in scroll container with pull-to-refresh baked in. Give it the scroll styles you'd
 * put on your own `overflowY:auto` div; it owns the ref, gesture, flame indicator, and the
 * rubber-band transform. Use for simple full-screen surfaces (Saved, Discover, profiles);
 * for containers with their own stacking/scroll quirks (the snap feed), use the hook directly.
 */
export function PullToRefreshView({
  onRefresh, label, style, children,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  label?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ptr = usePullToRefresh(scrollRef, onRefresh);
  return (
    <>
      <PullToRefreshSpinner show={ptr.showIndicator} progress={ptr.progress} refreshing={ptr.refreshing} armed={ptr.armed} phase={ptr.phase} label={label} onManualRefresh={ptr.refresh} />
      <div
        ref={scrollRef}
        style={{
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch',
          ...style,
          transform: ptr.offset ? `translateY(${ptr.offset}px)` : undefined,
          transition: ptr.settleTransition,
        }}
      >
        {children}
      </div>
    </>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};

/** The Sizzle flame that grows as you pull and flickers while refreshing. */
function Flame({ scale, lit, refreshing, reducedMotion }: { scale: number; lit: boolean; refreshing: boolean; reducedMotion: boolean }) {
  const gid = useId();
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={refreshing && !reducedMotion ? 'sz-flame-flicker' : undefined}
      style={{
        transform: refreshing && !reducedMotion ? undefined : `scale(${scale})`,
        transformOrigin: 'center bottom',
        filter: lit ? 'drop-shadow(0 0 6px rgba(255,110,40,.55))' : 'none',
        transition: refreshing || reducedMotion ? undefined : 'transform .06s linear, filter .2s ease',
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff5a36" />
          <stop offset="100%" stopColor="var(--saffron,#f4a52c)" />
        </linearGradient>
      </defs>
      <path
        d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"
        fill={`url(#${gid})`}
        opacity={lit ? 1 : 0.4 + scale * 0.4}
      />
    </svg>
  );
}

/**
 * The pull-to-refresh indicator: a growing/flickering Sizzle flame + a short state label,
 * plus a visually-hidden aria-live region so screen readers announce refresh/result.
 * Render as an absolutely-positioned sibling of the scroll container.
 */
export function PullToRefreshSpinner({
  phase, progress, refreshing, armed, show, label, onManualRefresh,
}: {
  phase: RefreshPhase;
  progress: number;
  refreshing: boolean;
  armed: boolean;
  show: boolean;
  /** Noun for the aria-live announcement + label, e.g. "feed", "profile" (default "content"). */
  label?: string;
  /** When provided, renders an SR-only "Refresh <noun>" button — an accessible refresh for
   *  VoiceOver/switch users who can't perform the pull gesture. */
  onManualRefresh?: () => void;
}) {
  const noun = label ?? 'content';
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  const resting = phase === 'success' || phase === 'failed';
  const text =
    phase === 'success' ? 'Refreshed' :
    phase === 'failed' ? "Couldn't refresh" :
    refreshing ? 'Refreshing…' : armed ? 'Release to refresh' : 'Pull to refresh';
  const aria =
    phase === 'refreshing' ? `Refreshing ${noun}` :
    phase === 'success' ? `${Noun} refreshed` :
    phase === 'failed' ? `Couldn't refresh — existing ${noun} still available` : '';
  const scale = refreshing || resting ? 1 : 0.55 + Math.min(1, progress) * 0.45;
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <>
      <div aria-live="polite" role="status" style={SR_ONLY}>{aria}</div>
      {onManualRefresh && (
        <button type="button" onClick={onManualRefresh} disabled={refreshing} style={{ ...SR_ONLY, pointerEvents: 'auto' }}>
          {`Refresh ${noun}`}
        </button>
      )}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 74,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          zIndex: 5, pointerEvents: 'none',
          opacity: show ? 1 : 0, transition: 'opacity .2s ease',
        }}
      >
        <Flame scale={scale} lit={armed || refreshing || resting} refreshing={refreshing} reducedMotion={reducedMotion} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.02em', color: 'var(--text-faint,#9a8f86)', textShadow: '0 1px 2px rgba(0,0,0,.35)' }}>{text}</div>
      </div>
    </>
  );
}
