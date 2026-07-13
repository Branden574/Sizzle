-- Scale hardening: additive, pure-win indexes + storage tuning.
--
-- All indexes are CREATE INDEX IF NOT EXISTS and touch only existing columns, so
-- this migration is safe to run against the live schema while the current app is
-- in review — it changes no behavior, only makes existing queries faster.
--
-- Columns referenced (verified against the schema):
--   profiles.is_cook, profiles.private, profiles.follower_count  (init + private-accounts)
--   profiles.display_name, profiles.handle                       (init)
--   recipes.title, recipes.cuisine                               (init)

-- pg_trgm powers the ilike/substring search indexes below. Already enabled by an
-- earlier migration; repeated for standalone-apply safety.
create extension if not exists pg_trgm;

-- Suggested-cooks discovery: top public cooks by follower count. The partial
-- predicate matches /cooks/suggested (is_cook AND not private) so the planner can
-- satisfy the "order by follower_count desc limit N" scan from the index alone.
create index if not exists profiles_cook_followers_idx
  on public.profiles (follower_count desc)
  where is_cook and not private;

-- Trigram indexes for fuzzy/substring search on recipe + profile text.
create index if not exists recipes_title_trgm
  on public.recipes using gin (title gin_trgm_ops);
create index if not exists recipes_cuisine_trgm
  on public.recipes using gin (cuisine gin_trgm_ops);
create index if not exists profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);
create index if not exists profiles_handle_trgm
  on public.profiles using gin (handle gin_trgm_ops);

-- Storage tuning for the two hottest, most-updated tables. A lower fillfactor
-- leaves room for HOT updates in-page (less index churn on counter bumps), and a
-- tighter autovacuum scale factor keeps these fast-churning tables vacuumed sooner
-- as row counts grow. Both are metadata-only settings; existing rows are unaffected.
alter table public.recipes  set (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.02);
alter table public.profiles set (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.02);
