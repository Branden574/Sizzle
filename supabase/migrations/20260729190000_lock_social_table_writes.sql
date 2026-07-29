-- Lock down direct PostgREST writes to the remaining social tables.
--
-- Extends the precedent set by 20260717001356_lock_recipes_video_assets_writes (recipes,
-- video_assets) and 20260620250000_profile_column_lock / 20260714154350 (profiles) to every
-- other table that still carried a blanket `grant ... to anon, authenticated` from its
-- creating migration.
--
-- WHY. The Supabase anon key is public and PostgREST is exposed, so these grants put RLS in
-- the position of being the ONLY control on writes. Before this migration, production ACLs
-- gave BOTH anon and authenticated full INSERT/UPDATE/DELETE on collections, notifications,
-- reactions, reposts and saves, and INSERT/UPDATE/DELETE on comments. Each table's policies
-- are column-blind (`with check (user_id = auth.uid())` and friends), so a signed-in user
-- could PATCH their own row's ARBITRARY columns straight through PostgREST:
--   * comments: set pinned=true (forge a Chef's note), clear hidden to undo moderation,
--     or forge like_count/reply_count
--   * notifications: rewrite type/actor_id/recipe_id/amount_cents on their own rows —
--     e.g. turn a 'follow' into a 'tip' with an arbitrary amount
--   * reactions / saves: forge rows to game the For-You ranking's engagement signals
--   * reposts: insert a repost row against ANY recipe id
--
-- SAFE TO REVOKE. The web client makes ZERO direct table calls — verified: there is no
-- `supabase.from(` anywhere in apps/web/src. It uses Supabase for `auth` (12 call sites) and
-- `storage` (5) only; every table read and write goes through the API on the service-role
-- key, which is unaffected by these grants.
--
-- The one exception is apps/api's `userClient` (anon key + the caller's JWT, so queries run
-- under that user's RLS). It is used in exactly four places, all in routes/me.ts, and touches
-- exactly two tables:
--     profiles -> update   (already column-scoped by the profile-lock migrations; untouched here)
--     saves    -> select   (SELECT is deliberately retained below)
-- Nothing else in the codebase runs under anon/authenticated, so nothing else can break.
--
-- SELECT is retained throughout, matching the recipes/video_assets precedent: this migration
-- narrows write surface only and changes no policy, so read behaviour is bit-for-bit identical.
--
-- user_blocks is intentionally absent: it already has RLS enabled with ZERO policies, so it
-- is fail-closed for anon/authenticated no matter what the grants say.

revoke insert, update, delete on public.comments      from anon, authenticated;
revoke insert, update, delete on public.notifications  from anon, authenticated;
revoke insert, update, delete on public.reactions      from anon, authenticated;
revoke insert, update, delete on public.reposts        from anon, authenticated;
revoke insert, update, delete on public.saves          from anon, authenticated;
revoke insert, update, delete on public.collections    from anon, authenticated;

-- Belt and braces: anon has no business writing any of these even if a future migration
-- re-grants broadly via `grant all on all tables in schema public`.
revoke insert, update, delete on public.user_blocks    from anon, authenticated;
