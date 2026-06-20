-- ============================================================================
-- Admin extras: auto-hide pending review + an admin audit log.
-- (Repeat-offender + reporter-abuse are computed live in the API.)
-- ============================================================================

-- Auto-hidden (crossed the high report threshold) — hidden from public feeds but
-- NOT admin-removed; the admin still decides remove vs restore.
alter table public.recipes add column auto_hidden boolean not null default false;
create index recipes_auto_hidden_idx on public.recipes (auto_hidden) where auto_hidden;

-- Audit log of moderation actions (admin_id null = system, e.g. auto-hide).
create table public.moderation_log (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid references public.profiles (id) on delete set null,
  action           text not null,
  target_user_id   uuid references public.profiles (id) on delete set null,
  target_recipe_id uuid references public.recipes (id) on delete set null,
  detail           text,
  created_at       timestamptz not null default now()
);
create index moderation_log_idx on public.moderation_log (created_at desc);

-- Read only via the service role (the admin API). No client policies/grants.
alter table public.moderation_log enable row level security;
