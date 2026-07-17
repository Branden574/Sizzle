import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { CommentDTO, CookLogDTO, RecipeDetail } from '@sizzle/shared';
import { isPremiumPriceTier } from '@sizzle/shared';
import { optionalAuth, requireAuth, requireNotBanned } from '../middleware/auth';
import { env } from '../env';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, forbidden, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, canViewCookContent, commentDTO, loadBlockedIds, type CommentRow, type ProfileRow, type RecipeRow } from '../mappers';
import { initialsOf, relativeTime } from '../lib/format';
import { rateLimit } from '../middleware/rateLimit';
import { moderate, moderateImages } from '../services/moderation';
import { fileReport } from '../services/reports';
import { parseHashtags } from '../services/hashtags';
import { notify } from '../services/notify';
import { syncVideoProtection } from '../services/videoFinalize';
import { getStreamProvider } from '../services/stream';
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

  const [{ data: ings }, { data: steps }, { data: pinnedRow }] = await Promise.all([
    supabaseAdmin.from('recipe_ingredients').select('text,position').eq('recipe_id', recipeId).order('position'),
    supabaseAdmin.from('recipe_steps').select('text,position').eq('recipe_id', recipeId).order('position'),
    supabaseAdmin.from('comments').select('text, author_id, hidden').eq('recipe_id', recipeId).eq('pinned', true).limit(1).maybeSingle(),
  ]);
  let chefsNote: RecipeDetail['chefsNote'] = null;
  if (pinnedRow && !pinnedRow.hidden) {
    const { data: author } = await supabaseAdmin.from('profiles').select('display_name, handle, banned').eq('id', pinnedRow.author_id).maybeSingle();
    if (author && !author.banned) chefsNote = { text: pinnedRow.text as string, authorName: (author.display_name as string) || `@${author.handle}` };
  }

  // Nutrition per serving — null unless the creator filled in at least one field.
  const m = {
    calories: (row.calories as number | null) ?? null,
    proteinG: (row.protein_g as number | null) ?? null,
    carbsG: (row.carbs_g as number | null) ?? null,
    fatG: (row.fat_g as number | null) ?? null,
  };
  const macros = m.calories == null && m.proteinG == null && m.carbsG == null && m.fatG == null ? null : m;

  // Premium gating: withhold the recipe body from a locked card (the client shows
  // an unlock CTA). The card's media was already stripped in the mapper.
  return {
    ...card,
    caption: (row.caption as string | null) ?? null,
    ingredients: card.locked ? [] : (ings ?? []).map((i) => i.text as string),
    steps: card.locked ? [] : (steps ?? []).map((s) => s.text as string),
    macros: card.locked ? null : macros,
    chefsNote: card.locked ? null : chefsNote,
  };
}

/** GET /recipes/:id */
recipes.get('/:id', optionalAuth, async (c) => {
  const detail = await getRecipeDetail(c.get('userId'), c.req.param('id'));
  if (!detail) throw notFound('Recipe not found');
  return c.json(detail);
});

/** Nutrition per serving — every field optional; a blank field stores NULL. */
const macrosSchema = z.object({
  calories: z.number().int().min(0).max(30000).optional(),
  proteinG: z.number().int().min(0).max(2000).optional(),
  carbsG: z.number().int().min(0).max(2000).optional(),
  fatG: z.number().int().min(0).max(2000).optional(),
}).optional();

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
  macros: macrosSchema,
  caption: z.string().max(600).optional(),
  postType: z.enum(['recipe', 'review']).default('recipe'),
  rating: z.number().int().min(1).max(5).optional(),
  status: z.enum(['draft', 'scheduled', 'published']).default('published'),
  scheduledAt: z.string().datetime().optional(),
  /** Lineage: the recipe this post was cooked from ("Cook this"). */
  originRecipeId: z.string().uuid().optional(),
  // Premium at create (mirrors PATCH /controls) — server-validated ≥$5 floor.
  priceCents: z.number().int().min(500).max(50_000).nullable().optional(),
  visibility: z.enum(['public', 'subscribers']).optional(),
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
      .select('id, owner_id, poster_url')
      .eq('id', input.videoAssetId)
      .maybeSingle();
    if (!asset || asset.owner_id !== userId) throw badRequest('Unknown or unowned video asset');
    // Idempotency: a retried / double-submitted create for the SAME video asset must
    // not publish a second post (unique index recipes_video_asset_uidx also enforces
    // this at the DB). Return the existing recipe instead of a duplicate or a 500.
    const { data: existingRecipe } = await supabaseAdmin
      .from('recipes').select('id').eq('video_asset_id', input.videoAssetId).maybeSingle();
    if (existingRecipe) {
      const detail = await getRecipeDetail(userId, existingRecipe.id as string);
      if (detail) return c.json(detail, 200);
    }
    // Vision-moderate the video's poster/thumbnail (a cheap proxy for the clip;
    // the recipe is only created once transcoding is done, so the poster exists).
    if (asset.poster_url) {
      const vidMod = await moderateImages([asset.poster_url as string]);
      if (!vidMod.ok) throw badRequest(vidMod.reason!);
    }
  } else {
    // Photo post: each image must live in OUR public storage under the user's own
    // folder. Anchor to the project host + a prefix (startsWith, not includes) —
    // a substring check let any valid URL that merely contained the path through,
    // so arbitrary external image URLs were accepted and served to every viewer.
    const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
    const ok = (input.images ?? []).every((u) => u.startsWith(ownFolder));
    if (!ok) throw badRequest('Invalid image upload');
    // Vision moderation on the uploaded photos (text was already moderated above).
    const imgMod = await moderateImages(input.images ?? []);
    if (!imgMod.ok) throw badRequest(imgMod.reason!);
  }

  // Lineage: the origin must be a real, published recipe. Self-lineage is
  // allowed (a creator can iterate on their own dish).
  let originRecipeId: string | null = null;
  if (input.originRecipeId) {
    const { data: origin } = await supabaseAdmin
      .from('recipes')
      .select('id, status')
      .eq('id', input.originRecipeId)
      .maybeSingle();
    if (origin && origin.status === 'published') originRecipeId = origin.id as string;
  }

  const bg = POSTER_GRADIENTS[Math.abs(hash(input.title)) % POSTER_GRADIENTS.length]!;
  const tags = parseHashtags(input.caption, input.title);

  // Draft = save without publishing; scheduled = publish automatically at a future
  // time (a cron flips it). A scheduled time in the past just publishes now.
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const willSchedule = input.status === 'scheduled' && scheduledAt != null && scheduledAt.getTime() > Date.now();
  const status = input.status === 'draft' ? 'draft' : willSchedule ? 'scheduled' : 'published';

  // Premium at create: pricing / subscribers-only requires an active payout
  // account (mirrors PATCH /controls) — validated up front so a priced post is
  // never briefly free/public before a follow-up controls PATCH. A review post
  // can't be premium (it's proof-of-cook, not sellable content).
  const priceCents = input.postType === 'review' ? null : (input.priceCents ?? null);
  const visibility = input.postType === 'review' ? 'public' : (input.visibility ?? 'public');
  if (priceCents !== null && !isPremiumPriceTier(priceCents)) throw badRequest('Choose one of the available price tiers');
  if (priceCents !== null || visibility === 'subscribers') {
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('monetization_status, sub_price_cents')
      .eq('id', userId)
      .maybeSingle();
    if (prof?.monetization_status !== 'active') throw badRequest('Set up payouts before pricing a recipe');
    if (visibility === 'subscribers' && !prof?.sub_price_cents) throw badRequest('Set a monthly subscription price before posting subscribers-only');
  }

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
      status,
      scheduled_at: willSchedule ? scheduledAt!.toISOString() : null,
      origin_recipe_id: originRecipeId,
      price_cents: priceCents,
      visibility,
      calories: input.postType === 'review' ? null : (input.macros?.calories ?? null),
      protein_g: input.postType === 'review' ? null : (input.macros?.proteinG ?? null),
      carbs_g: input.postType === 'review' ? null : (input.macros?.carbsG ?? null),
      fat_g: input.postType === 'review' ? null : (input.macros?.fatG ?? null),
    })
    .select('id')
    .single();
  // Race-safe idempotency: two concurrent creates for the same video asset both
  // pass the SELECT check above; the unique index recipes_video_asset_uidx makes
  // the loser land here — return the winner's recipe (200) instead of a 500.
  if (error?.code === '23505' && input.videoAssetId) {
    const { data: winner } = await supabaseAdmin
      .from('recipes').select('id').eq('video_asset_id', input.videoAssetId).maybeSingle();
    if (winner) {
      const detail = await getRecipeDetail(userId, winner.id as string);
      if (detail) return c.json(detail, 200);
    }
  }
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

  // A recipe published premium/subscribers-only with a READY video must have its
  // Cloudflare video signed + poster made UID-free NOW: the finalize hop can't have
  // done it if it ran before this recipe existed (it saw no linked recipe → treated
  // the video as free, keeping the UID-bearing thumbnail). No-op when the video isn't
  // ready yet — finalize applies protection on the ready-hop, which now finds this
  // recipe. Without this a short clip that transcodes mid-compose stays streamable.
  if (input.videoAssetId && (priceCents != null || visibility === 'subscribers')) {
    await syncVideoProtection(input.videoAssetId, true);
  }

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

/** Enforce the creator's "likes off" control server-side (owner exempt), so it
 * can't be bypassed by a crafted request even though the UI hides the button. */
async function assertLikesEnabled(recipeId: string, cookId: string, userId: string): Promise<void> {
  if (cookId === userId) return;
  const { data: rc } = await supabaseAdmin.from('recipes').select('likes_enabled').eq('id', recipeId).maybeSingle();
  if (rc && rc.likes_enabled === false) throw forbidden('Likes are turned off for this post');
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

async function recipeCookId(recipeId: string, viewerId?: string): Promise<string> {
  assertUuid(recipeId, 'recipe');
  const { data } = await supabaseAdmin.from('recipes').select('cook_id, status, auto_hidden').eq('id', recipeId).maybeSingle();
  if (!data) throw notFound('Recipe not found');
  // Non-owners can only interact with publicly-visible recipes — a draft, removed,
  // or auto-hidden post must 404 for everyone but its owner, matching the feed gate.
  if (viewerId && data.cook_id !== viewerId) {
    if (data.status !== 'published' || data.auto_hidden) throw notFound('Recipe not found');
    // Private account: only accepted followers may interact with the content
    // (like, save, comment, view, …). Same gate buildCards applies to the read
    // path — without it a non-follower could like/comment/inflate counters on a
    // post they cannot see.
    if (!(await canViewCookContent(supabaseAdmin, data.cook_id as string, viewerId))) throw notFound('Recipe not found');
  }
  return data.cook_id as string;
}

/**
 * Resolve a recipe's owner, but 404 if the viewer and owner are in a block
 * relationship (either direction). Blocks forbid the blocked user from
 * interacting with the blocker's content (liking, reposting, viewing, etc.).
 * Passes the viewer through so the status + private-account gates apply too.
 */
async function recipeCookIdUnblocked(recipeId: string, userId: string): Promise<string> {
  const cookId = await recipeCookId(recipeId, userId);
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(cookId)) throw notFound('Recipe not found');
  return cookId;
}

const cookEventSchema = z.object({ kind: z.enum(['cook_start', 'cook_finish', 'list_add']) });

/** POST /recipes/:id/cook-events — first-class cook-intent signals. cook_start /
 *  cook_finish come from cook mode, list_add from the shopping list. A user's
 *  first cook_finish bumps the recipe's qualified-cooks counter (DB trigger). */
recipes.post('/:id/cook-events', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 40, name: 'cook-event' }), async (c) => {
  const recipeId = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  const parsed = cookEventSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid cook event');

  // Same trust boundary as like/save/view: published + private-follower + block
  // gating (was only checking status, letting you inflate a private/blocked cook).
  await recipeCookIdUnblocked(recipeId, userId);

  const { error } = await supabaseAdmin.from('cook_events').insert({ user_id: userId, recipe_id: recipeId, kind: parsed.data.kind });
  if (error) throw dbFail(error.message);

  const { data: fresh } = await supabaseAdmin.from('recipes').select('cook_count').eq('id', recipeId).single();
  return c.json({ cooks: (fresh?.cook_count as number) ?? 0 });
});

/** GET /recipes/:id/derivatives — the "Cooked by N others" rail: published posts
 *  that stamped this recipe as their origin. Flows through buildCards, so
 *  blocks/privacy/bans apply as everywhere else. */
recipes.get('/:id/derivatives', optionalAuth, async (c) => {
  const recipeId = assertUuid(c.req.param('id'), 'recipe');
  const viewerId = c.get('userId');
  const [{ data: rows }, { count }] = await Promise.all([
    supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('origin_recipe_id', recipeId)
      .eq('status', 'published')
      .order('cook_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12),
    supabaseAdmin
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('origin_recipe_id', recipeId)
      .eq('status', 'published'),
  ]);
  const items = await buildCards(supabaseAdmin, viewerId, (rows ?? []) as RecipeRow[]);
  return c.json({ items, total: count ?? items.length });
});

const pinSchema = z.object({ pinned: z.boolean() });

/** POST /recipes/:id/comments/:commentId/pin — the recipe owner pins ONE
 *  comment as the Chef's note (pinning a new one unpins the old). */
recipes.post('/:id/comments/:commentId/pin', requireAuth, requireNotBanned, async (c) => {
  const recipeId = assertUuid(c.req.param('id'), 'recipe');
  const commentId = assertUuid(c.req.param('commentId'), 'comment');
  const userId = c.get('userId')!;
  const parsed = pinSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('pinned must be a boolean');

  const { data: recipe } = await supabaseAdmin.from('recipes').select('cook_id').eq('id', recipeId).maybeSingle();
  if (!recipe) throw notFound('Recipe not found');
  if (recipe.cook_id !== userId) throw forbidden('Only the recipe owner can pin a comment');
  const { data: comment } = await supabaseAdmin.from('comments').select('id').eq('id', commentId).eq('recipe_id', recipeId).maybeSingle();
  if (!comment) throw notFound('Comment not found');

  if (parsed.data.pinned) {
    // Single pin per recipe: clear any existing pin first.
    await supabaseAdmin.from('comments').update({ pinned: false }).eq('recipe_id', recipeId).eq('pinned', true);
    await supabaseAdmin.from('comments').update({ pinned: true }).eq('id', commentId);
  } else {
    await supabaseAdmin.from('comments').update({ pinned: false }).eq('id', commentId);
  }
  return c.json({ ok: true, pinned: parsed.data.pinned });
});

const cookLogSchema = z.object({
  note: z.string().trim().max(400).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  photoUrl: z.string().url().max(1000).optional(),
  isPublic: z.boolean().default(true),
});

/** POST /recipes/:id/cook-log — a Made-It Journal entry (proof-of-cook). Also
 *  logs a qualified cook_finish (deduped by the DB trigger), so "I made this"
 *  without cook mode still counts toward the Cooks metric. */
recipes.post('/:id/cook-log', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 10, name: 'cook-log' }), async (c) => {
  const recipeId = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  const parsed = cookLogSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid cook log', parsed.error.flatten());
  const input = parsed.data;

  // Same trust boundary as like/save/view: published + private-follower + block gating.
  await recipeCookIdUnblocked(recipeId, userId);

  // Same trust boundary as photo posts: the photo must live in OUR storage
  // under the author's own folder, and it goes through image moderation.
  if (input.photoUrl) {
    const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
    if (!input.photoUrl.startsWith(ownFolder)) throw badRequest('Invalid photo upload');
    const imgMod = await moderateImages([input.photoUrl]);
    if (!imgMod.ok) throw badRequest(imgMod.reason!);
  }
  if (input.note) {
    const mod = await moderate(input.note);
    if (!mod.ok) throw badRequest(mod.reason!);
  }

  const { data: row, error } = await supabaseAdmin
    .from('cook_logs')
    .insert({ user_id: userId, recipe_id: recipeId, note: input.note ?? null, rating: input.rating ?? null, photo_url: input.photoUrl ?? null, is_public: input.isPublic })
    .select('*')
    .single();
  if (error || !row) throw dbFail(error?.message ?? 'Could not save your entry');

  // Making it = a qualified cook (the trigger dedups repeat finishes).
  await supabaseAdmin.from('cook_events').insert({ user_id: userId, recipe_id: recipeId, kind: 'cook_finish' });

  return c.json({ id: row.id as string }, 201);
});

/** GET /recipes/:id/cook-log — recent public Made-It entries (+ total). */
recipes.get('/:id/cook-log', optionalAuth, async (c) => {
  const recipeId = assertUuid(c.req.param('id'), 'recipe');
  const viewerId = c.get('userId');
  const [{ data: rows }, { count }] = await Promise.all([
    supabaseAdmin.from('cook_logs').select('*').eq('recipe_id', recipeId).eq('is_public', true).order('created_at', { ascending: false }).limit(12),
    supabaseAdmin.from('cook_logs').select('id', { count: 'exact', head: true }).eq('recipe_id', recipeId).eq('is_public', true),
  ]);
  const blocked = await loadBlockedIds(supabaseAdmin, viewerId);
  const authorIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: authors } = authorIds.length
    ? await supabaseAdmin.from('profiles').select('id, display_name, handle, avatar_color, avatar_url, banned').in('id', authorIds)
    : { data: [] as Record<string, unknown>[] };
  const authorMap = new Map((authors ?? []).map((a) => [a.id as string, a]));
  const items = (rows ?? [])
    .filter((r) => !blocked.has(r.user_id as string))
    .map((r): CookLogDTO | null => {
      const a = authorMap.get(r.user_id as string);
      if (!a || a.banned) return null;
      const name = (a.display_name as string) || (a.handle as string);
      return {
        id: r.id as string,
        recipeId,
        author: { id: a.id as string, name, handle: a.handle as string, init: initialsOf(name), avatarColor: a.avatar_color as string, avatarUrl: (a.avatar_url as string) ?? null },
        note: (r.note as string) ?? null,
        rating: (r.rating as number) ?? null,
        photoUrl: (r.photo_url as string) ?? null,
        isPublic: true,
        time: relativeTime(new Date(r.created_at as string)),
        createdAt: r.created_at as string,
      };
    })
    .filter((x): x is CookLogDTO => !!x);
  return c.json({ items, total: count ?? items.length });
});

/** DELETE /cook-logs/:id — remove your own journal entry. */
recipes.delete('/cook-logs/:id', requireAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'entry');
  const userId = c.get('userId')!;
  const { error } = await supabaseAdmin.from('cook_logs').delete().eq('id', id).eq('user_id', userId);
  if (error) throw dbFail(error.message);
  return c.json({ ok: true });
});

recipes.post('/:id/like', requireAuth, requireNotBanned, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const cookId = await recipeCookIdUnblocked(id, userId);
  await assertLikesEnabled(id, cookId, userId);
  const result = await setReaction(id, userId, 'like');
  if (result === 'like') await notify({ userId: cookId, type: 'like', actorId: userId, recipeId: id });
  return reactionResponse(c, id, userId);
});

recipes.post('/:id/dislike', requireAuth, requireNotBanned, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  const cookId = await recipeCookIdUnblocked(id, userId);
  await assertLikesEnabled(id, cookId, userId);
  await setReaction(id, userId, 'dislike');
  return reactionResponse(c, id, userId);
});

/** POST /recipes/:id/save — toggle saved (atomic in the DB to avoid counter drift). */
recipes.post('/:id/save', requireAuth, requireNotBanned, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookId(id, userId);
  const { data, error } = await supabaseAdmin.rpc('toggle_save', { p_user: userId, p_recipe: id });
  if (error) throw dbFail(error.message);
  return c.json({ saved: data === true });
});

/** POST /recipes/:id/download — mark for offline. */
recipes.post('/:id/download', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookId(id, userId);
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
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  await recipeCookId(id, userId); // validates id + 404s a draft/removed/hidden post for non-owners
  await supabaseAdmin.rpc('increment_share', { rid: id });
  return c.json({ ok: true });
});

const controlsSchema = z.object({
  likesEnabled: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  countsVisible: z.boolean().optional(),
  // Premium price in cents (≥ $5 — see MIN_TIP), or null to make it free again.
  priceCents: z.number().int().min(500).max(50_000).nullable().optional(),
  // Post visibility: public, or subscribers-only (requires an active sub price).
  visibility: z.enum(['public', 'subscribers']).optional(),
});

/** PATCH /recipes/:id/controls — owner toggles likes/comments/count visibility (persisted, enforced for all viewers). */
recipes.patch('/:id/controls', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const id = assertUuid(c.req.param('id'), 'recipe');
  const parsed = controlsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid post controls');
  const { data: rec } = await supabaseAdmin
    .from('recipes')
    .select('cook_id, video_asset_id, price_cents, visibility, post_type')
    .eq('id', id)
    .maybeSingle<{ cook_id: string; video_asset_id: string | null; price_cents: number | null; visibility: string | null; post_type: string | null }>();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) throw forbidden('You can only change controls on your own posts');
  // A review is proof-of-cook, not sellable content — mirror the create-path guard so
  // the edit path can't paywall or subscriber-gate a review.
  if (rec.post_type === 'review' && (parsed.data.priceCents != null || parsed.data.visibility === 'subscribers')) {
    throw badRequest("A review can't be made premium");
  }
  const patch: Record<string, boolean | number | string | null> = {};
  if (parsed.data.likesEnabled !== undefined) patch.likes_enabled = parsed.data.likesEnabled;
  if (parsed.data.commentsEnabled !== undefined) patch.comments_enabled = parsed.data.commentsEnabled;
  if (parsed.data.countsVisible !== undefined) patch.counts_visible = parsed.data.countsVisible;
  if (parsed.data.priceCents !== undefined) {
    if (parsed.data.priceCents !== null) {
      if (!isPremiumPriceTier(parsed.data.priceCents)) throw badRequest('Choose one of the available price tiers');
      const { data: prof } = await supabaseAdmin.from('profiles').select('monetization_status').eq('id', userId).maybeSingle();
      if (prof?.monetization_status !== 'active') throw badRequest('Set up payouts before pricing a recipe');
    }
    patch.price_cents = parsed.data.priceCents;
  }
  if (parsed.data.visibility !== undefined) {
    if (parsed.data.visibility === 'subscribers') {
      const { data: prof } = await supabaseAdmin.from('profiles').select('monetization_status, sub_price_cents').eq('id', userId).maybeSingle();
      if (prof?.monetization_status !== 'active' || !prof?.sub_price_cents) throw badRequest('Set a monthly subscription price before posting subscribers-only');
    }
    patch.visibility = parsed.data.visibility;
  }
  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from('recipes').update(patch).eq('id', id);
    if (error) throw dbFail(error.message);
  }
  // If pricing/visibility changed, make the video's signed-URL protection match the
  // new premium state (no-op unless the video is a ready Cloudflare asset).
  if (parsed.data.priceCents !== undefined || parsed.data.visibility !== undefined) {
    const newPrice = parsed.data.priceCents !== undefined ? parsed.data.priceCents : rec.price_cents;
    const newVisibility = parsed.data.visibility !== undefined ? parsed.data.visibility : rec.visibility;
    await syncVideoProtection(rec.video_asset_id, newPrice != null || newVisibility === 'subscribers');
  }
  return c.json({ ok: true });
});

/**
 * GET /recipes/:id/playback — short-lived signed HLS URL for a PREMIUM video,
 * handed ONLY to an entitled viewer (owner / one-off unlock / active subscription).
 * Premium cards omit the playback URL (video.signed=true), so the paid video can't
 * be grabbed from the feed payload; the client calls this on demand when it's about
 * to play. Server-authoritative — the entitlement is checked here, not on the client.
 */
recipes.get('/:id/playback', optionalAuth, async (c) => {
  const userId = c.get('userId');
  const id = assertUuid(c.req.param('id'), 'recipe');
  const { data: rec } = await supabaseAdmin
    .from('recipes')
    .select('cook_id, price_cents, visibility, video_asset_id')
    .eq('id', id)
    .maybeSingle<{ cook_id: string; price_cents: number | null; visibility: string | null; video_asset_id: string | null }>();
  if (!rec || !rec.video_asset_id) throw notFound('Recipe not found');
  const { data: asset } = await supabaseAdmin
    .from('video_assets')
    .select('provider, provider_uid, hls_url, status')
    .eq('id', rec.video_asset_id)
    .maybeSingle<{ provider: string | null; provider_uid: string | null; hls_url: string | null; status: string | null }>();
  if (!asset || asset.status !== 'ready' || !asset.hls_url) throw notFound('Video not ready');

  const premium = rec.price_cents != null || rec.visibility === 'subscribers';
  // Free video: nothing to gate — hand back the public URL (the client normally
  // wouldn't ask, but this keeps the endpoint safe if it does).
  if (!premium) return c.json({ hlsUrl: asset.hls_url });

  // Entitlement (server-authoritative): owner, a one-off unlock, or an active,
  // non-expired subscription to the creator.
  let entitled = !!userId && rec.cook_id === userId;
  if (!entitled && userId) {
    const [{ data: unlock }, { data: sub }] = await Promise.all([
      supabaseAdmin.from('recipe_unlocks').select('user_id').eq('user_id', userId).eq('recipe_id', id).maybeSingle(),
      supabaseAdmin
        .from('subscriptions')
        .select('current_period_end')
        .eq('subscriber_id', userId)
        .eq('creator_id', rec.cook_id)
        .eq('status', 'active')
        .maybeSingle<{ current_period_end: string | null }>(),
    ]);
    const subActive = !!sub && (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());
    entitled = !!unlock || subActive;
  }
  if (!entitled) throw forbidden('This recipe is locked');

  // Mint a short-lived signed token. Cloudflare signed URLs replace the video UID
  // in the path with the token; on the mock / a non-Cloudflare asset there's nothing
  // to sign, so return the stored URL.
  const provider = getStreamProvider();
  if (asset.provider !== 'cloudflare' || !asset.provider_uid || !provider.signPlaybackToken) {
    return c.json({ hlsUrl: asset.hls_url });
  }
  try {
    const token = await provider.signPlaybackToken(asset.provider_uid, 60 * 60 * 4); // 4h session
    return c.json({ hlsUrl: asset.hls_url.replace(asset.provider_uid, token) });
  } catch (err) {
    console.error('[playback] signing failed', { id, err: String(err) });
    throw dbFail('Could not prepare playback');
  }
});

/** POST /recipes/:id/publish — flip the owner's draft or scheduled post live now. */
recipes.post('/:id/publish', requireAuth, requireNotBanned, async (c) => {
  const userId = c.get('userId')!;
  const id = assertUuid(c.req.param('id'), 'recipe');
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, status').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) throw forbidden('You can only publish your own posts');
  if (rec.status !== 'draft' && rec.status !== 'scheduled') throw badRequest('This post is already published');
  const { error } = await supabaseAdmin.from('recipes').update({ status: 'published', scheduled_at: null }).eq('id', id);
  if (error) throw dbFail(error.message);
  await supabaseAdmin.from('profiles').update({ is_cook: true }).eq('id', userId);
  return c.json({ ok: true });
});

const posterSchema = z.object({ posterUrl: z.string().url().max(1000) });

/** PATCH /recipes/:id/poster — owner sets a custom cover still for their video post.
 *  The thumbnail is the #1 tap-through lever and video is otherwise immutable, so this
 *  lets a creator fix a bad auto-poster without deleting + re-posting. */
recipes.patch('/:id/poster', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const id = assertUuid(c.req.param('id'), 'recipe');
  const parsed = posterSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid cover image');
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, video_asset_id').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) throw forbidden('You can only change your own posts');
  if (!rec.video_asset_id) throw badRequest('This post has no video to set a cover for');
  // Must be the caller's own storage upload, and moderated (it's shown to everyone).
  const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
  if (!parsed.data.posterUrl.startsWith(ownFolder)) throw badRequest('Cover must be your own uploaded image');
  const mod = await moderateImages([parsed.data.posterUrl]);
  if (!mod.ok) throw badRequest(mod.reason!);
  const { error } = await supabaseAdmin.from('video_assets').update({ poster_url: parsed.data.posterUrl }).eq('id', rec.video_asset_id);
  if (error) throw dbFail(error.message);
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
  const cookId = await recipeCookIdUnblocked(id, userId);
  // A creator watching their OWN post is not a view — skip it entirely (event
  // row AND counter). Logging self-views polluted insights (a creator's own 9
  // watches showed as 9 views while the profile counter, which already excluded
  // them, showed 0) and would skew ranking. One rule, applied to both.
  if (userId !== cookId) {
    await supabaseAdmin.from('recipe_views').insert({
      user_id: userId,
      recipe_id: id,
      dwell_ms: body.data.dwellMs,
      completed: body.data.completed,
      skipped: body.data.skipped,
    });
    // Bump the public/eligibility view counter (→ profiles.total_video_views via trigger).
    await supabaseAdmin.rpc('bump_view_count', { rid: id });
  }
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
  // Private account: its comment threads are follower-only, like the recipe itself.
  if (rec.cook_id !== viewerId && !viewerIsModerator && !(await canViewCookContent(supabaseAdmin, rec.cook_id as string, viewerId))) {
    throw notFound('Recipe not found');
  }

  const { data: rows, error } = await supabaseAdmin
    .from('comments')
    .select('*')
    .eq('recipe_id', id)
    .order('pinned', { ascending: false }) // the Chef's note leads the thread
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
  const cookId = await recipeCookId(id, userId);

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
  const { data: row } = await supabaseAdmin.from('comments').select('like_count, author_id, recipe_id').eq('id', commentId).maybeSingle();
  // Notify the comment's author on a fresh like (notify() skips self-likes).
  if (liked && row?.author_id) {
    await notify({ userId: row.author_id as string, type: 'comment_like', actorId: userId, recipeId: (row.recipe_id as string) ?? null });
  }
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

/** POST /recipes/:id/report — flag a recipe for moderation (one per user).
 *  Kept for back-compat; the generic POST /reports handles all target types. */
recipes.post('/:id/report', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 15, name: 'report' }), async (c) => {
  const id = assertUuid(c.req.param('id'), 'recipe');
  const userId = c.get('userId')!;
  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid report');
  await fileReport({ targetType: 'recipe', targetId: id, reporterId: userId, category: parsed.data.category, reason: parsed.data.reason });
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
  const { data: rec } = await supabaseAdmin.from('recipes').select('cook_id, video_asset_id, image_urls').eq('id', id).maybeSingle();
  if (!rec) throw notFound('Recipe not found');
  if (rec.cook_id !== userId) {
    const { data: viewer } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (viewer?.role !== 'admin') throw forbidden('You can only delete your own posts');
  }
  const { error } = await supabaseAdmin.from('recipes').delete().eq('id', id);
  if (error) throw dbFail(error.message);
  // Media teardown so deleted content stops being playable (App Store 5.1.1(v) /
  // GDPR) and storage cost stops compounding. Deleting the asset ROW is enough:
  // the video_assets BEFORE DELETE trigger snapshots its media refs into
  // pending_media_deletions, and the finalize cron removes the Cloudflare asset +
  // storage blobs within a minute — one queue covers every deletion path.
  if (rec.video_asset_id) {
    await supabaseAdmin.from('video_assets').delete().eq('id', rec.video_asset_id as string);
  }
  // Photo posts: the carousel blobs aren't tracked by any asset row — queue them
  // directly (they leaked forever before this).
  const images = (rec.image_urls as string[] | null) ?? [];
  if (images.length) {
    await supabaseAdmin.from('pending_media_deletions').insert(
      images.map((u) => ({ source_url: u, reason: 'recipe_delete' })),
    );
  }
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
  macros: macrosSchema,
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
      // The edit form always sends the current nutrition values, so a blank
      // field intentionally clears the stored one.
      calories: isReview ? null : (input.macros?.calories ?? null),
      protein_g: isReview ? null : (input.macros?.proteinG ?? null),
      carbs_g: isReview ? null : (input.macros?.carbsG ?? null),
      fat_g: isReview ? null : (input.macros?.fatG ?? null),
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
