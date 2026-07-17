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

  // Session-safe OTA policy: a pending update may apply only after the app has
  // been BACKGROUNDED for 5+ minutes (a natural session boundary). Quick
  // app-switches never reload the WebView mid-session (protecting recordings,
  // drafts, uploads), but real absences let updates through promptly.
  //
  // Do NOT use kind:'kill' here: the plugin clears the kill condition at native
  // launch and blocks installNext() while ANY condition exists — re-arming it at
  // every JS boot (which is unavoidable, this code runs each boot) permanently
  // wedges updates: downloaded bundles sit pending forever. Field-hit on build
  // 26 (device stuck on 1.0.62 with 1.0.64 downloaded). The background condition
  // self-evaluates per event, so per-boot re-arming is safe.
  void CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: 'background', value: '300000' }] }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
