#!/usr/bin/env bash
# Sizzle iOS release: build the web, sync Capacitor, archive, export a
# distribution-signed .ipa, verify the signature, and upload to App Store
# Connect. No Xcode UI, no Apple ID prompt — auth is the ASC API key.
#
# After this finishes (upload ≈10 min, then Apple ingest/process ≈5-30 min):
#   npm run asc:prepare   # attach build + fill What's New
#   npm run asc:submit    # submit for review
# or in one go:  npm run release:ios:full
#
# Env:
#   ASC_KEY_ID      (default 9SA2GBH9YV)
#   ASC_ISSUER_ID   (default is Branden's team issuer; only needed by asc:* steps)
#   ASC_KEY_PATH    (default ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8)
#   SKIP_WEB_BUILD=1  reuse the existing dist/ (skip npm run build + cap sync)
#
# Requires: Xcode, an Apple Distribution cert will be minted automatically.
set -euo pipefail

KEY_ID="${ASC_KEY_ID:-9SA2GBH9YV}"
ISSUER_ID="${ASC_ISSUER_ID:-aead110f-3dbb-4ea8-86a3-c0a41f22b775}"
KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$HERE/.." && pwd)"          # apps/web
IOS_DIR="$WEB_DIR/ios/App"
BUILD_DIR="$IOS_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/App.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
IPA_PATH="$EXPORT_DIR/App.ipa"
EXPORT_OPTS="$IOS_DIR/ExportOptions.plist"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$KEY_PATH" ] || die "ASC API key not found at $KEY_PATH (set ASC_KEY_PATH)."

# Read the versions we're shipping straight from the project (source of truth).
MARKETING_VERSION="$(grep -m1 'MARKETING_VERSION = ' "$IOS_DIR/App.xcodeproj/project.pbxproj" | sed 's/.*= //; s/;//; s/ //g')"
BUILD_NUMBER="$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$IOS_DIR/App.xcodeproj/project.pbxproj" | sed 's/.*= //; s/;//; s/ //g')"
step "Releasing Sizzle $MARKETING_VERSION (build $BUILD_NUMBER)"

if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then
  step "Building web + syncing Capacitor"
  ( cd "$WEB_DIR" && npm run build && npx cap sync ios )
else
  step "SKIP_WEB_BUILD=1 — reusing existing dist/ and native project"
fi

step "Archiving (device, Release) — this archive is dev-signed; the export re-signs it"
rm -rf "$ARCHIVE_PATH"
xcodebuild \
  -project "$IOS_DIR/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID" \
  archive

step "Exporting a distribution-signed .ipa"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID"

[ -f "$IPA_PATH" ] || die "Export produced no .ipa at $IPA_PATH"

step "Verifying the export is distribution-signed (not dev)"
VERIFY_DIR="$(mktemp -d)"
unzip -q "$IPA_PATH" -d "$VERIFY_DIR"
APP_PATH="$(find "$VERIFY_DIR/Payload" -maxdepth 1 -name '*.app' | head -1)"
[ -n "$APP_PATH" ] || die "No .app inside the .ipa"

AUTHORITY="$(codesign -dvvv "$APP_PATH" 2>&1 | grep -m1 'Authority=' || true)"
echo "  $AUTHORITY"
echo "$AUTHORITY" | grep -q 'Apple Distribution' \
  || die "Export is NOT Apple Distribution signed (got: $AUTHORITY). Do not upload a dev-signed build — it kills push in TestFlight."

APS="$(codesign -d --entitlements :- "$APP_PATH" 2>/dev/null | grep -A1 'aps-environment' | tr -d '\n' || true)"
echo "  aps-environment: $(echo "$APS" | grep -oE 'production|development' | head -1)"
echo "$APS" | grep -q 'production' \
  || die "aps-environment is not 'production' — push would break in TestFlight."

PROFILE="$APP_PATH/embedded.mobileprovision"
if [ -f "$PROFILE" ]; then
  if security cms -D -i "$PROFILE" 2>/dev/null | grep -q 'ProvisionedDevices'; then
    die "Embedded profile has ProvisionedDevices — that is an ad-hoc/dev profile, not App Store."
  fi
  echo "  embedded profile: App Store (no ProvisionedDevices) ✓"
fi
rm -rf "$VERIFY_DIR"

step "Validating with App Store Connect"
xcrun altool --validate-app -f "$IPA_PATH" -t ios \
  --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

step "Uploading to App Store Connect"
xcrun altool --upload-app -f "$IPA_PATH" -t ios \
  --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

step "Upload complete"
cat <<EOF

Sizzle $MARKETING_VERSION (build $BUILD_NUMBER) is uploading to App Store Connect.
Apple ingest + processing takes ~5-30 min. Then:

  ASC_ISSUER_ID=$ISSUER_ID npm run asc:prepare      # attach build + What's New
  ASC_ISSUER_ID=$ISSUER_ID npm run asc:submit       # submit for review

  (first submission for a version — also add review notes/demo account:
   ASC_DEMO_PASSWORD='...' npm run asc:prepare -- --review-info)
EOF
