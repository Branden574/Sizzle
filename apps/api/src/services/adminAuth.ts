/**
 * Admin passphrase primitives: scrypt hashing (node:crypto — no new dependency)
 * and opaque unlock-token generation. The hash is self-describing so params +
 * salt travel with it: `scrypt$N=<n>$r=<r>$p=<p>$<salt-b64>$<dk-b64>`.
 *
 * scrypt with N=32768,r=8 needs ~34MB, above node's 32MB default maxmem, so we
 * raise maxmem explicitly. Comparison is constant-time (timingSafeEqual).
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

interface ScryptOpts { N: number; r: number; p: number; maxmem: number }
const scrypt = promisify(_scrypt) as (pw: string | Buffer, salt: Buffer, keylen: number, opts: ScryptOpts) => Promise<Buffer>;

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALTLEN = 16;
const MAXMEM = 64 * 1024 * 1024;

/** Minimum passphrase entropy: length is the real security ceiling here. */
export const MIN_PASSPHRASE_LEN = 12;

/** Produce a self-describing scrypt hash string for storage. */
export async function hashPassphrase(pass: string): Promise<string> {
  const salt = randomBytes(SALTLEN);
  const dk = await scrypt(pass.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$N=${N}$r=${R}$p=${P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

/** Constant-time verify against a stored self-describing hash. Never throws. */
export async function verifyPassphrase(pass: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = Number(parts[1].slice(2));
    const r = Number(parts[2].slice(2));
    const p = Number(parts[3].slice(2));
    const salt = Buffer.from(parts[4], 'base64');
    const dk = Buffer.from(parts[5], 'base64');
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || dk.length === 0) return false;
    const test = await scrypt(pass.normalize('NFKC'), salt, dk.length, { N: n, r, p, maxmem: MAXMEM });
    return test.length === dk.length && timingSafeEqual(test, dk);
  } catch {
    return false;
  }
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** A fresh unlock token: the raw value is returned to the client once; we store
 *  only its SHA-256. */
export function newUnlockToken(): { token: string; tokenSha256: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenSha256: sha256(token) };
}
