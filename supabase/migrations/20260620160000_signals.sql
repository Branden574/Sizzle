-- ============================================================================
-- Phase 4 — engagement instrumentation that powers For You ranking.
-- (Heuristic ranker uses these now; a learned model is the Stage 2 follow-up.)
-- ============================================================================

-- What we've shown a user (served history → de-dup + click-through signal).
create table public.recipe_impressions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  served_at  timestamptz not null default now()
);
create index recipe_impressions_user_idx on public.recipe_impressions (user_id, served_at desc);
create index recipe_impressions_pair_idx on public.recipe_impressions (user_id, recipe_id);

-- Watch behavior — the strongest relevance signal.
create table public.recipe_views (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  dwell_ms   integer not null default 0,
  completed  boolean not null default false,
  skipped    boolean not null default false,
  created_at timestamptz not null default now()
);
create index recipe_views_user_idx on public.recipe_views (user_id, created_at desc);
create index recipe_views_pair_idx on public.recipe_views (user_id, recipe_id);

alter table public.recipe_impressions enable row level security;
alter table public.recipe_views enable row level security;

-- Private to the user; writes go through the service role (server-trusted).
create policy impressions_select_own on public.recipe_impressions
  for select to authenticated using (user_id = (select auth.uid()));
create policy views_select_own on public.recipe_views
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.recipe_impressions to authenticated;
grant select on public.recipe_views to authenticated;
