-- Saving a course is a personal choice, separate from access and learning.
-- No enrollment, tracking, study time or notification rows are changed here.
begin;

create table if not exists public.student_course_library (
  enrollment_id uuid primary key references public.enrollments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  saved_at timestamptz not null default now()
);
create index if not exists student_course_library_student_idx
  on public.student_course_library(student_id, saved_at desc);

alter table public.student_course_library enable row level security;
drop policy if exists "Students read own saved courses" on public.student_course_library;
create policy "Students read own saved courses" on public.student_course_library
for select to authenticated using (student_id = auth.uid());
revoke all on public.student_course_library from public, anon, authenticated;
grant select on public.student_course_library to authenticated;
grant all on public.student_course_library to service_role;

create or replace function public.save_course_to_library(p_course_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  select e.id into v_enrollment_id
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  join public.courses c on c.id = e.course_id
  where e.student_id = auth.uid() and e.course_id = p_course_id
    and e.status::text = 'approved'
    and e.membership_order_id is not null
    and (e.access_expires_at is null or e.access_expires_at > clock_timestamp())
    and p.role::text = 'student' and p.is_active is true
    and c.status::text = 'published'
  for share of e, p, c;
  if v_enrollment_id is null then
    raise exception using errcode = '42501', message = 'Active Plus course access required';
  end if;
  insert into public.student_course_library (enrollment_id, student_id)
  values (v_enrollment_id, auth.uid()) on conflict (enrollment_id) do nothing;
  return found;
end;
$$;
revoke all on function public.save_course_to_library(uuid) from public, anon;
grant execute on function public.save_course_to_library(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
