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
