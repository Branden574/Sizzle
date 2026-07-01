-- Creator post controls, persisted per recipe (were previously local-only in the
-- client, so "disable comments / likes / hide counts" never applied to other
-- viewers or survived a reload). Served via mappers.toCard; edited via
-- PATCH /recipes/:id/controls (owner only).
alter table public.recipes
  add column if not exists likes_enabled boolean not null default true,
  add column if not exists comments_enabled boolean not null default true,
  add column if not exists counts_visible boolean not null default true;
