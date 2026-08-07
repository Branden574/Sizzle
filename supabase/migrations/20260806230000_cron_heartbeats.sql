-- Cron heartbeats: one row per scheduled job, upserted on every SUCCESSFUL run.
-- /health derives "seconds since last success" per job and degrades when a job
-- goes silent past its threshold — before this, 4 of the 5 crons could die
-- silently forever (2026-08-06 autonomy audit, P1).
create table if not exists public.cron_runs (
  job text primary key,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_duration_ms integer,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

-- Service-role only: the API writes heartbeats and /health reads them through
-- supabaseAdmin. Nothing client-facing — lock it away from PostgREST entirely
-- (RLS on with no policies + explicit revoke, per the grant-drift lesson in
-- SYSTEM_RISK_MAP: grants are the boundary the anon key actually hits).
alter table public.cron_runs enable row level security;
revoke all on table public.cron_runs from anon, authenticated;

comment on table public.cron_runs is
  'Heartbeat per Vercel cron job (service-role only; read by /health for staleness alerting)';
