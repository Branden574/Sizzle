#!/usr/bin/env node
/**
 * anon-boundary-probe — black-box, READ-ONLY check of the production PostgREST
 * security boundary from the position of an anonymous web visitor.
 *
 * Why this exists: SYSTEM_RISK_MAP says the anon key is public and PostgREST is
 * exposed, so table grants + RLS are a real security boundary. The weekly sweep
 * normally verifies grants/policies via the Supabase MCP (information_schema +
 * pg_policies), but that path has a single credential (TD-21). This probe needs
 * NO credential: it fetches the deployed web bundle, extracts the public client
 * key the browser already ships with, and issues `SELECT … limit 1` GETs. It
 * never writes and never prints the key.
 *
 * How to read a result line:
 *   401 42501    grant revoked at the SQL level (belt-and-braces)     → pass
 *   200 rows=0   grant exists, RLS returned nothing (deny-all/owner-only) → pass
 *   200 rows≥1   anon received data                                   → REGRESSION
 * `rows=0` cannot distinguish "RLS holding" from "table empty", so an empty
 * table (e.g. `payouts`, 0 rows in prod per SYSTEM_RISK_MAP) is a weaker pass.
 *
 * Coverage: every table `supabase/migrations` declares is probed — the classification in
 * `anon-boundary-tables.mjs` must account for all of them, and CI fails if a migration adds
 * one that nobody classified. Tables anon may legitimately read are checked a second way:
 * the probe asserts the policy's own predicate (e.g. a blocked hashtag stays invisible),
 * so "readable by design" never degrades into "readable, unchecked".
 *
 * Usage:  node scripts/ops/anon-boundary-probe.mjs [--web https://getsizzle.app]
 * Exit:   0 = no anon-visible rows/columns where there must be none, and the
 *             positive control returned data (so the denials are trustworthy)
 *         1 = a boundary regression, or the probe could not run
 */
// The table classification lives in its own module so CI can assert it still covers every
// table the migrations declare (tests/invariants/security-invariants.test.mjs). Add a table
// there when a migration creates one; never remove one to make the probe pass.
import {
  NO_ROWS_FOR_ANON,
  ANON_READABLE_BY_DESIGN,
  ANON_READABLE_FILTERS,
  PROFILES_PUBLIC_COLS,
  PROFILES_PII_COLS,
  DENIED_RPC,
} from './anon-boundary-tables.mjs';

const args = process.argv.slice(2);
const webIdx = args.indexOf('--web');
const WEB = webIdx >= 0 ? args[webIdx + 1] : 'https://getsizzle.app';

const fail = (msg) => { console.error(`anon-boundary-probe: FAIL — ${msg}`); process.exit(1); };

const html = await (await fetch(`${WEB}/`)).text();
const bundle = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
if (!bundle) fail('could not find the index bundle in the deployed HTML');
const js = await (await fetch(`${WEB}${bundle}`)).text();
const base = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
if (!base) fail('could not find the Supabase project URL in the bundle');
// The public client key is either the new `sb_publishable_…` format or a legacy
// anon-role JWT. Both are public by design (every browser gets them).
let anon = js.match(/sb_publishable_[A-Za-z0-9_-]{10,}/)?.[0] ?? null;
let keyKind = anon ? 'sb_publishable' : null;
if (!anon) {
  for (const k of new Set(js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? [])) {
    try {
      const p = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString());
      if (p.role === 'anon') { anon = k; keyKind = 'legacy anon JWT'; break; }
    } catch { /* not a JWT */ }
  }
}
if (!anon) fail('no public client key (sb_publishable_… or anon-role JWT) found in the bundle');
console.log(`bundle ${bundle} → project host found, public client key found (${keyKind}; value not printed)\n`);

// Anonymous request = apikey only (no user bearer), exactly what a logged-out browser sends.
const headers = { apikey: anon };
const probe = async (path, init = {}) => {
  const r = await fetch(`${base}/rest/v1/${path}`, { headers: { ...headers, ...(init.headers ?? {}) }, method: init.method ?? 'GET', body: init.body });
  const text = await r.text().catch(() => '');
  if (r.status === 200) {
    let rows = null;
    try { const j = JSON.parse(text); rows = Array.isArray(j) ? j.length : (j && typeof j === 'object' ? 1 : 0); } catch { /* keep null */ }
    return { status: 200, code: '', rows };
  }
  let code = ''; try { code = String(JSON.parse(text).code ?? ''); } catch { /* non-JSON */ }
  return { status: r.status, code, rows: null };
};
const fmt = (r) => (r.status === 200 ? `200 rows=${r.rows ?? '?'}` : `${r.status} ${r.code}`.trim()).padEnd(13);

let regressions = 0;
console.log('— tables that must yield no rows to anon —');
for (const t of NO_ROWS_FOR_ANON) {
  const r = await probe(`${t}?select=*&limit=1`);
  let verdict;
  if (r.status === 200 && (r.rows ?? 1) > 0) { verdict = '❌ ANON RECEIVED ROWS'; regressions++; }
  else if (r.status === 200) verdict = '✓ grant present, RLS returned nothing';
  else if (r.code === '42501') verdict = '✓ denied (grant revoked)';
  else verdict = `? unexpected (${r.status} ${r.code}) — inspect`;
  console.log(`  ${t.padEnd(26)} ${fmt(r)} ${verdict}`);
}

console.log('\n— tables anon may read, with the policy predicate checked live —');
for (const t of ANON_READABLE_BY_DESIGN) {
  const r = await probe(`${t}?select=*&limit=1`);
  // Readable-by-design means rows are EXPECTED; zero rows would mean the probe below is
  // vacuous (an empty table cannot demonstrate that the filter excludes anything).
  const readable = r.status === 200 && (r.rows ?? 0) > 0;
  console.log(`  ${t.padEnd(26)} ${fmt(r)} ${readable ? '✓ readable by design (policy cited in anon-boundary-tables.mjs)' : '⚠ no rows — filter checks below prove nothing'}`);
  for (const { query, why } of ANON_READABLE_FILTERS[t] ?? []) {
    const f = await probe(`${t}?select=id&${query}&limit=1`);
    let verdict;
    if (f.status === 200 && (f.rows ?? 1) > 0) { verdict = `❌ ANON READ A ROW IT MUST NOT — ${why}`; regressions++; }
    else if (f.status === 200) verdict = `✓ ${why}`;
    else if (f.code === '42501') verdict = `✓ denied outright — ${why}`;
    else verdict = `? unexpected (${f.status} ${f.code}) — inspect`;
    console.log(`    ${`${t}?${query}`.padEnd(38)} ${fmt(f)} ${verdict}`);
  }
}

console.log('\n— profiles: column-scoped grant —');
const pos = await probe(`profiles?select=${PROFILES_PUBLIC_COLS}&limit=1`);
const posOk = pos.status === 200 && (pos.rows ?? 0) >= 1;
console.log(`  ${`profiles(${PROFILES_PUBLIC_COLS})`.padEnd(26)} ${fmt(pos)} ${posOk ? '✓ positive control: public columns readable' : '⚠ POSITIVE CONTROL FAILED — denials below cannot be trusted'}`);
for (const col of PROFILES_PII_COLS) {
  const r = await probe(`profiles?select=${col}&limit=1`);
  let verdict;
  if (r.status === 200) { verdict = '❌ PII COLUMN READABLE BY ANON'; regressions++; }
  else if (r.code === '42501') verdict = '✓ column permission denied';
  else if (r.code === '42703') verdict = '– column does not exist (n/a)';
  else verdict = `? unexpected (${r.status} ${r.code}) — inspect`;
  console.log(`  ${`profiles.${col}`.padEnd(26)} ${fmt(r)} ${verdict}`);
}

console.log('\n— security-definer function —');
const rpc = await probe(`rpc/${DENIED_RPC.name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(DENIED_RPC.body) });
const rpcOk = rpc.status !== 200;
if (!rpcOk) regressions++;
console.log(`  ${`rpc ${DENIED_RPC.name}`.padEnd(26)} ${fmt(rpc)} ${rpcOk ? '✓ execute denied' : '❌ EXECUTABLE BY ANON'}`);

console.log('');
if (!posOk) fail('positive control returned no data — the probe cannot vouch for the denials');
if (regressions) fail(`${regressions} boundary regression(s) — anon can read something it must not (P1: verify with pg_policies/grants and fix by revoke migration)`);
const filterChecks = Object.values(ANON_READABLE_FILTERS).reduce((n, f) => n + f.length, 0);
console.log(`anon-boundary-probe: OK — ${NO_ROWS_FOR_ANON.length} tables yield no rows, ${filterChecks} policy-predicate checks on ${ANON_READABLE_BY_DESIGN.length} by-design-readable table(s), ${PROFILES_PII_COLS.length} profile PII columns denied, ${DENIED_RPC.name} not executable, positive control readable`);
