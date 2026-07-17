#!/usr/bin/env node
// Prepare a Sizzle App Store version for review — the half that turns an
// uploaded binary into a version sitting in "Prepare for Submission" with the
// build attached and the metadata text boxes filled. Run asc-submit-for-review
// afterward to actually submit it.
//
// Idempotent. What it does:
//   1. Waits for BUILD_NUMBER to finish PROCESSING in App Store Connect
//      (the upload half — release-ios.sh — pushes the binary; Apple then
//      ingests + processes it, ~5-30 min).
//   2. Finds-or-creates the appStoreVersion for APP_VERSION.
//   3. Attaches the processed build.
//   4. Sets the release type (default MANUAL — you press Release after approval).
//   5. Writes the en-US "What's New" from release.config.json (or RELEASE_NOTES).
//   6. With --review-info: writes the App Review Information (contact, demo
//      account, notes) from release.config.json. Demo password from
//      ASC_DEMO_PASSWORD env only — never from a file.
//
// Usage:
//   ASC_ISSUER_ID=... APP_VERSION=1.0 BUILD_NUMBER=23 \
//     node scripts/asc-prepare-version.mjs [--review-info]
//
// APP_VERSION/BUILD_NUMBER default to the values baked into the Xcode project
// (MARKETING_VERSION / CURRENT_PROJECT_VERSION), read automatically if unset.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { asc, sleep, fail, CONFIG } from './lib/asc-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PBXPROJ = resolve(HERE, '../ios/App/App.xcodeproj/project.pbxproj');
const CONFIG_PATH = resolve(HERE, 'release.config.json');

/** Read a build setting out of the pbxproj (first occurrence). */
function fromPbxproj(key) {
  try {
    const m = readFileSync(PBXPROJ, 'utf8').match(new RegExp(`${key} = ([^;]+);`));
    return m ? m[1].trim().replace(/^"|"$/g, '') : '';
  } catch {
    return '';
  }
}

const APP_VERSION = process.env.APP_VERSION || fromPbxproj('MARKETING_VERSION');
const BUILD_NUMBER = process.env.BUILD_NUMBER || fromPbxproj('CURRENT_PROJECT_VERSION');
const RELEASE_TYPE = (process.env.ASC_RELEASE_TYPE || 'MANUAL').toUpperCase(); // MANUAL | AFTER_APPROVAL
const WRITE_REVIEW_INFO = process.argv.includes('--review-info');
const MAX_WAIT_MS = Number(process.env.MAX_WAIT_MS || 45 * 60 * 1000);

if (!APP_VERSION) fail('APP_VERSION not set and MARKETING_VERSION not found in project.pbxproj.');
if (!BUILD_NUMBER) fail('BUILD_NUMBER not set and CURRENT_PROJECT_VERSION not found in project.pbxproj.');

let releaseCfg = {};
try {
  releaseCfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch {
  console.warn(`(no readable release.config.json at ${CONFIG_PATH}; using RELEASE_NOTES env only)`);
}
const RELEASE_NOTES = process.env.RELEASE_NOTES || releaseCfg.whatsNew || '';

// Version states that are still editable (safe to reuse + attach a build).
const EDITABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
]);

async function main() {
  console.log(`› App Store Connect: app ${CONFIG.appId}, version ${APP_VERSION}, build ${BUILD_NUMBER}`);

  // 1. Wait for the uploaded binary to finish processing.
  console.log(`Waiting for build ${BUILD_NUMBER} (${APP_VERSION}) to process…`);
  const deadline = Date.now() + MAX_WAIT_MS;
  let buildId = null;
  for (;;) {
    const res = await asc(
      'GET',
      `/v1/builds?filter[app]=${CONFIG.appId}&filter[version]=${BUILD_NUMBER}` +
        `&filter[preReleaseVersion.version]=${APP_VERSION}&fields[builds]=processingState,version&limit=5`,
    );
    const build = res?.data?.[0];
    const state = build?.attributes?.processingState;
    if (state === 'VALID') {
      buildId = build.id;
      console.log(`✔ Build processed (id ${buildId}).`);
      break;
    }
    if (state === 'FAILED' || state === 'INVALID') {
      fail(`Build ${BUILD_NUMBER} processing state: ${state} — check App Store Connect.`);
    }
    if (Date.now() > deadline) {
      fail(`Timed out waiting for build ${BUILD_NUMBER} (last state: ${state ?? 'not visible yet'}).`);
    }
    console.log(`  …${state ?? 'not in ASC yet (upload/ingest pending)'}; retrying in 60s`);
    await sleep(60_000);
  }

  // 2. Find-or-create the appStoreVersion.
  const versions = await asc(
    'GET',
    `/v1/apps/${CONFIG.appId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,platform`,
  );
  let version = versions?.data?.find(
    (v) =>
      v.attributes.platform === CONFIG.platform &&
      v.attributes.versionString === APP_VERSION &&
      EDITABLE.has(v.attributes.appStoreState),
  );
  if (version) {
    console.log(`✔ Reusing existing version ${APP_VERSION} (${version.attributes.appStoreState}).`);
  } else {
    const clash = versions?.data?.find(
      (v) => v.attributes.platform === CONFIG.platform && v.attributes.versionString === APP_VERSION,
    );
    if (clash) {
      fail(
        `Version ${APP_VERSION} exists in non-editable state ${clash.attributes.appStoreState}. ` +
          `Bump MARKETING_VERSION for a new version, or reset the existing one in App Store Connect.`,
      );
    }
    const created = await asc('POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: CONFIG.platform, versionString: APP_VERSION, releaseType: RELEASE_TYPE },
        relationships: { app: { data: { type: 'apps', id: CONFIG.appId } } },
      },
    });
    version = created.data;
    console.log(`✔ Created App Store version ${APP_VERSION} (release: ${RELEASE_TYPE}).`);
  }

  // 3. Attach the build.
  await asc('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, {
    data: { type: 'builds', id: buildId },
  });
  console.log(`✔ Attached build ${BUILD_NUMBER}.`);

  // 4. Ensure the release type matches (existing versions may differ).
  try {
    await asc('PATCH', `/v1/appStoreVersions/${version.id}`, {
      data: { type: 'appStoreVersions', id: version.id, attributes: { releaseType: RELEASE_TYPE } },
    });
    console.log(`✔ Release type: ${RELEASE_TYPE}.`);
  } catch (e) {
    console.warn(`  (could not set release type: ${e.message})`);
  }

  // 5. Release notes (en-US). Localizations are auto-created with the version.
  if (RELEASE_NOTES) {
    const locs = await asc(
      'GET',
      `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,whatsNew`,
    );
    const enUS = locs?.data?.find((l) => l.attributes.locale === 'en-US') || locs?.data?.[0];
    if (!enUS) fail('No version localization found to write release notes into.');
    await asc('PATCH', `/v1/appStoreVersionLocalizations/${enUS.id}`, {
      data: {
        type: 'appStoreVersionLocalizations',
        id: enUS.id,
        attributes: { whatsNew: RELEASE_NOTES },
      },
    });
    console.log(`✔ Release notes set (${enUS.attributes.locale}).`);
  }

  // 6. App Review Information (opt-in — only when --review-info is passed, so a
  //    routine build bump doesn't clobber carefully-tuned review notes).
  if (WRITE_REVIEW_INFO) {
    const ri = releaseCfg.reviewInfo || {};
    const demoPassword = process.env.ASC_DEMO_PASSWORD || '';
    const attrs = {
      contactFirstName: ri.contactFirstName || '',
      contactLastName: ri.contactLastName || '',
      contactPhone: ri.contactPhone || '',
      contactEmail: ri.contactEmail || '',
      demoAccountRequired: !!ri.demoAccountRequired,
      notes: ri.notes || '',
    };
    if (ri.demoAccountRequired) {
      attrs.demoAccountName = ri.demoAccountName || '';
      if (demoPassword) attrs.demoAccountPassword = demoPassword;
      else console.warn('  (ASC_DEMO_PASSWORD not set — demo password left unchanged in ASC)');
    }
    // appStoreReviewDetail is a to-one on the version; find-or-create.
    const existing = await asc(
      'GET',
      `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
    ).catch(() => null);
    if (existing?.data?.id) {
      await asc('PATCH', `/v1/appStoreReviewDetails/${existing.data.id}`, {
        data: { type: 'appStoreReviewDetails', id: existing.data.id, attributes: attrs },
      });
    } else {
      await asc('POST', '/v1/appStoreReviewDetails', {
        data: {
          type: 'appStoreReviewDetails',
          attributes: attrs,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
        },
      });
    }
    console.log('✔ App Review Information written (contact, demo account, notes).');
  }

  console.log(`\nVersion ${APP_VERSION} is prepared. Now run: npm run asc:submit\n`);
}

main().catch((e) => fail(e.message));
