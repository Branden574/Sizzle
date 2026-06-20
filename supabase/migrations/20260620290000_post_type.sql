-- ============================================================================
-- Foodie reviews. A post is either a 'recipe' (a tutorial with ingredients +
-- method) or a 'review' (a creator reviewing a dish/restaurant, with an optional
-- 1–5 star rating and no recipe steps). Existing rows are recipes.
-- ============================================================================
alter table public.recipes
  add column if not exists post_type text not null default 'recipe',
  add column if not exists rating smallint;

-- Constrain the new columns (idempotent: drop-then-add so re-runs don't error).
alter table public.recipes drop constraint if exists recipes_post_type_check;
alter table public.recipes
  add constraint recipes_post_type_check check (post_type in ('recipe', 'review'));

alter table public.recipes drop constraint if exists recipes_rating_check;
alter table public.recipes
  add constraint recipes_rating_check check (rating is null or (rating between 1 and 5));

-- A rating only makes sense on a review.
alter table public.recipes drop constraint if exists recipes_rating_review_only;
alter table public.recipes
  add constraint recipes_rating_review_only check (rating is null or post_type = 'review');

-- Discover/feeds may filter by type; partial index keeps the (small) review set cheap.
create index if not exists recipes_post_type_idx on public.recipes (post_type) where post_type = 'review';
