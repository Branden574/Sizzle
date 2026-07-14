-- CREATOR ACCOUNT — Phase 1 schema (additive).
alter table public.profiles
  add column if not exists creator_status text not null default 'regular'
    check (creator_status in ('regular','eligible','pending','active','suspended')),
  add column if not exists creator_since timestamptz,
  add column if not exists total_video_views bigint not null default 0,
  add column if not exists payout_country text,
  add column if not exists creator_terms_accepted_at timestamptz,
  add column if not exists creator_terms_version text,
  add column if not exists fraud_flag text check (fraud_flag in ('review','confirmed'));
alter table public.recipes add column if not exists view_count integer not null default 0;
alter table public.recipe_views add column if not exists country text, add column if not exists lang text;
create index if not exists recipe_views_recipe_idx on public.recipe_views (recipe_id);
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null, currency text not null default 'usd',
  status text not null check (status in ('pending','in_transit','paid','failed','canceled')),
  stripe_payout_id text unique, arrival_date timestamptz, created_at timestamptz not null default now());
alter table public.payouts enable row level security;
create index if not exists payouts_creator_idx on public.payouts (creator_id, created_at desc);
create table if not exists public.creator_reviews (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  reason text, status text not null default 'open' check (status in ('open','approved','denied')),
  appeal_text text, created_at timestamptz not null default now(), resolved_at timestamptz);
alter table public.creator_reviews enable row level security;
create or replace function public.guard_profile_privileged()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if current_user in ('authenticated', 'anon') and (
       new.role is distinct from old.role or new.verified_tier is distinct from old.verified_tier
       or new.banned is distinct from old.banned or new.creator_status is distinct from old.creator_status) then
    raise exception 'cannot modify privileged profile fields';
  end if;
  return new;
end; $function$;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'follow','like','comment','comment_like','verified','repost','removed','restored','banned','message','tip','follow_request',
  'creator_progress','creator_eligible','creator_activated','creator_payout_incomplete','payout_first','payout_paid','creator_monthly_summary']));
