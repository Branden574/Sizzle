import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { optionalAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

export const hashtags = new Hono<AppEnv>();

interface Suggestion {
  tag: string;
  displayName: string;
  postCount: number;
  featured: boolean;
  isNew: boolean;
}

function toSuggestion(r: { normalized_name: string; display_name: string; post_count: number; is_featured: boolean }): Suggestion {
  return { tag: r.normalized_name, displayName: r.display_name, postCount: r.post_count, featured: r.is_featured, isNew: false };
}

/**
 * GET /hashtags/suggest?q=<prefix> — composer autocomplete. Prefix match over canonical
 * (active, non-blocked) hashtags, ranked by usage; blocked/sensitive tags never surface here.
 * With no prefix, returns featured/popular starters. Always offers the exact typed term (even
 * if brand-new) so a user can coin a tag. Small, fast, cacheable; safe for anon.
 */
hashtags.get('/suggest', optionalAuth, async (c) => {
  const raw = (c.req.query('q') ?? '').trim();
  const q = raw.replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);

  let query = supabaseAdmin
    .from('hashtags')
    .select('normalized_name, display_name, post_count, is_featured')
    .eq('status', 'active')
    .eq('is_blocked', false)
    .eq('is_sensitive', false)
    .order('is_featured', { ascending: false })
    .order('post_count', { ascending: false })
    .limit(8);
  if (q.length >= 1) query = query.like('normalized_name', `${q}%`);

  const { data } = await query;
  const out = (data ?? []).map(toSuggestion);
  // Offer the exact term so a user can create a new hashtag (min length 2, matches normalizeTag).
  if (q.length >= 2 && !out.some((s) => s.tag === q)) {
    out.push({ tag: q, displayName: q, postCount: 0, featured: false, isNew: true });
  }
  // Autocomplete suggestions are non-personalized + safe to edge-cache briefly.
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(out.slice(0, 8));
});
