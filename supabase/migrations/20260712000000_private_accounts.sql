-- Private accounts + follow requests.
--
-- A private profile's content (recipes, live, followers list) is only visible to
-- accepted followers; everyone else sees a limited profile and must request to
-- follow. Requests live in their own table so every existing `follows` query
-- (feed, counts, viewer state, triggers) keeps meaning "accepted follower".

alter table public.profiles
  add column if not exists private boolean not null default false;

-- profiles uses column-scoped grants (20260701100000); new columns don't inherit.
-- Owners flip the flag through PATCH /me (user-token client), and the flag itself
-- is public knowledge (a private profile visibly says so).
grant select (private) on public.profiles to anon, authenticated;
grant update (private) on public.profiles to authenticated;

create table if not exists public.follow_requests (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  cook_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, cook_id)
);

-- Incoming-requests lookup for the private account owner.
create index if not exists follow_requests_cook_idx on public.follow_requests (cook_id, created_at desc);

-- API-mediated (service role) like the other social tables: no direct PostgREST access.
alter table public.follow_requests enable row level security;
revoke all on public.follow_requests from anon, authenticated;

-- Extend the notifications kind list with the follow-request flow. Also adds
-- 'message' and 'tip', which the app already sends but the original CHECK
-- predates — those inserts were failing the constraint silently.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','verified','repost','removed','restored','banned','message','tip','follow_request'));

-- Lock down the follows table. The init schema left `follows_select_all` open to
-- anon/authenticated, so a private account's follower AND following lists were
-- readable straight from PostgREST with the public anon key — bypassing the API's
-- canViewPrivate() gate entirely. The client never reads follows directly (all
-- social reads go through the API on the service-role key, and counts are
-- denormalized onto profiles.follower_count/following_count), so we drop the
-- world-read policy and revoke table access. Same API-mediated posture as the
-- other social tables (reactions, saves, follow_requests).
drop policy if exists follows_select_all on public.follows;
drop policy if exists follows_insert_self on public.follows;
drop policy if exists follows_delete_self on public.follows;
revoke all on public.follows from anon, authenticated;
