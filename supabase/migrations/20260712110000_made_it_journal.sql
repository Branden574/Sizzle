-- Made-It Journal + save-to-cook nudges.
--
-- cook_logs: proof-of-cook entries — after finishing a cook (or tapping
-- "I made this") a user saves a photo + short note + 1-5 stars. Public entries
-- render on the recipe sheet as social proof ("what N cooks made"); all of a
-- user's entries build their personal cooking journal on the profile.
--
-- save_nudges: dedup ledger for the daily "you saved X — cook it tonight?"
-- push (one nudge per user+recipe, ever).

create table if not exists public.cook_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  note text check (note is null or char_length(note) <= 400),
  rating integer check (rating is null or rating between 1 and 5),
  photo_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists cook_logs_user_idx on public.cook_logs (user_id, created_at desc);
create index if not exists cook_logs_recipe_public_idx on public.cook_logs (recipe_id, created_at desc) where is_public;

alter table public.cook_logs enable row level security;
revoke all on public.cook_logs from anon, authenticated;

create table if not exists public.save_nudges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table public.save_nudges enable row level security;
revoke all on public.save_nudges from anon, authenticated;
