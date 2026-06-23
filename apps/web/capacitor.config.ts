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
  },
};

export default config;
