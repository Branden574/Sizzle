#!/usr/bin/env node
// Submit Sizzle's prepared App Store version for REVIEW via the App Store
// Connect API — so a build bump doesn't need a manual "Submit for Review"
// click in App Store Connect.
//
// It does NOT skip Apple's review (impossible) and does NOT upload the build
// (release-ios.sh does that) or fill metadata (asc-prepare-version.mjs does
// that). It performs the final "submit for review" on a version already in
// "Prepare for Submission" (build attached + metadata complete).
//
//   ASC_ISSUER_ID=... npm run asc:submit
//
// Run asc-prepare-version.mjs first.

import { asc, fail, CONFIG } from './lib/asc-client.mjs';

// App Store version states from which a version can be submitted for review.
const SUBMITTABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
]);

async function main() {
  console.log(`› App Store Connect: app ${CONFIG.appId}, key ${CONFIG.keyId}`);

  // 1. Find the version to submit (latest in a submittable state).
  const versions = await asc(
    'GET',
    `/v1/apps/${CONFIG.appId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,platform`,
  );
  const candidate = (versions?.data ?? []).find((v) => {
    const a = v.attributes ?? {};
    const state = a.appStoreState || a.appVersionState; // API field-rename tolerance
    return a.platform === CONFIG.platform && SUBMITTABLE.has(state);
  });
  if (!candidate) {
    fail(
      'No App Store version is ready to submit (need one in "Prepare for Submission" with the build ' +
        'attached + metadata complete). Run: npm run asc:prepare first.',
    );
  }
  const versionId = candidate.id;
  const versionString = candidate.attributes?.versionString;
  console.log(`› Submitting version ${versionString} (${versionId}) for review…`);

  // 2. Reuse an open reviewSubmission if one exists, else create one.
  let submissionId;
  const open = await asc(
    'GET',
    `/v1/apps/${CONFIG.appId}/reviewSubmissions?filter[platform]=${CONFIG.platform}` +
      `&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=1`,
  ).catch(() => null);
  if (open?.data?.length) {
    submissionId = open.data[0].id;
    console.log(`› Reusing open review submission ${submissionId}`);
  } else {
    const created = await asc('POST', '/v1/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: CONFIG.platform },
        relationships: { app: { data: { type: 'apps', id: CONFIG.appId } } },
      },
    });
    submissionId = created.data.id;
    console.log(`› Created review submission ${submissionId}`);
  }

  // 3. Add the version as a submission item (ignore "already added").
  try {
    await asc('POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
    console.log('› Added the version to the submission');
  } catch (e) {
    if (!/already|exists/i.test(String(e.message))) throw e;
    console.log('› Version already in the submission');
  }

  // 4. Submit for review.
  await asc('PATCH', `/v1/reviewSubmissions/${submissionId}`, {
    data: { type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true } },
  });

  console.log(`\n✔ Submitted ${versionString} for App Store review. Apple review is ~24–48h.`);
  console.log(
    '  Release type controls what happens on approval (MANUAL = you press Release; ' +
      'set ASC_RELEASE_TYPE=AFTER_APPROVAL in asc:prepare to auto-release).',
  );
}

main().catch((e) => fail(e.message));
