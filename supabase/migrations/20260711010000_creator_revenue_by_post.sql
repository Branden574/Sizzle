-- Creator insights #4: revenue-per-post. The earnings ledger tags each dollar
-- with a recipe_id (unlocks + recipe-tied support), but analytics and earnings
-- never joined — so creators can't see which recipe actually earned. Aggregate
-- net earnings per recipe over the whole ledger (not just the newest 100).
create or replace function public.creator_revenue_by_post(uid uuid)
  returns table (recipe_id uuid, net_cents bigint, earn_count bigint)
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select t.recipe_id,
         sum(t.net_cents)::bigint as net_cents,
         count(*)::bigint         as earn_count
  from public.tips t
  where t.creator_id = uid
    and t.status = 'succeeded'
    and t.recipe_id is not null
  group by t.recipe_id;
$$;
