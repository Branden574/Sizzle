import { supabaseAdmin } from '../lib/supabase';
import { loadBlockedIds } from '../mappers';

/**
 * The one definition of "unread" in the app.
 *
 * The iOS/Android app-icon badge, the Notifications sheet and the inbox dot all
 * have to agree — a badge that outlives the thing the user just read is exactly
 * the bug this module exists to prevent. So the DM helpers live here rather than
 * in routes/messages.ts, and every surface imports them instead of re-deriving
 * "unread" locally and drifting.
 */

export interface ConvRow {
  id: string;
  user_a: string;
  user_b: string;
  a_last_read_at: string;
  b_last_read_at: string;
  a_cleared_at: string | null;
  b_cleared_at: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_sender_id: string | null;
}

export const isUnread = (r: ConvRow, viewer: string): boolean => {
  const myLastRead = r.user_a === viewer ? r.a_last_read_at : r.b_last_read_at;
  return !!r.last_message_at && r.last_message_at > myLastRead && r.last_message_sender_id !== viewer;
};

// A conversation the viewer "deleted": hidden from their inbox until the other
// person sends something newer than the moment they cleared it. (last_message_at
// and *_cleared_at are both JS-ISO strings, so a lexical compare is exact.)
export const clearedHidden = (r: ConvRow, viewer: string): boolean => {
  const cleared = r.user_a === viewer ? r.a_cleared_at : r.b_cleared_at;
  return !!cleared && (!r.last_message_at || r.last_message_at <= cleared);
};

/**
 * Conversations with at least one unread message, excluding blocked + banned
 * counterparties — mirrors the inbox exactly, so the count can never outlive a
 * hidden conversation. Backs both GET /messages/unread-count and the badge.
 */
export async function unreadConversationCount(userId: string, preBlocked?: Set<string>): Promise<number> {
  // .throwOnError() is load-bearing: supabase-js resolves errors into
  // `{ data: null, error }` rather than throwing, so without it a failed query
  // silently reads as "zero unread" and the caller's fallback never runs —
  // erasing a badge instead of preserving it.
  const { data: rows } = await supabaseAdmin
    .from('conversations')
    .select('id, user_a, user_b, a_last_read_at, b_last_read_at, a_cleared_at, b_cleared_at, last_message_at, last_message_text, last_message_sender_id')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .not('last_message_at', 'is', null)
    .throwOnError();
  const unread = ((rows ?? []) as ConvRow[]).filter((r) => isUnread(r, userId) && !clearedHidden(r, userId));
  if (unread.length === 0) return 0;

  const blocked = preBlocked ?? (await loadBlockedIds(supabaseAdmin, userId));
  const otherIds = [...new Set(unread.map((r) => (r.user_a === userId ? r.user_b : r.user_a)))];
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, banned').in('id', otherIds).throwOnError();
  const banned = new Set((profiles ?? []).filter((p) => p.banned).map((p) => p.id as string));
  return unread.filter((r) => {
    const other = r.user_a === userId ? r.user_b : r.user_a;
    return !blocked.has(other) && !banned.has(other);
  }).length;
}

/**
 * Unread rows in the Notifications sheet. Mirrors GET /me/notifications, which
 * drops notifications from blocked actors (either direction) — count them and
 * the badge would survive a "mark all read" that never saw them.
 */
export async function unreadNotificationCount(userId: string, preBlocked?: Set<string>): Promise<number> {
  const { data: rows } = await supabaseAdmin
    .from('notifications')
    .select('actor_id')
    .eq('user_id', userId)
    .eq('read', false)
    // type='message' rows are DMs, which unreadConversationCount ALREADY counts.
    // Most DMs write no notifications row, but the creator welcome-DM and
    // broadcast paths (routes/monetize.ts) write both — so counting them here
    // made one welcome DM badge as 2, and reading it left the badge stuck at 1.
    // That is the very bug this module exists to kill.
    .neq('type', 'message')
    .throwOnError();
  const list = rows ?? [];
  if (list.length === 0) return 0;
  const blocked = preBlocked ?? (await loadBlockedIds(supabaseAdmin, userId));
  return list.filter((n) => !blocked.has(n.actor_id as string)).length;
}

/**
 * What the app-icon badge should read: everything awaiting the user across both
 * surfaces. DMs are MANDATORY here, not a nicety — they're push-only and write
 * no notifications row (routes/messages.ts), so a notifications-only count would
 * badge an incoming DM as 0 and silently swallow it.
 */
export async function unreadBadgeCount(userId: string): Promise<number> {
  // Someone who switched notifications off should not be badged. Push sends
  // already honour this (services/push.ts), but the badge is now also computed
  // on demand for the app, so the preference has to be enforced here too —
  // otherwise turning push off silently still lights the icon.
  const { data: profile } = await supabaseAdmin.from('profiles').select('push_enabled').eq('id', userId).maybeSingle();
  if (profile && profile.push_enabled === false) return 0;

  // Both halves filter on the same block list — resolve it once (it's 2 queries
  // of its own) rather than letting each half fetch its own copy.
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  const [notifs, dms] = await Promise.all([
    unreadNotificationCount(userId, blocked),
    unreadConversationCount(userId, blocked),
  ]);
  return notifs + dms;
}
