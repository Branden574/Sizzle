# Universal / App Links for getsizzle.app

These two files let a tapped `https://getsizzle.app/r/<recipe-id>` link open the
**native app** (iOS + Android) straight to that recipe, instead of the browser.
The in-app routing is already wired (Capacitor `appUrlOpen` → opens the recipe);
these files are the domain-side proof the OS checks before it will do that.

## What Branden must fill in (both are one-time, from your own accounts)

### iOS — `apple-app-site-association`
Replace `REPLACE_WITH_APPLE_TEAM_ID` with your Apple Developer **Team ID**
(Apple Developer → Membership → Team ID, a 10-char string like `AB12CD34EF`).
Final appID becomes `TEAMID.app.sizzle.mobile`.

Also enable the capability on the app:
- Xcode → App target → Signing & Capabilities → **+ Capability → Associated Domains**
  → add `applinks:getsizzle.app`. (The entitlement is already in `App.entitlements`.)

### Android — `assetlinks.json`
Replace `REPLACE_WITH_ANDROID_SIGNING_SHA256_FINGERPRINT` with your app's
**release signing certificate SHA-256**:
- If using Play App Signing: Play Console → your app → **Setup → App integrity →
  App signing** → copy the SHA-256 certificate fingerprint.
- Or from a keystore: `keytool -list -v -keystore my-release.keystore -alias my-alias`
  → copy the `SHA256:` line (colon-separated hex is fine).

You can list multiple fingerprints (e.g. upload key + Play signing key).

## Serving requirements (already handled)
- Both files must be reachable at `https://getsizzle.app/.well-known/<file>` over HTTPS
  with no redirects. They live in `apps/web/public/.well-known/` so Vercel serves them.
- `apple-app-site-association` must be served as `application/json` **with no extension** —
  a header rule in `apps/web/vercel.json` sets the content-type.

## Verify after filling in the values + deploying
- iOS: `https://app-site-association.cdn-apple.com/a/v1/getsizzle.app` (Apple's CDN cache)
  or the AASA validator; reinstall the app so it re-fetches.
- Android: `https://developers.google.com/digital-asset-links/tools/generator` or
  `adb shell pm get-app-links app.sizzle.mobile` should show `verified`.
