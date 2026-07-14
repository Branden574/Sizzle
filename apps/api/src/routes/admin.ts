import { Hono } from 'hono';
import { z } from 'zod';
import type { AdminAppealDTO, AdminContentReportDTO, AdminLogDTO, AdminReportGroupDTO, AdminStats, AdminUserDTO, ReportCategory, SupportRequestDTO } from '@sizzle/shared';
import { requireAdmin, requireAuth, requireNotBanned } from '../middleware/auth';
import { requireAdminUnlock } from '../middleware/adminUnlock';
import { rateLimit } from '../middleware/rateLimit';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound, unauthorized } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { initialsOf, relativeTime } from '../lib/format';
import { notify, systemNotify } from '../services/notify';
import { hashPassphrase, verifyPassphrase, newUnlockToken, MIN_PASSPHRASE_LEN } from '../services/adminAuth';
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
// Second factor: every admin route past this requires an unlock token, EXCEPT
// the bootstrap/unlock/status endpoints (exempted inside the middleware). Fails
// closed until a passphrase is set. See middleware/adminUnlock.ts.
admin.use('*', requireAdminUnlock);

/** Exponential lockout after repeated failed passphrase attempts (checked before
 *  scrypt so a wrong guess can't be used as a CPU-exhaustion oracle). First 4
 *  attempts are free (rate-limited only); then 30s, 60s, 120s… capped at 1h. */
function lockUntil(failCount: number): string | null {
  if (failCount < 5) return null;
  const secs = Math.min(3600, 2 ** (failCount - 5) * 30);
  return new Date(Date.now() + secs * 1000).toISOString();
}
const now = () => new Date().toISOString();

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

/** GET /admin/content-reports — flagged comments + profiles (grouped by target). */
admin.get('/content-reports', async (c) => {
  const { data: reps } = await supabaseAdmin
    .from('reports')
    .select('target_type, target_id, category, created_at')
    .in('target_type', ['comment', 'profile'])
    .eq('status', 'open');
  const groups = new Map<string, { targetType: 'comment' | 'profile'; targetId: string; count: number; categories: Record<string, number>; last: string }>();
  for (const r of reps ?? []) {
    const key = `${r.target_type}:${r.target_id}`;
    const g = groups.get(key) ?? { targetType: r.target_type as 'comment' | 'profile', targetId: r.target_id as string, count: 0, categories: {}, last: r.created_at as string };
    g.count += 1;
    g.categories[r.category as string] = (g.categories[r.category as string] ?? 0) + 1;
    if ((r.created_at as string) > g.last) g.last = r.created_at as string;
    groups.set(key, g);
  }
  const list = [...groups.values()];
  if (list.length === 0) return c.json<AdminContentReportDTO[]>([]);

  const commentIds = list.filter((g) => g.targetType === 'comment').map((g) => g.targetId);
  const profileIds = list.filter((g) => g.targetType === 'profile').map((g) => g.targetId);
  const [cRes, pRes] = await Promise.all([
    commentIds.length ? supabaseAdmin.from('comments').select('id, text, author_id').in('id', commentIds) : Promise.resolve({ data: [] as { id: string; text: string; author_id: string }[] }),
    profileIds.length ? supabaseAdmin.from('profiles').select('id, display_name, handle').in('id', profileIds) : Promise.resolve({ data: [] as { id: string; display_name: string; handle: string }[] }),
  ]);
  const cMap = new Map((cRes.data ?? []).map((r) => [r.id as string, r]));
  const pMap = new Map((pRes.data ?? []).map((r) => [r.id as string, r]));
  const authorIds = [...new Set((cRes.data ?? []).map((r) => r.author_id as string))];
  const { data: authors } = authorIds.length ? await supabaseAdmin.from('profiles').select('id, handle').in('id', authorIds) : { data: [] as { id: string; handle: string }[] };
  const authorMap = new Map((authors ?? []).map((a) => [a.id as string, a.handle as string]));

  const dto: AdminContentReportDTO[] = list
    .map((g): AdminContentReportDTO => {
      if (g.targetType === 'comment') {
        const cm = cMap.get(g.targetId);
        return { targetType: 'comment', targetId: g.targetId, preview: cm?.text ?? '(deleted comment)', subLabel: cm ? `by @${authorMap.get(cm.author_id as string) ?? 'user'}` : '', reportCount: g.count, categories: g.categories as AdminContentReportDTO['categories'], lastReportedAt: g.last, time: relativeTime(new Date(g.last)) };
      }
      const p = pMap.get(g.targetId);
      return { targetType: 'profile', targetId: g.targetId, preview: p ? `@${p.handle}` : '(deleted profile)', subLabel: (p?.display_name as string) ?? '', reportCount: g.count, categories: g.categories as AdminContentReportDTO['categories'], lastReportedAt: g.last, time: relativeTime(new Date(g.last)) };
    })
    .sort((a, b) => b.reportCount - a.reportCount);
  return c.json(dto);
});

const contentResolveSchema = z.object({
  targetType: z.enum(['comment', 'profile']),
  targetId: z.string().uuid(),
  action: z.enum(['dismiss', 'hide']),
});

/** POST /admin/content-reports/resolve — dismiss (keep) or hide (comments) a flagged target. */
admin.post('/content-reports/resolve', async (c) => {
  const adminId = c.get('userId')!;
  const parsed = contentResolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid');
  const { targetType, targetId, action } = parsed.data;
  await supabaseAdmin
    .from('reports')
    .update({ status: action === 'dismiss' ? 'dismissed' : 'resolved', resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'open');
  if (action === 'hide' && targetType === 'comment') {
    await supabaseAdmin.from('comments').update({ hidden: true, hidden_at: new Date().toISOString(), hidden_by: adminId }).eq('id', targetId);
  }
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
    creatorStatus: ((p as { creator_status?: string }).creator_status as AdminUserDTO['creatorStatus']) ?? 'regular',
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

const creatorGrantSchema = z.object({ status: z.enum(['regular', 'eligible', 'active', 'suspended']) });

/** POST /admin/users/:id/creator — manually set a user's Creator tier (admin
 *  override: bypasses the follower/view + payout requirements). Granting `active`
 *  unlocks the Creator badge/tools + notifies; the user still needs their OWN
 *  payout setup before money can move. */
admin.post('/users/:id/creator', async (c) => {
  const id = assertUuid(c.req.param('id'), 'user');
  const body = creatorGrantSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid creator status');
  const { data: prev } = await supabaseAdmin.from('profiles').select('creator_status, creator_since').eq('id', id).maybeSingle();
  if (!prev) throw notFound('User not found');
  const patch: Record<string, unknown> = { creator_status: body.data.status };
  if (body.data.status === 'active' && !prev.creator_since) patch.creator_since = now();
  const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', id);
  if (error) throw dbFail(error.message);
  // Fire the "you're a Creator" ping only on a real transition into active.
  if (body.data.status === 'active' && prev.creator_status !== 'active') await systemNotify({ userId: id, type: 'creator_activated' }).catch(() => {});
  await logModeration({
    adminId: c.get('userId'),
    action: body.data.status === 'active' ? 'grant_creator' : body.data.status === 'suspended' ? 'suspend_creator' : 'set_creator',
    targetUserId: id,
    detail: body.data.status,
  });
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
  // Unresolved first (status 'open'/'in_progress' sort before 'resolved'), newest
  // within each, and a wider window so spam can't bury a genuine request.
  const { data, error } = await supabaseAdmin
    .from('support_requests')
    .select('id, name, email, kind, message, status, created_at, user_id')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw dbFail(error.message);
  const list = data ?? [];
  // In-app tickets carry a user_id (public contact-form rows don't). Batch-fetch
  // the reporters' handles so the admin view can link back to their profile.
  const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean) as string[])];
  const { data: reporters } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, handle').in('id', userIds)
    : { data: [] };
  const handleMap = new Map((reporters ?? []).map((p) => [p.id as string, p.handle as string]));
  const rows: SupportRequestDTO[] = list.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    kind: r.kind as string,
    message: r.message as string,
    status: r.status as string,
    createdAt: relativeTime(new Date(r.created_at as string)),
    userId: (r.user_id as string) ?? null,
    userHandle: r.user_id ? handleMap.get(r.user_id as string) ?? null : null,
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

/* ─────────────────────── admin passphrase (second factor) ───────────────────────
 * These three routes are EXEMPT from requireAdminUnlock (they're how you set/verify
 * the passphrase) but still sit behind requireAuth + requireNotBanned + requireAdmin.
 */

/** GET /admin/security-status — whether this admin has set a passphrase yet
 *  (drives the client's "set one" vs "unlock" screen). Leaks no secret. */
admin.get('/security-status', async (c) => {
  const userId = c.get('userId')!;
  const { data } = await supabaseAdmin.from('admin_credentials').select('user_id').eq('user_id', userId).maybeSingle();
  return c.json({ passphraseSet: !!data });
});

const passphraseSchema = z.object({
  current: z.string().max(200).optional(),
  next: z.string().min(MIN_PASSPHRASE_LEN, `Passphrase must be at least ${MIN_PASSPHRASE_LEN} characters`).max(200),
});

/** POST /admin/passphrase — set (bootstrap) or change the admin passphrase.
 *  Changing requires the current one (rate-limited, lockout-aware). Rotating
 *  revokes every outstanding unlock session (forces re-unlock everywhere). */
admin.post('/passphrase', rateLimit({ windowMs: 60_000, max: 10, name: 'admin-passphrase' }), async (c) => {
  const userId = c.get('userId')!;
  const body = passphraseSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest(body.error.issues[0]?.message ?? 'Invalid passphrase');
  const { data: existing } = await supabaseAdmin.from('admin_credentials').select('pass_hash, fail_count, locked_until').eq('user_id', userId).maybeSingle();
  if (existing) {
    // Changing: verify the current passphrase (respect the lockout; generic errors).
    if (existing.locked_until && new Date(existing.locked_until as string).getTime() > Date.now()) throw unauthorized('Too many attempts — try again later');
    const ok = body.data.current ? await verifyPassphrase(body.data.current, existing.pass_hash as string) : false;
    if (!ok) {
      const n = ((existing.fail_count as number) ?? 0) + 1;
      await supabaseAdmin.from('admin_credentials').update({ fail_count: n, locked_until: lockUntil(n) }).eq('user_id', userId);
      throw unauthorized('Incorrect current passphrase');
    }
  }
  const pass_hash = await hashPassphrase(body.data.next);
  await supabaseAdmin.from('admin_credentials').upsert({ user_id: userId, pass_hash, fail_count: 0, locked_until: null, updated_at: now() }, { onConflict: 'user_id' });
  // Rotating the factor revokes all live unlock sessions.
  await supabaseAdmin.from('admin_sessions').delete().eq('user_id', userId);
  await logModeration({ adminId: userId, action: existing ? 'admin_passphrase_change' : 'admin_passphrase_set' });
  return c.json({ ok: true });
});

const unlockSchema = z.object({ passphrase: z.string().min(1).max(200) });

/** POST /admin/unlock — the ONLY place scrypt runs. Verifies the passphrase and,
 *  on success, mints a 20-min unlock token (only its SHA-256 is stored). Lockout
 *  is checked before scrypt so failures can't be used as a CPU oracle. */
admin.post('/unlock', rateLimit({ windowMs: 60_000, max: 10, name: 'admin-unlock' }), async (c) => {
  const userId = c.get('userId')!;
  const body = unlockSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Passphrase required');
  const { data: cred } = await supabaseAdmin.from('admin_credentials').select('pass_hash, fail_count, locked_until').eq('user_id', userId).maybeSingle();
  if (!cred) throw badRequest('No admin passphrase set yet — create one first');
  // Generic 401 for locked/wrong so lock state isn't an oracle.
  if (cred.locked_until && new Date(cred.locked_until as string).getTime() > Date.now()) throw unauthorized('Incorrect passphrase');
  const ok = await verifyPassphrase(body.data.passphrase, cred.pass_hash as string);
  if (!ok) {
    const n = ((cred.fail_count as number) ?? 0) + 1;
    await supabaseAdmin.from('admin_credentials').update({ fail_count: n, locked_until: lockUntil(n) }).eq('user_id', userId);
    throw unauthorized('Incorrect passphrase');
  }
  const { token, tokenSha256 } = newUnlockToken();
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  await supabaseAdmin.from('admin_credentials').update({ fail_count: 0, locked_until: null }).eq('user_id', userId);
  await supabaseAdmin.from('admin_sessions').delete().lt('expires_at', now()); // opportunistic GC
  const { error } = await supabaseAdmin.from('admin_sessions').insert({ user_id: userId, token_sha256: tokenSha256, expires_at: expiresAt });
  if (error) throw dbFail(error.message);
  return c.json({ token, expiresAt });
});
