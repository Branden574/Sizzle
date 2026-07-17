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

  // Apply pending OTA updates ONLY after the app is KILLED — never on a mere
  // backgrounding. The config's autoUpdate:'atBackground' reloaded the whole
  // WebView the moment the user swiped out with an update pending, destroying
  // whatever they were doing (an in-progress recording, a half-written post, an
  // upload) and dumping them back on the feed. A quick app-switch must be safe.
  void CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: 'kill' }] }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
