-- Profile forms update their own row from the browser. Grant only editable
-- profile fields, and keep account roles outside the authenticated write grant.
alter table public.profiles enable row level security;

revoke update on table public.profiles from public, anon, authenticated;

do $$
declare
  editable_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into editable_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = any (array[
      'full_name', 'avatar_url', 'headline', 'bio', 'phone', 'education',
      'university', 'faculty', 'language', 'pdpa_consent_at',
      'notify_new_student', 'marketing_consent', 'marketing_consent_at',
      'analytics_consent', 'analytics_consent_at', 'contact_consent',
      'contact_consent_at', 'updated_at'
    ]);

  if editable_columns is not null then
    execute format(
      'grant update (%s) on table public.profiles to authenticated',
      editable_columns
    );
  end if;
end;
$$;

drop policy if exists "Users update own profile details" on public.profiles;
create policy "Users update own profile details"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Protect identity fields even if another grant or policy is added later.
create or replace function public.protect_profile_identity_on_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
    and (new.id is distinct from old.id or new.role is distinct from old.role)
  then
    raise exception 'Profile identity and role cannot be changed by the account owner';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_identity_on_self_update on public.profiles;
create trigger protect_profile_identity_on_self_update
before update on public.profiles
for each row execute function public.protect_profile_identity_on_self_update();
