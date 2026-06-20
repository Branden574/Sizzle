import { supabaseAdmin } from '../lib/supabase';

/** Record a moderation action in the audit log (adminId null = system, e.g. auto-hide). */
export async function logModeration(opts: {
  adminId?: string | null;
  action: string;
  targetUserId?: string | null;
  targetRecipeId?: string | null;
  detail?: string | null;
}): Promise<void> {
  await supabaseAdmin.from('moderation_log').insert({
    admin_id: opts.adminId ?? null,
    action: opts.action,
    target_user_id: opts.targetUserId ?? null,
    target_recipe_id: opts.targetRecipeId ?? null,
    detail: opts.detail ?? null,
  });
}
