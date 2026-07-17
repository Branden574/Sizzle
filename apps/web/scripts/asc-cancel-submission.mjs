#!/usr/bin/env node
// Cancel the app's open App Store review submission (e.g. to replace the build
// it carries with a newer one, then re-run asc:prepare + asc:submit). Safe to
// run when nothing is open — it just reports that and exits 0.
import { asc, CONFIG } from './lib/asc-client.mjs';

const res = await asc(
  'GET',
  `/v1/apps/${CONFIG.appId}/reviewSubmissions?filter[platform]=${CONFIG.platform}&limit=10&fields[reviewSubmissions]=state,platform`,
);
// States that represent an open (cancelable) submission. COMPLETE/CANCELED are terminal.
const OPEN = new Set(['READY_FOR_REVIEW', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES']);
const open = (res?.data ?? []).filter((s) => OPEN.has(s.attributes?.state));

if (!open.length) {
  console.log('No open review submission to cancel.');
  process.exit(0);
}
for (const sub of open) {
  console.log(`Canceling review submission ${sub.id} (state: ${sub.attributes.state})…`);
  await asc('PATCH', `/v1/reviewSubmissions/${sub.id}`, {
    data: { type: 'reviewSubmissions', id: sub.id, attributes: { canceled: true } },
  });
  console.log(`✔ Canceled ${sub.id}.`);
}
