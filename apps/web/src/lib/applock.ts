import { Preferences } from '@capacitor/preferences';

/**
 * App-lock passcode (4 digits, set by the user in Settings → Privacy & safety).
 *
 * This replaced the biometric (Face ID) app-lock: the OS biometric overlay
 * fires app-state changes that repeatedly re-locked the app on some devices
 * (an unfixable-by-timing event-ordering problem), and iOS already offers
 * native per-app Face ID locking. A passcode screen is pure in-app UI — no
 * system overlay, no resume events — so a lock loop is impossible by
 * construction.
 *
 * The passcode is never stored in plain text: we keep a SHA-256 hash of
 * salt+pin (random 16-byte salt) in Capacitor Preferences (Keychain-backed
 * UserDefaults on iOS, SharedPreferences on Android, localStorage on web).
 * This is a privacy lock, not a vault — the account password/session remain
 * the real security boundary.
 */

const HASH_KEY = 'sz_applock_hash';
const SALT_KEY = 'sz_applock_salt';

function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Persist a new passcode (overwrites any existing one). */
export async function setPasscode(pin: string): Promise<void> {
  const salt = randomSaltHex();
  const hash = await sha256Hex(salt + pin);
  await Preferences.set({ key: SALT_KEY, value: salt });
  await Preferences.set({ key: HASH_KEY, value: hash });
}

/** True if the entered pin matches the stored passcode. */
export async function verifyPasscode(pin: string): Promise<boolean> {
  try {
    const [{ value: salt }, { value: hash }] = await Promise.all([
      Preferences.get({ key: SALT_KEY }),
      Preferences.get({ key: HASH_KEY }),
    ]);
    if (!salt || !hash) return false;
    return (await sha256Hex(salt + pin)) === hash;
  } catch {
    return false;
  }
}

/** Remove the stored passcode (turning the lock off / on sign-out). */
export async function clearPasscode(): Promise<void> {
  try {
    await Preferences.remove({ key: HASH_KEY });
    await Preferences.remove({ key: SALT_KEY });
  } catch {
    /* ignore */
  }
}

/** True if a passcode has been set on this device. */
export async function hasPasscode(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: HASH_KEY });
    return !!value;
  } catch {
    return false;
  }
}
