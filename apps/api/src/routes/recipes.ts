import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { RecipeDetail } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { buildCards, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const recipes = new Hono<AppEnv>();

async function getRecipeDetail(viewerId: string | undefined, recipeId: string): Promise<RecipeDetail | null> {
  const { data: row, error } = await supabaseAdmin.from('recipes').select('*').eq('id', recipeId).maybeSingle();
  if (error) throw dbFail(error.message);
  if (!row) return null;

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
recipes.post('/', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid recipe payload', parsed.error.flatten());
  const input = parsed.data;

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

/** Toggle a like/dislike (mutually exclusive) and keep denormalized counts in sync. */
async function setReaction(recipeId: string, userId: string, target: 'like' | 'dislike') {
  const { data: cur } = await supabaseAdmin
    .from('reactions')
    .select('kind')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  const prev = (cur?.kind as 'like' | 'dislike' | undefined) ?? undefined;

  let likeDelta = 0;
  let dislikeDelta = 0;

  if (prev === target) {
    await supabaseAdmin.from('reactions').delete().eq('user_id', userId).eq('recipe_id', recipeId);
    if (target === 'like') likeDelta = -1;
    else dislikeDelta = -1;
  } else {
    await supabaseAdmin
      .from('reactions')
      .upsert({ user_id: userId, recipe_id: recipeId, kind: target }, { onConflict: 'user_id,recipe_id' });
    if (target === 'like') {
      likeDelta = 1;
      if (prev === 'dislike') dislikeDelta = -1;
    } else {
      dislikeDelta = 1;
      if (prev === 'like') likeDelta = -1;
    }
  }

  if (likeDelta !== 0 || dislikeDelta !== 0) {
    await supabaseAdmin.rpc('adjust_recipe_counters', { rid: recipeId, like_delta: likeDelta, dislike_delta: dislikeDelta });
  }
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

async function ensureRecipeExists(recipeId: string) {
  const { data } = await supabaseAdmin.from('recipes').select('id').eq('id', recipeId).maybeSingle();
  if (!data) throw notFound('Recipe not found');
}

recipes.post('/:id/like', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await ensureRecipeExists(id);
  await setReaction(id, userId, 'like');
  return reactionResponse(c, id, userId);
});

recipes.post('/:id/dislike', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await ensureRecipeExists(id);
  await setReaction(id, userId, 'dislike');
  return reactionResponse(c, id, userId);
});

/** POST /recipes/:id/save — toggle saved. */
recipes.post('/:id/save', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await ensureRecipeExists(id);

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

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
