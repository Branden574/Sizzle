-- Creator insights: save-to-unlock funnel for premium recipes. How many people
-- watched a paid recipe, saved it, and actually unlocked it — the conversion path.
create or replace function public.creator_unlock_funnel(uid uuid)
  returns table (views bigint, saves bigint, unlocks bigint)
  language sql
  stable
  security definer
  set search_path to ''
as $$
  with premium as (
    select id, save_count from public.recipes
    where cook_id = uid and status = 'published' and price_cents is not null
  )
  select
    (select count(*) from public.recipe_views v where v.recipe_id in (select id from premium))::bigint  as views,
    (select coalesce(sum(save_count), 0) from premium)::bigint                                           as saves,
    (select count(*) from public.tips t
       where t.creator_id = uid and t.kind = 'unlock' and t.status = 'succeeded')::bigint                as unlocks;
$$;
