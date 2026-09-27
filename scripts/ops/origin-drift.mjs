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
 *
 * A mirror that materialises with the WRONG BYTE COUNT counts as missing, not as present —
 * a silently-empty mirror is more dangerous than an absent one, because the session reads
 * it as origin's truth (see `decodeMirrorBytes` and `contentsNeedsRawFallback`).
 *
 * It also answers the SECOND question TD-27's mechanism makes unanswerable: is anything
 * `git status` calls dirty actually uncommitted work? Pushing through the git-data API never
 * advances local HEAD or the index, so a file that landed at origin hours ago keeps
 * presenting as modified forever (see `classifyDirty`). This tool already holds both trees,
 * so it is the only place that can tell a phantom from real work without a hand-run
 * byte comparison.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
      // `--prefix`, never `cd`: the unattended sandbox refuses most compound commands, so
      // `(cd … && …)` degrades to a bare `cd` — and its shell keeps the working directory
      // ACROSS tool calls. The mirror carries its own package.json, scripts/ and tests/, so a
      // leaked cwd silently repoints `npm run test:invariants` and `verify-deploy.mjs` at
      // origin's stale copies, at the exact moment the session is reasoning about origin-vs-local.
      lines.push(`  Audit the ORIGIN tree with:  npm audit --package-lock-only --prefix ${outDir}`);
      lines.push('  Do NOT `cd` into the mirror — cwd persists across calls and the mirror has its own tests/.');
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

/**
 * The same call, asking for the file's bytes instead of a JSON envelope. Needed because
 * the `contents` API refuses to inline anything over 1 MiB (see `contentsNeedsRawFallback`).
 * No `encoding` option, so this returns a Buffer and stays correct for any payload.
 */
const ghRaw = (path) => execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw', path], { maxBuffer: 64 * 1024 * 1024 });

/** Wrap a fetcher in a bounded backoff, so one transport blip does not cost the whole run. */
function retrying(fetch) {
  return (path, attempts = 3) => {
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return fetch(path);
      } catch (err) {
        lastErr = err;
        if (i === attempts - 1 || !isRetryableGhError(err)) throw err;
        execFileSync('sleep', [String(0.5 * 2 ** i)]);
      }
    }
    throw lastErr;
  };
}

const ghWithRetry = retrying(gh);
const ghRawWithRetry = retrying(ghRaw);

/**
 * GitHub's `contents` API only inlines files up to 1 MiB. Between 1 and 100 MB it still
 * answers 200 with full metadata but sets `encoding: "none"` and `content: ""` — a
 * SUCCESSFUL response carrying no bytes. Decoding that yields a 0-byte mirror, and a
 * 0-byte mirror of `LOG.md` is the worst possible base: an append built on it silently
 * truncates every prior entry, which is precisely the TD-27 corruption this tool exists
 * to prevent (`CORRUPTS_CHECK` says so in as many words).
 *
 * Measured 2026-09-27 (watchdog session 101): `LOG.md` reached 1,085,434 bytes and
 * crossed the cap between sessions 89 (mirror 953,732 bytes, fine) and 100 (mirror
 * **0 bytes**). Session 100 caught it by hand and wrote "check the mirrored size before
 * diffing" into the log — prose that must be hand-executed every run, which is the exact
 * failure mode this file's header rejects. So it is a gate now.
 *
 * `LOG.md` only ever grows, so this is permanent from here on, not a blip.
 */
export function contentsNeedsRawFallback(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.encoding === 'base64') return false;
  return Number(payload.size) > 0;
}

/**
 * Decode one mirrored file, verifying the byte count origin reported.
 *
 * The size assertion is deliberately broader than the 1 MiB cap it was written for: it
 * catches ANY short write — a truncated body, a partial transfer that still exited 0, a
 * future API change to the envelope — and converts it into a named failure that
 * `materialiseReport` tells the session not to reason around. A wrong mirror must never be
 * indistinguishable from a right one.
 */
export function decodeMirrorBytes({ payload, path, fetchRaw }) {
  const bytes = contentsNeedsRawFallback(payload)
    ? Buffer.from(fetchRaw(path))
    : Buffer.from(String(payload?.content ?? '').replace(/\s/g, ''), 'base64');
  const expected = Number(payload?.size);
  if (Number.isFinite(expected) && bytes.length !== expected) {
    throw new Error(`mirror truncated: wrote ${bytes.length} bytes, origin reports ${expected}`);
  }
  return bytes;
}

/**
 * Mirror origin's copies of the drifted files into the scratch dir.
 *
 * Mirroring is a CONVENIENCE; the verdict is the gate. A transport blip here must never
 * suppress the verdict or, worse, emit "do not proceed" — that pushes the session onto
 * the stale working copy, which is the exact TD-27 failure this tool exists to prevent.
 * So every fetch is caught per file and reported, never thrown.
 *
 * `fetchPayload` and `fetchRaw` are injected so the degraded paths are testable without a
 * live network. Returns the list of files that could not be mirrored (empty on full success).
 */
export function mirrorAll({ files, outDir, fetchPayload, fetchRaw }) {
  const failures = [];
  const write = (path) => {
    const bytes = decodeMirrorBytes({ payload: fetchPayload(path), path, fetchRaw });
    const dest = mirrorPathFor(outDir, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
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

/**
 * Parse `git status --porcelain` into entries. Pure, so the odd shapes are testable.
 *
 * A rename records `old -> new`; the path on disk is the new one. Paths containing
 * specials are QUOTED by git, and a quoted path is deliberately not unescaped here —
 * mis-parsing one would compare the wrong file, so it is handed to the session instead
 * (`classifyDirty` routes it to UNDETERMINED).
 */
export function parseGitStatus(porcelain) {
  const entries = [];
  for (const raw of String(porcelain).split('\n')) {
    if (raw.length < 4) continue;
    const code = raw.slice(0, 2);
    let path = raw.slice(3);
    if (code.includes('R') && path.includes(' -> ')) path = path.split(' -> ').pop();
    entries.push({ code, path, quoted: path.startsWith('"') });
  }
  return entries;
}

/**
 * Split `git status`'s dirty paths into "phantom" (byte-identical to origin) and
 * "real local work", which is the distinction rule 11 actually cares about.
 *
 * Why this is needed at all (TD-27, measured by watchdog session 109). The only write path
 * available unattended is the GitHub git-data API, which moves the remote ref without
 * touching local `HEAD` or the index. So a file whose content landed at origin — including
 * the ops files a past session materialised into the checkout as a TD-27 repair — reports as
 * `M`/`??` forever, and the staleness compounds every session. Rule 11 says *preserve all
 * existing uncommitted work*, so a session reading those markers either protects content
 * that is already pushed, or worse "rescues" it into a commit built from the stale base,
 * which lands as a REVERT of origin. Session 109 byte-compared all four dirty paths in this
 * repo and found every one identical to origin: there was no uncommitted work at all.
 *
 * The classification is only ever allowed to *downgrade* a path to phantom on POSITIVE
 * proof — a successful byte comparison against the mirror. Every other outcome lands in
 * `real` or `unknown`, both of which tell the session to preserve. That asymmetry is
 * deliberate: a phantom mistaken for work costs a wasted paragraph, work mistaken for a
 * phantom costs the work.
 *
 * Paths absent from the drift set need no mirror to decide: origin at `originHead` matches
 * local `HEAD` there, so a working copy that differs from `HEAD` necessarily differs from
 * origin. That also makes the in-sync case correct for free — pass `driftPaths: []` and
 * everything dirty is real.
 */
export function classifyDirty({ entries, driftPaths = [], mirrorFailures = [], readLocal, readMirror }) {
  const failed = new Set(mirrorFailures);
  const mirrored = new Set(driftPaths);
  const phantom = [];
  const real = [];
  const unknown = [];

  for (const entry of entries) {
    if (entry.quoted) {
      unknown.push({ ...entry, reason: 'git-quoted path — compare it by hand rather than risk the wrong file' });
      continue;
    }
    if (failed.has(entry.path)) {
      unknown.push({ ...entry, reason: 'origin copy could not be mirrored, so no comparison is possible' });
      continue;
    }
    if (!mirrored.has(entry.path)) {
      real.push({ ...entry, reason: 'origin matches local HEAD here, so a dirty working copy really differs from origin' });
      continue;
    }
    const localBytes = readLocal(entry.path);
    const originBytes = readMirror(entry.path);
    if (!localBytes || !originBytes) {
      unknown.push({ ...entry, reason: 'could not read both copies (deleted locally, or an unreadable mirror)' });
      continue;
    }
    if (Buffer.compare(localBytes, originBytes) === 0) phantom.push({ ...entry });
    else real.push({ ...entry, reason: 'content differs from origin — genuine local work' });
  }
  return { phantom, real, unknown };
}

/**
 * The dirty-vs-origin report. Pure, so the wording is testable — and the wording carries the
 * whole finding: a session that reads "M scripts/verify-deploy.mjs" and stops there will
 * protect a file that has been pushed for days.
 */
export function dirtyReport({ phantom = [], real = [], unknown = [] }) {
  if (!phantom.length && !real.length && !unknown.length) return [];
  const lines = ['  ----  `git status` vs ORIGIN — what rule 11 actually applies to  ----', ''];
  if (phantom.length) {
    lines.push('  DIRTY BUT BYTE-IDENTICAL TO ORIGIN — this is NOT uncommitted work:');
    for (const entry of phantom) lines.push(`    ${entry.code} ${entry.path}`);
    lines.push('      ↳ A git-data-API push never advances local HEAD or the index, so content that');
    lines.push('        already landed at origin presents as dirty forever. Rule 11 does not apply here;');
    lines.push('        committing these re-lands origin\'s own bytes, or REVERTS them off a stale base.');
    lines.push('');
  }
  if (real.length) {
    lines.push('  REAL LOCAL WORK — differs from origin. PRESERVE IT (rule 11):');
    for (const entry of real) lines.push(`    ${entry.code} ${entry.path}\n      ↳ ${entry.reason}`);
    lines.push('');
  }
  if (unknown.length) {
    lines.push('  UNDETERMINED — treat as real work until compared by hand:');
    for (const entry of unknown) lines.push(`    ${entry.code} ${entry.path}\n      ↳ ${entry.reason}`);
    lines.push('');
  }
  return lines;
}

/**
 * Read `git status` and decide, per dirty path, whether it is real work or a TD-27 phantom.
 *
 * Wrapped in a try/catch for the same reason `mirrorAll` is: TD-40, TD-41 and TD-42 were each
 * one half of this tool silently corrupting the other half's answer. This is a convenience
 * layered on the verdict, so a failure here prints a named note and changes no exit code.
 */
function dirtySectionLines({ outDir, driftPaths, mirrorFailures }) {
  try {
    const entries = parseGitStatus(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }));
    if (!entries.length) return [];
    const readBytes = (path) => {
      try {
        return readFileSync(path);
      } catch {
        return null;
      }
    };
    return dirtyReport(classifyDirty({
      entries,
      driftPaths,
      mirrorFailures,
      readLocal: readBytes,
      readMirror: (path) => (outDir ? readBytes(mirrorPathFor(outDir, path)) : null),
    }));
  } catch (err) {
    return [`  ⚠  could not compare \`git status\` against origin: ${(err?.message || String(err)).split('\n')[0]}`, ''];
  }
}

function main() {
  const checkOnly = process.argv.includes('--check');

  const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const originHead = JSON.parse(gh(`repos/${REPO_SLUG}/commits/main`)).sha;

  if (localHead === originHead) {
    console.log(driftReport({ localHead, originHead, files: [] }).lines.join('\n'));
    // In sync, so origin IS local HEAD: anything dirty differs from origin and is real work.
    const synced = dirtySectionLines({ outDir: null, driftPaths: [], mirrorFailures: [] });
    if (synced.length) console.log(synced.join('\n'));
    return 0;
  }

  const files = (JSON.parse(gh(`repos/${REPO_SLUG}/compare/${localHead}...${originHead}`)).files || [])
    .map((f) => ({ path: f.filename, status: f.status }));

  let outDir = null;
  let failures = [];
  if (!checkOnly) {
    outDir = `.codex/origin-${short(originHead)}`;
    const contentsPath = (path) => {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      return `repos/${REPO_SLUG}/contents/${encoded}?ref=${originHead}`;
    };
    failures = mirrorAll({
      files,
      outDir,
      fetchPayload: (path) => JSON.parse(ghWithRetry(contentsPath(path))),
      fetchRaw: (path) => ghRawWithRetry(contentsPath(path)),
    });
  }

  console.log(driftReport({ localHead, originHead, files, outDir }).lines.join('\n'));
  const note = materialiseReport(failures);
  if (note.length) console.log(note.join('\n'));

  // `--check` writes no mirrors, so a drifted path has nothing to compare against — say so
  // rather than deducing "real" from a missing file, which would re-arm the phantom.
  const dirty = dirtySectionLines({
    outDir,
    driftPaths: files.map((f) => f.path),
    mirrorFailures: checkOnly ? files.map((f) => f.path) : failures.map((f) => f.path),
  });
  if (dirty.length) console.log(dirty.join('\n'));
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
