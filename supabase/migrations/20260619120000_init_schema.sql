-- ============================================================================
-- Sizzle — Phase 1 schema: profiles, recipes (+ ingredients/steps), video
-- assets, follows, reactions, saves. RLS-first, with denormalized display
-- counters so seeded sample data shows realistic totals.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users; every user is also a potential cook)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  handle          text not null unique,
  display_name    text not null,
  bio             text,
  avatar_url      text,
  avatar_color    text not null default 'linear-gradient(135deg,#3a2a22,#1b1512)',
  is_cook         boolean not null default false,
  tastes          text[] not null default '{}',
  -- denormalized display counters (seeded for sample cooks; adjusted on action)
  follower_count  integer not null default 0,
  following_count integer not null default 0,
  total_likes     bigint  not null default 0,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- video_assets  (one per uploaded recipe video; provider = mock | cloudflare)
-- ----------------------------------------------------------------------------
create table public.video_assets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  provider         text not null default 'mock',
  provider_uid     text,
  status           text not null default 'pending'
                     check (status in ('pending','uploading','processing','ready','error')),
  hls_url          text,
  poster_url       text,
  duration_seconds numeric,
  created_at       timestamptz not null default now()
);
create index video_assets_owner_id_idx   on public.video_assets (owner_id);
create index video_assets_provider_uid_idx on public.video_assets (provider_uid);

-- ----------------------------------------------------------------------------
-- recipes
-- ----------------------------------------------------------------------------
create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  cook_id        uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  cuisine        text not null default '',
  time_minutes   integer not null default 0,
  servings       integer not null default 1,
  level          text not null default 'Easy',
  bg             text not null default 'linear-gradient(165deg,#2a160e,#b5471f)',
  video_asset_id uuid references public.video_assets (id) on delete set null,
  status         text not null default 'published' check (status in ('draft','published','removed')),
  -- denormalized display counters
  like_count     integer not null default 0,
  dislike_count  integer not null default 0,
  comment_count  integer not null default 0,
  share_count    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index recipes_cook_id_idx        on public.recipes (cook_id);
create index recipes_video_asset_id_idx on public.recipes (video_asset_id);
-- feed ordering: newest published first
create index recipes_published_idx      on public.recipes (created_at desc) where status = 'published';

-- ----------------------------------------------------------------------------
-- recipe_ingredients / recipe_steps  (structured, ordered)
-- ----------------------------------------------------------------------------
create table public.recipe_ingredients (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position  integer not null,
  text      text not null,
  unique (recipe_id, position)
);
create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);

create table public.recipe_steps (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position  integer not null,
  text      text not null,
  unique (recipe_id, position)
);
create index recipe_steps_recipe_id_idx on public.recipe_steps (recipe_id);

-- ----------------------------------------------------------------------------
-- follows  (follower -> cook)
-- ----------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  cook_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, cook_id),
  check (follower_id <> cook_id)
);
create index follows_cook_id_idx on public.follows (cook_id);

-- ----------------------------------------------------------------------------
-- reactions  (one per user+recipe; like/dislike mutually exclusive)
-- ----------------------------------------------------------------------------
create table public.reactions (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  kind       text not null check (kind in ('like','dislike')),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index reactions_recipe_id_idx on public.reactions (recipe_id);

-- ----------------------------------------------------------------------------
-- saves
-- ----------------------------------------------------------------------------
create table public.saves (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index saves_recipe_id_idx on public.saves (recipe_id);

-- ============================================================================
-- Auto-create a profile whenever an auth user signs up.
-- SECURITY DEFINER so it can insert past RLS; pinned search_path; handle is
-- derived from email + a short uuid slice to stay unique.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_handle = '' then base_handle := 'cook'; end if;

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    base_handle || substr(replace(new.id::text, '-', ''), 1, 4),
    coalesce(new.raw_user_meta_data ->> 'display_name', initcap(base_handle))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.video_assets        enable row level security;
alter table public.recipes             enable row level security;
alter table public.recipe_ingredients  enable row level security;
alter table public.recipe_steps        enable row level security;
alter table public.follows             enable row level security;
alter table public.reactions           enable row level security;
alter table public.saves               enable row level security;

-- profiles: world-readable; self-update only (inserts happen via trigger)
create policy profiles_select_all on public.profiles
  for select to anon, authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- recipes: published are public; owners see/manage their own
create policy recipes_select_published on public.recipes
  for select to anon, authenticated
  using (status = 'published' or cook_id = (select auth.uid()));
create policy recipes_insert_own on public.recipes
  for insert to authenticated with check (cook_id = (select auth.uid()));
create policy recipes_update_own on public.recipes
  for update to authenticated
  using (cook_id = (select auth.uid())) with check (cook_id = (select auth.uid()));
create policy recipes_delete_own on public.recipes
  for delete to authenticated using (cook_id = (select auth.uid()));

-- ingredients/steps: readable by all; writable by the recipe's owner
create policy ingredients_select_all on public.recipe_ingredients
  for select to anon, authenticated using (true);
create policy ingredients_write_owner on public.recipe_ingredients
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.cook_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.cook_id = (select auth.uid())));

create policy steps_select_all on public.recipe_steps
  for select to anon, authenticated using (true);
create policy steps_write_owner on public.recipe_steps
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.cook_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.cook_id = (select auth.uid())));

-- video_assets: owner manages own; ready assets are publicly readable (playback)
create policy video_assets_select on public.video_assets
  for select to anon, authenticated
  using (status = 'ready' or owner_id = (select auth.uid()));
create policy video_assets_insert_own on public.video_assets
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy video_assets_update_own on public.video_assets
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- follows: public counts; a user manages only their own follow rows
create policy follows_select_all on public.follows
  for select to anon, authenticated using (true);
create policy follows_insert_self on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy follows_delete_self on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

-- reactions: private to the user (display counts are denormalized on recipes)
create policy reactions_all_self on public.reactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- saves: private to the user
create policy saves_all_self on public.saves
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================================
-- Grants (RLS still governs which rows are visible/writable)
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
