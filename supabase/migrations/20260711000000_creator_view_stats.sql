-- Creator insights #1: watch-time & completion. recipe_views already logs
-- dwell_ms/completed/skipped per view, but GET /me/analytics never read it — so a
-- video app showed creators zero views. Aggregate per recipe for the creator.
create or replace function public.creator_view_stats(p_creator uuid)
  returns table (
    recipe_id       uuid,
    views           bigint,
    avg_dwell_ms    numeric,
    completed_count bigint,
    skipped_count   bigint
  )
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select v.recipe_id,
         count(*)                                as views,
         coalesce(avg(v.dwell_ms), 0)            as avg_dwell_ms,
         count(*) filter (where v.completed)     as completed_count,
         count(*) filter (where v.skipped)       as skipped_count
  from public.recipe_views v
  join public.recipes r on r.id = v.recipe_id
  where r.cook_id = p_creator
  group by v.recipe_id;
$$;
