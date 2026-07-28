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
  void notifyReport(opts).catch(() => {});
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The moderation alert. A raw UUID is unactionable at 2am — this resolves the target into
 * something a human can judge: WHO was reported (handle + name), WHAT the content says, WHO
 * reported it, and how many open reports it now has, with a direct link. Best-effort: every
 * lookup is wrapped so a failed join still sends the core alert.
 */
async function notifyReport(opts: {
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  category: string;
  reason?: string | null;
}): Promise<void> {
  const site = process.env.APP_ORIGIN || 'https://getsizzle.app';
  const lines: string[] = [];
  let who = `${opts.targetType} ${opts.targetId}`;
  let link = '';

  try {
    if (opts.targetType === 'profile') {
      const { data: p } = await supabaseAdmin.from('profiles').select('handle, display_name, bio, created_at').eq('id', opts.targetId).maybeSingle();
      if (p) {
        who = `@${p.handle} (${p.display_name ?? '—'})`;
        link = `${site}/u/${p.handle}`;
        lines.push(`<li><b>Account:</b> @${esc(p.handle)} — ${esc(p.display_name)}</li>`);
        if (p.bio) lines.push(`<li><b>Bio:</b> ${esc(String(p.bio).slice(0, 300))}</li>`);
        lines.push(`<li><b>Joined:</b> ${esc(String(p.created_at).slice(0, 10))}</li>`);
      }
    } else if (opts.targetType === 'recipe') {
      const { data: r } = await supabaseAdmin.from('recipes').select('title, cook_id, status, auto_hidden').eq('id', opts.targetId).maybeSingle();
      if (r) {
        const { data: c } = await supabaseAdmin.from('profiles').select('handle, display_name').eq('id', r.cook_id as string).maybeSingle();
        who = `"${r.title}"${c ? ` by @${c.handle}` : ''}`;
        link = `${site}/r/${opts.targetId}`;
        lines.push(`<li><b>Post:</b> ${esc(r.title)}</li>`);
        if (c) lines.push(`<li><b>Creator:</b> @${esc(c.handle)} — ${esc(c.display_name)}</li>`);
        lines.push(`<li><b>Status:</b> ${esc(r.status)}${r.auto_hidden ? ' (auto-hidden)' : ''}</li>`);
      }
    } else {
      const { data: cm } = await supabaseAdmin.from('comments').select('text, author_id, recipe_id').eq('id', opts.targetId).maybeSingle();
      if (cm) {
        const { data: u } = await supabaseAdmin.from('profiles').select('handle, display_name').eq('id', cm.author_id as string).maybeSingle();
        who = `comment${u ? ` by @${u.handle}` : ''}`;
        if (cm.recipe_id) link = `${site}/r/${cm.recipe_id}`;
        lines.push(`<li><b>Comment:</b> “${esc(String(cm.text).slice(0, 300))}”</li>`);
        if (u) lines.push(`<li><b>Author:</b> @${esc(u.handle)} — ${esc(u.display_name)}</li>`);
      }
    }
  } catch { /* fall back to the id-only alert */ }

  let reporter = '';
  try {
    const { data: rp } = await supabaseAdmin.from('profiles').select('handle').eq('id', opts.reporterId).maybeSingle();
    if (rp) reporter = `@${rp.handle}`;
  } catch { /* optional */ }

  // How hot is this target? One report is noise; ten is a pattern.
  let openCount = 1;
  try {
    const { count } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', opts.targetType)
      .eq('target_id', opts.targetId)
      .eq('status', 'open');
    if (count) openCount = count;
  } catch { /* optional */ }

  const heat = openCount >= 5 ? ` — ${openCount} OPEN REPORTS` : '';
  void sendEmail({
    to: 'support@getsizzle.app',
    subject: `[Sizzle] ${opts.category} report on ${who}${heat}`,
    html:
      `<p><b>New ${esc(opts.targetType)} report</b>${openCount > 1 ? ` — this target now has <b>${openCount}</b> open reports.` : ''}</p>` +
      `<ul>${lines.join('')}` +
      `<li><b>Category:</b> ${esc(opts.category)}</li>` +
      `<li><b>Reason:</b> ${opts.reason ? esc(String(opts.reason).slice(0, 500)) : '(none given)'}</li>` +
      `<li><b>Reported by:</b> ${esc(reporter || opts.reporterId)}</li>` +
      `<li><b>Target id:</b> <code>${esc(opts.targetId)}</code></li>` +
      `</ul>` +
      (link ? `<p><a href="${esc(link)}">View the reported ${esc(opts.targetType)}</a></p>` : '') +
      `<p>Review in the admin dashboard (Profile → Admin dashboard → Reports) within 24h of this email.</p>`,
  });
}
