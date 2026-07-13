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

// OTA live updates: tell Capgo this bundle booted successfully. If we never call
// this (e.g. a hot-fix bundle white-screens on launch), Capgo auto-rolls back to
// the last good bundle after appReadyTimeout — the safety net for OTA pushes.
// No-op on web.
if (Capacitor.isNativePlatform()) {
  void CapacitorUpdater.notifyAppReady();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
