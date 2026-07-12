-- Cook-intent signals + recipe lineage + pantry search substrate.
--
-- 1. cook_events: first-class server events for the app's core action —
--    actually cooking. cook_start/cook_finish come from cook mode, list_add
--    from the shopping list. These power the "X cooked this" proof strip,
--    the creator analytics Cooks panel, and a qualified-cooks ranking signal
--    that view-bots can't fake.
-- 2. recipes.cook_count: distinct users who FINISHED cooking the recipe
--    (first finish per user counts, maintained by trigger — atomic, no
--    read-modify-write races in the API).
-- 3. recipes.origin_recipe_id: the lineage column — "Cook this" posts stamp
--    the recipe they were cooked from, making every recipe a hub that
--    collects its derivatives (TikTok's sound loop, but on structured food).
-- 4. pg_trgm index on ingredient text for pantry search.

create table if not exists public.cook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  kind text not null check (kind in ('cook_start', 'cook_finish', 'list_add')),
  created_at timestamptz not null default now()
);

create index if not exists cook_events_recipe_idx on public.cook_events (recipe_id, kind);
create index if not exists cook_events_user_idx on public.cook_events (user_id, created_at desc);

-- API-mediated via service role, like the other signal tables.
alter table public.cook_events enable row level security;
revoke all on public.cook_events from anon, authenticated;

alter table public.recipes
  add column if not exists cook_count integer not null default 0;

alter table public.recipes
  add column if not exists origin_recipe_id uuid references public.recipes(id) on delete set null;

create index if not exists recipes_origin_idx on public.recipes (origin_recipe_id) where origin_recipe_id is not null;

-- Qualified cooks: a user's FIRST cook_finish for a recipe bumps the counter.
create or replace function public.bump_cook_count()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.kind = 'cook_finish' and not exists (
    select 1 from public.cook_events
    where user_id = new.user_id and recipe_id = new.recipe_id and kind = 'cook_finish' and id <> new.id
  ) then
    update public.recipes set cook_count = cook_count + 1 where id = new.recipe_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cook_events_bump_count on public.cook_events;
create trigger cook_events_bump_count
  after insert on public.cook_events
  for each row execute function public.bump_cook_count();

-- Pantry search: trigram index so ingredient terms match fast with ilike.
create extension if not exists pg_trgm;
create index if not exists recipe_ingredients_text_trgm
  on public.recipe_ingredients using gin (text gin_trgm_ops);
