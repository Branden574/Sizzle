-- ============================================================================
-- Hashtags — a normalized text[] of tags on each recipe (parsed from the
-- caption + title on create) plus a free-text caption. GIN-indexed for fast
-- tag-membership search, trending aggregation, and ranking affinity.
-- ============================================================================
alter table public.recipes add column caption text;
alter table public.recipes add column tags text[] not null default '{}';
create index recipes_tags_gin on public.recipes using gin (tags);
