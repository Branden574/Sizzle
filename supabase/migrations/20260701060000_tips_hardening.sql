-- Financial ledger rows should survive a tipper deleting their account (audit/tax),
-- so anonymize instead of cascading the tip away. Also index provider_ref for the
-- refund/dispute webhook lookup (payment_intent).
alter table public.tips drop constraint if exists tips_tipper_id_fkey;
alter table public.tips alter column tipper_id drop not null;
alter table public.tips
  add constraint tips_tipper_id_fkey foreign key (tipper_id) references public.profiles (id) on delete set null;
create index if not exists tips_ref_lookup_idx on public.tips (provider_ref);
