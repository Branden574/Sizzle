-- TikTok-style creator moderation: the recipe owner (or an admin) can hide a
-- comment on their own post. Hidden comments stay in the table but are filtered
-- out of the public thread by the API. The original commenter still sees their
-- own comment (shadow-hide); the owner/admin see it flagged with an unhide path.
alter table public.comments
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;

-- Fast skip of hidden rows when serving the public thread.
create index if not exists comments_recipe_visible_idx
  on public.comments (recipe_id) where hidden = false;
