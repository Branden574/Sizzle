-- ============================================================================
-- Saved Collections ("cookbooks"). A user groups saved recipes into named
-- folders. Two tables: collections (owned by a user) and a join to recipes.
-- The API uses the service role and enforces ownership in-route; RLS is
-- defense-in-depth so a leaked anon/auth key still can't read others' folders.
-- ============================================================================
create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists collections_user_idx on public.collections (user_id, created_at desc);

create table if not exists public.collection_recipes (
  collection_id uuid not null references public.collections(id) on delete cascade,
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);
create index if not exists collection_recipes_recipe_idx on public.collection_recipes (recipe_id);

alter table public.collections enable row level security;
alter table public.collection_recipes enable row level security;

-- Owners can do anything with their own collections.
drop policy if exists collections_owner_all on public.collections;
create policy collections_owner_all on public.collections
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Owners can manage rows in collections they own.
drop policy if exists collection_recipes_owner_all on public.collection_recipes;
create policy collection_recipes_owner_all on public.collection_recipes
  for all using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  );
