/**
 * Guards the stale-chunk recovery path on the web boot sequence (shipped 2026-08-31,
 * root-caused in the 2026-08-28 incident session — see docs/operations/incidents/LOG.md).
 *
 * Vercel serves only the CURRENT deployment's /assets, so a tab held open across a
 * deploy 404s its first lazy import ("TypeError: Importing a module script failed")
 * and, on the public landing page, white-screens with no way out. The recovery is
 * three deliberate pieces, each of which a refactor could drop without a type error:
 * a vite:preloadError listener that reloads once, an error boundary over the lazy
 * Marketing chunk, and Sentry suppression for locally-served builds so reproducing
 * any of this never posts fake incidents into the production project.
 *
 * Run: node --test tests/invariants/
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

test('a failed lazy chunk load reloads the page once, then fails visibly', () => {
  const main = read('apps/web/src/main.tsx');

  assert.match(main, /addEventListener\(\s*['"]vite:preloadError['"]/,
    'main.tsx must listen for vite:preloadError — it is the only signal that a lazy chunk 404ed');
  assert.match(main, /preventDefault\(\)/,
    'the listener must preventDefault so an expected stale-chunk failure is not Sentry noise');
  assert.match(main, /sessionStorage/,
    'the reload guard must persist across the reload it triggers, so it must live in sessionStorage');
  assert.match(main, /location\.reload\(\)/,
    'recovery is a reload — the fresh index.html carries the current chunk hashes');

  // Timestamp guard, not a boolean: a broken deploy must not reload-loop, but the same
  // tab must still heal across the NEXT deploy.
  assert.match(main, /30[_]?000/,
    'the reload guard must be a time window (one reload per ~30s), not a one-shot boolean');
});

test('the public marketing page cannot white-screen on a render error', () => {
  const app = read('apps/web/src/App.tsx');
  const marketingBranch = app.match(/if \(showMarketing\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(marketingBranch, 'App.tsx must still have the showMarketing early-return branch');
  assert.match(marketingBranch, /<ErrorBoundary\b/,
    'the lazy Marketing chunk is the public front door — it must render inside an ErrorBoundary');
  assert.match(marketingBranch, /CrashFallback/,
    'the boundary must show the retry UI, not silently render nothing');
});

test('a locally-served build never reports to production Sentry', () => {
  const sentry = read('apps/web/src/lib/sentry.ts');

  assert.match(sentry, /isLocalDevHost/,
    'sentry.ts must gate its endpoint on a local-host check — a served dist/ carries the real DSN');
  assert.match(sentry, /localhost/,
    'the local-host check must cover localhost');
  // Native serves from capacitor://localhost (iOS) / http://localhost (Android); hostname
  // alone would silence every real device crash.
  assert.match(sentry, /isNativePlatform/,
    'the local-host check must exempt native, which also serves from a localhost origin');
});
