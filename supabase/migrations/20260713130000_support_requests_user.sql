-- In-app support tickets reuse the public support_requests pipeline. Attach the
-- authenticated author so admins can see who filed a ticket (and jump to their
-- profile). Nullable + ON DELETE SET NULL keeps public contact-form rows (which
-- have no user) and preserves tickets after an account is deleted. Table stays
-- RLS policy-free — service-role only, same as the rest of the pipeline. 'kind'
-- remains plain text so 'problem'/'feature' need no schema change.
alter table public.support_requests
  add column if not exists user_id uuid references public.profiles(id) on delete set null;
