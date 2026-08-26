-- Allow instructors to read enrollment progress only for courses they own.
-- Existing student/admin policies remain intact; these policies add the
-- minimum teacher-specific SELECT access needed by the tracking dashboard.

alter table public.enrollments enable row level security;
alter table public.profiles enable row level security;
alter table public.scorm_tracking enable row level security;

-- Security-definer predicates keep policy checks from recursively invoking
-- RLS on profiles/enrollments while still binding every lookup to auth.uid().
create or replace function public.teacher_owns_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.courses
    where courses.id = p_course_id
      and courses.created_by = auth.uid()
  );
$$;

create or replace function public.teacher_can_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments
    join public.courses on courses.id = enrollments.course_id
    where enrollments.student_id = p_student_id
      and enrollments.status::text = 'approved'
      and courses.created_by = auth.uid()
  );
$$;

create or replace function public.teacher_can_view_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments
    join public.courses on courses.id = enrollments.course_id
    where enrollments.id = p_enrollment_id
      and courses.created_by = auth.uid()
  );
$$;

revoke all on function public.teacher_owns_course(uuid) from public;
revoke all on function public.teacher_can_view_student(uuid) from public;
revoke all on function public.teacher_can_view_enrollment(uuid) from public;
grant execute on function public.teacher_owns_course(uuid) to authenticated;
grant execute on function public.teacher_can_view_student(uuid) to authenticated;
grant execute on function public.teacher_can_view_enrollment(uuid) to authenticated;

drop policy if exists "Teachers read enrollments in own courses" on public.enrollments;
create policy "Teachers read enrollments in own courses"
on public.enrollments for select
to authenticated
using (
  public.teacher_owns_course(enrollments.course_id)
);

drop policy if exists "Teachers read enrolled student profiles" on public.profiles;
create policy "Teachers read enrolled student profiles"
on public.profiles for select
to authenticated
using (
  public.teacher_can_view_student(profiles.id)
);

drop policy if exists "Teachers read tracking in own courses" on public.scorm_tracking;
create policy "Teachers read tracking in own courses"
on public.scorm_tracking for select
to authenticated
using (
  public.teacher_can_view_enrollment(scorm_tracking.enrollment_id)
);

grant select on public.enrollments, public.profiles, public.scorm_tracking to authenticated;
