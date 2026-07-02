import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { apiSend } from './api';
import { isNative, platform } from './native';
import { useSizzle } from '../store';

/**
 * Native push notifications via Firebase Cloud Messaging.
 *
 * Flow: ask permission → get the device's FCM token → register it with our API
 * (`POST /me/push-token`). FCM gives us a token on iOS *and* Android (on iOS,
 * Firebase relays to APNs using the auth key you upload in the Firebase
 * console), so the backend has a single delivery path. Everything is a no-op on
 * the web build — we only wire this up inside the Capacitor shell.
 */

const TOKEN_KEY = 'sizzle.pushToken';
let listenersBound = false;

async function registerToken(token: string): Promise<void> {
  try {
    await apiSend('POST', '/me/push-token', { token, platform });
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.warn('[push] failed to register token with API:', err);
  }
}

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  // Fired when FCM rotates the token; re-register the new one.
  void FirebaseMessaging.addListener('tokenReceived', (event) => {
    if (event?.token) void registerToken(event.token);
  });

  // Foreground delivery — the OS won't show a banner while the app is open, so
  // this is where we'd surface an in-app toast / refetch notifications later.
  void FirebaseMessaging.addListener('notificationReceived', (event) => {
    console.debug('[push] received in foreground:', event?.notification?.title);
  });

  // User tapped a notification — deep-link to the relevant surface. data.type /
  // data.recipeId / data.actorId are set server-side (see api push.ts).
  void FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    const data = (event?.notification?.data ?? {}) as { type?: string; recipeId?: string; actorId?: string };
    const store = useSizzle.getState();
    if (data.type === 'message' && data.actorId) store.setThreadWith(data.actorId);
    else if (data.recipeId) store.setOpenRecipe(data.recipeId);
    else if (data.type === 'follow' && data.actorId) store.setOpenCook(data.actorId);
  });
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
    if (perm.receive !== 'granted') return false;

    bindListeners();
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return false;
    await registerToken(token);
    return true;
  } catch (err) {
    console.warn('[push] enablePush failed:', err);
    return false;
  }
}

/**
 * Best-effort: register the device if permission was already granted, without
 * prompting. Use on app launch so returning users keep a fresh token; it stays
 * silent when the user hasn't opted in yet.
 */
export async function syncPushRegistration(): Promise<void> {
  if (!isNative) return;
  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== 'granted') return;
    bindListeners();
    const { token } = await FirebaseMessaging.getToken();
    if (token) await registerToken(token);
  } catch (err) {
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
