/**
 * Shared app-boot progress for the launch loading screen.
 *
 * The bar trickles smoothly toward a ceiling (so it always looks alive) and
 * completes to 100% the moment the app is genuinely interactive — `markBootReady`
 * is called when the first real screen's data has loaded (see Feed). The displayed
 * value lives at module scope so it stays continuous across the two loading
 * surfaces (auth Splash → Feed loading), instead of resetting when one unmounts.
 */
import { useEffect, useReducer } from 'react';

let displayed = 12;
let ready = false;
let raf = 0;
let failsafe = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function tick() {
  raf = 0;
  const cap = ready ? 100 : 90;
  // Ease toward the ceiling with a small constant creep so a slow network never
  // looks frozen; clamp so we never overshoot the ceiling (or 100).
  displayed += (cap - displayed) * 0.045 + 0.06;
  if (displayed > cap) displayed = cap;
  if (displayed > 100) displayed = 100;
  emit();
  if (displayed < 100) raf = requestAnimationFrame(tick);
}

function ensureTicking() {
  if (!raf && displayed < 100) raf = requestAnimationFrame(tick);
  // Backstop: if no explicit ready signal arrives (e.g. a screen with no data
  // fetch), finish anyway rather than sit at the ceiling forever.
  if (!failsafe) failsafe = window.setTimeout(markBootReady, 8000);
}

export function markBootReady(): void {
  if (ready) return;
  ready = true;
  ensureTicking();
}

export function isBootReady(): boolean {
  return ready;
}

export function getBootProgress(): number {
  return Math.round(displayed);
}

export function subscribeBoot(l: () => void): () => void {
  listeners.add(l);
  ensureTicking();
  return () => {
    listeners.delete(l);
  };
}

/** React hook: the live boot-progress percentage (0–100). */
export function useBootProgress(): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeBoot(force), []);
  return getBootProgress();
}
