-- Let new users choose their own username at signup. The desired handle is passed
-- in auth metadata ('handle'); the trigger uses it (normalized) when valid (3+
-- chars), otherwise falls back to the auto-generated email-based handle. The
-- case-insensitive unique index still guarantees uniqueness — a collision fails
-- the signup, which the client guards against with a live availability check.
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

  -- User-chosen username from signup metadata, normalized to [a-z0-9_].
  want_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', ''), '[^a-z0-9_]', '', 'g'));

  if length(want_handle) >= 3 then
    final_handle := left(want_handle, 30);
  else
    final_handle := base_handle || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  insert into public.profiles (id, handle, display_name, phone, role)
  values (
    new.id,
    final_handle,
    coalesce(new.raw_user_meta_data ->> 'display_name', initcap(base_handle)),
    new.raw_user_meta_data ->> 'phone',
    case when lower(new.email) = 'branden574@gmail.com' then 'admin' else 'user' end
  );
  return new;
end;
$$;
