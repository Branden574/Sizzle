-- Creator feature #2: subscribers-only posts. The monthly subscription is
-- shipped and charging, but it unlocks nothing recurring — so retention has no
-- content anchor. Let a creator mark any post subscribers-only; the mapper gates
-- it exactly like a premium price (subscribers + the owner see it, others get a
-- locked teaser that drives them to subscribe). Direct-DB reads are already
-- owner-only (20260701090000), so the API mapper is the single enforcement point.
alter table public.recipes
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'subscribers'));
