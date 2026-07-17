// Shared App Store Connect API client for Sizzle's release automation.
//
// Auth uses Branden's App Store Connect API key (the same one used to upload
// builds). The key is a SECRET and lives OUTSIDE this repo — never commit it.
// Defaults point at where it already is on Branden's Mac; override with env.
//
//   ASC_KEY_ID     Key ID              (default 9SA2GBH9YV)
//   ASC_ISSUER_ID  Issuer UUID         (default is Branden's ASC team issuer)
//   ASC_KEY_PATH   path to AuthKey.p8  (default ~/.appstoreconnect/private_keys)
//   ASC_APP_ID     numeric App ID      (default 6790235409 = Sizzle)
//   ASC_PLATFORM   IOS | MAC_OS | TV_OS (default IOS)
//
// The Issuer ID and App ID are NOT secret (they appear in dashboard URLs); the
// .p8 private key is. Keeping the key out of the repo is the whole security
// boundary here.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const API = 'https://api.appstoreconnect.apple.com';

export const CONFIG = {
  keyId: process.env.ASC_KEY_ID || '9SA2GBH9YV',
  issuerId: process.env.ASC_ISSUER_ID || 'aead110f-3dbb-4ea8-86a3-c0a41f22b775',
  appId: process.env.ASC_APP_ID || '6790235409',
  platform: process.env.ASC_PLATFORM || 'IOS',
  keyPath:
    process.env.ASC_KEY_PATH ||
    resolve(homedir(), '.appstoreconnect/private_keys', `AuthKey_${process.env.ASC_KEY_ID || '9SA2GBH9YV'}.p8`),
};

export function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Mint a short-lived ES256 JWT for the App Store Connect API (10-min ttl). */
export function makeToken() {
  let privateKey;
  try {
    privateKey = readFileSync(CONFIG.keyPath, 'utf8');
  } catch {
    fail(
      `Could not read the App Store Connect API key at:\n    ${CONFIG.keyPath}\n` +
        `Set ASC_KEY_PATH to the .p8 file, or copy it to ~/.appstoreconnect/private_keys/.`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: CONFIG.keyId, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: CONFIG.issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }),
  );
  const signingInput = `${header}.${payload}`;
  // ieee-p1363 gives the JOSE-style R||S signature ES256 requires (not DER).
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(signature)}`;
}

/** Call the ASC REST API. Re-mints the JWT per call (cheap, avoids expiry mid-run). */
export async function asc(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.title}: ${e.detail}`).join('; ') || text;
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return json;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
