-- Actual time spent in the lesson player, accumulated per enrollment.
-- The browser reports only whether learning is active; the database measures elapsed time.
create table if not exists public.student_study_time (
  enrollment_id uuid primary key references public.enrollments(id) on delete cascade,
  total_seconds bigint not null default 0 check (total_seconds >= 0),
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.student_study_time enable row level security;

drop policy if exists "Students read own study time" on public.student_study_time;
create policy "Students read own study time"
on public.student_study_time for select
to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = student_study_time.enrollment_id
      and e.student_id = auth.uid()
  )
);

revoke all on public.student_study_time from public, anon, authenticated;
grant select on public.student_study_time to authenticated;

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

revoke all on function public.record_student_study_time(uuid, uuid, boolean) from public, anon;
grant execute on function public.record_student_study_time(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
