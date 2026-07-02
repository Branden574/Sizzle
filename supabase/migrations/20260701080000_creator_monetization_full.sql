-- ── Full creator monetization: generalize the ledger + add unlock & subs ──────
-- The tips table is now the general creator-earnings ledger; `kind` distinguishes
-- one-off support, per-recipe unlocks, and subscription renewals. Every row still
-- carries the gross/fee/net split (10% platform fee), so earnings + the fee
-- rationale work uniformly across all three.
alter table public.tips add column if not exists kind text not null default 'support'
  check (kind in ('support', 'subscription', 'unlock'));

-- Paid premium recipes: a creator can price a recipe; fans unlock it once.
alter table public.recipes add column if not exists price_cents integer
  check (price_cents is null or price_cents >= 100);
create table if not exists public.recipe_unlocks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.recipe_unlocks enable row level security;
create index if not exists recipe_unlocks_recipe_idx on public.recipe_unlocks (recipe_id);

-- Creator subscriptions: a monthly price on the profile + a subscription per (fan, creator).
alter table public.profiles add column if not exists sub_price_cents integer
  check (sub_price_cents is null or sub_price_cents >= 100);
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  subscriber_id          uuid not null references public.profiles (id) on delete cascade,
  creator_id             uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text unique,
  price_cents            integer not null,
  status                 text not null default 'active' check (status in ('active', 'canceled', 'past_due')),
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  check (subscriber_id <> creator_id),
  unique (subscriber_id, creator_id)
);
alter table public.subscriptions enable row level security;
create index if not exists subscriptions_creator_idx on public.subscriptions (creator_id, status);
create index if not exists subscriptions_subscriber_idx on public.subscriptions (subscriber_id, status);
