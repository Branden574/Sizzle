-- Raise every price floor to $5.00 (500¢), matching the API's MIN_TIP and the
-- shared MIN_PRICE_CENTS. Card processing comes off the top of each payment, so
-- below ~$5 the fixed 30¢ eats an outsized share of what the fan pays.
-- Safe to apply: verified zero rows below 500 in prod (the one 499 was cleared).
-- Constraint names are Postgres's defaults for the inline CHECKs created in
-- 20260701080000_creator_monetization_full.sql, 20260711070000_digital_products.sql
-- and 20260711080000_subscription_tiers.sql (<table>_<column>_check).

alter table public.recipes drop constraint if exists recipes_price_cents_check;
alter table public.recipes add constraint recipes_price_cents_check
  check (price_cents is null or price_cents >= 500);

alter table public.profiles drop constraint if exists profiles_sub_price_cents_check;
alter table public.profiles add constraint profiles_sub_price_cents_check
  check (sub_price_cents is null or sub_price_cents >= 500);

alter table public.creator_tiers drop constraint if exists creator_tiers_price_cents_check;
alter table public.creator_tiers add constraint creator_tiers_price_cents_check
  check (price_cents >= 500 and price_cents <= 50000);

alter table public.creator_products drop constraint if exists creator_products_price_cents_check;
alter table public.creator_products add constraint creator_products_price_cents_check
  check (price_cents >= 500 and price_cents <= 50000000);
