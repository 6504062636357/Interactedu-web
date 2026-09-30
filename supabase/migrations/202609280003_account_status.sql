alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid;

create table if not exists public.account_status_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  actor_id uuid not null,
  is_active boolean not null,
  created_at timestamptz not null default now()
);

alter table public.account_status_events enable row level security;
drop policy if exists "Admins read account status events" on public.account_status_events;
create policy "Admins read account status events"
on public.account_status_events for select to authenticated
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

create or replace function public.protect_account_status_columns()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (
    new.is_active is distinct from old.is_active
    or new.deactivated_at is distinct from old.deactivated_at
    or new.deactivated_by is distinct from old.deactivated_by
  ) and current_setting('app.account_status_change_allowed', true) is distinct from 'on' then
    raise exception 'Account status can only be changed by an admin action';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_account_status_columns on public.profiles;
create trigger protect_account_status_columns
before update on public.profiles
for each row execute function public.protect_account_status_columns();

create or replace function public.admin_set_user_active(p_user_id uuid, p_is_active boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_role text;
  actor_active boolean;
  target_role text;
  old_active boolean;
begin
  perform pg_advisory_xact_lock(104872, 1);
  select role::text, is_active into actor_role, actor_active from public.profiles where id = auth.uid();
  if actor_role is distinct from 'admin' or actor_active is distinct from true then return 'forbidden'; end if;
  if p_user_id = auth.uid() then return 'self'; end if;
  if p_is_active is null then return 'invalid'; end if;

  select role::text, is_active into target_role, old_active
  from public.profiles where id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if old_active = p_is_active then return null; end if;
  if target_role = 'admin' and not p_is_active and (
    select count(*) from public.profiles where role = 'admin' and is_active
  ) <= 1 then
    return 'last_admin';
  end if;

  perform set_config('app.account_status_change_allowed', 'on', true);
  update public.profiles set
    is_active = p_is_active,
    deactivated_at = case when p_is_active then null else now() end,
    deactivated_by = case when p_is_active then null else auth.uid() end
  where id = p_user_id;
  insert into public.account_status_events (user_id, actor_id, is_active)
  values (p_user_id, auth.uid(), p_is_active);
  return null;
end;
$$;

revoke all on function public.admin_set_user_active(uuid, boolean) from public;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- The admin directory exposes the status alongside existing activity counts.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid, email text, full_name text, role text, phone text,
  university text, faculty text, created_at timestamptz,
  last_sign_in_at timestamptz, enrollment_count bigint,
  certificate_count bigint, is_active boolean
)
language sql stable security definer set search_path = public, auth as $$
  select
    users.id, users.email::text, profiles.full_name, profiles.role::text,
    profiles.phone, profiles.university, profiles.faculty,
    users.created_at, users.last_sign_in_at,
    (select count(*) from public.enrollments where enrollments.student_id = users.id),
    (select count(*) from public.certificates where certificates.user_id = users.id),
    coalesce(profiles.is_active, true)
  from auth.users as users
  left join public.profiles as profiles on profiles.id = users.id
  where exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid() and viewer.role::text = 'admin' and viewer.is_active
  )
  order by users.created_at desc;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

notify pgrst, 'reload schema';
