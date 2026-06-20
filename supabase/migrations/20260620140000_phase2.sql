-- ============================================================================
-- Phase 2 — comments + notifications.
-- ============================================================================

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 600),
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index comments_recipe_idx on public.comments (recipe_id, created_at desc);
create index comments_author_idx on public.comments (author_id);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade, -- recipient
  type       text not null check (type in ('follow', 'like', 'comment')),
  actor_id   uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid references public.recipes (id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Denormalized comment counter (called by the trusted API via service role).
create or replace function public.adjust_comment_count(rid uuid, delta int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recipes set comment_count = greatest(0, comment_count + delta) where id = rid;
$$;
revoke execute on function public.adjust_comment_count(uuid, int) from public, anon, authenticated;
grant execute on function public.adjust_comment_count(uuid, int) to service_role;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

-- comments: world-readable; authored by self; deletable by author.
create policy comments_select_all on public.comments
  for select to anon, authenticated using (true);
create policy comments_insert_self on public.comments
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy comments_delete_own on public.comments
  for delete to authenticated using (author_id = (select auth.uid()));

-- notifications: private to the recipient (inserts come from the service role).
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Grants (new tables) ─────────────────────────────────────────────────────
grant select on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;
grant select, update on public.notifications to authenticated;
