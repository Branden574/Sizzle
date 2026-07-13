-- Send-to-friend, pinned chef's notes, public boards.
--
-- 1. messages.recipe_id: rich recipe-card DMs ("Send to friend") — Instagram's
--    #1 ranking signal is sends-per-reach; recipes.send_count feeds the ranker.
-- 2. comments.pinned: the recipe owner pins one comment (the substitution, the
--    "use half the salt" errata) — surfaced as a Chef's note on the recipe
--    sheet and inside cook mode.
-- 3. collections.is_public: a collection can become a shareable public board.

alter table public.messages
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null;

alter table public.recipes
  add column if not exists send_count integer not null default 0;

create or replace function public.increment_send(rid uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.recipes set send_count = send_count + 1 where id = rid;
$$;

alter table public.comments
  add column if not exists pinned boolean not null default false;

create index if not exists comments_pinned_idx on public.comments (recipe_id) where pinned;

alter table public.collections
  add column if not exists is_public boolean not null default false;
