-- Following feed via a server-side join, so the API never ships a user's (possibly
-- thousands-long) follow list back out through a PostgREST .in() URL — which 400s
-- at ~690 follows (26KB URL). SECURITY DEFINER + locked to service_role, matching
-- the repo's function-hardening convention (the API calls these with the
-- service-role client). Muted/blocked cooks (either direction) are excluded here.

create or replace function public.following_feed_recipes(p_user uuid, p_cursor timestamptz, p_limit int)
returns setof public.recipes
language sql
security definer
set search_path = ''
as $$
  select r.*
  from public.recipes r
  join public.follows f on f.cook_id = r.cook_id and f.follower_id = p_user
  where r.status = 'published'
    and (p_cursor is null or r.created_at < p_cursor)
    and not exists (select 1 from public.user_mutes m  where m.muter_id  = p_user and m.muted_id   = r.cook_id)
    and not exists (select 1 from public.user_blocks b  where b.blocker_id = p_user and b.blocked_id = r.cook_id)
    and not exists (select 1 from public.user_blocks b2 where b2.blocker_id = r.cook_id and b2.blocked_id = p_user)
  order by r.created_at desc
  limit greatest(1, least(p_limit, 50));
$$;

-- Mutual-follow cook ids (I follow them AND they follow me), for repost sourcing —
-- replaces fetching both the full follows and full followers lists into JS.
create or replace function public.mutual_follow_ids(p_user uuid)
returns table(cook_id uuid)
language sql
security definer
set search_path = ''
as $$
  select f1.cook_id
  from public.follows f1
  join public.follows f2 on f2.follower_id = f1.cook_id and f2.cook_id = f1.follower_id
  where f1.follower_id = p_user
    and not exists (select 1 from public.user_mutes m  where m.muter_id  = p_user and m.muted_id   = f1.cook_id)
    and not exists (select 1 from public.user_blocks b  where b.blocker_id = p_user and b.blocked_id = f1.cook_id)
    and not exists (select 1 from public.user_blocks b2 where b2.blocker_id = f1.cook_id and b2.blocked_id = p_user);
$$;

-- Lock down PostgREST exposure: these are service-role-only (revoke the default
-- PUBLIC execute grant, per the 20260714153850 pattern).
revoke execute on function public.following_feed_recipes(uuid, timestamptz, int) from public, anon, authenticated;
revoke execute on function public.mutual_follow_ids(uuid) from public, anon, authenticated;
grant execute on function public.following_feed_recipes(uuid, timestamptz, int) to service_role;
grant execute on function public.mutual_follow_ids(uuid) to service_role;

-- Support the capped, recency-ordered viewer-signal reads (reactions/saves) the
-- ranker now uses instead of unbounded lifetime scans.
create index if not exists reactions_user_created_idx on public.reactions (user_id, created_at desc);
create index if not exists saves_user_created_idx     on public.saves     (user_id, created_at desc);
-- Support the following-feed join (recipes by cook, newest first).
create index if not exists recipes_cook_created_idx   on public.recipes   (cook_id, created_at desc);
