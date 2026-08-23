/**
 * Ops-tooling invariants — executable memory of how the sweep's own tools have failed.
 *
 * These guard the tools the unattended daily sweep depends on. A broken verifier is
 * worse than no verifier: it reports a healthy deploy as unverified (or, worse, stops
 * the run before anything is checked), which is exactly what happened on 2026-08-19
 * when a stale Vercel CLI token threw `Error: vercel api 403` out of the poll loop.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { checkWebVersion, createVercelClient } from '../../scripts/verify-deploy.mjs';

/** Minimal stand-in for a fetch Response, enough for the client's ok/status/json use. */
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function harness(statuses, { whoamiSucceeds = true } = {}) {
  const calls = { fetch: 0, whoami: 0, tokens: [] };
  let tokenSeq = 0;
  const client = createVercelClient({
    fetchImpl: async (_url, init) => {
      calls.tokens.push(init.headers.Authorization);
      const status = statuses[calls.fetch] ?? 200;
      calls.fetch += 1;
      return response(status, { deployments: [{ readyState: 'READY' }] });
    },
    loadToken: () => `tok-${tokenSeq++}`,
    refreshAuth: () => { calls.whoami += 1; return whoamiSucceeds; },
  });
  return { client, calls };
}

test('verify-deploy refreshes a stale Vercel token and retries instead of dying', async () => {
  // The 2026-08-19 failure exactly: first call 403, and the run must still complete.
  const { client, calls } = harness([403, 200]);
  const deployments = await client('prj_test');

  assert.deepEqual(deployments, [{ readyState: 'READY' }]);
  assert.equal(calls.whoami, 1, '`vercel whoami` should run exactly once to re-mint the token');
  assert.equal(calls.fetch, 2, 'the request should be retried after the refresh');
  assert.deepEqual(calls.tokens, ['Bearer tok-0', 'Bearer tok-1'], 'the retry must use the RE-READ token, not the stale one');
});

test('verify-deploy treats 401 as the same stale-token class as 403', async () => {
  const { client, calls } = harness([401, 200]);
  await client('prj_test');
  assert.equal(calls.whoami, 1);
});

test('verify-deploy refreshes at most once — a dead token fails, it does not spin', async () => {
  const { client, calls } = harness([403, 403, 200]);
  await assert.rejects(() => client('prj_test'), /vercel api 403/);
  assert.equal(calls.whoami, 1, 'refreshing on every poll tick would spin `vercel whoami` forever');
  assert.equal(calls.fetch, 2, 'exactly one retry, then give up');
});

test('verify-deploy keeps every non-auth status a hard error', async () => {
  for (const status of [404, 429, 500]) {
    const { client, calls } = harness([status, 200]);
    await assert.rejects(() => client('prj_test'), new RegExp(`vercel api ${status}`));
    assert.equal(calls.whoami, 0, `${status} is not an auth failure — it must not trigger a token refresh`);
  }
});

test('verify-deploy reports a real login problem when the refresh itself fails', async () => {
  const { client, calls } = harness([403, 200], { whoamiSucceeds: false });
  await assert.rejects(() => client('prj_test'), /vercel login/);
  assert.equal(calls.fetch, 1, 'no point retrying with a token that could not be refreshed');
  assert.equal(calls.whoami, 1);
});

/*
 * Frontend deploy verification (TD-8). Before this, the web branch printed the probe
 * status and asserted NOTHING — a READY deployment serving a 500, or an alias pointing
 * at a previous build, both passed as "verified". `/version.json` is emitted by the web
 * build (apps/web/vite.config.ts) so the served surface can name its own commit, the
 * way /health already does for the API.
 */
const HEAD = 'a'.repeat(40);
const versionFetch = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new Error('not json');
    return body;
  },
});

test('web verification passes when the served build names HEAD', async () => {
  const v = await checkWebVersion('https://x.test', HEAD, versionFetch(200, { version: '1.2.3', commit: HEAD }));
  assert.equal(v.ok, true);
  assert.match(v.detail, /== HEAD/);
});

test('web verification accepts the short commit Vercel stamps', async () => {
  const v = await checkWebVersion('https://x.test', HEAD, versionFetch(200, { version: '1.2.3', commit: HEAD.slice(0, 7) }));
  assert.equal(v.ok, true, 'a prefix of HEAD is the same commit, not a mismatch');
});

test('web verification FAILS when the alias serves a different build', async () => {
  const other = 'b'.repeat(40);
  const v = await checkWebVersion('https://x.test', HEAD, versionFetch(200, { version: '1.2.3', commit: other }));
  assert.equal(v.ok, false, 'a stale alias is the exact failure this check exists to catch');
  assert.match(v.detail, /another build/);
});

test('web verification FAILS on a commit too short to identify a build', async () => {
  const v = await checkWebVersion('https://x.test', HEAD, versionFetch(200, { version: '1.2.3', commit: 'a' }));
  assert.equal(v.ok, false, '"a" prefix-matches most SHAs — it must not pass as a match');
  assert.match(v.detail, /too short/);
});

test('web verification FAILS when version.json is missing', async () => {
  const v = await checkWebVersion('https://x.test', HEAD, versionFetch(404));
  assert.equal(v.ok, false);
  assert.match(v.detail, /did not emit it/);
});

test('web verification FAILS when version.json is unreachable', async () => {
  const v = await checkWebVersion('https://x.test', HEAD, async () => { throw new Error('ECONNREFUSED'); });
  assert.equal(v.ok, false);
  assert.match(v.detail, /unreachable/);
});

test('web verification reports — but does not fail — an unstamped archive CLI deploy', async () => {
  const v = await checkWebVersion('https://x.test', HEAD, versionFetch(200, { version: '1.2.3', commit: null }));
  assert.equal(v.ok, true, 'the documented webhook-outage fallback must not raise a false alarm');
  assert.match(v.detail, /not asserted/);
});

test('the web build emits version.json — the check above has something to read', async () => {
  const config = await readFile(new URL('../../apps/web/vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /fileName: 'version\.json'/, 'apps/web/vite.config.ts must emit dist/version.json');
  assert.match(config, /VERCEL_GIT_COMMIT_SHA/, 'the manifest must stamp the deploying commit');
  const vercelJson = JSON.parse(await readFile(new URL('../../apps/web/vercel.json', import.meta.url), 'utf8'));
  const rule = (vercelJson.headers ?? []).find((h) => h.source === '/version.json');
  assert.ok(rule, 'version.json needs an explicit header rule');
  const cacheControl = rule.headers.find((h) => h.key === 'Cache-Control')?.value ?? '';
  assert.match(cacheControl, /no-store/, 'a cached version.json would report the PREVIOUS build as live');
});
