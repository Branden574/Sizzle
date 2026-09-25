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

import { classifyDrift, driftReport, isRetryableGhError, materialiseReport, mirrorAll, mirrorPathFor } from '../../scripts/ops/origin-drift.mjs';
import { checkWebVersion, commitTimeIso, createVercelClient, staleHeadBail } from '../../scripts/verify-deploy.mjs';

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

/*
 * The TD-27 stale-HEAD trap in verify-deploy itself (TD-37).
 *
 * Session 44 of the 2026-09-21 SEV-1 ran `verify-deploy.mjs` with no `--sha` after a
 * git-data-API push. Local HEAD was frozen at an older commit, so the script polled for
 * a deployment that could never exist, burned its whole budget, and then reported "the
 * git webhook likely missed the push" — a confident, wrong root cause during an incident
 * (the webhook was fine; a new deployment had reached READY in 20s).
 */
const OLD_HEAD = 'e'.repeat(40);
const deployedAt = (iso, sha) => ({ createdAt: Date.parse(iso), meta: sha ? { githubCommitSha: sha } : {} });
const PAGE = [deployedAt('2026-09-23T17:00:00Z', 'f'.repeat(40)), deployedAt('2026-09-23T16:00:00Z', 'a'.repeat(40))];

test('verify-deploy bails instantly when local HEAD predates every deployment on the page', () => {
  const v = staleHeadBail({
    sha: OLD_HEAD, shaFromHead: true, commitIso: '2026-09-04T12:00:00Z', deployments: PAGE,
  });
  assert.equal(v.bail, true, 'polling for an aged-out commit can never succeed — fail fast instead');
  assert.match(v.detail, /--sha/, 'the message must name the actual remedy');
  assert.match(v.detail, /TD-27/, 'and the actual cause, not the webhook');
});

test('verify-deploy keeps polling when the SHA was passed explicitly — a deliberate redeploy is legal', () => {
  const v = staleHeadBail({
    sha: OLD_HEAD, shaFromHead: false, commitIso: '2026-09-04T12:00:00Z', deployments: PAGE,
  });
  assert.equal(v.bail, false, '`--sha` means the operator knows which commit they want');
});

test('verify-deploy does not bail on a commit newer than the oldest deployment — the build may still be queued', () => {
  const v = staleHeadBail({
    sha: OLD_HEAD, shaFromHead: true, commitIso: '2026-09-23T16:30:00Z', deployments: PAGE,
  });
  assert.equal(v.bail, false, 'a just-pushed commit legitimately has no deployment yet');
});

test('verify-deploy never bails when the SHA is already on the page', () => {
  const v = staleHeadBail({
    sha: 'a'.repeat(40), shaFromHead: true, commitIso: '2026-09-01T00:00:00Z', deployments: PAGE,
  });
  assert.equal(v.bail, false, 'the deployment exists — the normal path must handle it');
});

test('verify-deploy cannot bail without evidence — no deployments, no timestamps, or no local commit', () => {
  const base = { sha: OLD_HEAD, shaFromHead: true, commitIso: '2026-09-04T12:00:00Z' };
  assert.equal(staleHeadBail({ ...base, deployments: [] }).bail, false, 'an empty page proves nothing');
  assert.equal(staleHeadBail({ ...base, deployments: [{ meta: {} }] }).bail, false, 'no createdAt ⇒ no comparison');
  assert.equal(
    staleHeadBail({ ...base, commitIso: null, deployments: PAGE }).bail, false,
    'a commit absent from the local repo has no timestamp to judge — never guess',
  );
});

test('commitTimeIso returns null instead of throwing when the commit is not in the local repo', () => {
  assert.equal(commitTimeIso('deadbeef', () => { throw new Error('bad object'); }), null);
  assert.equal(commitTimeIso('deadbeef', () => '  \n'), null, 'empty output is absence, not a timestamp');
  assert.equal(commitTimeIso('deadbeef', () => '2026-09-04T12:00:00Z\n'), '2026-09-04T12:00:00Z');
});

/* ---------- origin-drift (TD-27): the sweep must notice a stale working tree ---------- */

const SYNCED = 'c'.repeat(40);
const AHEAD = 'd'.repeat(40);

test('origin-drift reports in-sync when local HEAD equals origin/main', () => {
  const r = driftReport({ localHead: SYNCED, originHead: SYNCED, files: [] });
  assert.equal(r.inSync, true);
  assert.match(r.lines.join('\n'), /in sync/);
});

test('origin-drift flags a stale lockfile as corrupting npm audit — the 2026-09-04 near-miss', () => {
  // Exactly the drift that made `npm audit` re-report a fixed @xmldom/xmldom advisory.
  const r = driftReport({
    localHead: SYNCED,
    originHead: AHEAD,
    files: [{ path: 'package-lock.json', status: 'modified' }],
    outDir: '.codex/origin-ddddddd',
  });
  assert.equal(r.inSync, false);
  assert.deepEqual(r.corrupting.map((f) => f.path), ['package-lock.json']);
  assert.match(r.lines.join('\n'), /npm audit \(sweep item 4\)/);
  assert.match(r.lines.join('\n'), /npm audit --package-lock-only/, 'it must hand the sweep the command that reads the ORIGIN tree');
});

test('origin-drift flags the two docs the sweep itself edits', () => {
  const { corrupting } = classifyDrift([
    { path: 'docs/engineering/technical-debt.md', status: 'modified' },
    { path: 'docs/operations/incidents/LOG.md', status: 'modified' },
  ]);
  assert.equal(corrupting.length, 2, 'building either edit on a stale base silently drops a prior sweep\'s entries');
});

test('origin-drift separates merely-behind files from check-corrupting ones', () => {
  const { corrupting, other } = classifyDrift([
    { path: 'package-lock.json', status: 'modified' },
    { path: 'apps/web/src/screens/Feed.tsx', status: 'modified' },
  ]);
  assert.deepEqual(corrupting.map((f) => f.path), ['package-lock.json']);
  assert.deepEqual(other.map((f) => f.path), ['apps/web/src/screens/Feed.tsx']);
});

test('origin-drift never tells the sweep to run a denied git command', () => {
  const text = driftReport({ localHead: SYNCED, originHead: AHEAD, files: [], outDir: '.codex/x' }).lines.join('\n');
  assert.match(text, /Do NOT `git pull`/, 'pull/fetch are not allowlisted unattended — the banner must say so');
});

test('origin-drift writes only inside the gitignored .codex scratch', async () => {
  const src = await readFile(new URL('../../scripts/ops/origin-drift.mjs', import.meta.url), 'utf8');
  const writeTargets = [...src.matchAll(/(?:writeFileSync|mkdirSync)\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(writeTargets.length > 0, 'the script is supposed to materialise origin copies');
  for (const target of writeTargets) {
    assert.match(target, /dest|dirname\(dest\)|mirrorPathFor\(outDir/, `unexpected write target: ${target}`);
  }
  assert.match(src, /outDir = `\.codex\/origin-/, 'the scratch dir must stay under .codex/ (gitignored since TD-20)');
  assert.equal(mirrorPathFor('.codex/origin-abc', 'docs/x.md'), '.codex/origin-abc/docs/x.md');
});

/* A transient `gh api` EOF mid-mirror must not suppress the drift verdict (session 88).
   Measured 2026-09-25: two consecutive runs died with `unexpected EOF` on a `contents/`
   fetch and printed "do not proceed on the working copy" instead of the drift they had
   already computed — which is the TD-27 failure the tool exists to prevent. */

test('isRetryableGhError classifies the transport blips but not a real absence', () => {
  assert.ok(isRetryableGhError(new Error('Get "https://api.github.com/...": unexpected EOF')));
  assert.ok(isRetryableGhError(new Error('read ECONNRESET')));
  assert.ok(isRetryableGhError(new Error('socket hang up')));
  assert.ok(!isRetryableGhError(new Error('HTTP 404: Not Found')), '404 is absence — retrying it just burns calls');
  assert.ok(!isRetryableGhError(new Error('HTTP 401: Bad credentials')), 'a revoked token will never succeed on retry');
  assert.ok(!isRetryableGhError(undefined), 'a missing error must not be treated as retryable');
});

test('a failed mirror reports the paths and keeps the verdict authoritative', () => {
  const lines = materialiseReport([{ path: 'docs/operations/incidents/LOG.md', reason: 'unexpected EOF' }]).join('\n');
  assert.match(lines, /verdict above is COMPLETE and valid/, 'the gate succeeded — say so, or the session discards it');
  assert.match(lines, /docs\/operations\/incidents\/LOG\.md/, 'it must name which mirror is missing');
  assert.match(lines, /Do NOT reason about the working copy/, 'the stale copy is exactly what TD-27 warns against');
  assert.match(lines, /raw\.githubusercontent\.com/, 'hand the session the single-file fallback that works');
});

test('a fully successful mirror adds no warning noise', () => {
  assert.deepEqual(materialiseReport([]), [], 'the clean path must stay silent');
});

test('a mid-mirror EOF is collected, not thrown — one bad file cannot abort the run', () => {
  const files = [
    { path: 'package-lock.json', status: 'modified' },
    { path: 'docs/operations/incidents/LOG.md', status: 'modified' },
  ];
  // The real failure shape: the big file blows up, everything else is fine.
  const failures = mirrorAll({
    files,
    outDir: `.codex/origin-test-${process.pid}`,
    fetchContent: (path) => {
      if (path === 'docs/operations/incidents/LOG.md') {
        throw new Error('Get "https://api.github.com/repos/x/y/contents/z": unexpected EOF');
      }
      return Buffer.from(`content of ${path}`).toString('base64');
    },
  });
  assert.deepEqual(failures.map((f) => f.path), ['docs/operations/incidents/LOG.md'],
    'the EOF must be collected and the other files still mirrored');
  assert.match(failures[0].reason, /unexpected EOF/, 'the reason must survive for the banner');
});

test('mirrorAll fetches the lockfile manifest only when the lockfile drifted', () => {
  const asked = [];
  const fetchContent = (path) => { asked.push(path); return ''; };
  mirrorAll({ files: [{ path: 'package-lock.json', status: 'modified' }], outDir: `.codex/origin-test-${process.pid}`, fetchContent });
  assert.ok(asked.includes('package.json'), 'npm audit needs the manifest beside the lockfile');

  asked.length = 0;
  mirrorAll({ files: [{ path: 'docs/x.md', status: 'modified' }], outDir: `.codex/origin-test-${process.pid}`, fetchContent });
  assert.ok(!asked.includes('package.json'), 'no lockfile drift ⇒ no wasted manifest call');
});

test('mirrorAll never fetches a file that origin deleted', () => {
  const asked = [];
  mirrorAll({
    files: [{ path: 'gone.md', status: 'removed' }, { path: 'here.md', status: 'modified' }],
    outDir: `.codex/origin-test-${process.pid}`,
    fetchContent: (path) => { asked.push(path); return ''; },
  });
  assert.deepEqual(asked, ['here.md'], 'a removed file has no content at the origin ref');
});

test('origin-drift prints the verdict before the mirror warning, never instead of it', async () => {
  const src = await readFile(new URL('../../scripts/ops/origin-drift.mjs', import.meta.url), 'utf8');
  assert.match(src, /ghWithRetry\(`repos\/\$\{REPO_SLUG\}\/contents\//, 'content fetches must go through the retrying wrapper');
  const report = src.indexOf('console.log(driftReport(');
  const note = src.indexOf('const note = materialiseReport(failures)');
  assert.ok(report > 0 && note > report, 'the verdict prints first; the mirror warning is appended after it');
});

test('the drift check is wired into the sweep prompt before the checks it protects', async () => {
  const prompt = await readFile(new URL('../../scripts/ops/sweep-prompt.md', import.meta.url), 'utf8');
  assert.match(prompt, /origin-drift/, 'a tool nothing invokes is a tool the sweep will skip');
  const drift = prompt.indexOf('origin-drift');
  const audit = prompt.indexOf('npm audit');
  assert.ok(drift < audit, 'the drift check must come BEFORE sweep item 4 (npm audit), which it protects');
});
