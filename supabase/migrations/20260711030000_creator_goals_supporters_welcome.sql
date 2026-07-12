-- Creator batch: funding goals, top-supporters leaderboard, auto welcome DM.

-- Funding goal (e.g. "New camera $500") with a live progress bar. raised is bumped
-- by net earnings as they settle; label/target are creator-set (null = no goal).
alter table public.profiles add column if not exists goal_cents        integer;
alter table public.profiles add column if not exists goal_label        text;
alter table public.profiles add column if not exists goal_raised_cents integer not null default 0;

-- Optional welcome/thank-you DM auto-sent to a new subscriber (null = off).
alter table public.profiles add column if not exists welcome_dm text;

-- These are creator-public-ish but managed only by the API (service role). The
-- profiles column-grant (20260701100000) already omits them, so anon/authenticated
-- can't read goal_raised/welcome_dm directly; the API surfaces the safe bits.

-- Leaderboard: a creator's biggest supporters by net contribution across the ledger.
create or replace function public.creator_top_supporters(uid uuid)
  returns table (supporter_id uuid, net_cents bigint, cnt bigint)
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select t.tipper_id as supporter_id,
         sum(t.net_cents)::bigint as net_cents,
         count(*)::bigint         as cnt
  from public.tips t
  where t.creator_id = uid
    and t.status = 'succeeded'
    and t.tipper_id is not null
  group by t.tipper_id
  order by net_cents desc
  limit 10;
$$;

-- Atomically add net earnings to a creator's funding goal progress.
create or replace function public.bump_goal(p_creator uuid, p_net integer)
  returns void
  language sql
  security definer
  set search_path to ''
as $$
  update public.profiles
     set goal_raised_cents = goal_raised_cents + greatest(0, p_net)
   where id = p_creator and goal_cents is not null;
$$;
