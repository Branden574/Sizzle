-- Creator feature: digital-product storefront (cookbooks, meal plans, guides).
-- Reuses the one-off checkout + 90/10 ledger — a new income line beyond recipes.

-- Add 'product' to the ledger kinds.
alter table public.tips drop constraint if exists tips_kind_check;
alter table public.tips add constraint tips_kind_check
  check (kind in ('support', 'subscription', 'unlock', 'product'));

create table if not exists public.creator_products (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  description text,
  price_cents int  not null check (price_cents >= 100 and price_cents <= 50000000),
  file_url    text,             -- optional download (must be the creator's own storage)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists creator_products_creator_idx on public.creator_products (creator_id) where active;

create table if not exists public.product_purchases (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.creator_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- API-mediated only (service role). No client policies = deny-by-default, so the
-- anon key can't read products/purchases directly — the API surfaces the safe view.
alter table public.creator_products  enable row level security;
alter table public.product_purchases enable row level security;
revoke all on public.creator_products  from anon, authenticated;
revoke all on public.product_purchases from anon, authenticated;

-- Link a ledger row to the product it paid for (so live purchases grant on settle).
alter table public.tips add column if not exists product_id uuid references public.creator_products (id) on delete set null;
