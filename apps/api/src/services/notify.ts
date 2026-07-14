import { supabaseAdmin } from '../lib/supabase';
import { sendPushForNotification } from './push';
import type { NotificationKind } from '@sizzle/shared';

/** Record a notification for `userId` (the recipient). No-op for self-actions. */
export async function notify(opts: {
  userId: string;
  type: NotificationKind;
  actorId: string;
  recipeId?: string | null;
}): Promise<void> {
  if (opts.userId === opts.actorId) return;
  await supabaseAdmin.from('notifications').insert({
    user_id: opts.userId,
    type: opts.type,
    actor_id: opts.actorId,
    recipe_id: opts.recipeId ?? null,
  });
  // Best-effort device push on top of the persisted row. Awaited (not detached)
  // so it completes before the serverless function can freeze; it never throws.
  await sendPushForNotification(opts);
}

/**
 * Record a system notification directed at the user themselves (Creator-account
 * milestones, payouts) — there's no other-user "actor", so we set actor_id to
 * the recipient and skip notify()'s self-action guard. The client renders these
 * kinds with static copy that ignores the actor. Best-effort push, never throws.
 */
export async function systemNotify(opts: { userId: string; type: NotificationKind; recipeId?: string | null }): Promise<void> {
  await supabaseAdmin.from('notifications').insert({
    user_id: opts.userId,
    type: opts.type,
    actor_id: opts.userId, // self — the builder requires a resolvable actor row
    recipe_id: opts.recipeId ?? null,
  });
  await sendPushForNotification({ userId: opts.userId, type: opts.type, actorId: opts.userId, recipeId: opts.recipeId ?? null }).catch(() => {});
}
