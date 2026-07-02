-- Generalize reports beyond recipes so users can flag comments and profiles too
-- (App Store Guideline 1.2 requires reporting for all user-generated content).
alter table public.reports add column if not exists target_type text
  check (target_type in ('recipe', 'comment', 'profile'));
alter table public.reports add column if not exists target_id uuid;

-- Backfill existing rows as recipe reports.
update public.reports set target_type = 'recipe', target_id = recipe_id
  where target_type is null and recipe_id is not null;

-- recipe_id is now optional (comment/profile reports have none); keep it for the
-- recipe FK cascade + the existing auto-hide count query.
alter table public.reports alter column recipe_id drop not null;

-- One report per (target, reporter). Replaces the old (recipe_id, reporter_id) unique.
alter table public.reports drop constraint if exists reports_recipe_id_reporter_id_key;
create unique index if not exists reports_target_reporter_uidx
  on public.reports (target_type, target_id, reporter_id);
create index if not exists reports_target_idx on public.reports (target_type, target_id, status);
