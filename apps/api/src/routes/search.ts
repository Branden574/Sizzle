import { Hono } from 'hono';
import type { SearchResults } from '@sizzle/shared';
import { optionalAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const search = new Hono<AppEnv>();

/** GET /search?q=… — recipes (title/cuisine) + cooks (name/handle). */
search.get('/', optionalAuth, async (c) => {
  // strip characters that would break PostgREST's or() filter grammar
  const q = (c.req.query('q') ?? '').replace(/[%,()]/g, '').trim();
  if (q.length < 1) return c.json<SearchResults>({ recipes: [], cooks: [] });
  const like = `%${q}%`;

  const [{ data: recipeRows }, { data: cookRows }] = await Promise.all([
    supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('status', 'published')
      .or(`title.ilike.${like},cuisine.ilike.${like}`)
      .order('like_count', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('is_cook', true)
      .or(`display_name.ilike.${like},handle.ilike.${like}`)
      .order('follower_count', { ascending: false })
      .limit(10),
  ]);

  const recipes = await buildCards(supabaseAdmin, c.get('userId'), (recipeRows ?? []) as RecipeRow[]);
  const cooks = ((cookRows ?? []) as ProfileRow[]).map(cookSummary);
  return c.json<SearchResults>({ recipes, cooks });
});
