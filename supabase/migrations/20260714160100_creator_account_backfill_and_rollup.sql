-- CREATOR ACCOUNT — Phase 1 backfill + rollup trigger + grandfather.
update public.recipes r set view_count = coalesce(v.n, 0)
from (select recipe_id, count(*)::int n from public.recipe_views group by recipe_id) v where v.recipe_id = r.id;
update public.profiles p set total_video_views = coalesce(s.total, 0)
from (select cook_id, sum(view_count)::bigint total from public.recipes group by cook_id) s where s.cook_id = p.id;
create or replace function public.rollup_total_video_views()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if tg_op = 'UPDATE' and new.view_count is distinct from old.view_count then
    update public.profiles set total_video_views = greatest(0, total_video_views + (new.view_count - old.view_count)) where id = new.cook_id;
  elsif tg_op = 'INSERT' and coalesce(new.view_count,0) <> 0 then
    update public.profiles set total_video_views = total_video_views + new.view_count where id = new.cook_id;
  elsif tg_op = 'DELETE' and coalesce(old.view_count,0) <> 0 then
    update public.profiles set total_video_views = greatest(0, total_video_views - old.view_count) where id = old.cook_id;
  end if; return null;
end; $function$;
revoke execute on function public.rollup_total_video_views() from public, anon, authenticated;
drop trigger if exists recipes_rollup_views on public.recipes;
create trigger recipes_rollup_views after insert or update of view_count or delete on public.recipes
  for each row execute function public.rollup_total_video_views();
update public.profiles set creator_status = 'active', creator_since = coalesce(creator_since, now())
  where monetization_status = 'active' and creator_status = 'regular';
update public.profiles set creator_status = 'eligible'
  where creator_status = 'regular' and follower_count >= 1000 and total_video_views >= 100000;
