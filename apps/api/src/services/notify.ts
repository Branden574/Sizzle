import { supabaseAdmin } from '../lib/supabase';
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
}
