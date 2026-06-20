-- ============================================================================
-- Post reporting — users flag recipes (nudity / harassment / etc.) for review.
-- One report per (recipe, reporter). Admin reads the queue via the service role.
-- ============================================================================
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  category    text not null check (category in ('nudity', 'harassment', 'violence', 'spam', 'other')),
  reason      text check (reason is null or char_length(reason) <= 500),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (recipe_id, reporter_id)
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_recipe_idx on public.reports (recipe_id);

alter table public.reports enable row level security;
-- A user may file a report as themselves and see their own; the admin queue is
-- read through the service role (which bypasses RLS), so no broad select policy.
create policy reports_insert_self on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
grant select, insert on public.reports to authenticated;
