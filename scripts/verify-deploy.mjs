#!/usr/bin/env node
/**
 * Deploy verification — answers "did my push actually promote?" mechanically.
 * The GitHub→Vercel webhook has silently died before (CLAUDE.md → Deploys), so
 * a push is never assumed deployed until this passes.
 *
 * For each affected project: poll the Vercel API until a deployment carrying
 * HEAD's SHA reaches READY (or timeout), then probe the live surface and — for
 * the API — compare /health's `commit` field against HEAD.
 *
 * Usage: node scripts/verify-deploy.mjs [--api] [--web] [--sha <sha>]
 *        (no flags = verify both projects)
 * Reads the Vercel token from the CLI's auth file; run `vercel whoami` first if
 * the token has gone stale (it refreshes in place).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PROJECTS = {
  api: { id: 'prj_UMPAxzfttxlSOPMJXLO7WpthZezr', label: 'sizzle (API)', probe: 'https://sizzle-chi.vercel.app/health' },
  web: { id: 'prj_Pmds5j99CiPpw41773VfeYEiTBws', label: 'sizzle-api (frontend)', probe: 'https://getsizzle.app' },
};

const args = process.argv.slice(2);
const shaIdx = args.indexOf('--sha');
const sha = shaIdx !== -1
  ? args[shaIdx + 1]
  : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const targets = [];
if (args.includes('--api')) targets.push('api');
if (args.includes('--web')) targets.push('web');
if (!targets.length) targets.push('api', 'web');

const token = JSON.parse(
  readFileSync(path.join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8'),
).token;

async function latestFor(projectId) {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=8`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`vercel api ${res.status}`);
  const { deployments } = await res.json();
  return deployments ?? [];
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
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

  // Live probe — and for the API, confirm the serving commit IS this commit.
  const res = await fetch(p.probe, { redirect: 'follow' }).catch((e) => ({ ok: false, status: String(e) }));
  console.log(`probe ${p.probe}: HTTP ${res.status}`);
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
