/**
 * Executable architectural memory. Each test here guards a deliberate, load-bearing
 * decision documented in docs/engineering/SYSTEM_RISK_MAP.md — decisions that a
 * future refactor could "simplify" away without realizing they're security
 * boundaries. Documentation can be skipped; these cannot.
 *
 * Run: node --test tests/invariants/
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

/** ripgrep-free recursive grep over tracked files in a subtree. */
function grepTracked(subdir, pattern) {
  const files = execFileSync('git', ['ls-files', subdir], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter((f) => /\.(ts|tsx|mjs|js|json)$/.test(f));
  const re = new RegExp(pattern);
  const hits = [];
  for (const f of files) {
    const text = readFileSync(path.join(repo, f), 'utf8');
    if (re.test(text)) hits.push(f);
  }
  return hits;
}

test('service-role credentials never appear in client-reachable code', () => {
  // The service-role key bypasses RLS entirely. It must exist ONLY in apps/api.
  // (SYSTEM_RISK_MAP: "Deployment, secrets & environment — CRITICAL")
  for (const subtree of ['apps/web/src', 'packages/shared/src']) {
    const hits = grepTracked(subtree, 'SERVICE_ROLE|service_role|serviceRole');
    assert.deepEqual(hits, [], `service-role reference leaked into ${subtree}: ${hits.join(', ')}`);
  }
});

test('no secret-shaped env var is exposed through the VITE_ client prefix', () => {
  // Everything VITE_-prefixed is baked into the public browser bundle.
  const files = execFileSync('git', ['ls-files', 'apps/web/src', 'apps/web/vite.config.ts'], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter((f) => /\.(ts|tsx)$/.test(f));
  const found = new Set();
  for (const f of files) {
    const text = readFileSync(path.join(repo, f), 'utf8');
    for (const m of text.matchAll(/VITE_[A-Z0-9_]+/g)) found.add(m[0]);
  }
  const banned = /SECRET|SERVICE_ROLE|PRIVATE|WEBHOOK|SK_LIVE|TOKEN(?!S)/;
  const bad = [...found].filter((v) => banned.test(v));
  assert.deepEqual(bad, [], `secret-shaped VITE_ vars must not exist: ${bad.join(', ')}`);
});

test('admin API keeps the double gate (role check AND second-factor unlock)', () => {
  // Deliberate design: admin role alone is NOT enough (SYSTEM_RISK_MAP →
  // "Authentication & authorization"). Do not simplify to role === "admin".
  const src = read('apps/api/src/routes/admin.ts');
  assert.match(src, /role.{0,40}admin/is, 'admin role check missing');
  assert.match(src, /unlock|passphrase|second|adminKey|ADMIN_/i, 'admin second-factor unlock missing');
});

test('hashtag moderation keeps the admin second-factor unlock', () => {
  // The one admin mutation outside the /admin router — found bypassing the
  // passphrase gate by the 2026-08-06 audit. Must stay explicitly gated.
  const src = read('apps/api/src/routes/hashtags.ts');
  assert.match(src, /'\/:tag\/moderate',\s*requireAuth,\s*requireAdmin,\s*requireAdminUnlock/, 'requireAdminUnlock missing from the moderate route chain');
});

test('every cron handler records a success heartbeat', () => {
  // 4 of 5 crons could die silently forever before cron_runs existed. Each
  // handler must keep its recordCronRun call so /health staleness stays real.
  const src = read('apps/api/src/routes/internal.ts');
  for (const job of ['finalize-videos', 'publish-scheduled', 'save-nudges', 'rollup-watch-ratios', 'rollup-hashtag-trends']) {
    assert.match(src, new RegExp(`recordCronRun\\('${job}'`), `${job} lost its heartbeat`);
  }
});

test('parked media deletions stay visible on /health', () => {
  // Rows at attempts>=10 are media we promised to erase (GDPR) and haven't. The
  // cron's Sentry alert only reaches whoever watches Sentry; the daily ops sweep
  // reads /health, so the gauge must survive future edits to this handler.
  const src = read('apps/api/src/routes/health.ts');
  assert.match(src, /pending_media_deletions/, 'parked-deletion probe removed from /health');
  assert.match(src, /parkedMediaDeletions: parked/, 'parkedMediaDeletions no longer reported in the response');
  // It must stay a report-only gauge: pushing it into `problems` 503s the API
  // (and trips every uptime monitor) over a reconciliation task, not an outage.
  assert.doesNotMatch(src, /problems\.push\([^)]*parked/i, 'parked deletions must not degrade health status');
});

test('Stripe webhook still verifies signatures before acting', () => {
  const src = read('apps/api/src/routes/monetize.ts');
  assert.match(src, /stripe-signature/i, 'stripe-signature header no longer read');
  assert.match(src, /timingSafeEqual|constructEvent|verif/i, 'signature verification missing');
});

test('Cloudflare stream webhook still verifies its HMAC', () => {
  const src = read('apps/api/src/routes/uploads.ts');
  assert.match(src, /webhook-signature/i);
  assert.match(src, /timingSafeEqual/, 'must use constant-time comparison');
});

test('upload registration only accepts URLs from the uploader\'s own storage folder', () => {
  // SSRF + content-injection guard: a client-supplied uploadedUrl becomes a
  // server-side fetch target AND a public playback URL (uploads.ts).
  const src = read('apps/api/src/routes/uploads.ts');
  assert.match(src, /storage\/v1\/object\/public\/videos\/\$\{userId\}/, 'own-folder URL anchor missing');
  assert.match(src, /startsWith/, 'must anchor with startsWith, not includes');
});

test('migrations directory is append-only against origin/main', () => {
  // Shipped migrations must never be edited or deleted (CLAUDE.md rule 3).
  let diff;
  try {
    diff = execFileSync('git', ['diff', '--name-status', 'origin/main...HEAD', '--', 'supabase/migrations'], { cwd: repo, encoding: 'utf8' });
  } catch {
    return; // no origin/main locally (fresh clone/CI shallow) — CI job covers this
  }
  const violations = diff.split('\n').filter((l) => /^[MDR]/.test(l));
  assert.deepEqual(violations, [], `shipped migrations modified/deleted: ${violations.join(' | ')}`);
});

test('identity change still clears account-scoped caches', () => {
  // Query keys are not user-scoped by design; the compensating control is an
  // explicit cache teardown on auth identity change (+ localClips clear so the
  // next account on a shared device can't replay a premium clip).
  const auth = grepTracked('apps/web/src', 'clear\\(\\)|removeQueries|qc\\.clear');
  assert.ok(auth.length > 0, 'no cache-clearing call found anywhere in apps/web/src');
  const clips = read('apps/web/src/lib/localClips.ts');
  assert.match(clips, /clearLocalClips/, 'localClips account-switch teardown missing');
});

test('native-sensitive paths are classified by safety-diff', async () => {
  const { classifyPath } = await import(path.join(repo, 'scripts/safety-diff.mjs'));
  for (const p of [
    'apps/web/ios/App/App/Info.plist',
    'apps/web/android/app/build.gradle',
    'apps/web/capacitor.config.ts',
    'supabase/migrations/20990101000000_x.sql',
    'apps/api/src/services/payments.ts',
    '.github/workflows/ci.yml',
    'CLAUDE.md',
  ]) {
    assert.ok(classifyPath(p).length > 0, `${p} must classify as sensitive`);
  }
  assert.equal(classifyPath('apps/web/src/components/Feed.tsx').length, 0, 'ordinary UI must NOT classify as sensitive');
});

test('guardrail documents exist and were not deleted by cleanup', () => {
  for (const f of [
    'CLAUDE.md', 'AGENTS.md',
    'docs/ARCHITECTURE.md', 'docs/security.md',
    'docs/engineering/AI_ENGINEERING_GUARDRAILS.md',
    'docs/engineering/SYSTEM_RISK_MAP.md',
    'docs/engineering/CHANGE_SAFETY_CHECKLIST.md',
    'docs/engineering/autonomy-policy.md',
    'docs/operations/incident-response.md',
  ]) {
    assert.ok(existsSync(path.join(repo, f)), `${f} is part of the engineering constitution and must exist`);
  }
});

test('production Android config does not enable cleartext broadly', () => {
  // Cleartext is intentionally confined to LAN development (SYSTEM_RISK_MAP →
  // Native). The capacitor config gates it; make loosening it loud.
  const cfg = read('apps/web/capacitor.config.ts');
  const cleartext = /cleartext:\s*true/.test(cfg);
  if (cleartext) {
    assert.match(cfg, /lan|LAN|dev|192\.168|process\.env/i,
      'cleartext:true appears unconditionally — must stay scoped to LAN/dev builds');
  }
});
