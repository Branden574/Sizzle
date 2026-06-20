-- ============================================================================
-- Phase 3 — offline downloads. Server tracks WHICH recipes a user marked for
-- offline; the recipe content itself is cached client-side (localStorage).
-- ============================================================================

create table public.downloads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index downloads_recipe_idx on public.downloads (recipe_id);

alter table public.downloads enable row level security;

create policy downloads_all_self on public.downloads
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.downloads to authenticated;
