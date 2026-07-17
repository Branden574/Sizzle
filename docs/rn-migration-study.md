# React Native Migration Study — Sizzle

**Prepared:** July 2026 · **App state:** v1.0.64, build 26 in App Review, launched this week · **Scope:** client only — the Hono/Supabase/Cloudflare/Stripe backend is untouched under every scenario examined.

---

## Executive summary

**Verdict: the research supports the standing decision — launch on Capacitor, treat React Native strictly as a data-driven v2.** None of the four workstreams surfaced evidence that overturns it; two of them materially *strengthened* it, and one sharpened what "data-driven" must mean.

The five load-bearing findings:

1. **Every problem Sizzle fought during launch week was won on Capacitor, and RN could not have won most of them faster.** The three failure classes examined (WebView memory/jetsam, background-suspended JS killing uploads, picker transcode delays) score as: *reshaped in RN's favor but not eliminated*, *unchanged — identical OS physics*, and *already fixed with zero residual RN advantage*. The background-upload system is actually a **regression risk** under RN: the shipped kill-proof URLSession pipeline has no maintained RN equivalent (`react-native-background-upload` is dormant since Oct 2022; Expo's background session type doesn't survive app kill) and would have to be rebuilt as a custom native module.

2. **The genuine RN gains are real but concentrated at scale Sizzle doesn't have yet.** The structurally large wins — a several-times-larger jetsam budget for the video feed, deletion of the Supabase-relay upload architecture and its double egress, FlashList/expo-video as maintained feed idiom, Android feed smoothness — matter at 100k+ users. At 0–10k users, where Sizzle is today with a field-verified build, no RN gain addresses a currently unsolved problem.

3. **The single largest structural cost is the web property.** getsizzle.app (marketing, PWA, desktop, share-link landing pages) is served by the *same components* as the iOS app. react-native-web is in maintenance mode and couldn't carry the GSAP/Lenis/hls.js/MediaRecorder surfaces regardless. **Capacitor is already the single codebase; RN would create the split** — every future feature built twice, forever.

4. **A migration would land mid-platform-transition.** Expo SDK 55+ made the New Architecture mandatory; ~17% of EAS projects hadn't migrated as of Jan 2026; documented behavioral regressions (gesture timing, `setNativeProps`, a reported ~25–30% RAM increase on RN 0.85) sit exactly on Sizzle's risk surface: a gesture-heavy vertical video feed.

5. **The decision is currently unfalsifiable — and that is the one thing to fix now.** `VITE_SENTRY_DSN` is unset; there is zero telemetry. None of the migration triggers defined below are observable today. The recommended action this week is ~2 days of instrumentation, not any migration work.

Realistic migration cost if ever triggered: **75–125 days elapsed solo (parallel-build path), 5–15× the tooling spend, with a falsifiable kill-switch at day ~15.** One honest counterweight to record: the recorder would get *better* on RN (VisionCamera's native pause/resume replaces the entire segment-stitch workaround and kills the transparent-WebView fragility class by construction), and hiring/ecosystem depth favors RN if Sizzle ever raises and staffs. Neither outweighs points 1–4 at current scale.

---

## 1. Module map — every Sizzle surface → its RN/Expo equivalent

Grounding: repo claims come from reading `apps/web` (v1.0.64 — `apps/web/package.json`, `src/components/*`, `src/lib/*`, `ios/App/App/VideoConcatPlugin.swift`). Ecosystem claims verified against the live web, July 2026. Target: **Expo SDK 56** (stable May 21 2026, RN 0.85; New Architecture only — Legacy Arch support ended with SDK 55) ([expo.dev/changelog/sdk-55](https://expo.dev/changelog/sdk-55), [sdk-56-beta](https://expo.dev/changelog/sdk-56-beta)).

| # | Surface / integration | Current implementation | RN/Expo equivalent | Maturity verdict (mid-2026) | Port class |
|---|---|---|---|---|---|
| 1 | **Vertical video feed** | `Feed.tsx` (623 ln): plain DOM list + CSS `scroll-snap-type: y mandatory`, `scrollSnapStop: always`, IntersectionObserver for active-card + infinite scroll, custom pull-to-refresh transform | **FlashList v2** (`pagingEnabled` + `snapToInterval`) or LegendList + `onViewableItemsChanged`; Widlarz's open-source [react-native-video-feed](https://github.com/TheWidlarzGroup/react-native-video-feed) is a working reference | FlashList v2: ground-up rewrite for New Arch, JS-only, production (powers Shopify's app) ([shopify.engineering/flashlist-v2](https://shopify.engineering/flashlist-v2), [docs](https://shopify.github.io/flash-list/docs/v2-changes/)). Healthy. | **Full rewrite** — none of the scroll-snap/IO code survives; the concept maps 1:1 |
| 2 | **Video playback (HLS + MP4)** | `VideoPlayer.tsx` (279 ln): `<video>` + **hls.js** with tuned buffers, error-recovery ladder, custom scrub bar | **expo-video** (`useVideoPlayer`, `replace`) or **react-native-video v7**. hls.js is deleted — AVPlayer/ExoPlayer speak HLS natively. Cloudflare Stream URLs work unchanged | expo-video: stable, first-party; **known limitation: its cache can't be used with HLS sources on iOS** (community proxy workarounds: [expo-video-cache](https://github.com/Monisankarnath/expo-video-cache), [GeekyAnts writeup](https://geekyants.com/blog/performant-vertical-feed-in-expo-hls-caching-on-ios)). react-native-video v7 (Nitro, player/view separation, `preload()`) is the better feed architecture but still "active development, expect breaking changes" ([npm](https://www.npmjs.com/package/react-native-video), [TWG](https://www.thewidlarzgroup.com/react-native-video)). expo-video first, v7 when stable | **Full rewrite** of the player; buffer-tuning knowledge doesn't transfer (you lose that control, mostly for the better) |
| 3 | **Segment recorder** | `NativeCameraRecorder.tsx` (860 ln) on **@capgo/camera-preview**: hold/tap model, torch, pinch + horizontal **zoom dial** (px-per-octave), mic-denied handling, mid-record flip, **pause = finish file, keep as segment** (plugin has no pause), 60 s/take auto-stop, transparent-WebView fragility | **react-native-vision-camera** + Reanimated/Gesture Handler for the dial UI | v5.1.0 released July 1 2026, actively maintained (Margelo), ~459k weekly downloads ([npm](https://www.npmjs.com/package/react-native-vision-camera), [releases](https://github.com/mrousavy/react-native-vision-camera/releases), [Snyk health](https://security.snyk.io/package/npm/react-native-vision-camera)). **Native `pauseRecording()`/`resumeRecording()` → one output file** — better than today's segment hack ([Camera API](https://react-native-vision-camera.com/docs/api/classes/Camera), [TrackTimeline PR](https://github.com/mrousavy/react-native-vision-camera/pull/2948)). Torch supported; zoom `prop` + device min/max — dial UI is yours to rebuild. **Mid-record flip via `enablePersistentRecorder: true` has open bug reports** (`capture/inactive-source`: [#1805](https://github.com/mrousavy/react-native-vision-camera/issues/1805), [#562](https://github.com/mrousavy/react-native-vision-camera/issues/562)) — spike this first | **Full rewrite** of the 860-line component; capability parity equal-or-better. Kills the transparent-WebView fragility class by construction (real native view, no `sz-native-cam` hacks) — though RN camera-under-overlay layering has its own z-order/surface quirks to characterize |
| 4 | **Video stitching** | App-local Swift `VideoConcatPlugin.swift` (156 ln) — AVMutableComposition passthrough concat, re-encode fallback when transforms differ; adversarially reviewed (4 HIGH-severity bugs caught pre-ship) | **No off-the-shelf replacement.** ffmpeg-kit retired, binaries pulled Apr 1 2025 ([github.com/arthenica/ffmpeg-kit](https://github.com/arthenica/ffmpeg-kit)); survivors are trim/compress-oriented, not trustworthy here. Port the existing Swift as an **Expo Module** — the AVFoundation body copies nearly verbatim (~0.5–1 day for the wrap) | n/a (custom). VisionCamera's native pause/resume may shrink the need to flip-while-paused cases only — keep it for per-segment retake if that's on the roadmap | **Custom (small port)** — days, not weeks; the Swift is already written and battle-tested |
| 5 | **Native photo picker (original files)** | @capawesome/capacitor-file-picker `pickVideos({ skipTranscoding: true })` — PHPicker, instant original-file picks (`UploadSheet.tsx:256`) | **expo-image-picker**: SDK 54+ defaults to `videoExportPreset: 'Passthrough'` / `preferredAssetRepresentationMode: 'current'` = original asset, no transcode ([docs](https://docs.expo.dev/versions/latest/sdk/imagepicker/)) | Caution: an open Jan-2026 report says SDK 54/55 on iOS 18 still transcodes video to H.264 MOV in some paths ([expo/expo #42739](https://github.com/expo/expo/issues/42739)). Instant-pick is a shipped, user-visible feature — **verify on device in week 1**; fallback is a thin custom PHPicker Expo Module (~100 lines Swift) | **Adapt** (with a verification spike) |
| 6 | **Background uploads** | @capgo/capacitor-uploader: background URLSession PUT from file path, **survives app kill, event re-delivery + claim on relaunch** (`uploadTask.ts` — the 450-line resume/checkpoint state machine depends on it) | **Gap — worst row in the table.** [react-native-background-upload](https://github.com/Vydia/react-native-background-upload) (Vydia): last release v6.6.0 **Oct 2022**, 127 open issues, dormant (scattered forks: rederteph, `rn-background-upload` TurboModule rewrite). `expo-file-system` `uploadAsync` is deprecated-to-`/legacy`; `FileSystemSessionType.BACKGROUND` survives backgrounding but is promise-based — **no kill-survival or event reclaim**, with open large-file and slowness issues ([docs](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/), [expo#16453](https://github.com/expo/expo/issues/16453), [expo#26754](https://github.com/expo/expo/issues/26754)) | True parity (kill-proof URLSession + relaunch event claim) = **custom Expo Module** wrapping `URLSession` background configuration — re-implementing what @capgo/capacitor-uploader gives free. ~2–3 days of Swift for the module itself, plus re-discovering iOS background-session edge cases one TestFlight build at a time | **Custom module or feature regression.** The checkpoint/resume TS in `uploadTask.ts` ports; its native backbone must be rebuilt |
| 7 | **OTA updates** | Capgo (@capgo/capacitor-updater), kill-only apply (`setMultiDelay kill` in `main.tsx`), channels, ~$12/mo ([capgo.app/pricing](https://capgo.app/pricing/)). Capgo is **Capacitor-only — it does not come with you** | **EAS Update**: check-on-launch/apply-next-launch (`checkAutomatically: 'NEVER'` + apply on cold start) ≈ your kill-only policy; `runtimeVersion` gating ≈ your "native change needs new binary" rule. Self-hosted `expo-updates` is the escape hatch. CodePush is dead (retired 2025) ([RN OTA guide 2026](https://stalliontech.io/react-native-ota-updates-guide)) | Mature, first-party; SDK 55 adds Hermes bytecode diffing (smaller downloads). Pricing: free 1,000 MAU; $19/mo Starter (3k MAU); $199/mo Production (50k MAU, 1 TiB); $0.005/extra MAU ([billing](https://docs.expo.dev/billing/usage-based-pricing/), [comparison](https://stalliontech.io/expo-eas-update-pricing)). Materially more expensive than Capgo at scale (see §3.6), same mental model | **Adapt** — semantics map cleanly; budget line item changes |
| 8 | **Push (FCM)** | @capacitor-firebase/messaging; APNs-token-race retry logic in `push.ts`; server sends via FCM service account (Hono API — untouched) | **@react-native-firebase/messaging** (config-plugin supported in Expo) keeps the server 100% unchanged; expo-notifications also accepts direct FCM/APNs sends ([expo docs](https://docs.expo.dev/push-notifications/sending-notifications-custom/), [comparison](https://pushbase.dev/blog/expo-notifications-vs-react-native-firebase-cloud-messaging)) | Both actively maintained. Badge (@capawesome/capacitor-badge → `Notifications.setBadgeCountAsync`) is trivial | **Adapt** (small; `push.ts` retry logic ports conceptually) |
| 9 | **OAuth + deep links** | System browser (@capacitor/browser) + custom scheme `app.sizzle.mobile://login-callback` + manual `Browser.close()` (SFSafariViewController doesn't auto-close) + supabase PKCE exchange (`nativeOAuth.ts`) | **expo-web-browser** `openAuthSessionAsync` (ASWebAuthenticationSession — **auto-closes on redirect**, deleting your workaround) + expo-linking; supabase-js code identical. Native **expo-apple-authentication** is an optional upgrade over web-flow Apple | First-party Expo modules, stable | **Adapt** — mild improvement over today |
| 10 | **App lock** | Passcode-only (`applock.ts` — biometric ripped out for an unfixable resume-loop; @capgo/capacitor-native-biometric still in package.json but unused). SHA-256 via WebCrypto, hash in Capacitor Preferences | Pure UI ports; **WebCrypto doesn't exist in Hermes** → `expo-crypto.digestStringAsync`; storage → **expo-secure-store** (actual Keychain — an upgrade). If biometrics return: expo-local-authentication — the resume-loop was a WebView/app-state artifact RN may not reproduce | First-party, stable | **Ports as-is** (two small shims) |
| 11 | **Offline downloads** | `offline.ts`: recipe JSON + poster in **localStorage**; video offline explicitly deferred ("needs Cache API") | MMKV/AsyncStorage for JSON; **RN makes real video offline finally feasible** (expo-file-system download + expo-video `file://` playback). iOS HLS offline still needs the MP4 rendition (already true today) | Stable | **Adapt** (and unblocks a deferred feature) |
| 12 | **Stripe / money surfaces** | No Stripe SDK in the client: purchases forced web-only (`canBuyInApp` in `native.ts`, Apple 3.1.1); creator dashboards are plain API-driven UI; external URLs via Browser sheet | Same architecture: purchase surfaces stay on getsizzle.app via expo-web-browser. [@stripe/stripe-react-native](https://www.npmjs.com/package/@stripe/stripe-react-native) v0.68.0 (June 2026, Stripe-official, active) exists if in-app ever becomes wanted | Healthy | **Ports as-is** (architecture), UI rewrite like everything else |
| 13 | **Drafts / KV storage** | Composer draft + push-debug + offline index in localStorage; app-lock + pending-upload descriptor in Capacitor Preferences | **react-native-mmkv** (or AsyncStorage) for localStorage uses; expo-secure-store for sensitive keys. Zustand `persist` has first-class MMKV adapters | MMKV: de-facto standard, active | **Adapt** (mechanical find-and-replace tier) |
| 14 | **Instant self-playback** | `localClips.ts`: object URLs of the just-posted blob mapped by recipe id (blobs pinned in WebView memory, LRU cap of 3) | Simpler in RN: keep the recorded file's `file://` path, hand it to expo-video until Cloudflare is `ready` — zero bytes in the JS heap | n/a | **Adapt** (gets simpler) |
| 15 | **State/data layer** | zustand 4, TanStack Query 5, supabase-js 2, `@sizzle/shared` DTOs, `api.ts` fetch wrapper, `queries.ts` (1,490 ln) | All work in RN unchanged (supabase-js needs AsyncStorage session adapter + `react-native-url-polyfill`). Query keys, mutations, optimistic updates, cache-invalidation graph — the hardest-won logic — move ~85–90% verbatim | All actively maintained | **Ports as-is** — the portable core of the app (see §3.1 for the honest overall share) |
| 16 | **Image cropper / video trimmer** | `ImageCropper.tsx` (canvas → JPEG blob); `VideoTrimmer.tsx` (MediaRecorder **real-time re-record** of the selected range — a web hack) | Cropper: expo-image-manipulator + gesture UI rewrite. Trimmer: native `AVAssetExportSession` `timeRange` — fold into the same custom video Expo Module as row 4; output is **better quality** than the current re-record | n/a | **Full rewrite** (trimmer improves) |
| 17 | **Shell plumbing** | @capacitor/status-bar, safe-area CSS vars (`--sat`), app-state listeners, share sheet, `browserFinished` staleness workaround | expo-status-bar, react-native-safe-area-context, `AppState`, RN `Share`/expo-sharing. The `browserFinished`-because-WebView-never-sees-visibilitychange hack dies (RN gets real AppState events) | Stable | **Adapt** (net deletion of workarounds) |
| 18 | **getsizzle.app (web + PWA + marketing)** | **Same codebase serves the web app and `Marketing.tsx`** (930 ln of GSAP + Lenis scroll-scrub — pure DOM), plus web-only recorder (`CameraRecorder.tsx`, getUserMedia/MediaRecorder), hls.js, canvas croppers | **react-native-web is not viable for this app**: RNW entered **maintenance mode** (creator moved to React Strict DOM; "no major features on the horizon") ([React Native Rewind](https://itnext.io/react-native-web-enters-maintenance-mode-a-drop-in-photo-gallery-and-the-strictest-button-ever-872c57a76c94)), and GSAP/Lenis/hls.js/canvas/MediaRecorder/scroll-snap have no RNW story regardless | React Strict DOM solves "DOM-subset in RN," not "run this RN app on the web" | **Full second codebase.** Realistic plan: keep the Vite app as the web/PWA/marketing property and accept permanent double-maintenance of every product feature — the single largest structural cost of the migration |
| 19 | **All remaining UI** (68 components, ~19.4k ln: 27 sheets, Discover, Profile, Onboarding, admin, glow/controls design system, `useSwipeDismiss` physics) | Inline-styled DOM + CSS + GSAP micro-interactions | RN primitives + Reanimated; no automated conversion exists | n/a | **Full rewrite**, component by component |

Key repo files backing the "current implementation" column: `/Users/brandenvincent-walker/Developer/Sizzle/apps/web/src/components/Feed.tsx`, `VideoPlayer.tsx`, `NativeCameraRecorder.tsx`, `VideoTrimmer.tsx`, `ImageCropper.tsx`, `Marketing.tsx`, `sheets/UploadSheet.tsx`, `src/lib/uploadTask.ts`, `native.ts`, `nativeOAuth.ts`, `applock.ts`, `push.ts`, `offline.ts`, `localClips.ts`, `src/App.tsx`, `src/main.tsx`, `/Users/brandenvincent-walker/Developer/Sizzle/apps/web/ios/App/App/VideoConcatPlugin.swift`, `/Users/brandenvincent-walker/Developer/Sizzle/apps/web/package.json`.

---

## 2. What genuinely improves on RN — with evidence

**Bottom line up front:** RN structurally eliminates roughly *one and a half* of the three WKWebView failure classes Sizzle fought at launch, delivers real (but not transformative) gains in feed headroom, gestures, and TTI, and delivers approximately zero gain on background uploads, transcode latency, App Review, or the backend. The biggest honest gain is *headroom and idiom*: the things Sizzle hand-built (DOM windowing, blob lifecycle management, upload-survival plumbing) are either the platform default or unnecessary in RN. The biggest honest non-gain: the hardest problems of launch week were OS physics and Supabase config, not WebView physics.

### 2.1 The three launch-week failure classes — eliminated, reshaped, or unchanged?

**a. Memory / jetsam from DOM + video — structurally reshaped in RN's favor, not eliminated.**
The repo shows a genuine, recurring fight: `Feed.tsx` carries a hand-rolled three-tier windowing system (`visible` / `near` / `nearDom` IntersectionObservers) whose comment says it exists because without it "a deep scroll session keeps EVERY card's subtree + observers mounted forever and the WKWebView eventually jetsams the app" (`Feed.tsx:330-336`). `localClips.ts` pins full clip blobs ("up to 150+ MB") in WebView memory behind an LRU cap of 3; the same jetsam fix was applied three separate times this week (Feed, `VideoPlayer`, `RecipeSheet` native-source detach). The 2026-07-16 audit calls feed virtualization "the WKWebView jetsam ceiling — biggest remaining scale risk."

Why RN moves the ceiling: the `com.apple.WebKit.WebContent` process gets its **own conservative jetsam budget** — roughly 300–450 MB on typical devices, varying by device/load, and Apple explicitly says you cannot raise it ([Apple Dev Forums](https://developer.apple.com/forums/thread/766309), [thread/663084](https://developer.apple.com/forums/thread/663084), [Embrace on WKWebView memory](https://embrace.io/blog/wkwebview-memory-leaks/), [Catch Metrics WebKit RAM deep dive](https://www.catchmetrics.io/blog/deep-dive-ram-internals-webkit)). An RN app is a single native process with the app's much larger limit, and video decode lives in AVPlayer layers accounted outside the JS heap. The specific sub-class "150 MB clip pinned as a `blob:` URL in JS memory" is **fully eliminated** — RN players play from file paths; `localClips.ts` and its release choreography stop existing (module map row 14). And list memory management stops being bespoke (row 1).

Why "not eliminated": RN TikTok clones also OOM if you mount a player per card — Bluesky ships a custom video component and strict active-player management ([bluesky-social/social-app](https://github.com/bluesky-social/social-app/blob/main/package.json), `@haileyok/bluesky-video`). Discipline is still required; the budget you're disciplined *within* is several times larger, and the failure mode degrades (evictions, dropped frames) rather than hard-killing a WebContent process.

**Impact: 0–10k users — moderate** (the hand-rolled fixes shipped and are field-verified; jetsam now mostly threatens marathon sessions on old devices). **100k+ — high** (this class scales with content depth, session length, and low-RAM Android devices, and every new media surface re-pays the tax).

**b. JS suspended in background killing uploads — NOT eliminated. Same physics, and Sizzle already has the correct fix.**
This must not be scored as an RN win. RN JavaScript is suspended on backgrounding exactly like WebView JavaScript; iOS gives any app ~30s–3min of grace, then execution stops ([Grokipedia: background uploads in Expo RN](https://grokipedia.com/page/Background_uploads_in_Expo_React_Native), [PearPixels](https://pearpixels.com/react-native-upload-in-background/)). The only correct fix on iOS is a **background `URLSession` PUTing from a file path** — precisely what Sizzle shipped in build 25 via `@capgo/capacitor-uploader` (PROGRESS.md: "verified `URLSessionConfiguration.background` in plugin source… Uploads survive backgrounding AND swipe-kill; next launch claims the completion event"), with resume-after-kill checkpoints in `uploadTask.ts` (`ck.nativeUploadId`/`pendingUploadUrl`, lines 42–50). A migration would *re-implement* this, on an RN ecosystem that is weaker here than what's shipped (module map row 6). **Net gain: zero; regression risk: real. Impact at any scale: 0.**

**c. Transcoding picker delays — already fixed; not structural; zero gain.**
The 15–20s "preparing" wait was the WebView `<input type=file>` forcing an iOS re-encode; build 24 fixed it with PHPicker + `skipTranscoding`. RN pickers sit on the same PHPicker API and expose the same original-asset option — equivalent, not better (and with an open transcoding regression to verify, [expo/expo #42739](https://github.com/expo/expo/issues/42739)). The residual "sometimes instant, sometimes 20s" delay is **iCloud-offloaded originals** downloading — Photos-library physics no framework touches. **Impact: 0 at any scale.**

**d. Bonus class: the WKWebView networking body bug — genuinely eliminated, and it would let you delete an architecture.**
The entire native upload relay (native → Supabase Storage → API `/copy` → Cloudflare) exists because iOS WKWebView never delivers the multipart body to Cloudflare direct upload (PROGRESS.md 2026-07-16; CLAUDE.md architecture map). RN networking is native `NSURLSession` — no WebView fetch/blob bridge — so native devices could upload direct-to-Cloudflare like the web client already does. That removes the Supabase Storage hop, its **double egress** (the audit's "free-tier 5GB egress dies in days from the /copy relay" → forced Supabase Pro), the `/copy` failure/re-ingest handling, and part of the orphan-GC surface. The background-URLSession requirement from (b) still applies to the transfer itself, but the *destination* simplifies. **Impact: 0–10k — moderate (real monthly cost + moving parts); 100k+ — high (egress scales linearly with upload volume).**

### 2.2 Native list virtualization + video surfaces for a TikTok feed

- **FlashList v2** (Shopify, mid-2025): recycling, no size estimates, up to 50% less blank-cell area vs v1, powering "thousands of lists in the Shopify mobile app" ([Shopify engineering](https://shopify.engineering/flashlist-v2), [repo](https://github.com/Shopify/flash-list)). Replaces `Feed.tsx`'s bespoke three-observer windowing with a maintained, benchmarked platform idiom.
- **Bluesky** is the best public proof that an Expo/RN app ships a production social video feed at millions-of-users scale, open source, custom video layer included ([bluesky-social/social-app](https://github.com/bluesky-social/social-app/blob/main/package.json)). Expo's own team built a TikTok-style vertical video app for AT Protocol and documented it ([Expo blog](https://expo.dev/blog/how-we-built-a-tiktok-for-bluesky-with-expo)); `expo-video` is a first-party hardware-surface player ([docs](https://docs.expo.dev/versions/latest/sdk/video/)).
- Honest caveats: apples-to-apples "we moved a WebView TikTok feed to RN, here are the numbers" postmortems essentially don't exist publicly — Cordova→RN migration literature is vendor marketing ([example](https://xbsoftware.com/blog/cordova-to-react-native-migration/)) — so treat this as strong ecosystem evidence, not a measured delta. And on iOS the current app already plays HLS through AVFoundation (WKWebView native HLS; hls.js only serves non-Safari web), so raw playback quality on iOS is not the gap — surface lifecycle, decoder management, and Android (where hls.js-in-WebView does MSE work a native ExoPlayer does for free) are. Android player-recycle flicker is a known sharp edge to budget for ([expo discussion](https://github.com/expo/expo/discussions/17398)).

**Impact: 0–10k — low-moderate** (the shipped feed is field-verified good; the gain is not re-fighting §2.1a per surface). **100k+ — high**, especially Android smoothness and long-session stability.

### 2.3 Animations / gestures

**Reanimated 4** went stable mid-2025 (UI-thread worklets + a CSS-syntax API; requires New Architecture) ([Software Mansion](https://swmansion.com/blog/reanimated-4-stable-release-the-future-of-react-native-animations-ba68210c3713/)), paired with Gesture Handler's native recognizers. What Sizzle does today — CSS opacity/transform fades, pointer-event scrubber, `useSwipeDismiss`, GSAP/Lenis on marketing — mostly rides the WebKit compositor and is *fine*. The gap is **gesture-driven, finger-tracking interactions** (drag-to-dismiss with physics, rubber-banding, shared-element transitions): in the WebView those run pointer-event JS on the same main thread as React; in RN they run as UI-thread worklets untouched by JS load. **Impact: 0–10k — low (polish); 100k+ — moderate** (interaction feel is a retention lever for a TikTok-class app).

### 2.4 Startup / TTI

RN with Hermes executes precompiled bytecode; a Capacitor launch must spin up a WKWebView process, load and parse the JS bundle, then React-render the DOM. Sizzle is demonstrably fighting this today (`bootProgress.ts`; OTAs for "feed-first launch, instant Profile paint"). Hermes V1 (opt-in, Expo SDK 55) shows further "meaningful performance improvements" ([SDK 55 changelog](https://expo.dev/changelog/sdk-55)). Expect a real but sub-second-class cold-start gain, not a rebirth. **Impact: 0–10k — low; 100k+ — moderate** (cold-start correlates with day-1 retention at acquisition scale).

### 2.5 Build/ship DX: EAS vs the current pipeline — a fair comparison

Sizzle's pipeline is *already fully automated* — `npm run release:ios:full` (archive → export → altool → ASC attach → submit, with signature verification), scripted submission cancel/replace, Capgo OTA in ~10 min with a hardened kill-only apply policy. EAS is not a capability unlock; it's **maintenance-shedding**: hosted builds/submit replace ~6 self-maintained scripts + local Xcode state, and EAS Update gains Hermes bytecode diffing in SDK 55. Expo dev-client iteration is genuinely better than build-and-`cap sync`. Note the pricing shape: **EAS Update bills by MAU** ([usage-based pricing](https://docs.expo.dev/billing/usage-based-pricing/), [expo.dev/pricing](https://expo.dev/pricing), [plans](https://docs.expo.dev/billing/plans/)) — full cost comparison in §3.6. **Impact: 0–10k — low (current pipeline works); 100k+ — low-moderate** (mostly de-risking bus-factor on bespoke scripts).

### 2.6 Hiring / ecosystem

The RN ecosystem is an order of magnitude deeper than Capacitor's for exactly Sizzle's needs: VisionCamera, FlashList, Reanimated, expo-video are all company-backed and healthy. Sizzle's current native layer leans on **one small team's plugins** (five `@capgo/*` packages in `apps/web/package.json`) — actively maintained today, but a concentration risk. Capacitor 8 itself is fine ([Ionic's own comparison](https://ionic.io/blog/ionic-vs-react-native-performance-comparison)); the asymmetry is the *plugin* ecosystem and hiring pool ([SO Survey 2025](https://survey.stackoverflow.co/2025/technology) — RN consistently ~8–9% of all developers vs low single digits for Ionic/Cordova). **Impact: 0–10k (solo + AI-assisted) — near zero; 100k+ (raising, hiring) — moderate-high.**

### 2.7 What does NOT improve — do not let these be priced into the bet

| Unchanged by RN | Why |
|---|---|
| **Background JS suspension** | Same OS behavior; the shipped background-URLSession + resume-checkpoint system must be rebuilt, not retired (§2.1b) |
| **Upload physics** | Bytes over cellular, retry/idempotency (`clientUploadId`), the 50 MB Supabase config root-cause — none of that was WebView's fault |
| **Cloudflare transcode time** | The finalize cron, 10-min poll, poster-404 window, and the *need* for instant self-playback all remain (the implementation just gets simpler) |
| **Picker/iCloud delays** | PHPicker + original-representation already shipped; iCloud offload downloads are Photos physics |
| **App Review** | Same cadence; RN *also* needs a new binary for any native-module change — the OTA-vs-binary boundary is identical to Capgo's |
| **Entire backend** | Hono/Supabase/Cloudflare/Stripe, RLS security model, ranking — untouched (correctly out of scope, but it means the migration buys zero backend leverage) |
| **The web surface** | getsizzle.app is served from the *same components*; RN forfeits that unless you maintain two frontends — priced in §3.2 |
| **Field-verified native work** | `VideoConcat` (adversarially reviewed), app-lock, OAuth deep links, FCM — all get re-implemented and re-verified, largely to parity, not improvement |

**Scoring summary (gain × stage):** the only entries that are simultaneously *structural* and *large at 100k+* are §2.1a (memory/jetsam headroom), §2.1d (deleting the upload relay + its egress economics), and §2.2 (feed idiom/Android smoothness). Everything else is polish, maintenance-shedding, or zero. At 0–10k users — where Sizzle is this week — no single RN gain addresses a problem that is currently unsolved; the week's war stories were all *won* on Capacitor, several of them (background uploads, instant picks) with solutions RN cannot improve on.

---

## 3. The case against: what gets worse, breaks, or costs

### 3.1 This is a total rewrite, not a port — most of ~19,400 lines of UI

The entire client is React **DOM**: 64 `.tsx` files (~22,000 lines in `components/` alone; 19,393 lines across `src`), built from `<div>`s, the CSS cascade in `index.css`, `position: fixed` sheets, backdrop-filter glows (`glow.tsx`), and browser APIs. RN has none of that: no DOM, no CSS cascade, no `hls.js`, no `requestVideoFrameCallback` (which the cover-capture pipeline in OTA 1.0.59 depends on), no GSAP/Lenis, no `<video>`.

The honest portability accounting, reconciled across analyses: the **data/logic layer ports at ~85–90%** — `queries.ts` (1,490 ln), `store.ts` (439 ln, zustand), `api.ts`, `format.ts`, `ingredients.ts`, `@sizzle/shared` DTOs, the TanStack Query mutation/invalidation graph — but that layer is only **~20–30% of the codebase**, and it's the *easy* 20–30%. Roughly **12–14k of the 19.4k lines are UI that must be rewritten** against the same visual spec. The hard-won parts — `NativeCameraRecorder.tsx` (860 ln), `uploadTask.ts` (450 ln), `Feed.tsx` (623 ln), `UploadSheet.tsx` (780 ln), all 27 sheets with `useSwipeDismiss` physics — are exactly the parts rebuilt from scratch on `View`/`Pressable`/Reanimated. Sizzle's own history says each of these takes multiple field-tested iterations, not one clean pass.

### 3.2 getsizzle.app loses its engine

The web app is not a separate product — `App.tsx` routes logged-out web visitors to `Marketing.tsx` (930 ln, GSAP scroll animation) and logged-in ones into **the same components the iOS app runs** (`showMarketing = !isNative && …`). getsizzle.app is simultaneously the marketing site, the PWA, the desktop experience (`DesktopSidebar`), the legal-docs host, and the share-link landing surface (`SharePostCard`, deep-link previews) — all from one build. After an RN migration there are three options, all bad:

- **React Native Web / Expo web**: RNW is in maintenance mode (§1 row 18) and its output is worse than DOM-native React for a content site — worse SEO markup, worse CSS control, heavier bundles — and the GSAP scroll-scrub page, hls.js, and MediaRecorder surfaces simply don't translate.
- **Keep the current Vite app as a second codebase** — every feature now lands twice (RN + DOM), permanently. The "single codebase" argument for RN is inverted for Sizzle: **Capacitor is already the single codebase; RN would create the split.** (This is the realistic option — see §5.)
- **Kill web** — losing shareability (recipe links that open in-browser drive installs), the PWA, and desktop.

### 3.3 Every stabilized native flow goes back to zero — and the repo shows what "stabilizing" cost

The strongest evidence in the repo. Git log and PROGRESS.md document that the current native surface was field-debugged through **builds 23→26 and OTAs 1.0.43→1.0.64 in rapid iteration** — conservatively ~4 native binaries and ~20 OTA releases to reach "field-verified on device":

- **Uploads**: direct-to-Cloudflare failed in WKWebView → Supabase-relay path (`26fe7b7`); tus tried and *reverted* (`6d78fc3`); "stuck at 0%" (`781ab3c`), "stalled at 99%" (`3ba5a80`), false session-expired (`c5da4c1`), a global 50MB storage-cap root cause (`fc35d94`); then build 25's background-URLSession uploads with resume-after-kill checkpoints, verified against swipe-kill on a real device. In RN this whole chain restarts on a weaker ecosystem (module map row 6).
- **Picker**: build 24's WKWebView-`<input>`-forces-re-encode discovery, fixed with PHPicker `skipTranscoding`, plus the iCloud-offloaded-original fallback UX in 1.0.60. `expo-image-picker` has its *own* transcoding and iCloud behaviors to characterize from scratch (row 5).
- **Recorder**: build 26's segment recording (@capgo/camera-preview + `VideoConcatPlugin.swift`) went through an adversarial review that caught **4 HIGH-severity bugs pre-ship** (app-lock bypass via the camera transparency chain, suspend/resume interleave, stop-rejection wedge, mixed-orientation stitch). VisionCamera reproduces none of this tuning for free; the transparency-chain bug class becomes a different fragile-layering problem rather than vanishing entirely.
- **OTA policy**: 1.0.61's lesson — `autoUpdate:'atBackground'` reloaded the app mid-session and destroyed user work, fixed with Capgo's `setMultiDelay({kind:'kill'})` (`main.tsx`). The kill-only policy is reproducible on EAS Update (row 7), but the failure mode that motivated it would need re-learning.

A rewrite doesn't skip that loop; it reruns it with a new set of unknowns, on an app that now has real users watching.

### 3.4 Expo constraints for the custom Swift

`VideoConcatPlugin.swift` is currently trivial to own: one file in the Xcode project, registered in `MainViewController`. Under Expo it becomes a **local Expo Module** — a new DSL (`Function`, `AsyncFunction`, `Events`, promise bridging) with its own quirks (functions capped at 8 arguments; known friction adding external Swift packages, which pod-install can silently blow away) ([Expo Modules API](https://docs.expo.dev/modules/get-started/), [Swift-package friction](https://medium.com/@me_82386/expo-modules-adding-swift-packages-and-frameworks-onnx-whisperkit-9f7229d7cf6f)). Worse is the workflow change: with [CNG/prebuild](https://docs.expo.dev/workflow/continuous-native-generation/), `ios/` becomes a **generated artifact** — every native customization Sizzle currently makes by editing the Xcode project (storyboard, pbxproj, plist, the camera transparency chain) must be expressed as config-plugin code or it's destroyed on the next `npx expo prebuild --clean`. Ejecting to bare workflow forfeits much of the reason to pick Expo. Expo Modules also isn't frozen ground: active toolchain-edge breakages exist (e.g. [expo-modules-jsi failing on Xcode 26 / Swift 6.2](https://github.com/expo/expo/issues/46242)).

### 3.5 RN's own failure classes are live right now, mid-2026

The migration would land mid-way through RN's biggest platform transition since 2015:

- **New Architecture is mandatory.** [Expo SDK 55 (Feb 2026) removed the Legacy Architecture entirely](https://expo.dev/changelog/sdk-55) — `newArchEnabled: false` is silently ignored. As of January 2026, [~17% of EAS Build projects still hadn't migrated](https://byteiota.com/expo-sdk-55-legacy-architecture-is-gone-migrate-now/), and Expo's guidance is that libraries on the interop layer "will eventually stop working" ([New Architecture guide](https://docs.expo.dev/guides/new-architecture/)).
- **Migration breakage is documented, not hypothetical.** Reanimated needed a major-version jump (v3→v4, with the `react-native-worklets` split) for SDK 54+; teams report New-Arch behavioral differences — `setNativeProps` failures, synchronous-measurement and gesture-timing shifts — that "do not produce test failures but produce subtle behavioral differences that show up in QA on real devices" ([production migration report](https://procedure.tech/blogs/react-native-new-architecture-in-production/), [SDK 55 migration guide](https://reactnativerelay.com/article/expo-sdk-55-migration-guide-breaking-changes-sdk-53-to-55)). For a gesture-heavy vertical-feed app, that is precisely Sizzle's risk surface.
- **The platform itself regresses.** A reported [~25–30% RAM increase on RN 0.85 vs 0.83 across identical flows](https://github.com/facebook/react-native/issues/57059) — notable because RN 0.85 is what SDK 56 ships, and memory headroom is a headline reason to migrate (§2.1a). Hermes V1 (new compiler+VM in RN 0.82) is better long-term but another moving part during the exact rewrite window.
- **Annual upgrade treadmill.** Expo ships ~3 SDKs/year with a narrow support window; every upgrade is a mini-migration across the native dependency set. Capacitor's model (WebView + thin plugins) let Sizzle ride one major version (Cap 8) through the entire launch sprint.

### 3.6 Real cost numbers: current stack vs. EAS

Current recurring tooling cost is roughly **$12–35/month**: Capgo from [$12/mo scaling ~$0.001/MAU](https://capgo.app/pricing/) (recently *reduced* prices), builds free on Branden's Mac (`release-ios.sh` + ASC API scripts), Vercel on existing plans. The EAS equivalents:

- **EAS Update**: [Starter ($19/mo) includes ~3,000 MAU, then $0.005/MAU — 10k users ≈ $35 extra/mo; at 100k MAU on the $199/mo Production plan (50k included) overage alone is ~$250/mo, plus $0.10/GiB bandwidth beyond allowance](https://stalliontech.io/expo-eas-update-pricing) ([official usage pricing](https://docs.expo.dev/billing/usage-based-pricing/)). Sizzle ships OTAs *multiple times per day* during sprints (1.0.43→1.0.64 in weeks) — a high-frequency-update shop is EAS Update's worst-case pricing shape. Capgo at the same scale is an order of magnitude cheaper.
- **EAS Build**: [per-build fees against monthly credits; Production $199/mo with $225 credits, 2 concurrencies](https://docs.expo.dev/billing/plans/). Local builds remain possible (`npx expo run:ios`), but everything CNG assumes pushes toward EAS.

Realistic steady state: **~$20–200+/mo where today's spend is ~$12 — a 5–15× tooling-cost increase for capabilities Sizzle already has working.**

### 3.7 Double infrastructure during the transition

For the entire migration window: two codebases receiving bug fixes, two OTA systems (Capgo live, EAS Update beta), two build pipelines, two push-token registrations against one FCM project, and careful migration of persisted client state (Preferences keys, Supabase session, app-lock hash, in-flight upload checkpoints) so the binary swap doesn't log everyone out or orphan drafts. Every production incident is triaged twice. App Review adds tail risk: the swap ships as one big-bang binary replacing a working app — a rejection or regression rolls back to a codebase that has by then gone stale.

### 3.8 Momentum and credibility

Sizzle launched **this week** — build 26 is in App Review, field-verified, with a public marketing site and announced launch. The next 90 days decide retention, creators, and App Store traction. A rewrite converts those 90 days of feature velocity (the thing Capgo OTAs deliver in ~10 minutes) into churn users never see, while the live app receives only life-support fixes. PROGRESS.md already records the rational framing: *"stay Capacitor; RN only as a data-driven v2"* — a rewrite is only justified by measured evidence, none of which exists yet (see §5).

### 3.9 Prior art: rewrites that were regretted

- **Airbnb** remains the canonical case: after ~2 years and a large dedicated team, they [sunset React Native in 2018](https://medium.com/airbnb-engineering/react-native-at-airbnb-f95aa460be1c), citing upgrade churn, abandoned third-party native modules, and bridge-maintenance cost. The transferable lesson: **the migration itself was the wound** — innovation budget spent on replatforming.
- **Threads (Meta, 2023)** — built by RN's own parent company — [shipped native Swift/UIKit and Jetpack Compose](https://zoewave.medium.com/the-journey-away-from-react-native-adfa65448c07), a telling choice for a media-feed app in Sizzle's exact category.
- Recent smaller-team accounts (2025–26) echo the pattern for media-heavy apps: teams that shipped faster with RN but paid in perf and plugin abandonment, [moving back to Swift after production](https://blog.stackademic.com/why-we-moved-back-from-react-native-to-swift-after-shipping-to-production-c05ec231fd8d); agencies [scrambling to fix unmaintained plugins and pausing releases during RN upgrades](https://studiokrew.com/blog/react-native-vs-swift-kotlin/).

None of these prove RN can't work — Discord, Shopify, and Bluesky prove it can — but they are consistent evidence that **the migration tax is paid in full even when the destination is fine**, and that video-feed apps specifically tend to fight the framework at the exact layer (camera, playback, memory) where Sizzle just finished winning its fights on Capacitor.

**Section bottom line:** the migration re-purchases, at 3–5 months of solo-dev time and 5–15× the tooling cost, a set of capabilities the repo proves are already working and field-verified — instant PHPicker picks, kill-proof background uploads with resume, a segment recorder with a custom AVFoundation stitcher, a session-safe OTA pipeline, and a single codebase that also powers getsizzle.app — in exchange for a platform mid-way through a mandatory architecture migration, in the single most valuable window of the product's life.

---

## 4. If the trigger ever fires: the migration strategy

### 4.1 What carries over untouched (verified in the repo)

| Asset | Status in an RN migration |
|---|---|
| **Entire backend** — Hono API on Vercel, Supabase (Postgres/Auth/Storage/RLS), Cloudflare Stream, Stripe Connect, Resend, finalize cron | **Zero changes.** The client speaks HTTPS + `@supabase/supabase-js`; nothing is WebView-specific. |
| **`packages/shared` DTOs** (`packages/shared/src/index.ts`) | Imports as-is into an RN workspace — same monorepo, same `@sizzle/shared` alias. |
| **`queries.ts` (1,490 ln) + `lib/api.ts` + most of `store.ts` (439 ln)** | ~85–90% portable. The DOM bits (object URLs, `File`, `<video>` capture) need swapping; the query keys, mutations, optimistic-update logic, and cache-invalidation graph move nearly verbatim. |
| **`VideoConcatPlugin.swift` (156 ln)** | The AVFoundation core is framework-agnostic. Re-wrapping as an Expo Module is ~0.5–1 day (subject to the CNG/config-plugin constraints in §3.4); the concat/cleanup logic is untouched. |
| **Supabase session** | `lib/supabase.ts` stores the session in Capacitor Preferences = iOS `NSUserDefaults` (keys prefixed `CapacitorStorage`). An RN successor shipped under the **same bundle ID** can read those exact UserDefaults keys on first launch and hydrate the Supabase client — **users stay logged in across the migration**. A genuinely lucky break; do not lose it by changing bundle IDs. |
| **Product/UX spec, copy, flows, App Store listing, review history** | All reusable. The 68 components are a pixel-accurate spec even where the code isn't portable. |
| **`apps/web` itself** | Does **not** die — it keeps serving getsizzle.app (marketing + PWA). GSAP/Lenis usage is confined to `Marketing.tsx`, which never goes native anyway. The permanent dual-maintenance cost of this arrangement is §3.2. |

What does **not** carry over: every pixel of UI — roughly 12–14k of 19.4k lines (§3.1), rebuilt against the module map in §1.

### 4.2 Ecosystem reality check (mid-2026)

Condensed from §1; the four items that gate a go decision:

- **Target: Expo SDK 56** (RN 0.85), New Architecture mandatory, ~3 SDKs/year cadence ([Expo changelog](https://expo.dev/changelog)) — and note the open RN 0.85 RAM-regression report (§3.5) touches the headline reason to migrate.
- **Recorder spike is gating**: VisionCamera pause/resume + `enablePersistentRecorder` mid-record flip must be verified on device against the open bug reports (§1 row 3) before anything else is built.
- **Background upload is the known regression**: plan the custom `URLSession` Expo Module from day one (~2–3 days of Swift you fully control, mirroring `capacitor-uploader`; `uploadTask.ts` already isolates it behind one seam) — and budget TestFlight cycles for the edge cases.
- **OTA**: Capgo does not serve RN — EAS Update, kill-only apply reproduced via `checkAutomatically: 'NEVER'` + apply on cold start; pricing per §3.6.

### 4.3 Path A — Big-bang v2 rewrite (Capacitor app frozen, all effort on RN)

| Module | Days |
|---|---|
| Scaffold: Expo SDK 56, expo-router, EAS, monorepo wiring, theme/design tokens, controls/icons port | 5–8 |
| Feed + video player (expo-video, FlashList v2, preload window, PosterImg retry, instant self-playback from local file, HLS) | 7–12 |
| Recorder (VisionCamera: pause-resume/segments, mid-record flip, zoom, torch; VideoConcat as Expo Module fallback; trimmer) | 8–14 |
| Upload pipeline (custom URLSession background-upload module, original-file picks via expo-image-picker or custom PHPicker module, resume-after-kill, UploadProgressTile) | 5–8 |
| Sheets/overlays — 27 sheets incl. UploadSheet (780 ln), RecipeSheet, CookMode, Comments, Analytics (`@gorhom/bottom-sheet`) | 10–16 |
| Screens: Profile, Discover, Saved, Hashtags, Onboarding, Admin, Splash, PasscodeLock | 8–13 |
| Auth: Supabase + native Sign in with Apple (`expo-apple-authentication` — an upgrade over web OAuth), Google, session migration from `CapacitorStorage` UserDefaults | 3–5 |
| Platform services: FCM push (`@react-native-firebase/messaging`), badge, biometric lock (`expo-local-authentication`), deep links, offline detection | 3–5 |
| OTA switch to EAS Update + release pipeline (EAS Build replacing the ASC scripts) | 2–3 |
| Data layer port (queries/store/format/ingredients/shopping — mostly mechanical) | 3–5 |
| Marketing/PWA split cleanup in `apps/web` | 2–3 |
| End-to-end QA on device + old-device pass, TestFlight beta, store submission, fix cycle | 9–15 |
| **Total** | **65–107 days (~3–5 months solo+AI)** |

Risk: the live app gets **no features and only OTA-able fixes** for the whole window — brutal for an app launched this week. Only sane if the app is actively dying in a way OTA can't fix.

### 4.4 Path B — Parallel greenfield reaching parity while Capacitor ships (recommended path if triggered)

Same modules as A, sequenced by risk: **week 1–2 spike = feed + recorder + background upload only** (the three reasons you'd migrate at all) on real old hardware. If the spike doesn't visibly beat the WKWebView app, stop and keep Capacitor — total sunk cost ~12–18 days. If it does, continue to parity, shipping the Capacitor app on Fridays only (fixes, no new features after the halfway mark). Ship the RN build as a **same-bundle-ID binary update** (sessions carry via UserDefaults; users just see an app update). Overhead vs. A: dual-maintenance tax and context switching, ~+15–20%. **Total: 75–125 days elapsed, with a kill-switch decision point at day ~15.** This is the right shape for a solo founder: the live app never stops, and the bet is falsifiable early.

### 4.5 Path C — Brownfield/hybrid (verified: it exists, but it's not your hybrid)

Embedding RN views in a Capacitor app is no longer strictly impossible — [callstack/react-native-brownfield 1.0](https://github.com/callstack/react-native-brownfield/) (April 2025) mounts RN components in any native iOS/Android app and has been [demonstrated inside Capacitor specifically](https://jnesis.com/en/blog/bridging-the-gap-integrating-react-native-views-into-your-capacitor-project/). But it means two JS runtimes (Hermes + WKWebView), Metro *and* Vite, ~25–35MB binary growth, duplicated state/auth across bridges, and gesture-handoff seams exactly at the feed edge where it matters. For a 19k-line app this is more total complexity than either rewrite. **Reject it.**

The brownfield option that *does* fit this codebase is the one already proven by `VideoConcatPlugin.swift`: **stay on Capacitor and move the specific hot path native as a Swift plugin.** Jetsam during feed scroll? Build a native `AVPlayer` feed view presented over the WebView (Swift/SwiftUI plugin, the web app drives it via bridge) — 10–20 days, one surface, no framework migration, OTA-updatable everywhere else. This is the correct *first* response to most trigger fires, and each such plugin also de-risks a later RN move (the Swift survives).

---

## 5. Decision triggers & instrumentation

**Instrumentation gap today (verified in repo):** `lib/sentry.ts` is a hand-rolled JS-only envelope poster and `VITE_SENTRY_DSN` is **unset** — literally nothing is being measured. None of the triggers below are observable right now. The "data-driven" half of "RN as data-driven v2" does not exist yet. Do this week (~2 days total):

1. **Set the DSN** — create the Sentry project, add `VITE_SENTRY_DSN` to both Vercel projects + the Capgo-shipped build. Cost: minutes.
2. **Native crash visibility** — the JS shim cannot see native crashes, OOM kills, or WebView process deaths. Add `@sentry/capacitor` (wraps sentry-cocoa) with `enableWatchdogTerminations: true` — the only practical jetsam/OOM proxy ([Watchdog Terminations docs](https://docs.sentry.io/platforms/apple/configuration/watchdog-terminations/)); MetricKit-grade jetsam detail is imperfect and late-arriving ([MetricKit in production](https://medium.com/@mrhotfix/metrickit-in-production-what-apple-doesnt-document-and-why-you-still-need-crashlytics-sentry-2a3c9591ed05)).
3. **WKWebView content-process deaths** — the WebView-specific failure Sentry won't label: override `webViewWebContentProcessDidTerminate` in `MainViewController.swift` (the file already exists for exactly this kind of hook), log a Sentry event tagged `webview_terminated`, then reload. This is *the* metric that indicts Capacitor specifically ([known Capacitor issue class](https://github.com/ionic-team/capacitor/issues/6549)).
4. **Feed jank probe** — a ~20-line rAF-delta sampler active only while the feed scrolls; report `%frames >100ms` + device model as a Sentry measurement per session. Simulator numbers are worthless — this must come from the field.
5. **Upload funnel telemetry** — `uploadTask.ts` already has every state transition; emit `upload_started / native_handoff / resumed_after_kill / failed{cause} / succeeded` as API events. Denominator = started; a failure rate is currently uncomputable.
6. **Complaint tagging** — label every App Store review / support email with one of {perf, camera, upload, crash, other} in a spreadsheet. Cheap, decisive.

**Triggers.** Each must hold **over a rolling 30 days**, on ≥ a few thousand sessions, **after** one honest Capacitor-side fix attempt — including the Path-C native-plugin escape hatch for feed/camera issues:

| Metric | Threshold that justifies the bet |
|---|---|
| Crash-free sessions (JS + native + watchdog combined) | < 99.3% and not attributable to one fixable bug |
| `webview_terminated` events | > 1% of sessions, or > 3% on the oldest quartile of devices |
| Watchdog/OOM terminations | > 0.5% of sessions, concentrated in feed scroll or recorder |
| Feed jank | > 8% of scroll frames over 100ms at P75 devices, still true after a dedicated optimization sprint |
| Upload failure (failed or abandoned ÷ started) | > 3% overall, or > 8% for app-backgrounded uploads |
| Complaint class | ≥ 10% of reviews/support volume citing lag/stutter/camera for 4+ consecutive weeks |

**Firing rule:** any **two** simultaneously, or one catastrophically (e.g. `webview_terminated` > 5% of sessions), fires the trigger → run Path B's 2-week feed+recorder+upload spike on old hardware as a falsifiable gate. A spike that doesn't visibly beat the live app kills the migration for another cycle.

---

## 6. Recommendation

**Do not migrate now, and do not treat migration as the default response when something hurts.** The research confirms the standing decision on every axis that matters at current scale:

1. **This week:** spend ~2 days lighting up the instrumentation in §5 (DSN, `@sentry/capacitor` with watchdog terminations, the `webViewWebContentProcessDidTerminate` hook, the jank probe, the upload funnel, complaint tagging). This is the entire near-term action item of this study. A migration decided without these instruments would be the only unforgivable version of the bet.

2. **Next 30–60 days:** let real-user data accumulate while shipping features at Capgo-OTA velocity. Answer every incident first with the cheap escape hatches Capacitor already provides — OTA fixes, and for feed/camera-class problems, a targeted native Swift plugin in the proven `VideoConcatPlugin.swift` pattern (Path C's good half: 10–20 days, one surface, and the Swift survives any later RN move).

3. **If two triggers from §5 still fire after that:** run Path B — the 2-week feed+recorder+upload spike on old hardware as a falsifiable gate (~12–18 days max sunk cost), then, only on a passing spike, the parallel greenfield Expo SDK 56+ build (75–125 days) shipped under the **same bundle ID** so sessions migrate silently via the `CapacitorStorage` UserDefaults keys — with the backend, `packages/shared`, the query layer, and the AVFoundation Swift coming along untouched, and the Vite app retained as the permanent web property.

4. **Record the honest counterweights** so the v2 evaluation isn't re-litigated from scratch: the recorder genuinely improves on RN (native pause/resume, no transparency chain); the upload relay and its double-egress cost can be deleted (§2.1d); the jetsam ceiling genuinely rises (§2.1a); and hiring/ecosystem depth favors RN if Sizzle raises and staffs. Against them: background uploads regress without custom native work, the web property forks permanently, tooling cost rises 5–15×, and the platform is mid-transition with documented churn.

The rewrite is a real but survivable bet whose expected value is negative at 0–10k users and plausibly positive at 100k+ — which is exactly what "launch on Capacitor, RN only as a data-driven v2" already says. The study's one material addition: **as of today the decision is unfalsifiable, and two days of instrumentation fixes that.**
