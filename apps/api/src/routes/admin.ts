import { Hono } from 'hono';
import { z } from 'zod';
import type { AdminAppealDTO, AdminLogDTO, AdminReportGroupDTO, AdminStats, AdminUserDTO, ReportCategory, SupportRequestDTO } from '@sizzle/shared';
import { requireAdmin, requireAuth, requireNotBanned } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { initialsOf, relativeTime } from '../lib/format';
import { notify } from '../services/notify';
import { logModeration } from '../services/audit';
import { emails, sendEmail, userEmail } from '../services/email';
import type { ProfileRow } from '../mappers';
import type { AppEnv } from '../types';

/** A post enters the moderation queue once this many distinct users report it. */
const REPORT_THRESHOLD = 5;
/** An account is auto-flagged for review past this many total reports. */
const FLAG_THRESHOLD = 100;
/** Days after a ban before the account + all its data are permanently wiped. */
const BAN_DELETE_DAYS = 45;

export const admin = new Hono<AppEnv>();
// A banned admin must lose admin powers too (ban enforcement + role check).
admin.use('*', requireAuth, requireNotBanned, requireAdmin);

/** open report rows → { recipeId → {count, categories, last} }. */
async function openReportsByRecipe() {
  const { data } = await supabaseAdmin.from('reports').select('recipe_id, category, created_at').eq('status', 'open');
  const map = new Map<string, { count: number; categories: Record<string, number>; last: string }>();
  for (const r of data ?? []) {
    const rid = r.recipe_id as string;
    const e = map.get(rid) ?? { count: 0, categories: {}, last: r.created_at as string };
    e.count += 1;
    e.categories[r.category as string] = (e.categories[r.category as string] ?? 0) + 1;
    if ((r.created_at as string) > e.last) e.last = r.created_at as string;
    map.set(rid, e);
  }
  return map;
}

/** all report rows → { cookId → total reports against their posts }. */
async function reportsByCook() {
  const { data: reps } = await supabaseAdmin.from('reports').select('recipe_id');
  const ids = [...new Set((reps ?? []).map((r) => r.recipe_id as string))];
  const byCook = new Map<string, number>();
  if (ids.length) {
    const { data: recs } = await supabaseAdmin.from('recipes').select('id, cook_id').in('id', ids);
    const cookOf = new Map((recs ?? []).map((r) => [r.id as string, r.cook_id as string]));
    for (const r of reps ?? []) {
      const cook = cookOf.get(r.recipe_id as string);
      if (cook) byCook.set(cook, (byCook.get(cook) ?? 0) + 1);
    }
  }
  return byCook;
}

/** removed videos per cook → repeat-offender signal. */
async function removedByCook() {
  const { data } = await supabaseAdmin.from('recipes').select('cook_id').eq('status', 'removed');
  const byCook = new Map<string, number>();
  for (const r of data ?? []) byCook.set(r.cook_id as string, (byCook.get(r.cook_id as string) ?? 0) + 1);
  return byCook;
}

/** Videos removed before an account is treated as a repeat offender. */
const REPEAT_OFFENDER_THRESHOLD = 3;

/** GET /admin/stats */
admin.get('/stats', async (c) => {
  const [byRecipe, byCook, appeals, banned, verified, total] = await Promise.all([
    openReportsByRecipe(),
    reportsByCook(),
    supabaseAdmin.from('recipes').select('*', { count: 'exact', head: true }).eq('appeal_status', 'pending'),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', true),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).not('verified_tier', 'is', null),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
  ]);
  const flaggedPosts = [...byRecipe.values()].filter((e) => e.count >= REPORT_THRESHOLD).length;
  const flaggedUsers = [...byCook.values()].filter((n) => n > FLAG_THRESHOLD).length;
  const stats: AdminStats = {
    flaggedPosts,
    pendingAppeals: appeals.count ?? 0,
    bannedUsers: banned.count ?? 0,
    flaggedUsers,
    verifiedUsers: verified.count ?? 0,
    totalUsers: total.count ?? 0,
  };
  return c.json(stats);
});

/** GET /admin/reports — posts with ≥ REPORT_THRESHOLD distinct reporters. */
admin.get('/reports', async (c) => {
  const byRecipe = await openReportsByRecipe();
  const flagged = [...byRecipe.entries()].filter(([, e]) => e.count >= REPORT_THRESHOLD);
  if (flagged.length === 0) return c.json<AdminReportGroupDTO[]>([]);

  const recipeIds = flagged.map(([rid]) => rid);
  const { data: recs } = await supabaseAdmin.from('recipes').select('id, title, status, cook_id').in('id', recipeIds);
  const recMap = new Map((recs ?? []).map((r) => [r.id as string, r]));
  const cookIds = [...new Set((recs ?? []).map((r) => r.cook_id as string))];
  const { data: cooks } = await supabaseAdmin.from('profiles').select('id, display_name').in('id', cookIds);
  const cookMap = new Map((cooks ?? []).map((p) => [p.id as string, p.display_name as string]));

  const dto: AdminReportGroupDTO[] = flagged
    .map(([rid, e]) => {
      const rec = recMap.get(rid);
      return {
        recipeId: rid,
        recipeTitle: rec?.title ?? '(deleted recipe)',
        recipeStatus: rec?.status ?? 'unknown',
        cookId: (rec?.cook_id as string) ?? '',
        cookName: rec ? cookMap.get(rec.cook_id as string) ?? 'cook' : 'cook',
        reportCount: e.count,
        categories: e.categories as Partial<Record<ReportCategory, number>>,
        lastReportedAt: e.last,
        time: relativeTime(new Date(e.last)),
      };
    })
    .sort((a, b) => b.reportCount - a.reportCount);
  return c.json(dto);
});

/** POST /admin/reports/:recipeId/false — mark all reports on a post as false (dismiss). */
admin.post('/reports/:recipeId/false', async (c) => {
  const recipeId = assertUuid(c.req.param('recipeId'), 'recipe');
  const adminId = c.get('userId')!;
  await supabaseAdmin
    .from('reports')
    .update({ status: 'dismissed', resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq('recipe_id', recipeId)
    .eq('status', 'open');
  // False alarm → un-hide if it had been auto-hidden.
  await supabaseAdmin.from('recipes').update({ auto_hidden: false }).eq('id', recipeId);
  await logModeration({ adminId, action: 'mark_false', targetRecipeId: recipeId });
  return c.json({ ok: true });
});

const removeSchema = z.object({ reason: z.string().trim().max(300).optional() });

/** POST /admin/recipes/:id/remove — take a post down with a reason; notify the owner. */
admin.post('/recipes/:id/remove', async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const adminId = c.get('userId')!;
  const body = removeSchema.safeParse(await c.req.json().catch(() => ({})));
  const reason = (body.success && body.data.reason) || 'Violated community guidelines';

  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, status, title').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');

  await supabaseAdmin
    .from('recipes')
    .update({ status: 'removed', removal_reason: reason, removed_at: new Date().toISOString(), auto_hidden: false, appeal_status: 'none', appeal_text: null, appealed_at: null })
    .eq('id', id);
  await supabaseAdmin
    .from('reports')
    .update({ status: 'resolved', resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq('recipe_id', id)
    .eq('status', 'open');
  await notify({ userId: rec.cook_id as string, type: 'removed', actorId: adminId, recipeId: id });
  const removeTo = await userEmail(rec.cook_id as string);
  if (removeTo) await sendEmail({ to: removeTo, subject: 'Your Sizzle post was removed', html: emails.removed((rec.title as string) ?? null, reason) });
  await logModeration({ adminId, action: 'remove', targetUserId: rec.cook_id as string, targetRecipeId: id, detail: reason });
  return c.json({ ok: true });
});

/** POST /admin/recipes/:id/restore — republish a removed post; notify the owner. */
admin.post('/recipes/:id/restore', async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const adminId = c.get('userId')!;
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, title').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');

  await supabaseAdmin
    .from('recipes')
    .update({ status: 'published', removal_reason: null, removed_at: null, auto_hidden: false, appeal_status: 'none', appeal_text: null, appealed_at: null })
    .eq('id', id);
  await notify({ userId: rec.cook_id as string, type: 'restored', actorId: adminId, recipeId: id });
  const restoreTo = await userEmail(rec.cook_id as string);
  if (restoreTo) await sendEmail({ to: restoreTo, subject: 'Your Sizzle post was restored', html: emails.restored((rec.title as string) ?? null) });
  await logModeration({ adminId, action: 'restore', targetUserId: rec.cook_id as string, targetRecipeId: id });
  return c.json({ ok: true });
});

/** POST /admin/recipes/:id/deny-appeal — keep the post removed, mark the appeal denied. */
admin.post('/recipes/:id/deny-appeal', async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  await supabaseAdmin.from('recipes').update({ appeal_status: 'denied' }).eq('id', id);
  await logModeration({ adminId: c.get('userId'), action: 'deny_appeal', targetRecipeId: id });
  return c.json({ ok: true });
});

/** GET /admin/appeals — pending appeals of removed posts. */
admin.get('/appeals', async (c) => {
  const { data: recs, error } = await supabaseAdmin
    .from('recipes')
    .select('id, title, cook_id, removal_reason, appeal_text, appealed_at')
    .eq('appeal_status', 'pending')
    .order('appealed_at', { ascending: false })
    .limit(200);
  if (error) throw dbFail(error.message);
  const list = recs ?? [];
  if (list.length === 0) return c.json<AdminAppealDTO[]>([]);
  const cookIds = [...new Set(list.map((r) => r.cook_id as string))];
  const { data: cooks } = await supabaseAdmin.from('profiles').select('id, display_name').in('id', cookIds);
  const cookMap = new Map((cooks ?? []).map((p) => [p.id as string, p.display_name as string]));
  const dto: AdminAppealDTO[] = list.map((r) => ({
    recipeId: r.id as string,
    recipeTitle: r.title as string,
    cookId: r.cook_id as string,
    cookName: cookMap.get(r.cook_id as string) ?? 'cook',
    removalReason: (r.removal_reason as string) ?? null,
    appealText: (r.appeal_text as string) ?? null,
    appealedAt: r.appealed_at as string,
    time: relativeTime(new Date(r.appealed_at as string)),
  }));
  return c.json(dto);
});

/** GET /admin/users?q=&filter=flagged|banned|all */
admin.get('/users', async (c) => {
  // Strip ilike wildcards (% _) AND PostgREST .or() metacharacters (, . ( ) * : \)
  // so the search term can't inject extra filter clauses into the predicate.
  const q = (c.req.query('q') ?? '').trim().toLowerCase().replace(/[%_,.()*:\\]/g, '');
  const filter = c.req.query('filter') ?? 'all';

  let query = supabaseAdmin.from('profiles').select('*').order('follower_count', { ascending: false }).limit(100);
  if (q) query = query.or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`);
  if (filter === 'banned') query = query.eq('banned', true);
  const { data: profiles, error } = await query;
  if (error) throw dbFail(error.message);
  const list = (profiles ?? []) as ProfileRow[];

  const [byCook, removed] = await Promise.all([reportsByCook(), removedByCook()]);
  let dto: AdminUserDTO[] = list.map((p) => ({
    id: p.id,
    name: p.display_name,
    handle: p.handle,
    init: initialsOf(p.display_name || p.handle),
    avatarColor: p.avatar_color,
    avatarUrl: p.avatar_url,
    followerCount: p.follower_count,
    verifiedTier: p.verified_tier,
    role: p.role,
    banned: p.banned,
    reportCount: byCook.get(p.id) ?? 0,
    flagged: (byCook.get(p.id) ?? 0) > FLAG_THRESHOLD,
    removedCount: removed.get(p.id) ?? 0,
    repeatOffender: (removed.get(p.id) ?? 0) >= REPEAT_OFFENDER_THRESHOLD,
    deleteAt: p.delete_at ?? null,
    banReason: p.banned_reason ?? null,
    banAppealStatus: p.ban_appeal_status ?? 'none',
    banAppealText: p.ban_appeal_text ?? null,
    boost: p.boost ?? 0,
  }));
  if (filter === 'flagged') dto = dto.filter((u) => u.flagged || u.repeatOffender).sort((a, b) => (b.reportCount + b.removedCount * 50) - (a.reportCount + a.removedCount * 50));
  return c.json(dto);
});

/** GET /admin/log — recent moderation actions (audit trail). */
admin.get('/log', async (c) => {
  const { data: rows, error } = await supabaseAdmin
    .from('moderation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw dbFail(error.message);
  const list = rows ?? [];
  if (list.length === 0) return c.json<AdminLogDTO[]>([]);

  const userIds = [...new Set(list.flatMap((r) => [r.admin_id, r.target_user_id]).filter(Boolean) as string[])];
  const recipeIds = [...new Set(list.map((r) => r.target_recipe_id).filter(Boolean) as string[])];
  const [{ data: users }, { data: recs }] = await Promise.all([
    userIds.length ? supabaseAdmin.from('profiles').select('id, display_name').in('id', userIds) : Promise.resolve({ data: [] }),
    recipeIds.length ? supabaseAdmin.from('recipes').select('id, title').in('id', recipeIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((users ?? []).map((u) => [u.id as string, u.display_name as string]));
  const titleOf = new Map((recs ?? []).map((r) => [r.id as string, r.title as string]));

  const dto: AdminLogDTO[] = list.map((r) => ({
    id: r.id as string,
    action: r.action as string,
    actorName: r.admin_id ? nameOf.get(r.admin_id as string) ?? 'admin' : 'System',
    targetName: r.target_user_id ? nameOf.get(r.target_user_id as string) ?? null : null,
    targetRecipeTitle: r.target_recipe_id ? titleOf.get(r.target_recipe_id as string) ?? null : null,
    detail: (r.detail as string) ?? null,
    createdAt: r.created_at as string,
    time: relativeTime(new Date(r.created_at as string)),
  }));
  return c.json(dto);
});

const verifySchema = z.object({ tier: z.enum(['blue', 'gold']).nullable() });

/** POST /admin/users/:id/verify */
admin.post('/users/:id/verify', async (c) => {
  const id = assertUuid(c.req.param('id'), 'user');
  const body = verifySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid tier');
  const { error } = await supabaseAdmin.from('profiles').update({ verified_tier: body.data.tier }).eq('id', id);
  if (error) throw dbFail(error.message);
  await logModeration({ adminId: c.get('userId'), action: 'verify', targetUserId: id, detail: body.data.tier ?? 'none' });
  return c.json({ ok: true });
});

const boostSchema = z.object({ boost: z.number().min(0).max(3) });

/** POST /admin/users/:id/boost — set a creator's For You ranking lift (0 = none). */
admin.post('/users/:id/boost', async (c) => {
  const id = assertUuid(c.req.param('id'), 'user');
  const body = boostSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid boost');
  const { error } = await supabaseAdmin.from('profiles').update({ boost: body.data.boost }).eq('id', id);
  if (error) throw dbFail(error.message);
  await logModeration({ adminId: c.get('userId'), action: 'boost', targetUserId: id, detail: String(body.data.boost) });
  return c.json({ ok: true });
});

const banSchema = z.object({ banned: z.boolean(), reason: z.string().trim().max(300).optional() });

/** POST /admin/users/:id/ban — ban (start the 45-day wipe timer) or unban; notify. */
admin.post('/users/:id/ban', async (c) => {
  const id = assertUuid(c.req.param('id'), 'user');
  const adminId = c.get('userId')!;
  if (id === adminId) throw badRequest('You cannot ban yourself');
  const body = banSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid request');

  if (body.data.banned) {
    const now = Date.now();
    await supabaseAdmin
      .from('profiles')
      .update({
        banned: true,
        banned_at: new Date(now).toISOString(),
        banned_reason: body.data.reason ?? 'Violated community guidelines',
        delete_at: new Date(now + BAN_DELETE_DAYS * 86_400_000).toISOString(),
        ban_appeal_status: 'none',
        ban_appeal_text: null,
        ban_appeal_at: null,
      })
      .eq('id', id);
    await notify({ userId: id, type: 'banned', actorId: adminId });
    const reason = body.data.reason ?? 'Violated community guidelines';
    const to = await userEmail(id);
    if (to) await sendEmail({ to, subject: 'Your Sizzle account was suspended', html: emails.banned(reason, new Date(now + BAN_DELETE_DAYS * 86_400_000).toISOString()) });
    await logModeration({ adminId, action: 'ban', targetUserId: id, detail: reason });
  } else {
    await supabaseAdmin
      .from('profiles')
      .update({ banned: false, banned_at: null, banned_reason: null, delete_at: null, ban_appeal_status: 'none', ban_appeal_text: null, ban_appeal_at: null })
      .eq('id', id);
    await notify({ userId: id, type: 'restored', actorId: adminId });
    await logModeration({ adminId, action: 'unban', targetUserId: id });
  }
  return c.json({ ok: true });
});

/** POST /admin/purge — manually run the expired-ban wipe (also runs daily via pg_cron). */
admin.post('/purge', async (c) => {
  const { data, error } = await supabaseAdmin.rpc('purge_expired_accounts');
  if (error) throw dbFail(error.message);
  return c.json({ purged: (data as number) ?? 0 });
});

/** GET /admin/support-requests — privacy/support requests from the contact form. */
admin.get('/support-requests', async (c) => {
  const { data, error } = await supabaseAdmin
    .from('support_requests')
    .select('id, name, email, kind, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw dbFail(error.message);
  const rows: SupportRequestDTO[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    kind: r.kind as string,
    message: r.message as string,
    status: r.status as string,
    createdAt: relativeTime(new Date(r.created_at as string)),
  }));
  return c.json(rows);
});

/** POST /admin/support-requests/:id/resolve — mark a request handled. */
admin.post('/support-requests/:id/resolve', async (c) => {
  const id = c.req.param('id');
  assertUuid(id);
  const { error } = await supabaseAdmin.from('support_requests').update({ status: 'resolved' }).eq('id', id);
  if (error) throw dbFail(error.message);
  return c.json({ ok: true });
});
