import { Hono } from 'hono';
import type { BoardDTO } from '@sizzle/shared';
import { optionalAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const boards = new Hono<AppEnv>();

/**
 * GET /boards/:id — a PUBLIC collection as a shareable board: name, owner and
 * its recipes. Only collections the owner flipped public resolve here; cards
 * flow through buildCards so blocks/privacy/premium gating all apply to the
 * viewer as everywhere else.
 */
boards.get('/:id', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'board');
  const viewerId = c.get('userId');

  const { data: col } = await supabaseAdmin.from('collections').select('id, name, user_id, is_public').eq('id', id).maybeSingle();
  if (!col || !col.is_public) throw notFound('Board not found');
  const { data: owner } = await supabaseAdmin.from('profiles').select('*').eq('id', col.user_id).maybeSingle();
  if (!owner || (owner as ProfileRow).banned) throw notFound('Board not found');

  const { data: items } = await supabaseAdmin
    .from('collection_recipes')
    .select('recipe_id, added_at')
    .eq('collection_id', id)
    .order('added_at', { ascending: false })
    .limit(100);
  const recipeIds = (items ?? []).map((r) => r.recipe_id as string);
  let recipes: BoardDTO['recipes'] = [];
  if (recipeIds.length) {
    const { data: rows } = await supabaseAdmin.from('recipes').select('*').in('id', recipeIds).eq('status', 'published');
    const order = new Map(recipeIds.map((rid, i) => [rid, i]));
    const sorted = ((rows ?? []) as RecipeRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    recipes = await buildCards(supabaseAdmin, viewerId, sorted);
  }
  return c.json<BoardDTO>({ id: col.id as string, name: col.name as string, owner: cookSummary(owner as ProfileRow), recipes });
});
