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
 *
 * Exit 1 means "the VERDICT could not be computed" and nothing weaker. Mirroring the
 * origin copies is a convenience layered on top; if that fails for some path the verdict
 * still prints, the exit stays 3, and the banner names the paths whose mirror is missing.
 * Conflating the two is how a transient `gh` EOF used to emit "do not proceed on the
 * working copy" and hand the session zero drift information (see `isRetryableGhError`).
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

/**
 * Transient GitHub transport failures, as opposed to "this path does not exist".
 * Measured 2026-09-25 (watchdog session 88): two consecutive runs died with
 * `unexpected EOF` mid-`contents/` fetch and the third succeeded untouched. The
 * payload is the reason it shows up here and not elsewhere — `LOG.md` alone is
 * ~950 KB (≈1.26 MB base64) and grows every session, so the mandatory-first tool
 * makes a heavier sequential call on every incident hour.
 */
export function isRetryableGhError(err) {
  const text = `${err?.message || ''}${err?.stderr || ''}`;
  return /unexpected EOF|EOF|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|502|503|504/i.test(text);
}

/** Fetch with a bounded backoff, so one transport blip does not cost the whole run. */
function ghWithRetry(path, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return gh(path);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryableGhError(err)) throw err;
      execFileSync('sleep', [String(0.5 * 2 ** i)]);
    }
  }
  throw lastErr;
}

/**
 * Mirror origin's copies of the drifted files into the scratch dir.
 *
 * Mirroring is a CONVENIENCE; the verdict is the gate. A transport blip here must never
 * suppress the verdict or, worse, emit "do not proceed" — that pushes the session onto
 * the stale working copy, which is the exact TD-27 failure this tool exists to prevent.
 * So every fetch is caught per file and reported, never thrown.
 *
 * `fetchContent` is injected so the degraded path is testable without a live network.
 * Returns the list of files that could not be mirrored (empty on full success).
 */
export function mirrorAll({ files, outDir, fetchContent }) {
  const failures = [];
  const write = (path) => {
    const b64 = fetchContent(path);
    const dest = mirrorPathFor(outDir, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(b64.replace(/\s/g, ''), 'base64'));
  };
  const attempt = (path) => {
    try {
      write(path);
    } catch (err) {
      failures.push({ path, reason: (err?.message || String(err)).split('\n')[0] });
    }
  };

  // `removed` files have no content to fetch at the origin ref.
  for (const file of files.filter((f) => f.status !== 'removed')) attempt(file.path);
  // npm audit needs the manifest beside the lockfile to resolve the workspace tree.
  if (files.some((f) => f.path === 'package-lock.json')) attempt('package.json');
  return failures;
}

/**
 * The warning shown when the drift VERDICT succeeded but mirroring some files did not.
 * Pure, so the wording is testable — and the wording is the point: the verdict is the
 * gate, the mirrors are a convenience, and a session must not silently fall back to the
 * stale working copy for a path whose origin copy is missing.
 */
export function materialiseReport(failures) {
  if (!failures.length) return [];
  const lines = [
    '  ⚠  The drift verdict above is COMPLETE and valid, but these origin copies could not be fetched:',
  ];
  for (const f of failures) lines.push(`    ${f.path}\n      ↳ ${f.reason}`);
  lines.push('');
  lines.push('  Do NOT reason about the working copy for those paths — it is the stale one.');
  lines.push('  Re-run this command, or fetch a single file directly (verified working 2026-09-25):');
  lines.push('    curl -sL https://raw.githubusercontent.com/<repo>/<origin-sha>/<path> -o <dest>');
  lines.push('');
  return lines;
}

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
  let failures = [];
  if (!checkOnly) {
    outDir = `.codex/origin-${short(originHead)}`;
    failures = mirrorAll({
      files,
      outDir,
      fetchContent: (path) => {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        return JSON.parse(ghWithRetry(`repos/${REPO_SLUG}/contents/${encoded}?ref=${originHead}`)).content;
      },
    });
  }

  console.log(driftReport({ localHead, originHead, files, outDir }).lines.join('\n'));
  const note = materialiseReport(failures);
  if (note.length) console.log(note.join('\n'));
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
