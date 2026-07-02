-- ── Creator monetization v1: tips ───────────────────────────────────────────
-- Every tip is a ledger row storing gross / platform fee / creator net in
-- integer cents, so the 5.5% platform fee is permanently auditable and the
-- creator-facing UI can show the exact split. Payouts ride Stripe Connect
-- (profiles.stripe_account_id); a mock provider covers dev/test.
create table if not exists public.tips (
  id            uuid primary key default gen_random_uuid(),
  tipper_id     uuid not null references public.profiles (id) on delete cascade,
  creator_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id     uuid references public.recipes (id) on delete set null,
  amount_cents  integer not null check (amount_cents > 0),
  fee_cents     integer not null check (fee_cents >= 0),
  net_cents     integer not null check (net_cents >= 0),
  currency      text not null default 'usd',
  status        text not null default 'pending' check (status in ('pending', 'succeeded', 'refunded')),
  provider      text not null check (provider in ('stripe', 'mock')),
  provider_ref  text,
  created_at    timestamptz not null default now(),
  succeeded_at  timestamptz,
  check (amount_cents = fee_cents + net_cents),
  check (tipper_id <> creator_id)
);
create index if not exists tips_creator_idx on public.tips (creator_id, status, created_at desc);
create index if not exists tips_tipper_idx on public.tips (tipper_id, created_at desc);
create unique index if not exists tips_provider_ref_uidx on public.tips (provider, provider_ref) where provider_ref is not null;

alter table public.tips enable row level security;
-- Service-role only (through the API); no client policies = deny by default.

-- Creator payout state on the profile.
alter table public.profiles
  add column if not exists monetization_status text not null default 'none'
    check (monetization_status in ('none', 'pending', 'active')),
  add column if not exists stripe_account_id text;
