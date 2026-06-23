# Push notifications — setup

Sizzle delivers push via **Firebase Cloud Messaging (FCM) HTTP v1**, one path for
both platforms. The app code is already wired end-to-end:

- DB: `push_tokens` table + `profiles.push_enabled` (migration
  `supabase/migrations/20260623000000_push_tokens.sql`, already applied to the
  hosted DB).
- API: `POST/DELETE /me/push-token`, `POST /me/push-enabled`, and a guarded
  sender (`apps/api/src/services/push.ts`) invoked from `notify()` on every
  follow / like / comment / repost / verification / moderation event.
- Client: `apps/web/src/lib/push.ts` (permission + FCM token registration),
  silent re-register on launch + unregister on sign-out (`App.tsx`), and a
  **Settings → Notifications → Push notifications** toggle.

Everything below is the **credentials + native wiring** that can't live in the
repo. Until it's done, the app runs normally — notification *rows* are still
written; we just don't ping devices. Do the iOS and Android native steps in one
sitting: adding the Firebase SDK without its config file breaks that platform's
build.

---

## 1. Firebase project (once)

1. Create a free project at <https://console.firebase.google.com>.
2. **Project settings → Cloud Messaging** — confirm the *Firebase Cloud
   Messaging API (V1)* is enabled.

## 2. Server credential (the only API secret)

1. Firebase console → **Project settings → Service accounts → Generate new
   private key**. Downloads a JSON file.
2. Set it as the API env var **`FCM_SERVICE_ACCOUNT`** = the full JSON (as a
   single-line string). Local: add to `apps/api/.env`. Production: add to the
   **API** Vercel project (the one that serves `sizzle-chi.vercel.app`) →
   Settings → Environment Variables, then redeploy.
   - Branden pastes this — it must never be committed (it's a private key).
3. With it set, the sender activates automatically. With it unset, it's a no-op.

## 3. iOS (TestFlight / App Store)

1. **APNs key:** Apple Developer → Certificates, IDs & Profiles → **Keys** →
   create an *Apple Push Notifications service (APNs)* key (`.p8`). Note the
   Key ID + your Team ID.
2. **Upload it to Firebase:** console → Project settings → Cloud Messaging →
   *Apple app configuration* → upload the `.p8` (with Key ID + Team ID). This is
   what lets FCM deliver to Apple devices.
3. **Register the iOS app** in Firebase (bundle id **`app.sizzle.mobile`**) and
   download **`GoogleService-Info.plist`**.
4. Put the plist in the Xcode project: drag it into `App/App/` in Xcode (check
   "Copy items if needed", target = App). It's gitignored on purpose.
5. In Xcode → target **App → Signing & Capabilities → + Capability**:
   - **Push Notifications** (this wires up `App.entitlements`, already created
     with `aps-environment`).
   - **Background Modes** → check **Remote notifications**.
6. From `apps/web`: **`npx cap sync ios`** (pulls the Firebase pods the plugin
   needs; `AppDelegate.swift` already calls `FirebaseApp.configure()` guarded on
   the plist's presence).
7. Build to a **physical device** (push doesn't work on the simulator). Sign in,
   toggle Settings → Push notifications on, accept the prompt.

## 4. Android (Play)

1. **Register the Android app** in Firebase (package **`app.sizzle.mobile`**) and
   download **`google-services.json`** → place in `apps/web/android/app/`
   (gitignored).
2. Add the Google Services Gradle plugin (only after the json exists, or the
   build fails):
   - `android/build.gradle` → `dependencies { classpath
     'com.google.gms:google-services:4.4.2' }`
   - `android/app/build.gradle` → at the bottom: `apply plugin:
     'com.google.gms.google-services'`
3. From `apps/web`: **`npx cap sync android`**, then run on a device/emulator
   with Google Play services.

## 5. Verify delivery

Trigger a real event from a *second* account (follow Branden's account, like a
recipe, comment). The device should get a banner. If not:

- API logs: look for `[push]` lines (token exchange / send failures).
- `select * from push_tokens` — confirm the device registered a token.
- Dead tokens are auto-pruned on send (404 / UNREGISTERED).

## Notes

- The in-app toggle flips `profiles.push_enabled` (gates delivery to all the
  user's devices) and, on a device, (de)registers that install's token.
- `apns-environment` is `development` in `App.entitlements`; Xcode/TestFlight
  automatically promotes to `production` for distribution builds.
