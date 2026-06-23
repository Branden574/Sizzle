# Biometric unlock & persistent login

Two related native features. Unlike push, **neither needs any external credentials** —
just a `cap sync` and one iOS Info.plist key (already added).

## Persistent login (stay signed in like TikTok / IG / X)

The Supabase session is stored in **Capacitor Preferences** (iOS `NSUserDefaults`
/ Android `SharedPreferences`) on native instead of WebView `localStorage`, which
iOS can evict. See the `nativeStorage` adapter in
[apps/web/src/lib/supabase.ts](../apps/web/src/lib/supabase.ts). Result: closing
the app and reopening drops you straight into the feed — no re-login. Web is
unchanged (default `localStorage`).

- Plugin: `@capacitor/preferences` (installed).
- Setup: just `npx cap sync ios` / `npx cap sync android`. No config.
- Note: existing native installs migrate once (the old localStorage session
  isn't read by the new adapter) — users sign in one more time, then it sticks.

## Biometric app-lock (Face ID / Touch ID / fingerprint)

Opt-in, **off by default**. Settings → Security → "Unlock with Face ID / Touch ID".
When on: the app shows a lock on launch and when returning from the background
([BiometricLock.tsx](../apps/web/src/components/BiometricLock.tsx)), and the
keychain-stashed refresh token restores an expired session after a biometric
check ("faster re-login"). All logic is in
[apps/web/src/lib/biometric.ts](../apps/web/src/lib/biometric.ts) +
[apps/web/src/App.tsx](../apps/web/src/App.tsx); it's a no-op on web.

- Plugins: `@capgo/capacitor-native-biometric`, `@capacitor/app` (installed).
- iOS: `NSFaceIDUsageDescription` added to
  [Info.plist](../apps/web/ios/App/App/Info.plist). Run `npx cap sync ios`.
- Android: the plugin adds the `USE_BIOMETRIC` permission via manifest merge.
  Run `npx cap sync android`.
- Fails **open**: if biometrics aren't enrolled/available, the lock is skipped
  so a user is never trapped. The lock screen also has a "Log out instead"
  escape hatch.

## Testing

Both require a **physical device** (biometrics don't work on the simulator, and
session persistence is only meaningfully different from web on a real install).
Build to a device, sign in, enable the Security toggle, background/relaunch the
app to see the lock, and confirm a cold start lands straight in the feed.
