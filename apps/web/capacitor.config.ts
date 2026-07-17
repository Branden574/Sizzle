import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Sizzle native shell (iOS + Android) via Capacitor. The web build in `dist`
 * is bundled into the native app:
 *   - `npm run ios` / `android` / `cap:sync`  → .env.production → HOSTED https
 *     backend. This is the TestFlight / App Store / Play build.
 *   - `npm run ios:lan` / `android:lan`        → .env.lan → local backend over
 *     the Wi-Fi LAN, for testing against a dev API on a simulator/device.
 * cleartext is enabled only so the *:lan dev builds can reach the http LAN
 * backend; the store build uses https and doesn't rely on it.
 */
const config: CapacitorConfig = {
  appId: 'app.sizzle.mobile',
  appName: 'Sizzle',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    // Show banners for pushes even while the app is in the foreground (iOS).
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // OTA live updates via Capgo Cloud. Checks the `production` channel in the
    // background and applies a downloaded JS/CSS bundle on the next resume —
    // ships hot-fixes without an App Store review (Apple 3.3.2: web-layer only,
    // no change to the app's reviewed purpose). notifyAppReady() in main.tsx
    // arms the auto-rollback if a bad bundle fails to boot. Push with:
    //   npx @capgo/cli bundle upload app.sizzle.mobile --path dist --channel production
    CapacitorUpdater: {
      appId: 'app.sizzle.mobile',
      // Apply a downloaded OTA on the next COLD LAUNCH (kill → reopen) — the
      // behavior every OTA system uses and the one users expect. It never
      // reloads mid-session (the swipe-out→feed bug that 'atBackground' caused),
      // and needs no setMultiDelay hack (that gated on a 5-min background, which
      // broke the intuitive kill-and-reopen and confused testing).
      autoUpdate: 'onLaunch',
      defaultChannel: 'production',
    },
  },
};

export default config;
