-- Atomic counter adjustments, called by the (trusted) API via the service role.
-- SECURITY DEFINER + pinned search_path; counters floored at 0.

create or replace function public.adjust_recipe_counters(rid uuid, like_delta int, dislike_delta int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recipes
     set like_count    = greatest(0, like_count + like_delta),
         dislike_count = greatest(0, dislike_count + dislike_delta)
   where id = rid;
$$;

create or replace function public.adjust_follow_counters(p_follower uuid, p_cook uuid, delta int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set following_count = greatest(0, following_count + delta) where id = p_follower;
  update public.profiles set follower_count  = greatest(0, follower_count  + delta) where id = p_cook;
$$;

revoke execute on function public.adjust_recipe_counters(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.adjust_follow_counters(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.adjust_recipe_counters(uuid, int, int) to service_role;
grant execute on function public.adjust_follow_counters(uuid, uuid, int) to service_role;
