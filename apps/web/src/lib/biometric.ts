import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric';
import { isNative } from './native';

/**
 * Face ID / Touch ID / fingerprint helpers.
 *
 * Two roles:
 *  1. App lock — when the user opts in (Settings), `verify()` gates access to
 *     the app on each open/resume.
 *  2. Faster re-login — we stash the Supabase refresh token in the device
 *     Keychain/Keystore so that, after a successful biometric check, an expired
 *     session can be restored without retyping the password.
 *
 * Everything is a no-op / safe default on the web build (isNative === false).
 */

const SERVER = 'app.sizzle.mobile';

/** A friendly label for the device's biometric hardware. */
export function biometryLabel(type: BiometryType): string {
  switch (type) {
    case BiometryType.FACE_ID:
      return 'Face ID';
    case BiometryType.TOUCH_ID:
      return 'Touch ID';
    case BiometryType.FINGERPRINT:
      return 'fingerprint';
    case BiometryType.FACE_AUTHENTICATION:
      return 'face unlock';
    case BiometryType.IRIS_AUTHENTICATION:
      return 'iris unlock';
    default:
      return 'biometrics';
  }
}

export async function biometricAvailability(): Promise<{ available: boolean; label: string }> {
  if (!isNative) return { available: false, label: 'biometrics' };
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: false });
    return { available: !!r.isAvailable, label: biometryLabel(r.biometryType) };
  } catch {
    return { available: false, label: 'biometrics' };
  }
}

// Showing the OS biometric prompt makes iOS/Android fire an app-state change
// (the app goes inactive behind the system overlay, then active again when it
// dismisses). The app-lock re-locks on "became active", so without this guard
// passing Face ID would immediately re-lock and re-prompt forever. We flag the
// window around a prompt so the appStateChange listener can ignore that one
// spurious resume. A short cooldown after resolve covers the dismissal event.
let promptInFlight = false;
let promptBusyUntil = 0;

/** True while a biometric prompt is showing, or briefly (1.5s) after it
 *  resolves — used to ignore the resume the prompt itself triggers. */
export function biometricPromptBusy(): boolean {
  return promptInFlight || Date.now() < promptBusyUntil;
}

/**
 * Prompt the OS biometric check. Resolves true on success, false on
 * cancel/failure. On web it resolves true (nothing to gate).
 */
export async function biometricVerify(reason = 'Unlock Sizzle'): Promise<boolean> {
  if (!isNative) return true;
  promptInFlight = true;
  try {
    await NativeBiometric.verifyIdentity({ reason, title: 'Sizzle', subtitle: '', description: reason });
    return true;
  } catch {
    return false;
  } finally {
    promptInFlight = false;
    promptBusyUntil = Date.now() + 1500; // swallow the resume the prompt dismissal fires
  }
}

/** Stash the refresh token behind the biometric-protected keychain entry. */
export async function storeBiometricToken(refreshToken: string): Promise<void> {
  if (!isNative) return;
  try {
    await NativeBiometric.setCredentials({ username: 'sizzle', password: refreshToken, server: SERVER });
  } catch {
    /* non-fatal */
  }
}

/** Retrieve the stashed refresh token (call only after biometricVerify). */
export async function getBiometricToken(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const c = await NativeBiometric.getCredentials({ server: SERVER });
    return c?.password || null;
  } catch {
    return null;
  }
}

/** Forget the stashed token (on opt-out or sign-out). */
export async function clearBiometricToken(): Promise<void> {
  if (!isNative) return;
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    /* ignore */
  }
}
