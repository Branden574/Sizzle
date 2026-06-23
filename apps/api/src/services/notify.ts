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
