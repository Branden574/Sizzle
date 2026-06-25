-- Track whether a profile's handle was auto-derived (OAuth / no handle at signup)
-- vs. chosen by the user. New OAuth signups land with handle_auto=true so the app
-- can route them through a username step instead of stranding them on an email-
-- derived handle. Existing rows default to false (treated as already chosen).
alter table public.profiles add column if not exists handle_auto boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  base_handle text;
  want_handle text;
  final_handle text;
  auto boolean;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_handle = '' then base_handle := 'cook'; end if;

  want_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', ''), '[^a-z0-9_]', '', 'g'));

  if length(want_handle) >= 3 then
    final_handle := left(want_handle, 30);
    auto := false;
  else
    final_handle := base_handle || substr(replace(new.id::text, '-', ''), 1, 4);
    auto := true;
  end if;

  insert into public.profiles (id, handle, handle_auto, display_name, phone, role, country, region, terms_accepted_at, terms_version)
  values (
    new.id,
    final_handle,
    auto,
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
$function$;
