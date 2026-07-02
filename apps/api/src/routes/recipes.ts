import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { CommentDTO, RecipeDetail } from '@sizzle/shared';
import { optionalAuth, requireAuth, requireNotBanned } from '../middleware/auth';
import { env } from '../env';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, forbidden, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, commentDTO, loadBlockedIds, type CommentRow, type ProfileRow, type RecipeRow } from '../mappers';
import { rateLimit } from '../middleware/rateLimit';
import { moderate } from '../services/moderation';
import { parseHashtags } from '../services/hashtags';
import { logModeration } from '../services/audit';
import { notify } from '../services/notify';
import type { AppEnv } from '../types';

export const recipes = new Hono<AppEnv>();

async function getRecipeDetail(viewerId: string | undefined, recipeId: string): Promise<RecipeDetail | null> {
  assertUuid(recipeId, 'recipe');
  const { data: row, error } = await supabaseAdmin.from('recipes').select('*').eq('id', recipeId).maybeSingle();
  if (error) throw dbFail(error.message);
  if (!row) return null;
  // Drafts / removed / auto-hidden recipes are visible only to their owner — and
  // to admins (so the moderation "view video" action works). Resolve admin once
  // and pass it to buildCards, which otherwise drops the card and 404s the route.
  const restricted = row.status !== 'published' || row.auto_hidden;
  let viewerIsAdmin = false;
  if (restricted && viewerId && row.cook_id !== viewerId) {
    const { data: viewer } = await supabaseAdmin.from('profiles').select('role').eq('id', viewerId).maybeSingle();
    viewerIsAdmin = viewer?.role === 'admin';
  }
  if (row.status !== 'published' && row.cook_id !== viewerId && !viewerIsAdmin) return null;

  const [card] = await buildCards(supabaseAdmin, viewerId, [row as RecipeRow], viewerIsAdmin);
  if (!card) return null;

  const [{ data: ings }, { data: steps }] = await Promise.all([
    supabaseAdmin.from('recipe_ingredients').select('text,position').eq('recipe_id', recipeId).order('position'),
    supabaseAdmin.from('recipe_steps').select('text,position').eq('recipe_id', recipeId).order('position'),
  ]);

  return {
    ...card,
    caption: (row.caption as string | null) ?? null,
    ingredients: (ings ?? []).map((i) => i.text as string),
    steps: (steps ?? []).map((s) => s.text as string),
  };
}

/** GET /recipes/:id */
recipes.get('/:id', optionalAuth, async (c) => {
  const detail = await getRecipeDetail(c.get('userId'), c.req.param('id'));
  if (!detail) throw notFound('Recipe not found');
  return c.json(detail);
});

const createSchema = z.object({
  videoAssetId: z.string().uuid().optional(),
  images: z.array(z.string().url()).min(1).max(8).optional(),
  title: z.string().min(1).max(120),
  cuisine: z.string().max(40).default(''),
  timeMinutes: z.number().int().min(0).max(6000),
  servings: z.number().int().min(1).max(99),
  level: z.string().max(20).default('Easy'),
  ingredients: z.array(z.string().min(1)).max(40).default([]),
  steps: z.array(z.string().min(1)).max(40).default([]),
  caption: z.string().max(600).optional(),
  postType: z.enum(['recipe', 'review']).default('recipe'),
  rating: z.number().int().min(1).max(5).optional(),
}).refine((v) => v.postType === 'review' || v.rating === undefined, {
  message: 'rating is only allowed on a review',
  path: ['rating'],
}).refine((v) => !!v.videoAssetId !== !!(v.images && v.images.length), {
  message: 'Provide either a video or photos, not both',
  path: ['videoAssetId'],
});

const POSTER_GRADIENTS = [
  'linear-gradient(165deg,#2a160e,#b5471f)',
  'linear-gradient(165deg,#3a1f06,#f4a52c)',
  'linear-gradient(165deg,#1a1006,#c23a1a)',
  'linear-gradient(165deg,#3a1420,#d96a4a)',
  'linear-gradient(165deg,#2c2410,#b8922e)',
];

/** POST /recipes — create recipe metadata after a video upload is registered. */
recipes.post('/', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 20, name: 'recipe-create' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid recipe payload', parsed.error.flatten());
  const input = parsed.data;

  const mod = await moderate(input.title, input.cuisine, input.ingredients, input.steps, input.caption ?? '');
  if (!mod.ok) throw badRequest(mod.reason!);

  // Media is either a video asset you own, or photos you uploaded.
  if (input.videoAssetId) {
    const { data: asset } = await supabaseAdmin
      .from('video_assets')
      .select('id, owner_id')
      .eq('id', input.videoAssetId)
      .maybeSingle();
    if (!asset || asset.owner_id !== userId) throw badRequest('Unknown or unowned video asset');
  } else {
    // Photo post: each image must live in OUR public storage under the user's own
    // folder. Anchor to the project host + a prefix (startsWith, not includes) —
    // a substring check let any valid URL that merely contained the path through,
    // so arbitrary external image URLs were accepted and served to every viewer.
    const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
    const ok = (input.images ?? []).every((u) => u.startsWith(ownFolder));
    if (!ok) throw badRequest('Invalid image upload');
  }

  const bg = POSTER_GRADIENTS[Math.abs(hash(input.title)) % POSTER_GRADIENTS.length]!;
  const tags = parseHashtags(input.caption, input.title);

  const { data: recipe, error } = await supabaseAdmin
    .from('recipes')
    .insert({
      cook_id: userId,
      title: input.title,
      cuisine: input.cuisine,
      time_minutes: input.timeMinutes,
      servings: input.servings,
      level: input.level,
      bg,
      video_asset_id: input.videoAssetId ?? null,
      image_urls: input.images ?? [],
      caption: input.caption ?? null,
      tags,
      post_type: input.postType,
      rating: input.postType === 'review' ? (input.rating ?? null) : null,
      status: 'published',
    })
    .select('id')
    .single();
  if (error || !recipe) throw dbFail(error?.message ?? 'Failed to create recipe');

  if (input.ingredients.length) {
    const rows = input.ingredients.map((text, i) => ({ recipe_id: recipe.id, position: i, text }));
    const { error: e } = await supabaseAdmin.from('recipe_ingredients').insert(rows);
    if (e) throw dbFail(e.message);
  }
  if (input.steps.length) {
    const rows = input.steps.map((text, i) => ({ recipe_id: recipe.id, position: i, text }));
    const { error: e } = await supabaseAdmin.from('recipe_steps').insert(rows);
    if (e) throw dbFail(e.message);
  }

  // Publishing makes you a cook.
  await supabaseAdmin.from('profiles').update({ is_cook: true }).eq('id', userId);

  const detail = await getRecipeDetail(userId, recipe.id);
  return c.json(detail, 201);
});

/**
 * Toggle a like/dislike (mutually exclusive) atomically in the DB (serialized
 * per user+recipe). Returns the resulting reaction kind (or null when off).
 */
async function setReaction(recipeId: string, userId: string, target: 'like' | 'dislike'): Promise<'like' | 'dislike' | null> {
  const { data, error } = await supabaseAdmin.rpc('toggle_reaction', { p_user: userId, p_recipe: recipeId, p_kind: target });
  if (error) throw dbFail(error.message);
  return (data ?? null) as 'like' | 'dislike' | null;
}

async function reactionResponse(c: Context<AppEnv>, recipeId: string, userId: string) {
  const [{ data: r }, { data: reaction }] = await Promise.all([
    supabaseAdmin.from('recipes').select('like_count,dislike_count').eq('id', recipeId).maybeSingle(),
    supabaseAdmin.from('reactions').select('kind').eq('user_id', userId).eq('recipe_id', recipeId).maybeSingle(),
  ]);
  return c.json({
    liked: reaction?.kind === 'like',
    disliked: reaction?.kind === 'dislike',
    counts: { likes: r?.like_count ?? 0, dislikes: r?.dislike_count ?? 0 },
  });
}

async function recipeCookId(recipeId: string): Promise<string> {
  assertUuid(recipeId, 'recipe');
  const { data } = await supabaseAdmin.from('recipes').select('cook_id').eq('id', recipeId).maybeSingle();
  if (!data) throw notFound('Recipe not found');
  return data.cook_id as string;
}

/**
 * Resolve a recipe's owner, but 404 if the viewer and owner are in a block
 * relationship (either direction). Blocks forbid the blocked user from
 * interacting with the blocker's content (liking, reposting, viewing, etc.).
 */
async function recipeCookIdUnblocked(recipeId: string, userId: string): Promise<string> {
  const cookId = await recipeCookId(recipeId);
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(cookId)) throw notFound('Recipe not found');
  return cookId;
}

recipes.post('/:id/like', requireAuth, requireNotBanned, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const cookId = await recipeCookIdUnblocked(id, userId);
  const result = await setReaction(id, userId, 'like');
  if (result === 'like') await notify({ userId: cookId, type: 'like', actorId: userId, recipeId: id });
  return reactionResponse(c, id, userId);
});

recipes.post('/:id/dislike', requireAuth, requireNotBanned, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookIdUnblocked(id, userId);
  await setReaction(id, userId, 'dislike');
  return reactionResponse(c, id, userId);
});

/** POST /recipes/:id/save — toggle saved. */
recipes.post('/:id/save', requireAuth, requireNotBanned, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookId(id);

  const { data: existing } = await supabaseAdmin
    .from('saves')
    .select('recipe_id')
    .eq('user_id', userId)
    .eq('recipe_id', id)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from('saves').delete().eq('user_id', userId).eq('recipe_id', id);
    await supabaseAdmin.rpc('adjust_save_count', { rid: id, delta: -1 });
    return c.json({ saved: false });
  }
  await supabaseAdmin.from('saves').insert({ user_id: userId, recipe_id: id });
  await supabaseAdmin.rpc('adjust_save_count', { rid: id, delta: 1 });
  return c.json({ saved: true });
});

/** POST /recipes/:id/download — mark for offline. */
recipes.post('/:id/download', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookId(id);
  await supabaseAdmin.from('downloads').upsert({ user_id: userId, recipe_id: id }, { onConflict: 'user_id,recipe_id' });
  return c.json({ downloaded: true });
});

/** DELETE /recipes/:id/download — remove offline copy. */
recipes.delete('/:id/download', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await supabaseAdmin.from('downloads').delete().eq('user_id', userId).eq('recipe_id', id);
  return c.json({ downloaded: false });
});

/** POST /recipes/:id/share — bump the share counter when a link is shared/copied. */
recipes.post('/:id/share', requireAuth, rateLimit({ windowMs: 60_000, max: 60, name: 'share' }), async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  await supabaseAdmin.rpc('increment_share', { rid: id });
  return c.json({ ok: true });
});

const controlsSchema = z.object({
  likesEnabled: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  countsVisible: z.boolean().optional(),
});

/** PATCH /recipes/:id/controls — owner toggles likes/comments/count visibility (persisted, enforced for all viewers). */
recipes.patch('/:id/controls', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const id = assertUuid(c.req.param('id'), 'recipe');
  const parsed = controlsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid post controls');
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) throw forbidden('You can only change controls on your own posts');
  const patch: Record<string, boolean> = {};
  if (parsed.data.likesEnabled !== undefined) patch.likes_enabled = parsed.data.likesEnabled;
  if (parsed.data.commentsEnabled !== undefined) patch.comments_enabled = parsed.data.commentsEnabled;
  if (parsed.data.countsVisible !== undefined) patch.counts_visible = parsed.data.countsVisible;
  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from('recipes').update(patch).eq('id', id);
    if (error) throw dbFail(error.message);
  }
  return c.json({ ok: true });
});

const viewSchema = z.object({
  dwellMs: z.number().int().min(0).max(3_600_000).default(0),
  completed: z.boolean().default(false),
  skipped: z.boolean().default(false),
});

/** POST /recipes/:id/view — log a watch event (powers ranking). */
recipes.post('/:id/view', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 90, name: 'view' }), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const body = viewSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid view payload', body.error.flatten());
  await recipeCookIdUnblocked(id, userId);
  await supabaseAdmin.from('recipe_views').insert({
    user_id: userId,
    recipe_id: id,
    dwell_ms: body.data.dwellMs,
    completed: body.data.completed,
    skipped: body.data.skipped,
  });
  return c.json({ ok: true });
});

const commentSchema = z.object({
  text: z.string().trim().min(1).max(600),
  parentId: z.string().uuid().optional(),
});

/** GET /recipes/:id/comments — top-level comments (newest first) with nested replies. */
recipes.get('/:id/comments', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const viewerId = c.get('userId');
  // Only expose comments on recipes the viewer can see.
  const { data: rec } = await supabaseAdmin.from('recipes').select('status, cook_id').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  // Owner or admin — needed both for the removed-post gate (so moderators can
  // review comments on a removed post) and for hidden-comment visibility below.
  let viewerIsModerator = !!viewerId && viewerId === rec.cook_id;
  if (viewerId && !viewerIsModerator) {
    const { data: vp } = await supabaseAdmin.from('profiles').select('role').eq('id', viewerId).maybeSingle();
    viewerIsModerator = vp?.role === 'admin';
  }
  if (rec.status !== 'published' && rec.cook_id !== viewerId && !viewerIsModerator) throw notFound('Recipe not found');

  const { data: rows, error } = await supabaseAdmin
    .from('comments')
    .select('*')
    .eq('recipe_id', id)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw dbFail(error.message);
  const list = (rows ?? []) as CommentRow[];
  if (list.length === 0) return c.json<CommentDTO[]>([]);

  const authorIds = [...new Set(list.map((r) => r.author_id))];
  const { data: authors } = await supabaseAdmin.from('profiles').select('*').in('id', authorIds);
  const authorMap = new Map<string, ProfileRow>((authors ?? []).map((a) => [a.id as string, a as ProfileRow]));

  // Which of these comments has the viewer liked?
  const likedSet = new Set<string>();
  if (viewerId) {
    const { data: likes } = await supabaseAdmin
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', viewerId)
      .in('comment_id', list.map((r) => r.id));
    for (const l of likes ?? []) likedSet.add(l.comment_id as string);
  }

  // Comment moderation visibility: a hidden comment is shown only to the post
  // owner / an admin (flagged so they can unhide, `viewerIsModerator` above) and
  // to its own author (shadow — it looks normal, so they don't just re-post it).
  // Comments from blocked users (either direction) never reach the viewer.
  const blocked = await loadBlockedIds(supabaseAdmin, viewerId);
  const canSee = (r: CommentRow) => (!r.hidden || viewerIsModerator || r.author_id === viewerId) && !blocked.has(r.author_id);
  const visible = list.filter(canSee);

  // `hidden` only ever reaches a moderator — coerce it off for everyone else so a
  // shadow-hidden comment can't reveal its state to its own author.
  const dto = (r: CommentRow) => ({ ...commentDTO(r, authorMap.get(r.author_id), likedSet), hidden: viewerIsModerator ? !!r.hidden : false });
  // Group replies under their parent. `visible` is newest-first; reverse each
  // group so replies read oldest-first under the parent (top-level stays newest).
  // A hidden parent that the viewer can't see drops out here, taking its thread
  // with it (orphaned replies are never attached to a top-level comment).
  const repliesByParent = new Map<string, CommentDTO[]>();
  for (const r of visible) {
    if (!r.parent_id) continue;
    const arr = repliesByParent.get(r.parent_id);
    if (arr) arr.push(dto(r));
    else repliesByParent.set(r.parent_id, [dto(r)]);
  }
  for (const arr of repliesByParent.values()) arr.reverse();

  const top = visible
    .filter((r) => !r.parent_id)
    .map((r) => ({ ...dto(r), replies: repliesByParent.get(r.id) ?? [] }));
  return c.json<CommentDTO[]>(top);
});

const hideSchema = z.object({ hidden: z.boolean() });

/**
 * POST /recipes/:id/comments/:commentId/hide {hidden} — the recipe owner (or an
 * admin) hides/unhides a comment on their own post (TikTok-style moderation).
 * Hidden comments are filtered from the public thread by GET /comments — the
 * author still sees their own (shadow-hide); the counter is left untouched
 * (hiding is moderation, not deletion).
 */
recipes.post('/:id/comments/:commentId/hide', requireAuth, requireNotBanned, async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const commentId = assertUuid(c.req.param('commentId'), 'comment');
  const userId = c.get('userId')!;
  const parsed = hideSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('hidden flag required');

  // Only the post owner or an admin can moderate comments.
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) {
    const { data: viewer } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (viewer?.role !== 'admin') throw forbidden('Only the post owner can hide comments');
  }

  const { data: comment } = await supabaseAdmin.from('comments').select('id, recipe_id').eq('id', commentId).maybeSingle();
  if (!comment || comment.recipe_id !== id) throw notFound('Comment not found');

  const { error } = await supabaseAdmin
    .from('comments')
    .update({
      hidden: parsed.data.hidden,
      hidden_at: parsed.data.hidden ? new Date().toISOString() : null,
      hidden_by: parsed.data.hidden ? userId : null,
    })
    .eq('id', commentId);
  if (error) throw dbFail(error.message);
  return c.json({ hidden: parsed.data.hidden });
});

/** POST /recipes/:id/comments — add a comment or a reply, bump counts, notify. */
recipes.post('/:id/comments', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 30, name: 'comment' }), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const parsed = commentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Comment text required');
  const mod = await moderate(parsed.data.text);
  if (!mod.ok) throw badRequest(mod.reason!);
  const cookId = await recipeCookId(id);

  // Can't comment on a post by someone you've blocked or who has blocked you.
  const blockedFromOwner = await loadBlockedIds(supabaseAdmin, userId);
  if (blockedFromOwner.has(cookId)) throw notFound('Recipe not found');

  // Enforce the creator's "commenting off" control server-side (owner exempt) so
  // it can't be bypassed by a crafted request even though the UI hides the field.
  if (cookId !== userId) {
    const { data: rc } = await supabaseAdmin.from('recipes').select('comments_enabled').eq('id', id).maybeSingle();
    if (rc && rc.comments_enabled === false) throw forbidden('Comments are turned off for this post');
  }

  // A reply must target a top-level comment on the same recipe.
  let parentId: string | null = null;
  let parentAuthor: string | null = null;
  if (parsed.data.parentId) {
    const { data: parent } = await supabaseAdmin
      .from('comments')
      .select('id, recipe_id, parent_id, author_id')
      .eq('id', parsed.data.parentId)
      .maybeSingle();
    if (!parent || parent.recipe_id !== id || parent.parent_id) throw badRequest('Invalid parent comment');
    // Can't reply to (and notify) someone in a block relationship with you.
    if (blockedFromOwner.has(parent.author_id as string)) throw badRequest('Invalid parent comment');
    parentId = parent.id as string;
    parentAuthor = parent.author_id as string;
  }

  const { data: row, error } = await supabaseAdmin
    .from('comments')
    .insert({ recipe_id: id, author_id: userId, text: parsed.data.text, parent_id: parentId })
    .select('*')
    .single();
  if (error || !row) throw dbFail(error?.message ?? 'Failed to add comment');

  await supabaseAdmin.rpc('adjust_comment_count', { rid: id, delta: 1 });
  if (parentId) {
    await supabaseAdmin.rpc('adjust_comment_reply_count', { cid: parentId, delta: 1 });
    // Notify the comment author of the reply (fall back to the cook for top-level).
    if (parentAuthor) await notify({ userId: parentAuthor, type: 'comment', actorId: userId, recipeId: id });
  } else {
    await notify({ userId: cookId, type: 'comment', actorId: userId, recipeId: id });
  }

  const { data: author } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();
  return c.json<CommentDTO>(commentDTO(row as CommentRow, (author ?? undefined) as ProfileRow | undefined), 201);
});

/** POST /recipes/:id/comments/:commentId/like — toggle a like on a comment. */
recipes.post('/:id/comments/:commentId/like', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 90, name: 'comment-like' }), async (c) => {
  const userId = c.get('userId')!;
  const commentId = assertUuid(c.req.param('commentId'), 'comment');

  const { data: liked, error } = await supabaseAdmin.rpc('toggle_comment_like', { p_user: userId, p_comment: commentId });
  if (error) throw dbFail(error.message);
  const { data: row } = await supabaseAdmin.from('comments').select('like_count').eq('id', commentId).maybeSingle();
  return c.json({ liked: !!liked, likes: row?.like_count ?? 0 });
});

/**
 * DELETE /recipes/:id/comments/:commentId — the comment's author, the recipe
 * owner, or an admin removes a comment. Replies (parent_id) and any likes
 * cascade via ON DELETE CASCADE, so the recipe's comment counter is corrected
 * by the full thread size (the comment + its replies).
 */
recipes.delete('/:id/comments/:commentId', requireAuth, requireNotBanned, async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const commentId = assertUuid(c.req.param('commentId'), 'comment');
  const userId = c.get('userId')!;

  const { data: comment } = await supabaseAdmin
    .from('comments')
    .select('id, recipe_id, author_id, parent_id')
    .eq('id', commentId)
    .maybeSingle();
  if (!comment || comment.recipe_id !== id) throw notFound('Comment not found');

  // Authorize: the comment's author, the recipe owner, or an admin.
  if (comment.author_id !== userId) {
    const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id').eq('id', id).maybeSingle();
    if (!rec) throw notFound('Recipe not found');
    if (rec.cook_id !== userId) {
      const { data: viewer } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
      if (viewer?.role !== 'admin') throw forbidden('You can only delete your own comments');
    }
  }

  // A top-level comment takes its replies with it (cascade) — count them so the
  // recipe's comment counter drops by the whole thread, not just one.
  let removed = 1;
  if (!comment.parent_id) {
    const { count } = await supabaseAdmin
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', commentId);
    removed += count ?? 0;
  }

  const { error } = await supabaseAdmin.from('comments').delete().eq('id', commentId);
  if (error) throw dbFail(error.message);

  await supabaseAdmin.rpc('adjust_comment_count', { rid: id, delta: -removed });
  // Deleting a reply also drops its parent's reply counter.
  if (comment.parent_id) await supabaseAdmin.rpc('adjust_comment_reply_count', { cid: comment.parent_id, delta: -1 });

  return c.json({ ok: true });
});

const reportSchema = z.object({
  category: z.enum(['nudity', 'harassment', 'violence', 'spam', 'other']),
  reason: z.string().trim().max(500).optional(),
});

/** Distinct reporters before a post is auto-hidden pending admin review. */
const AUTOHIDE_THRESHOLD = 20;
/** Dismissed-as-false reports before a user's reporting is throttled. */
const REPORTER_ABUSE_THRESHOLD = 5;

/** POST /recipes/:id/report — flag a recipe for moderation (one per user). */
recipes.post('/:id/report', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 15, name: 'report' }), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid report');
  await recipeCookId(id); // 404s on a non-existent recipe + validates the id

  // Reporter-abuse throttle: too many of this user's RECENT reports were
  // dismissed as false. A 30-day rolling window keeps this genuinely temporary
  // and lets old dismissals (incl. mass post-clears that weren't the reporter's
  // fault) age out, rather than permanently barring good-faith reporters.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: falseCount } = await supabaseAdmin
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('reporter_id', userId)
    .eq('status', 'dismissed')
    .gte('resolved_at', since);
  if ((falseCount ?? 0) >= REPORTER_ABUSE_THRESHOLD) throw forbidden('Reporting is temporarily disabled for your account');

  // Idempotent: a repeat report by the same user is a no-op (unique constraint).
  const { error } = await supabaseAdmin
    .from('reports')
    .upsert(
      { recipe_id: id, reporter_id: userId, category: parsed.data.category, reason: parsed.data.reason ?? null },
      { onConflict: 'recipe_id,reporter_id', ignoreDuplicates: true },
    );
  if (error) throw dbFail(error.message);

  // Auto-hide once a post crosses the high report threshold (pending review).
  const { count: distinct } = await supabaseAdmin
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('recipe_id', id)
    .eq('status', 'open');
  if ((distinct ?? 0) >= AUTOHIDE_THRESHOLD) {
    const { data: hid } = await supabaseAdmin.from('recipes').update({ auto_hidden: true }).eq('id', id).eq('auto_hidden', false).select('id');
    if (hid && hid.length) await logModeration({ action: 'auto_hide', targetRecipeId: id, detail: `${distinct} reports` });
  }
  return c.json({ ok: true });
});

const appealSchema = z.object({ text: z.string().trim().min(1).max(600) });

/** POST /recipes/:id/appeal — the owner appeals a removed video. */
recipes.post('/:id/appeal', requireAuth, rateLimit({ windowMs: 60_000, max: 10, name: 'appeal' }), async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  const parsed = appealSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Appeal text required');

  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, status').eq('id', id).maybeSingle();
  if (!rec || rec.cook_id !== userId) throw notFound('Recipe not found');
  if (rec.status !== 'removed') throw badRequest('This recipe has not been removed');

  const { error } = await supabaseAdmin
    .from('recipes')
    .update({ appeal_status: 'pending', appeal_text: parsed.data.text, appealed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw dbFail(error.message);
  return c.json({ ok: true });
});

const repostSchema = z.object({ comment: z.string().trim().max(600).optional() });

/** POST /recipes/:id/repost — repost a recipe (optional quote comment). */
recipes.post('/:id/repost', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 30, name: 'repost' }), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const parsed = repostSchema.safeParse(await c.req.json().catch(() => ({})));
  const comment = parsed.success ? parsed.data.comment ?? null : null;
  if (comment) {
    const mod = await moderate(comment);
    if (!mod.ok) throw badRequest(mod.reason!);
  }
  const cookId = await recipeCookIdUnblocked(id, userId); // 404s / validates id / blocks
  // Repost shares OTHER cooks' videos to your followers — you can't repost your own.
  if (cookId === userId) throw badRequest("You can't repost your own video");

  const { error } = await supabaseAdmin
    .from('reposts')
    .upsert({ user_id: userId, recipe_id: id, comment }, { onConflict: 'user_id,recipe_id' });
  if (error) throw dbFail(error.message);
  if (cookId !== userId) await notify({ userId: cookId, type: 'repost', actorId: userId, recipeId: id });
  return c.json({ reposted: true });
});

/** DELETE /recipes/:id/repost — undo a repost. */
recipes.delete('/:id/repost', requireAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  await supabaseAdmin.from('reposts').delete().eq('user_id', userId).eq('recipe_id', id);
  return c.json({ reposted: false });
});

/**
 * DELETE /recipes/:id — the owner (or an admin) permanently deletes a post.
 * Every recipe-referencing table (comments, saves, reactions, reposts,
 * downloads, views, ingredients, steps, reports, notifications) has an
 * ON DELETE CASCADE foreign key, so a single delete cleans everything up.
 */
recipes.delete('/:id', requireAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, video_asset_id').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) {
    const { data: viewer } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (viewer?.role !== 'admin') throw forbidden('You can only delete your own posts');
  }
  const { error } = await supabaseAdmin.from('recipes').delete().eq('id', id);
  if (error) throw dbFail(error.message);
  // Best-effort: drop the now-orphaned video asset (and its storage object stays
  // harmlessly; the mock/Cloudflare cleanup is out of scope here).
  if (rec.video_asset_id) await supabaseAdmin.from('video_assets').delete().eq('id', rec.video_asset_id as string);
  return c.json({ ok: true });
});

const updateSchema = z.object({
  title: z.string().min(1).max(120),
  cuisine: z.string().max(40).default(''),
  timeMinutes: z.number().int().min(0).max(6000),
  servings: z.number().int().min(1).max(99),
  level: z.string().max(20).default('Easy'),
  ingredients: z.array(z.string().min(1)).max(40).default([]),
  steps: z.array(z.string().min(1)).max(40).default([]),
  caption: z.string().max(600).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

/**
 * PATCH /recipes/:id — the owner (or an admin) edits a published post's text
 * (title, caption, recipe fields). The video is immutable here (re-record =
 * new post). Re-moderates, re-parses hashtags, and replaces ingredients/steps.
 */
recipes.patch('/:id', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 30, name: 'recipe-edit' }), async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, post_type, status').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  let isAdmin = false;
  if (rec.cook_id !== userId) {
    const { data: viewer } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    isAdmin = viewer?.role === 'admin';
    if (!isAdmin) throw forbidden('You can only edit your own posts');
  }
  // A moderator-removed post can be appealed, not edited (no evading removal by edit).
  if (rec.status === 'removed' && !isAdmin) throw badRequest("This post was removed — you can appeal it, but it can't be edited");
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid recipe payload', parsed.error.flatten());
  const input = parsed.data;
  const isReview = rec.post_type === 'review';

  const mod = await moderate(input.title, input.cuisine, input.ingredients, input.steps, input.caption ?? '');
  if (!mod.ok) throw badRequest(mod.reason!);

  const tags = parseHashtags(input.caption, input.title);
  const { error } = await supabaseAdmin
    .from('recipes')
    .update({
      title: input.title,
      cuisine: input.cuisine,
      time_minutes: isReview ? 0 : input.timeMinutes,
      servings: isReview ? 1 : input.servings,
      level: input.level,
      caption: input.caption ?? null,
      tags,
      rating: isReview ? (input.rating ?? null) : null,
    })
    .eq('id', id);
  if (error) throw dbFail(error.message);

  // Replace ingredient + step rows (reviews keep none).
  await supabaseAdmin.from('recipe_ingredients').delete().eq('recipe_id', id);
  await supabaseAdmin.from('recipe_steps').delete().eq('recipe_id', id);
  if (!isReview) {
    if (input.ingredients.length) {
      await supabaseAdmin.from('recipe_ingredients').insert(input.ingredients.map((text, i) => ({ recipe_id: id, position: i, text })));
    }
    if (input.steps.length) {
      await supabaseAdmin.from('recipe_steps').insert(input.steps.map((text, i) => ({ recipe_id: id, position: i, text })));
    }
  }

  const detail = await getRecipeDetail(userId, id);
  return c.json(detail);
});

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
