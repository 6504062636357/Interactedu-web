-- Soft deletion keeps Auth, learning, payment and certificate records intact.
-- Run after 202609280003_account_status.sql. No users are archived by this migration.
begin;

alter table public.profiles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

alter table public.account_status_events
  add column if not exists event_type text not null default 'status_changed';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'archived_accounts_are_inactive') then
    alter table public.profiles add constraint archived_accounts_are_inactive
      check (archived_at is null or is_active = false);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.account_status_events'::regclass and conname = 'account_status_event_type_valid') then
    alter table public.account_status_events add constraint account_status_event_type_valid
      check (event_type in ('status_changed', 'archived'));
  end if;
end;
$$;

create or replace function public.protect_account_archive_columns()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if (new.archived_at is not null or new.archived_by is not null)
      and current_setting('app.account_archive_allowed', true) is distinct from 'on' then
      raise exception 'Account archives can only be changed by an admin action';
    end if;
  elsif (new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by)
    and current_setting('app.account_archive_allowed', true) is distinct from 'on' then
    raise exception 'Account archives can only be changed by an admin action';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_account_archive_columns() from public, anon, authenticated;
drop trigger if exists protect_account_archive_columns on public.profiles;
create trigger protect_account_archive_columns
before insert or update on public.profiles
for each row execute function public.protect_account_archive_columns();

create or replace function public.admin_archive_user(p_user_id uuid, p_confirmation text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_role text;
  target_active boolean;
  target_archived_at timestamptz;
  target_email text;
begin
  -- Serialize with account activation/deactivation, including the last-admin guard.
  perform pg_advisory_xact_lock(104872, 1);
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text = 'admin' and is_active and archived_at is null
  ) then return 'forbidden'; end if;
  if p_user_id = auth.uid() then return 'self'; end if;
  if p_confirmation is null or char_length(p_confirmation) > 320 then return 'invalid'; end if;

  select p.role::text, p.is_active, p.archived_at, u.email::text
  into target_role, target_active, target_archived_at, target_email
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user_id for update of p;
  if not found then return 'not_found'; end if;
  if lower(btrim(p_confirmation)) is distinct from lower(coalesce(nullif(target_email, ''), p_user_id::text)) then
    return 'confirmation_mismatch';
  end if;
  -- A duplicate submission succeeds without changing the original actor/time or audit.
  if target_archived_at is not null then return null; end if;
  if target_role = 'admin' and target_active and (
    select count(*) from public.profiles where role::text = 'admin' and is_active and archived_at is null
  ) <= 1 then return 'last_admin'; end if;

  perform set_config('app.account_status_change_allowed', 'on', true);
  perform set_config('app.account_archive_allowed', 'on', true);
  update public.profiles set
    is_active = false,
    deactivated_at = coalesce(deactivated_at, now()),
    deactivated_by = coalesce(deactivated_by, auth.uid()),
    archived_at = now(),
    archived_by = auth.uid()
  where id = p_user_id;
  perform set_config('app.account_archive_allowed', 'off', true);
  perform set_config('app.account_status_change_allowed', 'off', true);
  insert into public.account_status_events (user_id, actor_id, is_active, event_type)
  values (p_user_id, auth.uid(), false, 'archived');
  return null;
end;
$$;

revoke all on function public.admin_archive_user(uuid, text) from public, anon;
grant execute on function public.admin_archive_user(uuid, text) to authenticated;

create or replace function public.admin_set_user_active(p_user_id uuid, p_is_active boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_role text;
  old_active boolean;
  target_archived_at timestamptz;
begin
  perform pg_advisory_xact_lock(104872, 1);
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text = 'admin' and is_active and archived_at is null
  ) then return 'forbidden'; end if;
  if p_user_id = auth.uid() then return 'self'; end if;
  if p_is_active is null then return 'invalid'; end if;

  select role::text, is_active, archived_at into target_role, old_active, target_archived_at
  from public.profiles where id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if target_archived_at is not null then return 'archived'; end if;
  if old_active = p_is_active then return null; end if;
  if target_role = 'admin' and not p_is_active and (
    select count(*) from public.profiles where role::text = 'admin' and is_active and archived_at is null
  ) <= 1 then return 'last_admin'; end if;

  perform set_config('app.account_status_change_allowed', 'on', true);
  update public.profiles set
    is_active = p_is_active,
    deactivated_at = case when p_is_active then null else now() end,
    deactivated_by = case when p_is_active then null else auth.uid() end
  where id = p_user_id;
  perform set_config('app.account_status_change_allowed', 'off', true);
  insert into public.account_status_events (user_id, actor_id, is_active, event_type)
  values (p_user_id, auth.uid(), p_is_active, 'status_changed');
  return null;
end;
$$;

revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- Details remain accessible to active admins, even after archival.
create or replace function public.admin_get_user_account_state(p_user_id uuid)
returns table (
  id uuid, email text, full_name text, role text, phone text,
  university text, faculty text, created_at timestamptz,
  last_sign_in_at timestamptz, enrollment_count bigint,
  certificate_count bigint, is_active boolean, archived_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, u.email::text, p.full_name, p.role::text, p.phone,
    p.university, p.faculty, u.created_at, u.last_sign_in_at,
    (select count(*) from public.enrollments e where e.student_id = p.id),
    (select count(*) from public.certificates c where c.user_id = p.id),
    p.is_active, p.archived_at
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user_id and exists (
    select 1 from public.profiles viewer
    where viewer.id = auth.uid() and viewer.role::text = 'admin' and viewer.is_active and viewer.archived_at is null
  );
$$;

revoke all on function public.admin_get_user_account_state(uuid) from public, anon;
grant execute on function public.admin_get_user_account_state(uuid) to authenticated;

-- Recreate to also support databases with the older directory return columns.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid, email text, full_name text, role text, phone text,
  university text, faculty text, created_at timestamptz,
  last_sign_in_at timestamptz, enrollment_count bigint,
  certificate_count bigint, is_active boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    u.id, u.email::text, p.full_name, p.role::text,
    p.phone, p.university, p.faculty, u.created_at, u.last_sign_in_at,
    (select count(*) from public.enrollments e where e.student_id = u.id),
    (select count(*) from public.certificates c where c.user_id = u.id),
    coalesce(p.is_active, true)
  from auth.users u left join public.profiles p on p.id = u.id
  where p.archived_at is null and exists (
    select 1 from public.profiles viewer
    where viewer.id = auth.uid() and viewer.role::text = 'admin' and viewer.is_active and viewer.archived_at is null
  )
  order by u.created_at desc;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

notify pgrst, 'reload schema';
commit;
