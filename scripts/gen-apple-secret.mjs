#!/usr/bin/env node
/**
 * Generate the Sign in with Apple client secret (ES256 JWT) that Supabase's
 * Apple provider requires. Apple caps validity at 6 months — rerun this and
 * re-paste into Supabase (Auth → Providers → Apple → Secret Key) before it
 * expires. Run locally; the .p8 never leaves your machine.
 *
 *   node scripts/gen-apple-secret.mjs <path-to-SIWA-key.p8> <KEY_ID>
 *
 * Team ID and Services ID are Sizzle constants baked in below.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TEAM_ID = '6R2T984G9S';
const CLIENT_ID = 'app.sizzle.web'; // the Services ID, NOT the app bundle id
const MAX_AGE_S = 15_776_999; // just under Apple's 6-month ceiling

const [, , keyPath, keyId] = process.argv;
if (!keyPath || !keyId) {
  console.error('Usage: node scripts/gen-apple-secret.mjs <path-to-key.p8> <KEY_ID>');
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const now = Math.floor(Date.now() / 1000);

const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
const payload = b64url(
  JSON.stringify({
    iss: TEAM_ID,
    iat: now,
    exp: now + MAX_AGE_S,
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  }),
);

const key = createPrivateKey(readFileSync(keyPath, 'utf8'));
const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
  key,
  dsaEncoding: 'ieee-p1363', // JWT ES256 wants raw r||s, not DER
});

console.log(`${header}.${payload}.${b64url(signature)}`);
console.error(`\n(expires ${new Date((now + MAX_AGE_S) * 1000).toISOString().slice(0, 10)} — rerun before then)`);
