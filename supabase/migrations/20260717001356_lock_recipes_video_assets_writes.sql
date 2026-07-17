-- Lock down direct PostgREST writes to recipes and video_assets.
--
-- These tables carry moderation state (recipes.status/removed_at/auto_hidden,
-- video_assets.status), playback URLs (hls_url/mp4_url/poster_url), and
-- denormalized ranking counters. The blanket `grant ... to authenticated` from
-- init_schema, combined with the column-blind `for update using
-- (owner_id = auth.uid())` RLS policies, let any user with the PUBLIC anon key
-- PATCH their own row's arbitrary columns via PostgREST:
--   * set video_assets.status='ready' to bypass thumbnail moderation,
--   * inject off-domain hls_url/poster_url served through the trusted app to
--     every viewer (phishing / tracking / NSFW that skipped moderation),
--   * un-remove admin-removed or auto-hidden recipes,
--   * forge like_count/view_count/etc. to game the For-You ranking.
--
-- Safe to revoke: the web client issues ZERO direct writes to either table
-- (verified: no .from('recipes'|'video_assets').insert/update/delete anywhere in
-- apps/web) — all writes flow through the service-role API. Every counter/
-- reaction function that touches recipes (toggle_reaction, adjust_*_count,
-- bump_view_count, increment_share/send, toggle_save, cleanup_user_counters,
-- adjust_recipe_counters) is SECURITY DEFINER, so it runs as the owner and is
-- unaffected. service_role retains all privileges.
--
-- Mirrors the precedent set by 20260620250000_profile_column_lock and
-- 20260714154350_harden_profiles_grants_and_guard for profiles.

revoke insert, update, delete on public.recipes from authenticated, anon;
revoke insert, update, delete on public.video_assets from authenticated, anon;
