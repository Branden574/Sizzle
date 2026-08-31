import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import App from './App';
import { queryClient } from './data/queries';
import { initSentry } from './lib/sentry';
import './index.css';

initSentry();

/**
 * Recover from a stale-chunk load after a deploy.
 *
 * Vite fingerprints every chunk, and Vercel only serves the CURRENT deployment's /assets — every
 * previous deploy's chunk URLs 404 immediately (verified: prior hashes for the entry, AppShell and
 * Marketing chunks all return 404 on getsizzle.app). So a tab open across a deploy holds the old
 * index.html, and the first lazy import() it attempts — Marketing, AppShell, AdminDashboard —
 * fetches a file that no longer exists and rejects with "TypeError: Importing a module script
 * failed". Marketing and AdminDashboard have no error boundary above them, so on the public
 * landing page that is a white screen with no way out.
 *
 * `vite:preloadError` is the hook Vite fires for precisely this. Reloading picks up the fresh
 * index.html and its current hashes, which is the whole fix — the user's own chunk request is
 * what tells us the page is stale.
 *
 * Guarded by a timestamp, not a boolean: a genuinely broken deploy must not reload-loop, but a
 * tab left open across a LATER deploy still needs to heal. One reload per 30s window does both.
 */
const CHUNK_RELOAD_KEY = 'sz.chunkReloadAt';
window.addEventListener('vite:preloadError', (event) => {
  // Stop it surfacing as an unhandled rejection (and as Sentry noise on every deploy) — it is
  // expected, and it self-heals below.
  event.preventDefault();
  let last = 0;
  try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0; } catch { /* private mode */ }
  if (Date.now() - last < 30_000) return; // already tried very recently — let the UI fail visibly
  try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())); } catch { /* private mode */ }
  window.location.reload();
});

if (Capacitor.isNativePlatform()) {
  // Lock the WebView viewport on native. iOS auto-zooms when any <input> under
  // 16px gains focus, and because the base viewport allows user scaling it stays
  // stuck zoomed with no way to reset — this is the "adding a link zoomed my
  // screen and I can't fix it" bug. A native app never pinch-zooms its own chrome,
  // so disable scaling here; the web build (index.html) keeps pinch-zoom for a11y.
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

  // OTA live updates: tell Capgo this bundle booted successfully. If we never call
  // this (e.g. a hot-fix bundle white-screens on launch), Capgo auto-rolls back to
  // the last good bundle after appReadyTimeout — the safety net for OTA pushes.
  void CapacitorUpdater.notifyAppReady();

  // OTA apply timing is handled natively by autoUpdate:'onLaunch' (capacitor
  // .config.ts) — a downloaded bundle applies on the next cold start. No runtime
  // delay condition needed (an earlier setMultiDelay approach caused an OTA wedge
  // and a confusing 5-min-background requirement — removed).
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
