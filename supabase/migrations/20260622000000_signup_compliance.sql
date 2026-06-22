-- Signup compliance: capture the user's country + state/region and their
-- acceptance of the Terms of Service + Privacy Policy (when + which version).
-- This acceptance record is the audit trail needed for per-jurisdiction privacy
-- compliance (e.g. proving a California user accepted CCPA/CPRA-compliant terms).
alter table public.profiles
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- Extend new-user creation to persist the signup metadata fields.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  want_handle text;
  final_handle text;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_handle = '' then base_handle := 'cook'; end if;

  want_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', ''), '[^a-z0-9_]', '', 'g'));

  if length(want_handle) >= 3 then
    final_handle := left(want_handle, 30);
  else
    final_handle := base_handle || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  insert into public.profiles (id, handle, display_name, phone, role, country, region, terms_accepted_at, terms_version)
  values (
    new.id,
    final_handle,
    coalesce(new.raw_user_meta_data ->> 'display_name', initcap(base_handle)),
    new.raw_user_meta_data ->> 'phone',
    case when lower(new.email) = 'branden574@gmail.com' then 'admin' else 'user' end,
    nullif(new.raw_user_meta_data ->> 'country', ''),
    nullif(new.raw_user_meta_data ->> 'region', ''),
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'terms_version', '')
  );
  return new;
end;
$$;
