-- The farthest point watched in each lesson. Rewinding never reduces this value.
create table if not exists public.student_video_watch_progress (
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  max_watched_seconds numeric(12,2) not null default 0 check (max_watched_seconds >= 0),
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, lesson_id)
);

alter table public.student_video_watch_progress enable row level security;

drop policy if exists "Students read own video watch progress" on public.student_video_watch_progress;
create policy "Students read own video watch progress"
on public.student_video_watch_progress for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = student_video_watch_progress.enrollment_id
      and e.student_id = auth.uid()
  )
);

revoke all on public.student_video_watch_progress from public, anon, authenticated;
grant select on public.student_video_watch_progress to authenticated;

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

  -- Allow the player to run at up to 2x speed, with a small network tolerance.
  -- The browser cannot submit an arbitrary jump in one heartbeat.
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

revoke all on function public.record_student_video_watch_progress(uuid, uuid, numeric, boolean) from public, anon;
grant execute on function public.record_student_video_watch_progress(uuid, uuid, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
