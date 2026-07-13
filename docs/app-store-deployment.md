# Shipping Sizzle to the App Store & Google Play

App: **Sizzle** · Bundle/App ID: **`app.sizzle.mobile`** · Domain: **getsizzle.app**
Native shell: Capacitor (iOS + Android) in `apps/web/`.

This is the runbook to take the app from "builds locally" to "live in both stores."
It separates what's **already done in the repo** from what **only you can do**
(anything that needs a developer account, a password, a certificate, or a
signature — I can scaffold those but can't create accounts or handle secrets).

---

## 0. Status at a glance

**Ready in the repo (no action needed):**
- iOS app icon (1024²) + light/dark launch screens — `Assets.xcassets`.
- Android launcher icons across every density + adaptive (`mipmap-*`).
- Permission strings with human reasons: camera, mic, photo library, Face ID
  (iOS `Info.plist`); camera, mic, media, and `POST_NOTIFICATIONS` (Android).
- ATS enabled + `ITSAppUsesNonExemptEncryption=false` (clears the TestFlight
  "Missing Compliance" and export-compliance gates automatically).
- Deep links / App Links for `getsizzle.app/r/:id` on both platforms.
- In-app **account deletion** (Settings → Delete account) — an App Store hard
  requirement (Guideline 5.1.1(v)) and Play requirement. ✅ present.
- In-app **report / block / mute** + owner moderation — the UGC safety
  requirements (Apple 1.2). ✅ present.
- Android **release signing scaffold** + a verified `bundleRelease` that
  produces `app-release.aab`.
- Version **1.0 / build 1** on both platforms.

**Needs you (accounts / secrets / submission) — see the sections below.**

---

## 1. Payments on mobile — DONE (Option A: web-only purchases)

Sizzle's monetization (creator **subscriptions**, **recipe unlocks**, and
**Support/tips**) runs on **Stripe**. Both stores forbid that *inside* the app:

- **Apple 3.1.1** — digital content/subscriptions consumed in-app must use **Apple
  In-App Purchase**, not Stripe.
- **Google Play** — same via **Play Billing**.

**Resolution (implemented): Option A — hide in-app payments on native.** A single
flag `showMonetization` (= `!isNative`, in `apps/web/src/lib/native.ts`) gates every
purchase and creator-payout surface. On the native build they're hidden; on the web
app they're unchanged, so **creators still keep the full 90% with no store cut**.
Verified on the iOS Simulator (creator profile shows no Support/Subscribe/Shop;
insights show no Earnings center; feed rail has no tip) and on web (all still shown).
Flip the one flag — or wire it to real StoreKit/Play Billing — to re-enable in-app
purchases later.

Why not the alternatives: **B. Integrate IAP/Play Billing** — full mobile revenue
but weeks of work, ~15–30% store cut, and ledger reconciliation; the right
fast-follow once in-app conversion justifies the tax. **C. Submit as-is** — near
certain rejection of the sub/unlock flows.

Gated on native (see the "Hide in-app payments on native" commit): TipSheet,
CookSheet (Support/Subscribe/Shop/goal), RecipeSheet locked cards (neutral, no
purchase path), AnalyticsSheet earnings center, EditPostSheet premium config, and
the Roadmap "Get Paid" phase. Tip *receipts* and the tip notification-preference
toggle stay (creators still receive web-originated tips).

---

## 2. One-time accounts & setup (only you can do these)

I can't create accounts or handle passwords/keys — these are yours:

1. **Apple Developer Program** — enroll at developer.apple.com ($99/yr). You'll
   get a **Team ID**.
2. **Google Play Console** — sign up at play.google.com/console ($25 once).
3. **Apple app record** — in App Store Connect, create an app with bundle ID
   `app.sizzle.mobile`.
4. **Signing keys:**
   - *iOS:* let Xcode "Automatically manage signing" with your team — it creates
     the certificate + provisioning profile for you.
   - *Android:* generate an upload keystore (holds passwords, so you run this):
     ```bash
     cd apps/web/android
     keytool -genkey -v -keystore sizzle-upload.jks -alias sizzle-upload \
       -keyalg RSA -keysize 2048 -validity 10000
     cp keystore.properties.example keystore.properties   # then fill in the 4 values
     ```
     `keystore.properties` and `*.jks` are already gitignored. Keep the keystore
     backed up — losing it means you can't update the app.
5. **Provider config for the two OAuth buttons** (already coded, need console setup):
   - *Sign in with Apple* — required by Apple because you offer Google sign-in
     (Guideline 4.8). Create a Services ID + key in the Apple portal and paste
     them into Supabase → Auth → Providers → Apple.
   - *Google* — add the iOS/Android OAuth client IDs to Supabase → Auth → Google,
     and your bundle ID to the Google Cloud console.
6. **Push (optional but wired):** the iOS entitlement ships as
   `aps-environment=development`. For a TestFlight/App Store build set it to
   **production** (Xcode → Signing & Capabilities, or a Release-specific
   entitlements file). Android push needs `google-services.json` in
   `apps/web/android/app/` (gitignored).

---

## 3. iOS: build → TestFlight → App Store

```bash
cd apps/web
npm run build            # production web build → dist (hosted backend)
npx cap sync ios
npx cap open ios         # opens Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → set your **Team**
   (Automatically manage signing).
2. Bump **Version**/**Build** if resubmitting (they start at 1.0 / 1).
3. If shipping push: set the Push Notifications capability to **production**.
4. Product → **Archive** (device/Any iOS Device, not a simulator).
5. In the Organizer, **Distribute App → App Store Connect → Upload**.
6. In App Store Connect: fill the listing (§5), attach the build, answer the
   **App Privacy** questions (§6), and **Submit for Review**.

TestFlight first: after upload, the build appears under TestFlight in ~15 min;
add yourself as an internal tester to smoke-test on a real device before
submitting for review.

---

## 4. Android: build → internal testing → Play Store

```bash
cd apps/web
npm run build
npx cap sync android
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

(The local JDK is 25, which Gradle 8.14 rejects; Android Studio's bundled JDK 21
works — hence the `JAVA_HOME` above. Android Studio builds it directly too.)

With `keystore.properties` filled in (§2.4) the AAB is signed with your upload
key. Then in Play Console:
1. Create the app → **Internal testing** track → upload `app-release.aab`.
2. Complete **Data safety** (§6), content rating, target audience, and the store
   listing (§5).
3. Roll out to internal testers, verify, then promote to **Production**.

Play also requires enrolling in **Play App Signing** (recommended) — Google
holds the app signing key; you keep the upload key.

---

## 5. Store listing copy (ready to paste)

**Name:** Sizzle
**Subtitle / short description (30/80 chars):** Watch it. Then actually cook it.
**Category:** Food & Drink (secondary: Social Networking)
**Age rating:** 12+ / Teen (user-generated content).

**Promotional text (App Store, 170 chars):**
> Full-screen video recipes from real home cooks. Swipe, save, and actually make
> dinner — no ads, no 2,000-word life stories before the recipe.

**Description:**
> Sizzle is where recipes come to life. Full-screen, vertical cooking videos from
> real home cooks — watch a dish come together, then cook it yourself with the
> steps and ingredients right there.
>
> • A feed built for cooking, not doomscrolling — every video is a recipe you can
>   actually make.
> • Save recipes to collections, build a shopping list, and check off ingredients
>   as you shop.
> • Follow the cooks you love, comment, and share dishes with friends.
> • Creators can post video recipes and photo carousels, see insights on their
>   posts, and earn support from the people who cook their food.
> • No ads in the feed. No endless preamble. Just the good part of cooking: the
>   watching, the wanting, the making.
>
> Hungry yet? Download Sizzle and start cooking.

**Keywords (App Store, 100 chars):**
`recipe,recipes,cooking,food video,home cook,meal,dinner,shopping list,chef,cook,foodie,kitchen`

**Support URL:** https://getsizzle.app/contact
**Marketing URL:** https://getsizzle.app
**Privacy Policy URL:** https://getsizzle.app/privacy

**Screenshots you still need to capture** (per store specs): 6.7" iPhone and
5.5" iPhone for App Store; phone + 7"/10" tablet for Play. Capture the feed, a
recipe with steps, collections/shopping list, a creator profile, and insights.

---

## 6. App privacy / Data safety answers

Consistent with the hosted privacy policy. Sizzle collects, all **linked to the
user** and used **only to run the app** (no selling, no third-party ads, no
cross-app tracking):

- **Account:** name, username, email; optional phone and links.
- **User content:** videos, photos, recipes, comments, messages.
- **Identifiers:** user ID; push token (if notifications enabled).
- **Usage/diagnostics:** watch time and engagement (powers ranking + creator
  insights); crash/error logs.
- **Purchases:** none in the native app (Option A — purchases are web-only), so
  mark **purchases: not collected** on the App Privacy / Data Safety forms for the
  store build. (On the web, payments are handled by **Stripe**, not stored by Sizzle.)

Third parties that process data: **Supabase** (database/auth), **Cloudflare**
(video), **Stripe** (payments), **Firebase Cloud Messaging** (push),
**Resend/Sentry** (email + error monitoring). Answer **Yes** to account creation
and **Yes** to in-app account deletion (deep-link: Settings → Delete account).

---

## 7. Review-readiness checklist

| Requirement | Status |
|---|---|
| In-app account deletion (Apple 5.1.1(v), Play) | ✅ Settings → Delete account |
| UGC: report content, block users, moderation (Apple 1.2) | ✅ present |
| Sign in with Apple offered alongside Google (Apple 4.8) | ✅ coded — needs provider config (§2.5) |
| Privacy policy + terms reachable in-app and by URL | ✅ getsizzle.app/privacy, /terms |
| Encryption/export compliance | ✅ `ITSAppUsesNonExemptEncryption=false` |
| Permission purpose strings | ✅ all present with human reasons |
| Digital purchases use IAP / Play Billing | ✅ resolved via Option A — in-app payments hidden on native (§1) |
| Push production entitlement (if using push) | ⚠️ flip to production before archive (§2.6) |
| No placeholder/demo copy in legal docs | ⚠️ replace the demo privacy blurb in `AppSettingsSheet` with the hosted policy |

---

## 8. After launch

- Bump `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` (iOS) and
  `versionName`/`versionCode` (Android `app/build.gradle`) for every update.
- Web (Vercel) and the native shells share the same `dist` build — a web deploy
  updates the site instantly, but native users only get changes after a new
  store build. Keep them in step for anything backend-contract-related.

---

## Compliance audit — 2026-07-12 (multi-agent sweep vs App Review Guidelines)

**Fixed in code (commit this date):**
- **4.8 / 2.1** — "Continue with Apple"/"Continue with Google" hidden on native
  (`Onboarding.tsx`, `!isNative` gate). Native ships email-only auth until BOTH
  providers are configured; an unconfigured Apple button is a broken-feature
  rejection AND Google OAuth cannot run inside the Capacitor WebView
  (`disallowed_useragent`). When enabling later: use `skipBrowserRedirect` +
  the system browser + a `https://getsizzle.app/auth/callback` redirect.
- **ITMS-91053** — `PrivacyInfo.xcprivacy` added + registered in the Xcode
  project (required-reason APIs: UserDefaults CA92.1, FileTimestamp C617.1,
  SystemBootTime 35F9.1, DiskSpace E174.1; collected-data types mirror the App
  Privacy form: email, phone (optional), photos/videos, other UGC, user ID,
  product interaction — all linked, none tracking).
- **2.1 (mock features)** — Go Live button + live banners hidden on native
  while the streaming provider is the mock (`Profile.tsx`, `CookSheet.tsx`).
  Remove gates when Cloudflare Stream is configured.
- **5.1.1(ii)** — phone number now OPTIONAL at signup (was required; Apple
  rejects mandatory personal data not core to app function).
- **2.1 / 1.2** — in-app legal docs no longer label themselves "placeholder";
  they summarize + link the authoritative hosted documents. Settings copy
  fixed likewise. Support email switched to support@getsizzle.app.
- **3.1.x hardening** — premium unlock funnel in creator insights now gated
  off native with the rest of the monetization surfaces.
- **2.4.1** — `TARGETED_DEVICE_FAMILY = 1` (iPhone-only; no iPad layout or
  screenshots were prepared — iPads run iPhone apps in compatibility mode).

**App Review demo account (already created + confirmed on production):**
- `review@getsizzle.app` / `SizzleReview!2026` — follows the top 3 cooks.
  ROTATE THE PASSWORD before/after review. Enter these in App Store Connect →
  App Review Information, with notes: "Premium/subscriber content is acquired
  on the Sizzle web app (multiplatform service, Guideline 3.1.3(b)); the iOS
  app contains no purchasing and no external purchase links."

**Branden's pre-submission checklist (needs your accounts — cannot be automated):**
1. Apple Developer Program: replace `REPLACE_WITH_APPLE_TEAM_ID` in
   `apps/web/public/.well-known/apple-app-site-association` with the real Team
   ID and redeploy the web app (universal links are dead until then).
2. Drop the real Firebase iOS `GoogleService-Info.plist` (bundle id
   `app.sizzle.mobile`) over the placeholder, and flip
   `App.entitlements` `aps-environment` → `production` for the store archive.
3. Supabase Auth → SMTP: configure Resend so confirmation/reset emails deliver
   reliably (built-in SMTP is heavily rate-limited; a reviewer creating a
   fresh account may otherwise never get the confirmation email).
4. Set `CRON_SECRET` on the `sizzle` Vercel project (cron endpoints are
   currently open; code enforces the secret once present).
5. Optional (recommended before wide launch, not required for review):
   configure Apple Sign-In + publish Google OAuth, then remove the
   `!isNative` gate in `Onboarding.tsx`.
6. App Store Connect: App Privacy form using the data inventory above; age
   rating (UGC: pick 'Infrequent/Mild' user-generated content → 12+);
   screenshots (6.9" set committed under docs/store-assets), keywords,
   support URL https://getsizzle.app/contact, marketing URL
   https://getsizzle.app.

**Known reviewer-dependent risks (accepted, with mitigations):**
- Account required to browse (5.1.1(ii)): social apps commonly pass; a
  "browse as guest" mode exists as dead code (`continueAsGuest`) and can be
  wired if a rejection cites this.
- Locked premium posts visible on native with neutral copy and no price/CTA:
  the compliant multiplatform pattern; covered by the review notes above.

