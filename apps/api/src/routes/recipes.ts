import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { CommentDTO, RecipeDetail } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, commentDTO, type CommentRow, type ProfileRow, type RecipeRow } from '../mappers';
import { rateLimit } from '../middleware/rateLimit';
import { moderateText } from '../services/moderation';
import { notify } from '../services/notify';
import type { AppEnv } from '../types';

export const recipes = new Hono<AppEnv>();

async function getRecipeDetail(viewerId: string | undefined, recipeId: string): Promise<RecipeDetail | null> {
  assertUuid(recipeId, 'recipe');
  const { data: row, error } = await supabaseAdmin.from('recipes').select('*').eq('id', recipeId).maybeSingle();
  if (error) throw dbFail(error.message);
  if (!row) return null;
  // Drafts / removed recipes are visible only to their owner.
  if (row.status !== 'published' && row.cook_id !== viewerId) return null;

  const [card] = await buildCards(supabaseAdmin, viewerId, [row as RecipeRow]);
  if (!card) return null;

  const [{ data: ings }, { data: steps }] = await Promise.all([
    supabaseAdmin.from('recipe_ingredients').select('text,position').eq('recipe_id', recipeId).order('position'),
    supabaseAdmin.from('recipe_steps').select('text,position').eq('recipe_id', recipeId).order('position'),
  ]);

  return {
    ...card,
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
  videoAssetId: z.string().uuid(),
  title: z.string().min(1).max(120),
  cuisine: z.string().max(40).default(''),
  timeMinutes: z.number().int().min(0).max(6000),
  servings: z.number().int().min(1).max(99),
  level: z.string().max(20).default('Easy'),
  ingredients: z.array(z.string().min(1)).max(40).default([]),
  steps: z.array(z.string().min(1)).max(40).default([]),
});

const POSTER_GRADIENTS = [
  'linear-gradient(165deg,#2a160e,#b5471f)',
  'linear-gradient(165deg,#3a1f06,#f4a52c)',
  'linear-gradient(165deg,#1a1006,#c23a1a)',
  'linear-gradient(165deg,#3a1420,#d96a4a)',
  'linear-gradient(165deg,#2c2410,#b8922e)',
];

/** POST /recipes — create recipe metadata after a video upload is registered. */
recipes.post('/', requireAuth, rateLimit({ windowMs: 60_000, max: 20, name: 'recipe-create' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid recipe payload', parsed.error.flatten());
  const input = parsed.data;

  const mod = moderateText(input.title, input.cuisine, input.ingredients, input.steps);
  if (!mod.ok) throw badRequest(mod.reason!);

  // The video asset must exist and belong to this user.
  const { data: asset } = await supabaseAdmin
    .from('video_assets')
    .select('id, owner_id')
    .eq('id', input.videoAssetId)
    .maybeSingle();
  if (!asset || asset.owner_id !== userId) throw badRequest('Unknown or unowned video asset');

  const bg = POSTER_GRADIENTS[Math.abs(hash(input.title)) % POSTER_GRADIENTS.length]!;

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
      video_asset_id: input.videoAssetId,
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

recipes.post('/:id/like', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const cookId = await recipeCookId(id);
  const result = await setReaction(id, userId, 'like');
  if (result === 'like') await notify({ userId: cookId, type: 'like', actorId: userId, recipeId: id });
  return reactionResponse(c, id, userId);
});

recipes.post('/:id/dislike', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookId(id);
  await setReaction(id, userId, 'dislike');
  return reactionResponse(c, id, userId);
});

/** POST /recipes/:id/save — toggle saved. */
recipes.post('/:id/save', requireAuth, async (c) => {
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
    return c.json({ saved: false });
  }
  await supabaseAdmin.from('saves').insert({ user_id: userId, recipe_id: id });
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

const viewSchema = z.object({
  dwellMs: z.number().int().min(0).max(3_600_000).default(0),
  completed: z.boolean().default(false),
  skipped: z.boolean().default(false),
});

/** POST /recipes/:id/view — log a watch event (powers ranking). */
recipes.post('/:id/view', requireAuth, rateLimit({ windowMs: 60_000, max: 90, name: 'view' }), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const body = viewSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid view payload', body.error.flatten());
  await recipeCookId(id);
  await supabaseAdmin.from('recipe_views').insert({
    user_id: userId,
    recipe_id: id,
    dwell_ms: body.data.dwellMs,
    completed: body.data.completed,
    skipped: body.data.skipped,
  });
  return c.json({ ok: true });
});

const commentSchema = z.object({ text: z.string().trim().min(1).max(600) });

/** GET /recipes/:id/comments — newest first. */
recipes.get('/:id/comments', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  // Only expose comments on recipes the viewer can see.
  const { data: rec } = await supabaseAdmin.from('recipes').select('status, cook_id').eq('id', id).maybeSingle();
  if (!rec || (rec.status !== 'published' && rec.cook_id !== c.get('userId'))) throw notFound('Recipe not found');

  const { data: rows, error } = await supabaseAdmin
    .from('comments')
    .select('*')
    .eq('recipe_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw dbFail(error.message);
  const list = (rows ?? []) as CommentRow[];
  if (list.length === 0) return c.json<CommentDTO[]>([]);

  const authorIds = [...new Set(list.map((r) => r.author_id))];
  const { data: authors } = await supabaseAdmin.from('profiles').select('*').in('id', authorIds);
  const authorMap = new Map<string, ProfileRow>((authors ?? []).map((a) => [a.id as string, a as ProfileRow]));
  return c.json<CommentDTO[]>(list.map((r) => commentDTO(r, authorMap.get(r.author_id))));
});

/** POST /recipes/:id/comments — add a comment, bump the count, notify the cook. */
recipes.post('/:id/comments', requireAuth, rateLimit({ windowMs: 60_000, max: 30, name: 'comment' }), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const parsed = commentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Comment text required');
  const mod = moderateText(parsed.data.text);
  if (!mod.ok) throw badRequest(mod.reason!);
  const cookId = await recipeCookId(id);

  const { data: row, error } = await supabaseAdmin
    .from('comments')
    .insert({ recipe_id: id, author_id: userId, text: parsed.data.text })
    .select('*')
    .single();
  if (error || !row) throw dbFail(error?.message ?? 'Failed to add comment');
  await supabaseAdmin.rpc('adjust_comment_count', { rid: id, delta: 1 });
  await notify({ userId: cookId, type: 'comment', actorId: userId, recipeId: id });

  const { data: author } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();
  return c.json<CommentDTO>(commentDTO(row as CommentRow, (author ?? undefined) as ProfileRow | undefined), 201);
});

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
