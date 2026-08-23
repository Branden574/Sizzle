#!/usr/bin/env node
/**
 * Deploy verification — answers "did my push actually promote?" mechanically.
 * The GitHub→Vercel webhook has silently died before (CLAUDE.md → Deploys), so
 * a push is never assumed deployed until this passes.
 *
 * For each affected project: poll the Vercel API until a deployment carrying
 * HEAD's SHA reaches READY (or timeout), then probe the live surface and confirm
 * the SERVED build is HEAD — via /health's `commit` for the API, and /version.json
 * for the frontend. "READY" alone is not proof the alias points at that build.
 *
 * Usage: node scripts/verify-deploy.mjs [--api] [--web] [--sha <sha>]
 *        (no flags = verify both projects)
 * Reads the Vercel token from the CLI's auth file. A stale token is recovered
 * automatically (see createVercelClient); `vercel login` is only needed if that
 * refresh fails.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECTS = {
  api: { id: 'prj_UMPAxzfttxlSOPMJXLO7WpthZezr', label: 'sizzle (API)', probe: 'https://sizzle-chi.vercel.app/health' },
  web: { id: 'prj_Pmds5j99CiPpw41773VfeYEiTBws', label: 'sizzle-api (frontend)', probe: 'https://getsizzle.app' },
};

const AUTH_FILE = path.join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json');

/** Statuses that mean "this token is no longer good", not "this request was wrong".
 *  403 is what a stale CLI token actually returned on 2026-08-19; 401 is the same class. */
const AUTH_STATUSES = new Set([401, 403]);

const readToken = () => JSON.parse(readFileSync(AUTH_FILE, 'utf8')).token;

/** `vercel whoami` re-mints the CLI token and rewrites auth.json in place.
 *  Returns false (rather than throwing) when the CLI is missing or fully logged
 *  out, so the caller can report the original auth failure instead of a spawn error. */
function runWhoami() {
  try {
    execFileSync('vercel', ['whoami'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vercel deployments client that survives a stale CLI token.
 *
 * The token is read out of the CLI's auth file, and it goes stale on its own
 * schedule. Before this, a stale token threw `Error: vercel api 403` out of the
 * poll loop and killed the run before either project was checked — so an
 * unattended sweep reported a perfectly good deploy as unverified (TD-24, hit
 * 2026-08-19). The recovery was already in this file's docstring but nothing
 * performed it: run `vercel whoami`, re-read the file, retry.
 *
 * Refreshing happens at most ONCE per process: if the retry still fails the
 * token is genuinely dead, and re-running `whoami` every 10s poll tick would
 * turn that into a spin. Any non-auth status stays a hard error, unchanged.
 */
export function createVercelClient({
  fetchImpl = globalThis.fetch,
  loadToken = readToken,
  refreshAuth = runWhoami,
  onRefresh = () => {},
} = {}) {
  let token = loadToken();
  let refreshedOnce = false;

  return async function latestFor(projectId) {
    for (;;) {
      const res = await fetchImpl(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=8`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { deployments } = await res.json();
        return deployments ?? [];
      }
      if (!AUTH_STATUSES.has(res.status) || refreshedOnce) throw new Error(`vercel api ${res.status}`);
      refreshedOnce = true;
      onRefresh(res.status);
      if (!refreshAuth()) {
        throw new Error(`vercel api ${res.status} — \`vercel whoami\` could not refresh the token; run \`vercel login\``);
      }
      token = loadToken();
    }
  };
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Confirm the FRONTEND is serving this commit, from the served surface itself.
 *
 * Vercel's API telling us a deployment with HEAD's SHA reached READY is not the
 * same claim as "getsizzle.app serves it" — an alias could point elsewhere. The
 * build emits /version.json (see apps/web/vite.config.ts) so we can ask directly.
 *
 * Returns { ok, detail }. `commit: null` in the manifest means the build had no
 * VERCEL_GIT_COMMIT_SHA / GITHUB_SHA — a plain archive CLI deploy, which is the
 * documented webhook-outage fallback. That is reported, not failed: the file's
 * presence still proves the current build was served, and failing there would
 * raise a false alarm during exactly the outage the fallback exists for.
 */
export async function checkWebVersion(origin, sha, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(`${origin}/version.json`, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  } catch (e) {
    return { ok: false, detail: `version.json unreachable (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!res.ok) {
    return { ok: false, detail: `version.json HTTP ${res.status} — the frontend build did not emit it (expected dist/version.json)` };
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, detail: 'version.json is not valid JSON' };
  }
  if (!body?.commit) {
    return { ok: true, detail: `serving version ${body?.version ?? '?'}, commit unstamped (archive CLI deploy) — SHA not asserted` };
  }
  // Guard the prefix compare below: a 1-char value would `startsWith`-match most
  // SHAs. Anything shorter than a git short SHA is corrupt, not a match.
  if (String(body.commit).length < 7) {
    return { ok: false, detail: `version.json commit "${body.commit}" is too short to identify a build` };
  }
  if (!sha.startsWith(body.commit) && !body.commit.startsWith(sha)) {
    return { ok: false, detail: `serving commit ${String(body.commit).slice(0, 7)} ≠ HEAD ${sha.slice(0, 7)} — the alias points at another build` };
  }
  return { ok: true, detail: `serving commit ${String(body.commit).slice(0, 7)} == HEAD ✓ (version ${body.version})` };
}

async function main() {
  const args = process.argv.slice(2);
  const shaIdx = args.indexOf('--sha');
  const sha = shaIdx !== -1
    ? args[shaIdx + 1]
    : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const targets = [];
  if (args.includes('--api')) targets.push('api');
  if (args.includes('--web')) targets.push('web');
  if (!targets.length) targets.push('api', 'web');

  const latestFor = createVercelClient({
    onRefresh: (status) => {
      console.log(`vercel api ${status} — token looks stale, refreshing via \`vercel whoami\` and retrying once`);
    },
  });

  let failed = false;

  for (const key of targets) {
    const p = PROJECTS[key];
    process.stdout.write(`\n=== ${p.label} — waiting for ${sha.slice(0, 7)} ===\n`);
    let state = null;
    const deadline = Date.now() + 8 * 60_000;
    while (Date.now() < deadline) {
      const deployments = await latestFor(p.id);
      const match = deployments.find((d) => (d.meta?.githubCommitSha ?? '') === sha);
      state = match?.readyState ?? null;
      if (state === 'READY') break;
      if (state === 'ERROR') break;
      // CANCELED for a commit that doesn't touch this project = ignored-build-step, normal.
      if (state === 'CANCELED') break;
      await sleep(10_000);
    }

    if (state === 'READY') {
      console.log(`deployment: READY`);
    } else if (state === 'CANCELED') {
      console.log(`deployment: CANCELED (ignored-build-step — commit didn't affect this project)`);
      continue;
    } else if (state === 'ERROR') {
      console.error(`deployment: BUILD FAILED — inspect the Vercel dashboard`);
      failed = true;
      continue;
    } else {
      console.error(`deployment: NOT FOUND after timeout — the git webhook likely missed the push.`);
      console.error(`Fallback: CLI deploy per CLAUDE.md → Deploys (.vercelignore recipe).`);
      failed = true;
      continue;
    }

    // Live probe — and for both projects, confirm the serving commit IS this commit.
    const res = await fetch(p.probe, { redirect: 'follow' }).catch((e) => ({ ok: false, status: String(e) }));
    console.log(`probe ${p.probe}: HTTP ${res.status}`);
    if (key === 'web') {
      // The probe result used to be printed and then ignored, so a READY frontend
      // serving a 500 passed verification. Assert it, then confirm WHICH build.
      if (!res.ok) {
        console.error(`probe failed — getsizzle.app is not serving successfully`);
        failed = true;
        continue;
      }
      const verdict = await checkWebVersion(p.probe, sha);
      console.log(`${verdict.ok ? '' : 'ERROR: '}${verdict.detail}`);
      if (!verdict.ok) failed = true;
      continue;
    }
    if (key === 'api' && res.ok) {
      const body = await res.json().catch(() => null);
      const serving = body?.commit ?? null;
      const match = serving && sha.startsWith(serving);
      console.log(`serving commit: ${serving} ${match ? '== HEAD ✓' : `≠ HEAD ${sha.slice(0, 7)} ✗`}`);
      console.log(`health status: ${body?.status}${body?.problems?.length ? ` (${body.problems.join(', ')})` : ''}`);
      if (!match) failed = true;
    } else if (key === 'api' && res.status === 503) {
      // Degraded is still "deployed" — report the problems without failing the SHA check.
      const body = await res.json().catch(() => null);
      console.log(`health status: degraded (${(body?.problems ?? []).join(', ')}) — deployed but unhealthy`);
      const serving = body?.commit ?? null;
      if (!(serving && sha.startsWith(serving))) failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

// Importable for tests; only the CLI entrypoint reads auth.json and polls.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
