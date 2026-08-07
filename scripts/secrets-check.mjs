#!/usr/bin/env node
/**
 * Secret scanner — staged files by default, `--all` for every tracked file.
 *
 * Exists because a blanket `git add -A` once pushed a live Supabase token to public
 * GitHub. Layer 2 of the defense (Layer 1 = .gitignore; Layer 3 = the same scan in CI).
 *
 * NEVER prints matched values — only file, line number, and the pattern family.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Pattern families. Tuned against this repo: Supabase PATs, Stripe live/test keys,
// webhook secrets, JWTs, private keys, service-account JSON, generic bearer blobs.
const PATTERNS = [
  { name: 'Supabase personal access token', re: /sbp_[A-Za-z0-9]{20,}/ },
  { name: 'Supabase secret API key', re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'Stripe live secret key', re: /sk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe test secret key', re: /sk_test_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe restricted key', re: /rk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe webhook secret', re: /whsec_[A-Za-z0-9]{16,}/ },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{20,}/ },
  { name: 'Google/Firebase API key', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Service-account JSON', re: /"private_key_id"\s*:/ },
  // JWTs: three base64url segments. Long enough to skip the doc-example threshold.
  { name: 'JWT-like token', re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
];

// Files where pattern NAMES legitimately appear as documentation/scanner source.
// Matched loosely so the guardrail docs can list the prefixes they ban.
const DOC_ALLOWLIST = [
  /^CLAUDE\.md$/, /^AGENTS\.md$/, /^docs\//, /^scripts\/secrets-check\.mjs$/,
  /^\.github\//, /^README\.md$/, /^PROGRESS\.md$/,
];
// Binary-ish or vendored paths never worth scanning.
const SKIP = [
  /^apps\/web\/ios\/App\/build\//, /\.(png|jpg|jpeg|gif|webp|mp4|mov|glb|ttf|woff2?|ico|pdf)$/i,
  /^package-lock\.json$/,
];

const all = process.argv.includes('--all');
const listCmd = all
  ? ['ls-files']
  : ['diff', '--cached', '--name-only', '--diff-filter=ACM'];
const files = execFileSync('git', listCmd, { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !SKIP.some((re) => re.test(f)));

let hits = 0;
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const isDoc = DOC_ALLOWLIST.some((re) => re.test(file));
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (!re.test(line)) continue;
      // In docs, bare prefixes are fine but a REAL-length match still fails: test the
      // full pattern (which requires the long tail) — if it matched, it's real enough.
      if (isDoc && /`/.test(line)) continue; // code-formatted doc mention of a prefix
      hits++;
      console.error(`POTENTIAL SECRET  ${file}:${i + 1}  (${name})`);
    }
  });
}

if (hits) {
  console.error(`\n${hits} potential secret(s) found. Values were NOT printed.`);
  console.error('If a hit is a false positive, narrow the pattern or move the mention into a doc code-span.');
  process.exit(1);
}
console.log(`secrets-check: clean (${files.length} file(s) scanned${all ? ', all tracked' : ', staged'})`);
