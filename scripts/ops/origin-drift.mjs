#!/usr/bin/env node
/**
 * origin-drift — answer "is my working tree actually current with origin/main?"
 * and, when it is not, materialise the drifted files AS THEY EXIST ON ORIGIN so the
 * sweep can reason about reality instead of a stale checkout.
 *
 * Why this exists (TD-27). The unattended sweep's permission allowlist has
 * `git push/add/commit/status/diff/log/show/stash` but NOT `git fetch`/`git pull` —
 * both prompt for approval, which an unattended session cannot grant. So whenever a
 * sweep advances *remote* main (a `gh pr merge`, or a docs commit pushed through the
 * GitHub git-data API) local main silently stays behind, and every later sweep reads
 * stale files. On 2026-09-04 that produced a near-miss: a 2-commits-behind
 * `package-lock.json` made `npm audit` re-report `@xmldom/xmldom` GHSA-6gmq-8vp8-gcm6
 * as a live advisory that had been fixed the previous day. The sweep nearly spent its
 * one in-lane ship re-doing finished work and logging a false "advisory cleared" claim.
 *
 * The workaround was written down as mandatory prose and then hand-executed twice.
 * Prose that must be hand-executed every run is a checklist item waiting to be skipped,
 * so this makes it one command.
 *
 * Read-only by construction: it runs `git rev-parse` and `gh api` GETs, and only ever
 * writes inside `.codex/` (gitignored scratch). It never touches the index, the working
 * tree, or any ref. It is NOT a substitute for the real fix — adding `Bash(git fetch:*)`
 * to `.claude/settings.json` is the owner's one-line call, and an agent may not widen
 * its own permission set.
 *
 * Usage:
 *   node scripts/ops/origin-drift.mjs           # report; fetch origin copies if drifted
 *   node scripts/ops/origin-drift.mjs --check   # report only, write nothing
 *
 * Exit codes: 0 = in sync · 3 = drifted (copies written, see banner) · 1 = tool failure.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const REPO_SLUG = process.env.SIZZLE_GH_REPO || 'Branden574/Sizzle';

/**
 * Files whose staleness silently corrupts a specific sweep check. The sweep reads a
 * conclusion off each of these, so a stale copy yields a confidently wrong finding
 * rather than an obvious error — which is the whole failure mode TD-27 describes.
 */
const CORRUPTS_CHECK = [
  { match: (p) => p === 'package-lock.json' || p.endsWith('/package-lock.json'), check: 'npm audit (sweep item 4) — a stale lockfile re-reports fixed advisories as live' },
  { match: (p) => p === 'docs/engineering/technical-debt.md', check: 'flag drift (sweep item 6) — edits built on a stale register drop another sweep\'s entries' },
  { match: (p) => p === 'docs/operations/incidents/LOG.md', check: 'the sweep log append — a stale base silently truncates prior entries' },
  { match: (p) => p.startsWith('scripts/') || p.startsWith('tests/'), check: 'ops tooling / invariants — the sweep may re-fix something already fixed' },
];

/** Split the drifted paths into "this breaks a sweep check" vs "just behind". */
export function classifyDrift(files) {
  const corrupting = [];
  const other = [];
  for (const file of files) {
    const hit = CORRUPTS_CHECK.find((rule) => rule.match(file.path));
    if (hit) corrupting.push({ ...file, check: hit.check });
    else other.push(file);
  }
  return { corrupting, other };
}

/** Mirror origin's tree inside the scratch dir, so paths read naturally. */
export function mirrorPathFor(outDir, path) {
  return join(outDir, path);
}

/** The human-facing report. Pure, so the wording itself is testable. */
export function driftReport({ localHead, originHead, files, outDir }) {
  if (localHead === originHead) {
    return { inSync: true, lines: [`origin-drift: in sync — local and origin/main are both ${short(localHead)}`] };
  }
  const { corrupting, other } = classifyDrift(files);
  const lines = [
    '',
    '  ####  ORIGIN DRIFT — THE WORKING TREE IS NOT CURRENT (TD-27)  ####',
    '',
    `  local  HEAD  ${short(localHead)}`,
    `  origin main  ${short(originHead)}   (${files.length} file(s) differ)`,
    '',
  ];
  if (corrupting.length) {
    lines.push('  These drifted files feed a sweep check. Reason about the ORIGIN copy, not the working copy:');
    for (const file of corrupting) lines.push(`    ${file.status.padEnd(9)} ${file.path}\n      ↳ ${file.check}`);
    lines.push('');
  }
  if (other.length) {
    lines.push('  Also behind (no sweep check reads these directly):');
    for (const file of other) lines.push(`    ${file.status.padEnd(9)} ${file.path}`);
    lines.push('');
  }
  if (outDir) {
    lines.push(`  Origin copies written to: ${outDir}/`);
    if (corrupting.some((f) => f.path.endsWith('package-lock.json'))) {
      lines.push(`  Audit the ORIGIN tree with:  (cd ${outDir} && npm audit --package-lock-only)`);
    }
    lines.push('');
  }
  lines.push('  Do NOT `git pull` to fix this — fetch/pull are not allowlisted unattended.');
  lines.push('  Push any commit through the GitHub git-data API (recipe in TD-27), then stash locally.');
  lines.push('');
  return { inSync: false, corrupting, other, lines };
}

const short = (sha) => (sha || '').slice(0, 7);

const gh = (path) => execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function main() {
  const checkOnly = process.argv.includes('--check');

  const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const originHead = JSON.parse(gh(`repos/${REPO_SLUG}/commits/main`)).sha;

  if (localHead === originHead) {
    console.log(driftReport({ localHead, originHead, files: [] }).lines.join('\n'));
    return 0;
  }

  const files = (JSON.parse(gh(`repos/${REPO_SLUG}/compare/${localHead}...${originHead}`)).files || [])
    .map((f) => ({ path: f.filename, status: f.status }));

  let outDir = null;
  if (!checkOnly) {
    outDir = `.codex/origin-${short(originHead)}`;
    // `removed` files have no content to fetch at the origin ref.
    for (const file of files.filter((f) => f.status !== 'removed')) {
      const encoded = file.path.split('/').map(encodeURIComponent).join('/');
      const b64 = JSON.parse(gh(`repos/${REPO_SLUG}/contents/${encoded}?ref=${originHead}`)).content;
      const dest = mirrorPathFor(outDir, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(b64.replace(/\s/g, ''), 'base64'));
    }
    // npm audit needs the manifest beside the lockfile to resolve the workspace tree.
    if (files.some((f) => f.path === 'package-lock.json')) {
      const b64 = JSON.parse(gh(`repos/${REPO_SLUG}/contents/package.json?ref=${originHead}`)).content;
      writeFileSync(mirrorPathFor(outDir, 'package.json'), Buffer.from(b64.replace(/\s/g, ''), 'base64'));
    }
  }

  console.log(driftReport({ localHead, originHead, files, outDir }).lines.join('\n'));
  return 3;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`origin-drift: FAILED — ${err.message}`);
    console.error('This check is mandatory before sweep items 4 and 6; do not proceed on the working copy.');
    process.exit(1);
  }
}
