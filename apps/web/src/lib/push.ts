import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { apiSend } from './api';
import { isNative, platform } from './native';
import { syncBadge } from './badge';
import { useSizzle } from '../store';

/**
 * Native push notifications via Firebase Cloud Messaging.
 *
 * Flow: ask permission → get the device's FCM token → register it with our API
 * (`POST /me/push-token`). On iOS the FCM token can't be minted until the APNs
 * device token has arrived from Apple, which lands a beat AFTER the permission
 * dialog — so a single getToken() right after "Allow" often comes back empty.
 * getFcmToken() retries to ride that out, and the `tokenReceived` listener is a
 * parallel backstop. The last attempt's result is stashed in `sz.pushDebug` and
 * surfaced in Settings so a device-side failure is diagnosable without logs.
 * Everything is a no-op on the web build.
 */

const TOKEN_KEY = 'sizzle.pushToken';
const DEBUG_KEY = 'sizzle.pushDebug';
let listenersBound = false;

/** Human-readable status of the last registration attempt (shown in Settings). */
export function getPushDebug(): string {
  try {
    return localStorage.getItem(DEBUG_KEY) || 'not attempted yet';
  } catch {
    return 'unknown';
  }
}
function setDebug(msg: string): void {
  try {
    localStorage.setItem(DEBUG_KEY, msg);
  } catch {
    /* ignore */
  }
}

async function registerToken(token: string): Promise<void> {
  try {
    await apiSend('POST', '/me/push-token', { token, platform });
    localStorage.setItem(TOKEN_KEY, token);
    setDebug(`registered ✓ (${platform} · …${token.slice(-6)})`);
  } catch (err) {
    setDebug(`got token but API register failed: ${(err as Error)?.message ?? String(err)}`);
    console.warn('[push] failed to register token with API:', err);
  }
}

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  // Fired when FCM delivers/rotates the token — the authoritative path. If the
  // initial getToken() raced the APNs token, this catches the token when it's
  // finally minted and registers it.
  void FirebaseMessaging.addListener('tokenReceived', (event) => {
    if (event?.token) void registerToken(event.token);
  });

  // Foreground delivery — the OS won't show a banner while the app is open.
  void FirebaseMessaging.addListener('notificationReceived', (event) => {
    console.debug('[push] received in foreground:', event?.notification?.title);
  });

  // User tapped a notification — deep-link to the relevant surface.
  void FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    const data = (event?.notification?.data ?? {}) as { type?: string; recipeId?: string; actorId?: string };
    // Tapping in from the background doesn't always cross an appStateChange we
    // see, so re-sync here rather than rely on it.
    void syncBadge();
    const store = useSizzle.getState();
    if (data.type === 'message' && data.actorId) store.setThreadWith(data.actorId);
    else if (data.recipeId) store.setOpenRecipe(data.recipeId);
    else if (data.type === 'follow' && data.actorId) store.setOpenCook(data.actorId);
  });
}

/** getToken() can race the APNs device token on a fresh grant; retry ~15s. */
async function getFcmToken(): Promise<string | null> {
  let lastErr = '';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) return token;
      lastErr = 'getToken returned empty (APNs token not ready yet?)';
    } catch (err) {
      lastErr = (err as Error)?.message ?? String(err);
    }
    setDebug(`waiting for FCM token… (try ${attempt}/6 — ${lastErr})`);
    if (attempt < 6) await new Promise<void>((r) => { setTimeout(r, 2500); });
  }
  setDebug(`no FCM token after retries — ${lastErr}`);
  return null;
}

/**
 * Request permission (if not already granted) and register this device for
 * push. Call after the user is signed in. Returns true when a token was
 * registered. Safe to call repeatedly.
 */
export async function enablePush(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') {
      setDebug(`notification permission: ${perm.receive}`);
      return false;
    }
    bindListeners();
    const token = await getFcmToken();
    if (!token) return false;
    await registerToken(token);
    return true;
  } catch (err) {
    setDebug(`enablePush error: ${(err as Error)?.message ?? String(err)}`);
    console.warn('[push] enablePush failed:', err);
    return false;
  }
}

/**
 * Best-effort: register the device if permission was already granted, without
 * prompting. Use on app launch so returning users keep a fresh token.
 */
export async function syncPushRegistration(): Promise<void> {
  if (!isNative) return;
  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== 'granted') {
      setDebug(`permission is ${perm.receive} — not registering`);
      return;
    }
    bindListeners();
    const token = await getFcmToken();
    if (token) await registerToken(token);
  } catch (err) {
    setDebug(`sync error: ${(err as Error)?.message ?? String(err)}`);
    console.warn('[push] syncPushRegistration failed:', err);
  }
}

/**
 * Unregister this device (call on sign-out). Removes the token from our API and
 * tells FCM to drop it so a signed-out device stops receiving pushes.
 */
export async function disablePush(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      await apiSend('DELETE', '/me/push-token', { token });
    } catch {
      /* ignore — server-side prune covers dead tokens anyway */
    }
    localStorage.removeItem(TOKEN_KEY);
  }
  if (!isNative) return;
  try {
    await FirebaseMessaging.deleteToken();
  } catch {
    /* ignore */
  }
}
