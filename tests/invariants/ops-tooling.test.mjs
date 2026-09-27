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

import { classifyDirty, classifyDrift, contentsNeedsRawFallback, decodeMirrorBytes, dirtyReport, driftReport, isRetryableGhError, materialiseReport, mirrorAll, mirrorPathFor, parseGitStatus } from '../../scripts/ops/origin-drift.mjs';
import { checkWebVersion, commitTimeIso, createVercelClient, staleHeadBail } from '../../scripts/verify-deploy.mjs';

/** Minimal stand-in for a fetch Response, enough for the client's ok/status/json use. */
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * A GitHub `contents` envelope for a file small enough to inline (≤1 MiB). `size` is
 * overridable so a test can express the "server said N, we got fewer" truncation case.
 */
const inlinePayload = (body, { size = Buffer.byteLength(body) } = {}) => ({
  encoding: 'base64',
  content: Buffer.from(body).toString('base64'),
  size,
});

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

/* The mirror is a trap you can walk into: measured session 102 of the Supabase SEV-1, the
   sandbox shell keeps its working directory ACROSS tool calls, and `.codex/origin-<sha>/`
   carries its own package.json, scripts/verify-deploy.mjs and tests/invariants/. So one `cd`
   into the mirror silently repoints the session's own verification gates at origin's stale
   copies — a green test run that proves nothing about the edit in the working tree. The tool
   used to print `(cd <mirror> && npm audit …)`, which the sandbox degrades to a bare `cd`. */

test('origin-drift never tells the sweep to cd — a leaked cwd runs the mirror\'s stale tools', () => {
  const text = driftReport({
    localHead: SYNCED,
    originHead: AHEAD,
    files: [{ path: 'package-lock.json', status: 'modified' }],
    outDir: '.codex/origin-ddddddd',
  }).lines.join('\n');
  assert.doesNotMatch(text, /\(cd /, 'the subshell form degrades to a bare `cd` in this sandbox');
  assert.doesNotMatch(text, /\bcd \.codex/, 'a printed `cd` into the mirror leaks into every later relative path');
  assert.match(
    text,
    /npm audit --package-lock-only --prefix \.codex\/origin-ddddddd/,
    'the audit command must NAME the mirror rather than move into it',
  );
  assert.match(text, /Do NOT `cd`/, 'and it must say why, because the hazard outlives this one command');
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
    fetchPayload: (path) => {
      if (path === 'docs/operations/incidents/LOG.md') {
        throw new Error('Get "https://api.github.com/repos/x/y/contents/z": unexpected EOF');
      }
      return inlinePayload(`content of ${path}`);
    },
  });
  assert.deepEqual(failures.map((f) => f.path), ['docs/operations/incidents/LOG.md'],
    'the EOF must be collected and the other files still mirrored');
  assert.match(failures[0].reason, /unexpected EOF/, 'the reason must survive for the banner');
});

test('mirrorAll fetches the lockfile manifest only when the lockfile drifted', () => {
  const asked = [];
  const fetchPayload = (path) => { asked.push(path); return inlinePayload(''); };
  mirrorAll({ files: [{ path: 'package-lock.json', status: 'modified' }], outDir: `.codex/origin-test-${process.pid}`, fetchPayload });
  assert.ok(asked.includes('package.json'), 'npm audit needs the manifest beside the lockfile');

  asked.length = 0;
  mirrorAll({ files: [{ path: 'docs/x.md', status: 'modified' }], outDir: `.codex/origin-test-${process.pid}`, fetchPayload });
  assert.ok(!asked.includes('package.json'), 'no lockfile drift ⇒ no wasted manifest call');
});

test('mirrorAll never fetches a file that origin deleted', () => {
  const asked = [];
  mirrorAll({
    files: [{ path: 'gone.md', status: 'removed' }, { path: 'here.md', status: 'modified' }],
    outDir: `.codex/origin-test-${process.pid}`,
    fetchPayload: (path) => { asked.push(path); return inlinePayload(''); },
  });
  assert.deepEqual(asked, ['here.md'], 'a removed file has no content at the origin ref');
});

// ---------------------------------------------------------------------------
// The 1 MiB `contents` cap (TD-41, measured watchdog session 101).
//
// GitHub answers 200 with full metadata but `encoding:"none"` / `content:""` for any file
// over 1 MiB. Decoding that yielded a 0-byte mirror of `LOG.md` — the single file whose
// stale/empty base "silently truncates prior entries" per CORRUPTS_CHECK. It is the one
// failure direction that reads as success, so every test below is about refusing to write
// a mirror that looks fine and is not.
// ---------------------------------------------------------------------------

test('contentsNeedsRawFallback fires only on the oversize envelope', () => {
  assert.ok(contentsNeedsRawFallback({ encoding: 'none', content: '', size: 1_085_434 }),
    'encoding "none" with a non-zero size is the >1 MiB envelope');
  assert.ok(!contentsNeedsRawFallback({ encoding: 'base64', content: 'aGk=', size: 2 }),
    'an inlined file must not cost a second call');
  assert.ok(!contentsNeedsRawFallback({ encoding: 'none', content: '', size: 0 }),
    'a genuinely empty file is legitimately empty — do not invent a fallback fetch');
  assert.ok(!contentsNeedsRawFallback(null), 'a missing payload must not claim a fallback');
});

test('decodeMirrorBytes takes the raw path for an oversize file and returns every byte', () => {
  const body = 'x'.repeat(1_085_434);
  const asked = [];
  const bytes = decodeMirrorBytes({
    payload: { encoding: 'none', content: '', size: body.length },
    path: 'docs/operations/incidents/LOG.md',
    fetchRaw: (path) => { asked.push(path); return Buffer.from(body); },
  });
  assert.deepEqual(asked, ['docs/operations/incidents/LOG.md'], 'the oversize branch must reach for the raw bytes');
  assert.equal(bytes.length, body.length, 'the mirror must carry the whole file, not an empty string');
});

test('decodeMirrorBytes REFUSES a short write instead of returning it', () => {
  // The exact pre-fix bug: a successful response that inlined nothing.
  assert.throws(
    () => decodeMirrorBytes({
      payload: { encoding: 'none', content: '', size: 1_085_434 },
      path: 'docs/operations/incidents/LOG.md',
      fetchRaw: () => Buffer.alloc(0),
    }),
    /mirror truncated: wrote 0 bytes, origin reports 1085434/,
    'a 0-byte mirror of LOG.md must be an error, never a base to append to',
  );
  // Broader than the cap it was written for: any truncation, inline branch included.
  assert.throws(
    () => decodeMirrorBytes({ payload: inlinePayload('half', { size: 999 }), path: 'x.md' }),
    /mirror truncated: wrote 4 bytes, origin reports 999/,
    'the size gate must cover the inline branch too',
  );
});

test('mirrorAll reports an un-materialisable oversize file instead of writing 0 bytes', () => {
  const failures = mirrorAll({
    files: [{ path: 'docs/operations/incidents/LOG.md', status: 'modified' }],
    outDir: `.codex/origin-test-${process.pid}`,
    fetchPayload: () => ({ encoding: 'none', content: '', size: 1_085_434 }),
    fetchRaw: () => { throw new Error('Get "https://api.github.com/...": unexpected EOF'); },
  });
  assert.deepEqual(failures.map((f) => f.path), ['docs/operations/incidents/LOG.md'],
    'an unfetchable mirror must be NAMED — materialiseReport is what tells the session not to trust the working copy');
});

test('mirrorAll writes the real bytes through the injected raw fallback', async () => {
  const outDir = `.codex/origin-test-${process.pid}-raw`;
  const body = `line\n`.repeat(50_000); // 250 KB, stands in for the >1 MiB envelope
  const failures = mirrorAll({
    files: [{ path: 'docs/operations/incidents/LOG.md', status: 'modified' }],
    outDir,
    fetchPayload: () => ({ encoding: 'none', content: '', size: body.length }),
    fetchRaw: () => Buffer.from(body),
  });
  assert.deepEqual(failures, [], 'the fallback is the happy path for a big file, not a failure');
  const written = await readFile(`${outDir}/docs/operations/incidents/LOG.md`, 'utf8');
  assert.equal(written.length, body.length, 'the mirror on disk must match origin byte for byte');
});

test('origin-drift prints the verdict before the mirror warning, never instead of it', async () => {
  const src = await readFile(new URL('../../scripts/ops/origin-drift.mjs', import.meta.url), 'utf8');
  // Both fetchers must be wrapped; a bare `gh(contentsPath(...))` would reintroduce the
  // single-blip abort that TD-40 fixed, on whichever branch was left unwrapped.
  assert.match(src, /fetchPayload: \(path\) => JSON\.parse\(ghWithRetry\(contentsPath\(path\)\)\)/,
    'the envelope fetch must go through the retrying wrapper');
  assert.match(src, /fetchRaw: \(path\) => ghRawWithRetry\(contentsPath\(path\)\)/,
    'the >1 MiB raw fallback must go through the retrying wrapper too');
  assert.ok(!/[^a-zA-Z]gh\(contentsPath\(/.test(src), 'no un-retried content fetch may survive');
  const report = src.indexOf('console.log(driftReport(');
  const note = src.indexOf('const note = materialiseReport(failures)');
  assert.ok(report > 0 && note > report, 'the verdict prints first; the mirror warning is appended after it');
});

/* ---------- TD-27's phantom: `git status` is dirty, but nothing is uncommitted ----------
   Measured by watchdog session 109 of the Supabase SEV-1: all four paths `git status` called
   dirty were byte-identical to origin, because a git-data-API push never advances local HEAD
   or the index. For ~100 sessions every entry promised to "preserve" them under rule 11, and
   the real hazard runs the other way — a commit built from the stale base lands as a REVERT of
   origin's own content. These tests pin the discrimination and, more importantly, its SAFE
   DIRECTION: only a positive byte comparison may retire a path to phantom. */

const bytes = (s) => Buffer.from(s);

test('classifyDirty calls a dirty-but-identical path a phantom, not uncommitted work', () => {
  const { phantom, real, unknown } = classifyDirty({
    entries: parseGitStatus(' M scripts/verify-deploy.mjs\n'),
    driftPaths: ['scripts/verify-deploy.mjs'],
    readLocal: () => bytes('same'),
    readMirror: () => bytes('same'),
  });
  assert.deepEqual(phantom.map((e) => e.path), ['scripts/verify-deploy.mjs']);
  assert.deepEqual(real, [], 'rule 11 must not fire on content that already landed at origin');
  assert.deepEqual(unknown, []);
});

test('classifyDirty preserves a path whose bytes really differ from origin', () => {
  const { phantom, real } = classifyDirty({
    entries: parseGitStatus(' M scripts/ops/origin-drift.mjs\n'),
    driftPaths: ['scripts/ops/origin-drift.mjs'],
    readLocal: () => bytes('edited in this session'),
    readMirror: () => bytes('origin'),
  });
  assert.deepEqual(phantom, [], 'a differing file is work — misclassifying it costs the work');
  assert.deepEqual(real.map((e) => e.path), ['scripts/ops/origin-drift.mjs']);
});

test('classifyDirty treats an unmirrored path as REAL without needing a comparison', () => {
  // Absent from the drift set ⇒ origin at originHead matches local HEAD there, so a working
  // copy that differs from HEAD necessarily differs from origin. No mirror required.
  const { phantom, real } = classifyDirty({
    entries: parseGitStatus(' M apps/web/src/screens/Feed.tsx\n'),
    driftPaths: [],
    readLocal: () => { throw new Error('must not be read'); },
    readMirror: () => { throw new Error('must not be read'); },
  });
  assert.deepEqual(phantom, []);
  assert.deepEqual(real.map((e) => e.path), ['apps/web/src/screens/Feed.tsx']);
});

test('classifyDirty refuses to guess when the origin copy is missing or the path is quoted', () => {
  const failed = classifyDirty({
    entries: parseGitStatus(' M docs/operations/incidents/LOG.md\n'),
    driftPaths: ['docs/operations/incidents/LOG.md'],
    mirrorFailures: ['docs/operations/incidents/LOG.md'],
    readLocal: () => bytes('x'),
    readMirror: () => bytes('x'),
  });
  assert.deepEqual(failed.phantom, [], 'an unfetchable mirror must never license "identical to origin"');
  assert.deepEqual(failed.unknown.map((e) => e.path), ['docs/operations/incidents/LOG.md']);

  const quoted = classifyDirty({
    entries: parseGitStatus(' M "docs/a b.md"\n'),
    driftPaths: ['"docs/a b.md"'],
    readLocal: () => bytes('x'),
    readMirror: () => bytes('x'),
  });
  assert.deepEqual(quoted.phantom, [], 'a git-quoted path could name a different file — never compare it blind');
  assert.equal(quoted.unknown.length, 1);
});

test('classifyDirty will not call a locally-deleted file a phantom', () => {
  const { phantom, unknown } = classifyDirty({
    entries: parseGitStatus(' D scripts/verify-deploy.mjs\n'),
    driftPaths: ['scripts/verify-deploy.mjs'],
    readLocal: () => null, // gone from disk
    readMirror: () => bytes('origin'),
  });
  assert.deepEqual(phantom, [], 'a deletion is uncommitted work, and an unreadable side is not a match');
  assert.equal(unknown.length, 1);
});

test('parseGitStatus reads the on-disk path of a rename and marks quoted paths', () => {
  assert.deepEqual(parseGitStatus('R  old.md -> new.md\n').map((e) => e.path), ['new.md']);
  assert.equal(parseGitStatus(' M "a b.md"\n')[0].quoted, true);
  assert.deepEqual(parseGitStatus('?? scripts/ops/origin-drift.mjs\n').map((e) => e.code), ['??']);
  assert.deepEqual(parseGitStatus('\n\n').length, 0, 'blank porcelain output is not a dirty path');
});

test('dirtyReport tells the session rule 11 does NOT apply to a phantom', () => {
  const text = dirtyReport({ phantom: [{ code: ' M', path: 'scripts/verify-deploy.mjs' }] }).join('\n');
  assert.match(text, /NOT uncommitted work/);
  assert.match(text, /REVERTS/, 'the real hazard is a commit off the stale base, and the banner must name it');
  assert.deepEqual(dirtyReport({}), [], 'a clean tree must stay silent');
});

test('dirtyReport says PRESERVE for real work, and the phantom banner never leaks onto it', () => {
  const text = dirtyReport({ real: [{ code: ' M', path: 'apps/web/src/screens/Feed.tsx', reason: 'differs' }] }).join('\n');
  assert.match(text, /PRESERVE IT \(rule 11\)/);
  assert.ok(!/NOT uncommitted work/.test(text), 'real work must never be described as a phantom');
});

test('the dirty comparison cannot suppress the drift verdict — TD-40/41/42 class', async () => {
  const src = await readFile(new URL('../../scripts/ops/origin-drift.mjs', import.meta.url), 'utf8');
  const verdict = src.indexOf('console.log(driftReport({ localHead, originHead, files, outDir })');
  const dirty = src.indexOf('const dirty = dirtySectionLines(');
  assert.ok(verdict > 0 && dirty > verdict, 'the verdict must print before the dirty section is even computed');
  assert.match(src, /function dirtySectionLines[\s\S]{0,1200}try \{/,
    'the convenience half must be caught, never allowed to abort the gate half');
  // `--check` writes no mirrors, so drifted paths must be reported UNDETERMINED rather than
  // deduced "real" from a file that was simply never fetched.
  assert.match(src, /mirrorFailures: checkOnly \? files\.map\(\(f\) => f\.path\) : failures\.map\(\(f\) => f\.path\)/,
    '--check must not compare against mirrors it never wrote');
});

test('the drift check is wired into the sweep prompt before the checks it protects', async () => {
  const prompt = await readFile(new URL('../../scripts/ops/sweep-prompt.md', import.meta.url), 'utf8');
  assert.match(prompt, /origin-drift/, 'a tool nothing invokes is a tool the sweep will skip');
  const drift = prompt.indexOf('origin-drift');
  const audit = prompt.indexOf('npm audit');
  assert.ok(drift < audit, 'the drift check must come BEFORE sweep item 4 (npm audit), which it protects');
});
