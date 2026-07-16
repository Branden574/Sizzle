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
- All four **UGC safety** mechanisms Apple 1.2 requires — automated content
  filtering on every submission, in-app report, block/mute, and a published
  contact point (getsizzle.app/contact) — plus owner moderation. ✅ present.
- Android **release signing scaffold** + a verified `bundleRelease` that
  produces `app-release.aab`.
- Version **1.0** on both platforms — iOS is at build **22**, Android at
  `versionCode` **1** (it has never been uploaded).

**Needs you (accounts / secrets / submission) — see the sections below.**

---

## 1. Payments on mobile — DONE (Option A: fan purchases are web-only)

Sizzle's monetization (creator **subscriptions**, **recipe unlocks**, and
**Support/tips**) runs on **Stripe**. Both stores forbid that *inside* the app:

- **Apple 3.1.1** — digital content/subscriptions consumed in-app must use **Apple
  In-App Purchase**, not Stripe.
- **Google Play** — same via **Play Billing**.

**Resolution (implemented): Option A — no fan purchases on native.** The rule is
carried by two flags in `apps/web/src/lib/native.ts`, because *spending* money and
*getting paid* are different things under 3.1.1:

- **`canBuyInApp`** (= `!isNative`) — every **fan-side spend** surface: Support/tips,
  Subscribe, premium unlock, product shelf, creator goal. Hidden on native, shown on
  web. Fans buy at getsizzle.app, so **creators keep the full 90% with no store cut**.
- **`showCreatorMoney`** (= `true`, every platform) — **creator-side money tooling**:
  your own earnings, payout setup, subscription price, tiers, products, goals. Money
  flowing *to* a creator is not a purchase, so the stores don't require IAP here —
  the same reason TikTok, Instagram and YouTube all show creator earnings natively.
  Creators shouldn't need a laptop to run their business.

Hidden on native by `canBuyInApp`: TipSheet, CookSheet (Support/Subscribe/Shop/goal),
RecipeSheet locked cards (neutral — no price, no purchase path). **Shown** on native
under `showCreatorMoney`: AnalyticsSheet Earnings + unlock funnel, EditPostSheet
premium config, the tip notification-preference toggle, the Roadmap "Get Paid" phase.

Payout setup (CreatorSheet → "Become a Creator", AnalyticsSheet → payout dashboard)
sends the creator to Stripe's hosted Connect onboarding in an in-app browser sheet
via `openExternal`. That is a **business onboarding flow, not a consumer purchase**
and not a link to buy digital content — §"App Review notes" below states this to
Apple explicitly rather than claiming the app opens nothing external.

Why not the alternatives: **B. Integrate IAP/Play Billing** — full mobile revenue
but weeks of work, ~15–30% store cut, and ledger reconciliation; the right
fast-follow once in-app conversion justifies the tax. **C. Submit as-is** — near
certain rejection of the sub/unlock flows.

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
5. ~~**Provider config for the two OAuth buttons**~~ DONE — Apple + Google are
   configured in Supabase and live on production. Native reuses the same provider
   config via the system browser + a `app.sizzle.mobile://login-callback` custom
   scheme (`apps/web/src/lib/nativeOAuth.ts`), so both buttons ship on native and
   4.8 is satisfied. **The Apple client secret expires ~6 months out** — regenerate
   with `scripts/gen-apple-secret.mjs` before it lapses or Apple sign-in breaks.
6. **Push:** iOS is ready — `App.entitlements` already carries
   `aps-environment = production`, and the real Firebase `GoogleService-Info.plist`
   (project `sizzle-f631c`, bundle `app.sizzle.mobile`) is committed. Android push
   still needs `google-services.json` in `apps/web/android/app/` (gitignored) —
   download it from the same Firebase project.

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
2. Bump **Build** (`CURRENT_PROJECT_VERSION`) if resubmitting — iOS is at 1.0 (22).
3. Product → **Archive** (device/Any iOS Device, not a simulator).
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
**Subtitle (App Store, 27/30 chars):** Watch it. Actually cook it.
**Short description (Google Play, 32/80 chars):** Watch it. Then actually cook it.
**Category:** Food & Drink (secondary: Social Networking)
**Copyright (ASC App Information):** © 2026 Branden Vincent-Walker
**Age rating:** 13+ (Apple's updated tiers; UGC + messaging declared) / Teen on Play.

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
>   posts, and build a following of people who cook their food.
> • No ads in the feed. No endless preamble. Just the good part of cooking: the
>   watching, the wanting, the making.
>
> Hungry yet? Download Sizzle and start cooking.

**Keywords (App Store, 100 chars):**
`recipe,recipes,cooking,food video,home cook,meal,dinner,shopping list,chef,cook,foodie,kitchen`

**Support URL:** https://getsizzle.app/contact
**Marketing URL:** https://getsizzle.app
**Privacy Policy URL:** https://getsizzle.app/privacy

**Screenshots:** ✅ five 1290×2796 (6.9") PNGs are committed under
`docs/store-assets/screenshots/` — feed, creator profile, recipe detail, insights,
discover. That's the primary iPhone slot for App Store Connect, and Play accepts
the same files. No iPad set is needed (`TARGETED_DEVICE_FAMILY = 1`). Play tablet
screenshots remain optional.

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
- **Purchases:** no fan purchase happens in the native app (Option A — buying is
  web-only), so mark **purchases: not collected** on the App Privacy / Data Safety
  forms for the store build. Creator payout setup hands off to Stripe's hosted
  onboarding, which collects the creator's payout/identity details **directly —
  Sizzle never receives or stores them**, so it doesn't add a data type here.
  (On the web, payments are likewise handled by **Stripe**, not stored by Sizzle.)

Third parties that process data: **Supabase** (database/auth), **Cloudflare**
(video), **Stripe** (payments), **Firebase Cloud Messaging** (push),
**Resend/Sentry** (email + error monitoring). Answer **Yes** to account creation
and **Yes** to in-app account deletion (deep-link: Settings → Delete account).

---

## 7. Review-readiness checklist

| Requirement | Status |
|---|---|
| In-app account deletion (Apple 5.1.1(v), Play) | ✅ Settings → Delete account |
| UGC: filter, report, block, contact point (Apple 1.2) | ✅ all four — see the review notes below |
| Sign in with Apple offered alongside Google (Apple 4.8) | ✅ live on web + native (§2.5) |
| Privacy policy + terms reachable in-app and by URL | ✅ getsizzle.app/privacy, /terms |
| Encryption/export compliance | ✅ `ITSAppUsesNonExemptEncryption=false` |
| Permission purpose strings | ✅ all present with human reasons |
| Digital purchases use IAP / Play Billing | ✅ resolved via Option A — no fan purchase surface on native (§1) |
| Push production entitlement | ✅ `aps-environment = production` in `App.entitlements` |
| Firebase iOS config | ✅ real `GoogleService-Info.plist` (`sizzle-f631c`) committed |
| Android push config | ⚠️ `google-services.json` still missing from `apps/web/android/app/` (§2.6) |
| No placeholder/demo copy in legal docs | ✅ in-app docs summarize + link the hosted policy |

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
- **4.8 / 2.1** — "Continue with Apple"/"Continue with Google" were hidden on
  native pending provider config. SUPERSEDED: both providers are configured and
  the buttons now ship on native (`Onboarding.tsx` has no `!isNative` gate).
  Google OAuth still cannot run inside the Capacitor WebView
  (`disallowed_useragent`), so `nativeOAuth.ts` opens the provider in the system
  browser and returns via the `app.sizzle.mobile://login-callback` scheme.
- **ITMS-91053** — `PrivacyInfo.xcprivacy` added + registered in the Xcode
  project (required-reason APIs: UserDefaults CA92.1, FileTimestamp C617.1,
  SystemBootTime 35F9.1, DiskSpace E174.1; collected-data types mirror the App
  Privacy form: email, phone (optional), photos/videos, other UGC, user ID,
  product interaction — all linked, none tracking).
- **2.1 (mock features)** — Go Live button + live banners hidden on native
  while the streaming provider is the mock (`CreateSheet.tsx` — Go Live moved off
  the profile into the + menu — and `CookSheet.tsx`'s `LiveBanner`).
  Remove gates when Cloudflare Stream live inputs are configured.
- **5.1.1(ii)** — phone number now OPTIONAL at signup (was required; Apple
  rejects mandatory personal data not core to app function).
- **2.1 / 1.2** — in-app legal docs no longer label themselves "placeholder";
  they summarize + link the authoritative hosted documents. Settings copy
  fixed likewise. Support email switched to support@getsizzle.app.
- **3.1.x hardening** — premium unlock funnel in creator insights was gated off
  native with the rest of the monetization surfaces. SUPERSEDED by the
  `canBuyInApp` / `showCreatorMoney` split (§1): the funnel reports a creator's
  own results and carries no purchase path, so it ships on native.
- **2.4.1** — `TARGETED_DEVICE_FAMILY = 1` (iPhone-only; no iPad layout or
  screenshots were prepared — iPads run iPhone apps in compatibility mode).

**App Review demo account (created + verified on production 2026-07-15):**
- `review@getsizzle.app` / `SizzleReview!2026` — handle `@appreview`, follows 3
  cooks, 0 posts of its own, 0 followers, `creator_status = regular`.
  ROTATE THE PASSWORD before/after review.

### App Review notes (paste into App Store Connect → App Review Information)

Every sentence below is true of the submitted build — verify it again if the
monetization flags or the 1.2 surfaces change.

> **Demo account:** review@getsizzle.app / SizzleReview!2026
> Sign in with the email tab. The account follows 3 cooks, so the Following feed
> and the For You feed are both populated. It has no posts of its own; use the +
> tab to record or upload if you want to see the creation flow.
>
> **User-generated content (Guideline 1.2).** Sizzle has all four required
> mechanisms:
> 1. *Filtering objectionable content* — every user submission is screened
>    automatically before it can appear: recipe titles/ingredients/steps/captions,
>    comments, direct messages, and cook-log notes go through a text moderation
>    check, and uploaded photos plus each video's poster frame go through image
>    moderation. Flagged submissions are rejected at post time.
> 2. *Reporting* — three entry points, all one tap from the content itself: the
>    ⋯ button on any post → **Report post**; the **Report** action under any
>    comment; any profile → ⋯ → **Report**. Five categories: nudity/sexual
>    content, harassment or hate, violence or dangerous acts, spam or scam, and
>    something else. Reports land in an internal moderation queue where we remove
>    posts and suspend accounts.
> 3. *Blocking abusive users* — open any profile → ⋯ → **Block**. Blocking is
>    mutual and total: neither user can find the other's profile or content
>    anywhere in the app. **Mute** is also available to hide someone's posts
>    without blocking them.
> 4. *Published contact point* — https://getsizzle.app/contact, also reachable
>    in-app from Settings.
>
> We act on reported content and eject offending users **within 24 hours** of a
> report. This isn't just a promise to you: it's published in our Terms
> (https://getsizzle.app/terms → "Objectionable content and abusive users", which
> also spells out the filtering, enforcement and blocking measures above) and
> shown to every user who submits a report.
>
> **Monetization (Guideline 3.1.1).** The iOS app contains **no way for a viewer
> to spend money** — there is no tipping, subscribing, premium unlock, or product
> purchase anywhere in the app, and no price, link, button, or call to action
> pointing to one. Premium posts appear as neutral locked cards with no price and
> no purchase path. Subscriptions and unlocks are acquired only on our website,
> entirely outside the app; users who purchased on the web can access their
> content in the app. This is the transactions-disabled-on-iOS configuration.
>
> Creator-side earnings and payout setup **are** present in the app (Profile →
> Insights → Earnings, and the Creator sheet). This is business onboarding for
> people who want to get paid for their own work — not the purchase of any digital
> content — and it is the same pattern TikTok, Instagram and YouTube ship. If a
> creator starts payout setup, we hand off to Stripe's hosted Connect onboarding in
> a Safari view controller; nothing is sold there.
>
> **The demo account cannot reach that flow.** Becoming a Creator requires 1,000
> followers and 100,000 views; review@getsizzle.app has 0 of each, so it sees only
> a read-only progress screen. The eligibility bar is enforced on our server, not
> just in the UI. If you want to inspect payout onboarding, tell us and we'll
> provision an eligible test account.

**Branden's pre-submission checklist (needs your accounts — cannot be automated):**
1. ~~Apple Team ID~~ DONE 2026-07-12: `6R2T984G9S` set in the AASA (deployed)
   and as `DEVELOPMENT_TEAM` in the Xcode project.
2. ~~Firebase iOS plist + push entitlement~~ DONE: the real
   `GoogleService-Info.plist` (project `sizzle-f631c`, bundle `app.sizzle.mobile`)
   is committed and `App.entitlements` already reads
   `aps-environment = production`. Android still needs `google-services.json`
   (§2.6) before push works there.
3. Supabase Auth → SMTP: configure Resend so confirmation/reset emails deliver
   reliably (built-in SMTP is heavily rate-limited; a reviewer creating a
   fresh account may otherwise never get the confirmation email).
4. Confirm `CRON_SECRET` is set on the `sizzle` (API) Vercel project. The risk
   here is the opposite of what it looks like: `internal.ts` fails CLOSED, so an
   absent secret 401s every `/internal/*` route — the crons silently stop rather
   than the endpoints being exposed.
5. ~~Configure Apple Sign-In + publish Google OAuth~~ DONE — both are live and the
   native buttons ship (§2.5). Watch the Apple client secret's ~6-month expiry.
6. App Store Connect: App Privacy form using the data inventory above; age
   rating (complete the updated questionnaire: UGC = Yes, declare in-app filtering/reporting/blocking controls, messaging = Yes → lands at 13+, matching the in-app 13+ gate);
   screenshots (6.9" set committed under docs/store-assets), keywords,
   support URL https://getsizzle.app/contact, marketing URL
   https://getsizzle.app.

**Known reviewer-dependent risks (accepted, with mitigations):**
- Account required to browse (5.1.1(ii)): social apps commonly pass; a
  "browse as guest" mode exists as dead code (`continueAsGuest` in `useAuth.ts`,
  never called from the UI) and can be wired if a rejection cites this.
- Locked premium posts visible on native with neutral copy and no price/CTA:
  the compliant multiplatform pattern; covered by the review notes above.
- **Creator earnings + payout setup visible on iOS (3.1.1).** The judgment call
  in §1: getting paid isn't a purchase. A reviewer could still read the Stripe
  Connect hand-off as an external payment flow. Mitigation: the review account
  can't reach it (server-enforced), and the notes say so up front. If rejected,
  gate payout setup — not the earnings *display* — behind `!isNative`.
- **The 24-hour commitment is an operational promise, not a code path.** The
  Terms now carry a zero-tolerance clause that states it, and the report
  confirmation screen repeats it to users — so it is published in two places and
  Branden has to actually keep it. The moderation queue in the admin dashboard is
  the only thing backing it; nothing pages anyone when a report arrives.
  (Residual: §6's Termly boilerplate still says "no obligation to monitor" — the
  zero-tolerance clause is written to govern in the event of conflict, but the
  cleanest fix is to strike the boilerplate line.)

