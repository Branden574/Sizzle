import { Badge } from '@capawesome/capacitor-badge';
import { apiGet } from './api';
import { isNative } from './native';

/**
 * App-icon badge.
 *
 * The badge is native state, not web state: `@capacitor-firebase/messaging`
 * exposes no badge API at all (its `removeAllDeliveredNotifications()` clears
 * Notification Center and pointedly does NOT touch the icon), so this needs a
 * real native plugin and cannot be hot-fixed over OTA. That's why this file
 * shipped with a native build rather than as a bundle update.
 *
 * The server owns the number — only it can see unread notifications and unread
 * DMs as one total (`GET /me/badge-count`). We never guess it locally: pushing a
 * literal 0 on mark-read would wipe a badge that unread DMs still justify.
 */

/**
 * Pull the true count and stamp it on the icon. Safe to call anywhere: a no-op
 * on web, and never throws — a failed badge sync must not break the action that
 * triggered it (reading a notification, opening the app).
 */
export async function syncBadge(): Promise<void> {
  if (!isNative) return;
  try {
    const { count } = await apiGet<{ count: number }>('/me/badge-count');
    // set(0) removes the badge and clears delivered notifications, which is what
    // we want when the user has caught up: no stale banners behind a dead badge.
    await Badge.set({ count });
  } catch {
    // Offline, signed out mid-flight, or the count failed. Leave the badge as-is
    // — the next push carries a fresh count, and the next foreground re-syncs.
  }
}

/** Wipe the badge outright. Sign-out only: the next user must not inherit the
 *  previous one's count, and /me/badge-count is unauthenticated-dead by then. */
export async function clearBadge(): Promise<void> {
  if (!isNative) return;
  try {
    await Badge.clear();
  } catch {
    /* ignore */
  }
}
