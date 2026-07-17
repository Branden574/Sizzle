-- Apple In-App Purchase ledger for per-recipe premium unlocks.
--
-- Each consumable purchase (a price-tier product) is recorded here BY ITS STORE
-- TRANSACTION ID, which is the primary key — so one Apple purchase can only ever
-- grant one recipe unlock, even if the confirm endpoint is called twice or a buyer
-- buys the same $ tier for two different recipes (each is a distinct transaction).
-- The row also lets the refund webhook find exactly which unlock to revoke.
--
-- Deny-by-default RLS (no client policies + revoke), matching recipe_unlocks /
-- subscriptions: only the service-role API reads or writes it, so a client can't
-- self-grant an unlock by inserting a row.

create table if not exists public.iap_transactions (
  transaction_id text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  recipe_id      uuid not null references public.recipes(id) on delete cascade,
  product_id     text not null,
  price_cents    integer,
  store          text not null default 'app_store',
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

create index if not exists iap_transactions_user_idx on public.iap_transactions (user_id);
create index if not exists iap_transactions_recipe_idx on public.iap_transactions (recipe_id);
-- Find an unconsumed purchase of a given product for a user (the confirm endpoint).
create index if not exists iap_transactions_user_product_idx on public.iap_transactions (user_id, product_id);

alter table public.iap_transactions enable row level security;
revoke all on public.iap_transactions from anon, authenticated;
