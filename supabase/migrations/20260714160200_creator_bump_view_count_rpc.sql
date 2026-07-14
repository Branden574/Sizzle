-- bump_view_count(rid): atomically increment recipes.view_count for a single
-- recipe. Called by the API on each qualifying (non-self) view; the
-- recipes_rollup_views trigger cascades the delta into
-- profiles.total_video_views (the public metric + Creator eligibility signal).
--
-- SECURITY DEFINER so the API's service role is the only caller: view counts
-- must not be writable by anon/authenticated (would let anyone inflate a
-- creator's public views / eligibility). Per the SECURITY DEFINER lockdown
-- pattern, revoke from PUBLIC (not just anon/authenticated) then grant only
-- service_role. search_path pinned to '' to prevent search-path hijacking.
create or replace function public.bump_view_count(rid uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.recipes set view_count = view_count + 1 where id = rid;
$$;

revoke execute on function public.bump_view_count(uuid) from public, anon, authenticated;
grant execute on function public.bump_view_count(uuid) to service_role;
