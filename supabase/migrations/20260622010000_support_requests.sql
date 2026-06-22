-- Privacy / support requests submitted via the public contact form
-- (https://getsizzle.app/contact). This is the SECOND required privacy-request
-- method (alongside the privacy@getsizzle.app email) for FL/NE/TX compliance.
-- Inserts come from the API using the service-role key; RLS is enabled with NO
-- public policies, so only trusted server code (and admins via the API) can
-- read or write these rows.
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  kind text not null default 'general',
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;

create index if not exists support_requests_status_created_idx
  on public.support_requests (status, created_at desc);
