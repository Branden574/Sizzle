#!/usr/bin/env node
/**
 * Dangerous-diff classifier — inspects changed paths (working tree + staged by
 * default, or `--base <ref>` for a PR range) and reports which risk lanes apply
 * per docs/engineering/autonomy-policy.md. Exit code 0 always: this script informs
 * review requirements; it does not decide that a change is safe.
 *
 * OTA rule it enforces informationally: any NATIVE hit means the change must NOT
 * ship as an OTA-only release — a new binary is required.
 */
import { execFileSync } from 'node:child_process';

export const CLASSES = [
  { tag: 'DATABASE MIGRATION', level: 'C', res: [/^supabase\/migrations\//] },
  { tag: 'AUTH CODE', level: 'C', res: [/^apps\/api\/src\/middleware\/auth/, /^apps\/web\/src\/auth\//] },
  { tag: 'PAYMENT / MONEY CODE', level: 'C', res: [/^apps\/api\/src\/routes\/monetize/, /^apps\/api\/src\/services\/payments/, /revenuecat/i] },
  { tag: 'ADMIN AUTHORIZATION', level: 'C', res: [/^apps\/api\/src\/routes\/admin/] },
  { tag: 'UPLOAD / WEBHOOK / MEDIA PIPELINE', level: 'C', res: [/^apps\/api\/src\/routes\/uploads/, /^apps\/api\/src\/services\/stream/, /^apps\/api\/src\/services\/videoFinalize/] },
  { tag: 'NATIVE (new binary required — never OTA-only)', level: 'C', res: [/^apps\/web\/ios\//, /^apps\/web\/android\//, /^apps\/web\/capacitor\.config/] },
  { tag: 'CI / WORKFLOWS', level: 'C', res: [/^\.github\/workflows\//] },
  { tag: 'GUARDRAIL DOCS', level: 'C', res: [/^CLAUDE\.md$/, /^AGENTS\.md$/, /^docs\/engineering\//] },
  { tag: 'SHARED CONTRACT (DTOs)', level: 'B', res: [/^packages\/shared\//] },
  { tag: 'RELEASE TOOLING', level: 'B', res: [/^apps\/web\/scripts\//, /^scripts\//] },
];

// Native plugin dependency changes are native-impacting even though the file is JSON.
export const NATIVE_DEP_RE = /"(@capacitor|@capgo|@capawesome|@revenuecat|@capacitor-firebase)\//;

/** Classify one path against the sensitive-path rules (pure; used by tests + main). */
export function classifyPath(file) {
  return CLASSES.filter((c) => c.res.some((re) => re.test(file))).map((c) => c.tag);
}

// Script body only runs when invoked directly, so tests can import the rules above.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
const baseIdx = process.argv.indexOf('--base');
const base = baseIdx !== -1 ? process.argv[baseIdx + 1] : null;
let files;
if (base) {
  files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
} else {
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  const unstaged = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
  files = staged + '\n' + unstaged;
}
const changed = [...new Set(files.split('\n').filter(Boolean))];

if (!changed.length) { console.log('safety:diff — no changes detected'); process.exit(0); }

const hits = new Map();
for (const f of changed) {
  for (const c of CLASSES) {
    if (c.res.some((re) => re.test(f))) {
      if (!hits.has(c.tag)) hits.set(c.tag, { level: c.level, files: [] });
      hits.get(c.tag).files.push(f);
    }
  }
  // Native plugin bumps hide in manifest AND lockfile changes — check both, and
  // diff the SAME range as the file listing (in --base/PR mode `git diff HEAD`
  // is empty on a clean checkout, which silently skipped this check).
  if (/package(-lock)?\.json$/.test(f)) {
    try {
      const range = base ? [`${base}...HEAD`] : ['HEAD'];
      const diff = execFileSync('git', ['diff', ...range, '--', f], { encoding: 'utf8' });
      // Only ADDED/REMOVED lines count — unified-diff context lines around an
      // unrelated change also mention native packages (verified false positive).
      const changedLines = diff.split('\n').filter((l) => /^[+-][^+-]/.test(l)).join('\n');
      const touched = NATIVE_DEP_RE.test(changedLines) ||
        /node_modules\/(@capacitor|@capgo|@capawesome|@revenuecat|@capacitor-firebase)\//.test(changedLines);
      if (touched) {
        const tag = 'NATIVE PLUGIN DEPENDENCY (new binary required — never OTA-only)';
        if (!hits.has(tag)) hits.set(tag, { level: 'C', files: [] });
        hits.get(tag).files.push(f);
      }
    } catch { /* new file or no HEAD — classify by path rules only */ }
  }
}

console.log(`safety:diff — ${changed.length} changed file(s)\n`);
if (!hits.size) {
  console.log('No security-sensitive paths touched. Minimum lane: A/B per autonomy-policy.md.');
} else {
  let maxLevel = 'B';
  for (const [tag, { level, files: fs }] of hits) {
    console.log(`⚠ ${tag} DETECTED  →  minimum Level ${level}`);
    for (const f of fs) console.log(`    ${f}`);
    if (level === 'C') maxLevel = 'C';
  }
  console.log(`\nMinimum review lane for this diff: Level ${maxLevel}`);
  console.log('Level C = explicit owner approval before any production effect.');
}
}
