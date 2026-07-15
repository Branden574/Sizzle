-- Earning notifications ("X sent you a tip") had no amount, so the UI could only
-- say "sent you a tip" with no idea how much — the single most useful fact in the
-- message. Denormalize the gross amount onto the notification: the tips ledger is
-- the source of truth, but a notification must be self-contained (it's rendered in
-- a list and in a push payload, neither of which can join).
alter table public.notifications
  add column if not exists amount_cents integer;

comment on column public.notifications.amount_cents is
  'Gross amount in cents for earning notifications (tip/unlock/product/subscription). NULL for all other kinds.';
