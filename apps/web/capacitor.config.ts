import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Sizzle native shell (iOS + Android) via Capacitor. The web build in `dist`
 * (built with .env.production → LAN backend) is bundled into the native app.
 * cleartext is enabled so the app can reach the local http dev backend over the
 * LAN during development; for a store build this points at an https backend.
 */
const config: CapacitorConfig = {
  appId: 'app.sizzle.mobile',
  appName: 'Sizzle',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
