-- Run this entire file in Supabase SQL Editor. Existing prices are preserved.
-- After success, set the monthly price and enable sales in /dashboard/admin/membership.
begin;

create table if not exists public.membership_settings (
  id boolean primary key default true check (id),
  monthly_price numeric(12, 2) not null default 0 check (monthly_price >= 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.membership_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.membership_settings enable row level security;

drop policy if exists "Anyone can view membership offer" on public.membership_settings;
create policy "Anyone can view membership offer"
on public.membership_settings for select
to anon, authenticated
using (id);

drop policy if exists "Admins manage membership offer" on public.membership_settings;
create policy "Admins manage membership offer"
on public.membership_settings for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'admin'
  )
);

revoke all on public.membership_settings from public;
grant select on public.membership_settings to anon, authenticated;
grant update on public.membership_settings to authenticated;
grant all on public.membership_settings to service_role;

create table if not exists public.student_membership_orders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  charge_id text not null unique,
  paid_amount numeric(12, 2) not null check (paid_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_membership_orders_dates check (
    (status = 'pending' and starts_at is null and expires_at is null)
    or (status = 'active' and starts_at is not null and expires_at > starts_at)
    or (status = 'failed' and starts_at is null and expires_at is null)
  )
);

create index if not exists student_membership_orders_student_expiry_idx
  on public.student_membership_orders (student_id, expires_at desc);

alter table public.student_membership_orders enable row level security;

drop policy if exists "Students read own membership orders" on public.student_membership_orders;
create policy "Students read own membership orders"
on public.student_membership_orders for select
to authenticated
using (student_id = auth.uid());

drop policy if exists "Admins read membership orders" on public.student_membership_orders;
create policy "Admins read membership orders"
on public.student_membership_orders for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'admin'
  )
);

revoke all on public.student_membership_orders from public, anon, authenticated;
grant select on public.student_membership_orders to authenticated;
grant all on public.student_membership_orders to service_role;

alter table public.enrollments
  add column if not exists membership_order_id uuid
    references public.student_membership_orders(id) on delete set null,
  add column if not exists access_expires_at timestamptz;

drop policy if exists "Students read own study time" on public.student_study_time;
create policy "Students read own study time"
on public.student_study_time for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = student_study_time.enrollment_id
      and e.student_id = auth.uid()
      and e.status::text = 'approved'
      and (e.access_expires_at is null or e.access_expires_at > clock_timestamp())
  )
);

drop policy if exists "Students read own video watch progress" on public.student_video_watch_progress;
create policy "Students read own video watch progress"
on public.student_video_watch_progress for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = student_video_watch_progress.enrollment_id
      and e.student_id = auth.uid()
      and e.status::text = 'approved'
      and (e.access_expires_at is null or e.access_expires_at > clock_timestamp())
  )
);

create or replace function public.activate_student_membership_for_charge(p_charge_id text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.student_membership_orders%rowtype;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
begin
  select * into v_order
  from public.student_membership_orders
  where charge_id = p_charge_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership payment not found';
  end if;

  if v_order.status = 'active' then
    return v_order.expires_at;
  end if;

  if v_order.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Membership payment is not pending';
  end if;

  perform 1
  from public.profiles
  where id = v_order.student_id
  for update;

  select greatest(clock_timestamp(), coalesce(max(expires_at), clock_timestamp()))
    into v_starts_at
  from public.student_membership_orders
  where student_id = v_order.student_id
    and status = 'active';

  v_expires_at := v_starts_at + interval '1 month';

  update public.student_membership_orders
  set status = 'active', starts_at = v_starts_at, expires_at = v_expires_at
  where id = v_order.id;

  update public.enrollments e
  set status = 'approved',
      approved_at = coalesce(e.approved_at, v_starts_at),
      membership_order_id = v_order.id,
      access_expires_at = v_expires_at
  from public.courses c
  where e.student_id = v_order.student_id
    and e.course_id = c.id
    and c.status::text = 'published'
    and (e.membership_order_id is not null or e.status::text <> 'approved');

  insert into public.enrollments (
    student_id, course_id, status, approved_at, paid_amount, membership_order_id, access_expires_at
  )
  select v_order.student_id, c.id, 'approved', v_starts_at, 0, v_order.id, v_expires_at
  from public.courses c
  where c.status::text = 'published'
    and not exists (
      select 1
      from public.enrollments e
      where e.student_id = v_order.student_id and e.course_id = c.id
    );

  return v_expires_at;
end;
$$;

revoke all on function public.activate_student_membership_for_charge(text) from public, anon, authenticated;
grant execute on function public.activate_student_membership_for_charge(text) to service_role;

create or replace function public.grant_active_memberships_for_published_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text <> 'published' then
    return new;
  end if;

  update public.enrollments e
  set status = 'approved',
      approved_at = coalesce(e.approved_at, clock_timestamp()),
      membership_order_id = latest.id,
      access_expires_at = latest.expires_at
  from (
    select distinct on (student_id) student_id, id, expires_at
    from public.student_membership_orders
    where status = 'active' and expires_at > clock_timestamp()
    order by student_id, expires_at desc
  ) latest
  where e.student_id = latest.student_id
    and e.course_id = new.id
    and (e.membership_order_id is not null or e.status::text <> 'approved');

  insert into public.enrollments (
    student_id, course_id, status, approved_at, paid_amount, membership_order_id, access_expires_at
  )
  select latest.student_id, new.id, 'approved', clock_timestamp(), 0, latest.id, latest.expires_at
  from (
    select distinct on (student_id) student_id, id, expires_at
    from public.student_membership_orders
    where status = 'active' and expires_at > clock_timestamp()
    order by student_id, expires_at desc
  ) latest
  where not exists (
    select 1 from public.enrollments e
    where e.student_id = latest.student_id and e.course_id = new.id
  );

  return new;
end;
$$;

drop trigger if exists grant_active_memberships_for_published_course on public.courses;
create trigger grant_active_memberships_for_published_course
after insert or update of status on public.courses
for each row
when (new.status::text = 'published')
execute function public.grant_active_memberships_for_published_course();

create or replace function public.record_student_study_time(
  p_course_id uuid,
  p_lesson_id uuid,
  p_active boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment_id uuid;
  v_total_seconds bigint;
  v_last_heartbeat_at timestamptz;
  v_now timestamptz;
  v_elapsed_seconds integer := 0;
begin
  if p_active is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Not authorized to record study time';
  end if;

  select e.id into v_enrollment_id
  from public.enrollments e
  join public.lessons l on l.course_id = e.course_id
  join public.profiles p on p.id = e.student_id
  where e.student_id = auth.uid()
    and e.course_id = p_course_id
    and e.status::text = 'approved'
    and (e.access_expires_at is null or e.access_expires_at > clock_timestamp())
    and l.id = p_lesson_id
    and l.is_published is true
    and p.is_active is true
  limit 1;

  if v_enrollment_id is null then
    raise exception using errcode = '42501', message = 'An active enrollment and published lesson are required';
  end if;

  insert into public.student_study_time (enrollment_id)
  values (v_enrollment_id)
  on conflict (enrollment_id) do nothing;

  select total_seconds, last_heartbeat_at
    into v_total_seconds, v_last_heartbeat_at
  from public.student_study_time
  where enrollment_id = v_enrollment_id
  for update;

  v_now := clock_timestamp();
  if v_last_heartbeat_at is not null
    and v_now >= v_last_heartbeat_at
    and v_now - v_last_heartbeat_at <= interval '45 seconds'
  then
    v_elapsed_seconds := least(30, floor(extract(epoch from v_now - v_last_heartbeat_at))::integer);
  end if;

  update public.student_study_time
  set total_seconds = v_total_seconds + v_elapsed_seconds,
      last_heartbeat_at = case when p_active then v_now else null end,
      updated_at = v_now
  where enrollment_id = v_enrollment_id
  returning total_seconds into v_total_seconds;

  return v_total_seconds;
end;
$$;

create or replace function public.record_student_video_watch_progress(
  p_course_id uuid,
  p_lesson_id uuid,
  p_position_seconds numeric,
  p_active boolean
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment_id uuid;
  v_max_seconds numeric;
  v_last_heartbeat_at timestamptz;
  v_now timestamptz;
  v_elapsed_seconds numeric := 0;
begin
  if auth.uid() is null or p_active is null
    or p_position_seconds is null or p_position_seconds < 0 or p_position_seconds > 86400
  then
    raise exception using errcode = '42501', message = 'Invalid video watch progress';
  end if;

  select e.id into v_enrollment_id
  from public.enrollments e
  join public.lessons l on l.course_id = e.course_id
  join public.profiles p on p.id = e.student_id
  where e.student_id = auth.uid()
    and e.course_id = p_course_id
    and e.status::text = 'approved'
    and (e.access_expires_at is null or e.access_expires_at > clock_timestamp())
    and l.id = p_lesson_id
    and l.is_published is true
    and p.is_active is true
  limit 1;

  if v_enrollment_id is null then
    raise exception using errcode = '42501', message = 'An active enrollment and published lesson are required';
  end if;

  insert into public.student_video_watch_progress (enrollment_id, lesson_id)
  values (v_enrollment_id, p_lesson_id)
  on conflict (enrollment_id, lesson_id) do nothing;

  select max_watched_seconds, last_heartbeat_at
    into v_max_seconds, v_last_heartbeat_at
  from public.student_video_watch_progress
  where enrollment_id = v_enrollment_id and lesson_id = p_lesson_id
  for update;

  v_now := clock_timestamp();
  if v_last_heartbeat_at is not null
    and v_now >= v_last_heartbeat_at
    and v_now - v_last_heartbeat_at <= interval '30 seconds'
  then
    v_elapsed_seconds := extract(epoch from v_now - v_last_heartbeat_at);
  end if;

  if v_last_heartbeat_at is not null and v_elapsed_seconds > 0 then
    v_max_seconds := greatest(v_max_seconds, least(p_position_seconds, v_max_seconds + v_elapsed_seconds * 2.25 + 2));
  end if;

  update public.student_video_watch_progress
  set max_watched_seconds = v_max_seconds,
      last_heartbeat_at = case when p_active then v_now else null end,
      updated_at = v_now
  where enrollment_id = v_enrollment_id and lesson_id = p_lesson_id;

  return v_max_seconds;
end;
$$;

revoke all on function public.record_student_study_time(uuid, uuid, boolean) from public, anon;
grant execute on function public.record_student_study_time(uuid, uuid, boolean) to authenticated;
revoke all on function public.record_student_video_watch_progress(uuid, uuid, numeric, boolean) from public, anon;
grant execute on function public.record_student_video_watch_progress(uuid, uuid, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
