# Sizzle — automated App Store Connect upload + submit

One command takes a native iOS change from source to "submitted for Apple
review" — no Xcode UI, no Apple ID prompt, metadata text boxes filled. This
mirrors the StockPilot pipeline, adapted for Capacitor + `xcodebuild` (Sizzle
doesn't use EAS/Expo).

## When you need this vs. OTA

- **JS/CSS-only change** → ship over-the-air with **Capgo** (~10 min, no review).
  See the OTA runbook — no new binary, no App Store review. Use this for the vast
  majority of updates.
- **Native change** (new Capacitor plugin, native code, or a store-visible
  version bump) → a new binary that **must** go through Apple review. That's what
  the scripts here automate.

Apple's review itself (~24-48h) can never be skipped. The automation removes
every *manual* step around it.

## One-time setup (already done on Branden's Mac)

- App Store Connect API key at `~/.appstoreconnect/private_keys/AuthKey_9SA2GBH9YV.p8`
  (Key ID `9SA2GBH9YV`). **This is a secret — it lives outside the repo and is
  never committed.**
- Issuer ID `aead110f-3dbb-4ea8-86a3-c0a41f22b775`, App ID `6790235409`,
  bundle `app.sizzle.mobile`, team `6R2T984G9S`. These are baked in as defaults
  in `apps/web/scripts/lib/asc-client.mjs` (all non-secret) and overridable by env.

Nothing else to configure. The Apple Distribution certificate and App Store
provisioning profile are minted automatically at export time via
`-allowProvisioningUpdates` + the API key.

## The commands (run from `apps/web`)

```bash
# 0. Bump the version/build in Xcode's project first (source of truth):
#    ios/App/App.xcodeproj → MARKETING_VERSION and/or CURRENT_PROJECT_VERSION.
#    A new App Store *version* needs a new MARKETING_VERSION; a re-upload of the
#    same version needs a higher CURRENT_PROJECT_VERSION (build number).

# 1. Build web + sync Capacitor + archive + export + verify signature + upload:
npm run release:ios

# 2. After Apple finishes processing (~5-30 min), attach the build + What's New:
npm run asc:prepare

# 3. Submit for review:
npm run asc:submit

# — or all three, hands-off (step 2 polls until processing completes):
npm run release:ios:full
```

`release:ios:full` is the "one command" equivalent of StockPilot's
`pnpm release:ios --auto-submit` + `pnpm submit:review`.

### First submission of a new version (fill review notes + demo account)

A routine build bump reuses the review notes already in App Store Connect. When
you want the automation to (re)write the App Review Information — contact, demo
account, the UGC/monetization notes — pass `--review-info` and supply the demo
password via env (never stored in a file):

```bash
ASC_DEMO_PASSWORD='the-review-account-password' npm run asc:prepare -- --review-info
npm run asc:submit
```

The non-secret review text (What's New, contact, demo account email, notes) lives
in `apps/web/scripts/release.config.json` — edit `whatsNew` there each release.

## What each piece does

| File | Role |
|---|---|
| `scripts/release-ios.sh` | build web → `cap sync ios` → `xcodebuild archive` (dev-signed) → `xcodebuild -exportArchive` (re-signs to **Apple Distribution**, flips `aps-environment` to **production**) → **verifies** the signature/entitlements/profile → `altool --validate-app` → `altool --upload-app`. Aborts if the export is dev-signed (a dev-signed upload silently kills push in TestFlight). |
| `scripts/asc-prepare-version.mjs` | polls ASC until the build is `VALID`, finds-or-creates the App Store version, attaches the build, sets release type, writes What's New, and (with `--review-info`) the review details. |
| `scripts/asc-submit-for-review.mjs` | creates/reuses a review submission, adds the version, and submits it for review. |
| `scripts/lib/asc-client.mjs` | shared ASC REST client — ES256 JWT auth, config with env overrides. |
| `ios/App/ExportOptions.plist` | `app-store-connect` / automatic signing / team `6R2T984G9S`. |
| `scripts/release.config.json` | the editable "text boxes" (What's New, review contact/notes/demo email). No secrets. |

## Release type: manual vs. automatic release on approval

`asc:prepare` sets the release type (env `ASC_RELEASE_TYPE`, default **`MANUAL`**):

- `MANUAL` — after Apple approves, **you** press "Release This Version" in ASC.
- `AFTER_APPROVAL` — auto-releases to the store the moment Apple approves.

Set `ASC_RELEASE_TYPE=AFTER_APPROVAL npm run asc:prepare` for fully hands-off.

## The dev-signing trap (why the verify step exists)

`xcodebuild archive` **always** produces a dev-signed archive (`Apple Development`,
`aps-environment: development`). That is normal — do not conclude it's broken. The
**export** step re-signs it with an Apple Distribution cert + App Store profile and
flips `aps-environment` to `production`. `release-ios.sh` verifies all three
(distribution authority, production aps-environment, no `ProvisionedDevices` in the
embedded profile) and refuses to upload otherwise.

## Env overrides (all optional)

`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`, `ASC_APP_ID`, `ASC_PLATFORM`,
`ASC_RELEASE_TYPE`, `APP_VERSION`, `BUILD_NUMBER` (default to the Xcode project's
`MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`), `RELEASE_NOTES`,
`ASC_DEMO_PASSWORD`, `SKIP_WEB_BUILD=1` (reuse existing `dist/`).

## Not wired to `git push` — and why

iOS release builds must be signed on a Mac, so firing on every push isn't
appropriate (and StockPilot's isn't either — its `release:ios` is a manual
command too). If you later want push-triggered releases, it'd be a GitHub Actions
job on a `macos` runner with the `.p8` key stored as an encrypted Actions secret;
the three scripts here are the building blocks it would call.
