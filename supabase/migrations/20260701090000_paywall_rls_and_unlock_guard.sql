-- Adversarial money-review fixes for the premium-recipe / subscription launch.
--
-- CRITICAL — the paywall was enforced only in the API mapping layer, but the
-- content tables underneath carried permissive public SELECT policies. With the
-- (public) anon key, anyone could read a paid recipe's ingredients, steps,
-- photos and playable video URL straight from the Data API, bypassing every
-- unlock/subscription gate. The app never reads these tables from the client —
-- all data flows through the service-role API — so we restrict direct SELECT to
-- the owner. The API keeps working (service role bypasses RLS) and is now the
-- single read path that enforces the paywall, blocking, and moderation.

-- recipes: owner-only direct read (published rows are served through the API).
drop policy if exists recipes_select_published on public.recipes;
create policy recipes_select_own on public.recipes
  for select to anon, authenticated
  using (cook_id = (select auth.uid()));

-- ingredients: owner-only (was USING (true) — the core leak).
drop policy if exists ingredients_select_all on public.recipe_ingredients;
create policy ingredients_select_own on public.recipe_ingredients
  for select to anon, authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id and r.cook_id = (select auth.uid())
  ));

-- steps: owner-only (was USING (true)).
drop policy if exists steps_select_all on public.recipe_steps;
create policy steps_select_own on public.recipe_steps
  for select to anon, authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_steps.recipe_id and r.cook_id = (select auth.uid())
  ));

-- video assets: owner-only (was readable for every 'ready' asset — leaked hls/mp4).
drop policy if exists video_assets_select on public.video_assets;
create policy video_assets_select_own on public.video_assets
  for select to anon, authenticated
  using (owner_id = (select auth.uid()));

-- MEDIUM — one in-flight unlock checkout per (buyer, recipe). Prevents a user
-- opening two checkout sessions for the same premium recipe and completing both
-- (the grant is idempotent, but the charge is not). Mirrors the
-- unique(subscriber_id, creator_id) guard that already protects subscriptions.
create unique index if not exists tips_one_pending_unlock
  on public.tips (tipper_id, recipe_id)
  where kind = 'unlock' and status = 'pending';
