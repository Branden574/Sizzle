-- Allow 'apple' as a tips-ledger provider so Apple In-App Purchase unlocks are
-- recorded in the earnings ledger the same way Stripe/mock unlocks are (the tips
-- table is what /monetize/earnings + /monetize/payout + funding goals aggregate).
alter table public.tips drop constraint if exists tips_provider_check;
alter table public.tips add constraint tips_provider_check
  check (provider in ('stripe', 'mock', 'apple'));
