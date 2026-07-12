-- Creator feature: multi-tier subscriptions (e.g. Home Cook / Sous Chef / Pro).
-- A pricing + perks layer over the existing "subscribed" boolean — any active
-- tier grants subscriber access; tiers differ by price and listed perks. The
-- subscriptions row records which tier + its price.
create table if not exists public.creator_tiers (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  price_cents int  not null check (price_cents >= 100 and price_cents <= 50000),
  perks       text,
  sort        int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists creator_tiers_creator_idx on public.creator_tiers (creator_id, sort) where active;

-- Which tier a subscription is on (null = the creator's base sub_price_cents).
alter table public.subscriptions add column if not exists tier_id uuid references public.creator_tiers (id) on delete set null;

alter table public.creator_tiers enable row level security;
revoke all on public.creator_tiers from anon, authenticated;
