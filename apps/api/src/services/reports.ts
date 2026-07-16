import type { ReportTargetType } from '@sizzle/shared';
import { supabaseAdmin } from '../lib/supabase';
import { sendEmail } from './email';
import { forbidden, notFound } from '../lib/errors';
import { logModeration } from './audit';

/** Distinct reporters before a recipe is auto-hidden pending admin review. */
const AUTOHIDE_THRESHOLD = 20;
/** Dismissed-as-false reports (30-day window) before reporting is throttled. */
const REPORTER_ABUSE_THRESHOLD = 5;

const TABLE: Record<ReportTargetType, string> = { recipe: 'recipes', comment: 'comments', profile: 'profiles' };

async function targetExists(type: ReportTargetType, id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from(TABLE[type]).select('id').eq('id', id).maybeSingle();
  return !!data;
}

/**
 * File a report against any target (recipe / comment / profile). Idempotent per
 * (target, reporter). Throttles reporters with too many recently-dismissed
 * reports, and auto-hides a recipe once enough distinct open reports accrue.
 */
export async function fileReport(opts: {
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  category: string;
  reason?: string | null;
}): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: falseCount } = await supabaseAdmin
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('reporter_id', opts.reporterId)
    .eq('status', 'dismissed')
    .gte('resolved_at', since);
  if ((falseCount ?? 0) >= REPORTER_ABUSE_THRESHOLD) throw forbidden('Reporting is temporarily disabled for your account');

  if (!(await targetExists(opts.targetType, opts.targetId))) throw notFound('Not found');

  await supabaseAdmin.from('reports').upsert(
    {
      target_type: opts.targetType,
      target_id: opts.targetId,
      recipe_id: opts.targetType === 'recipe' ? opts.targetId : null,
      reporter_id: opts.reporterId,
      category: opts.category,
      reason: opts.reason ?? null,
    },
    { onConflict: 'target_type,target_id,reporter_id', ignoreDuplicates: true },
  );

  if (opts.targetType === 'recipe') {
    const { count: distinct } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'recipe')
      .eq('target_id', opts.targetId)
      .eq('status', 'open');
    if ((distinct ?? 0) >= AUTOHIDE_THRESHOLD) {
      const { data: hid } = await supabaseAdmin.from('recipes').update({ auto_hidden: true }).eq('id', opts.targetId).eq('auto_hidden', false).select('id');
      if (hid && hid.length) await logModeration({ action: 'auto_hide', targetRecipeId: opts.targetId, detail: `${distinct} reports` });
    }
  }

  // The published Terms promise every report is reviewed within 24 hours.
  // Nobody sits watching the admin dashboard, so the clock has to start with a
  // push to a monitored inbox. Fire-and-forget: an email failure must never
  // fail the report itself.
  void sendEmail({
    to: 'support@getsizzle.app',
    subject: `[Sizzle] New ${opts.targetType} report — ${opts.category}`,
    html: `<p>New report filed.</p><ul><li>Target: ${opts.targetType} <code>${opts.targetId}</code></li><li>Category: ${opts.category}</li><li>Reason: ${opts.reason ? String(opts.reason).slice(0, 500) : '(none given)'}</li></ul><p>Review in the admin dashboard within 24h of this email.</p>`,
  }).catch(() => {});
}
