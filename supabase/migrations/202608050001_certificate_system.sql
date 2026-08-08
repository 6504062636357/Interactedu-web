-- Certificate settings and issuance for the existing SCORM course model.
-- Apply this migration in the Supabase SQL editor or with `supabase db push`.

create extension if not exists pgcrypto;

alter table public.courses
  add column if not exists certificate_enabled boolean not null default true,
  add column if not exists certificate_pass_percentage numeric(5,2) not null default 70,
  add column if not exists certificate_template_id uuid null,
  add column if not exists certificate_title text null,
  add column if not exists certificate_description text null;

alter table public.courses
  drop constraint if exists courses_certificate_pass_percentage_check;

alter table public.courses
  add constraint courses_certificate_pass_percentage_check
  check (certificate_pass_percentage >= 0 and certificate_pass_percentage <= 100);

-- scorm_tracking is the existing trusted, server-written result row. These
-- fields distinguish a real quiz submission from the score=0 video commits.
alter table public.scorm_tracking
  add column if not exists quiz_score_recorded boolean not null default false,
  add column if not exists quiz_attempted_at timestamptz null;

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_no text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  attempt_id uuid null references public.scorm_tracking(id) on delete set null,
  score_percentage numeric(5,2) not null check (score_percentage >= 0 and score_percentage <= 100),
  pass_percentage numeric(5,2) not null check (pass_percentage >= 0 and pass_percentage <= 100),
  pdf_path text not null,
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificates_one_per_user_course unique (user_id, course_id)
);

create index if not exists certificates_user_issued_at_idx
  on public.certificates(user_id, issued_at desc);
create index if not exists certificates_course_idx
  on public.certificates(course_id);

create or replace function public.set_certificate_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists certificates_set_updated_at on public.certificates;
create trigger certificates_set_updated_at
before update on public.certificates
for each row execute function public.set_certificate_updated_at();

alter table public.certificates enable row level security;

drop policy if exists "Students read own certificates" on public.certificates;
create policy "Students read own certificates"
on public.certificates for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

drop policy if exists "Admins update certificates" on public.certificates;
create policy "Admins update certificates"
on public.certificates for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- The RPC derives the score from scorm_tracking and never accepts user_id or
-- a score from the browser. The unique constraint makes concurrent calls safe.
create or replace function public.issue_course_certificate(
  p_course_id uuid,
  p_attempt_id uuid,
  p_certificate_no text,
  p_pdf_path text
)
returns public.certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_course public.courses%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_existing public.certificates%rowtype;
  v_total_lessons integer;
  v_completed_lessons integer;
  v_scored_lessons integer;
  v_score numeric(5,2);
  v_result public.certificates%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_existing
  from public.certificates
  where user_id = v_user_id and course_id = p_course_id;

  if found then
    return v_existing;
  end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Course not found';
  end if;
  if not v_course.certificate_enabled then
    raise exception using errcode = 'P0001', message = 'Certificates are disabled for this course';
  end if;

  select * into v_enrollment
  from public.enrollments
  where student_id = v_user_id
    and course_id = p_course_id
    and status::text in ('approved', 'active', 'completed', 'certified')
  order by created_at desc
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'An eligible enrollment is required';
  end if;

  if not exists (
    select 1
    from public.scorm_tracking st
    join public.lessons l on l.id = st.lesson_id
    where st.id = p_attempt_id
      and st.enrollment_id = v_enrollment.id
      and l.course_id = p_course_id
      and st.quiz_score_recorded = true
  ) then
    raise exception using errcode = 'P0002', message = 'Trusted quiz attempt not found';
  end if;

  select count(*) into v_total_lessons
  from public.lessons where course_id = p_course_id;

  select count(*) into v_completed_lessons
  from public.scorm_tracking st
  join public.lessons l on l.id = st.lesson_id
  where st.enrollment_id = v_enrollment.id
    and l.course_id = p_course_id
    and st.video_completed = true;

  if v_total_lessons = 0 or v_completed_lessons < v_total_lessons then
    raise exception using errcode = 'P0001', message = 'Complete every lesson and post-test first';
  end if;

  select count(*), round(avg(st.score_raw)::numeric, 2)
  into v_scored_lessons, v_score
  from public.scorm_tracking st
  join public.lessons l on l.id = st.lesson_id
  where st.enrollment_id = v_enrollment.id
    and l.course_id = p_course_id
    and st.quiz_score_recorded = true;

  if v_scored_lessons = 0 then
    raise exception using errcode = 'P0001', message = 'Complete a post-test first';
  end if;
  if v_score < v_course.certificate_pass_percentage then
    raise exception using errcode = 'P0001', message = 'Score does not meet the certificate threshold';
  end if;
  if p_certificate_no !~ '^CERT-[0-9]{8}-[A-Z0-9]{1,10}-[A-F0-9]{6}$'
    or p_pdf_path <> p_course_id::text || '/' || v_user_id::text || '/' || p_certificate_no || '.pdf' then
    raise exception using errcode = '22023', message = 'Invalid certificate PDF path';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'certificates' and name = p_pdf_path
  ) then
    raise exception using errcode = 'P0002', message = 'Certificate PDF upload not found';
  end if;

  insert into public.certificates (
    certificate_no, user_id, course_id, enrollment_id, attempt_id,
    score_percentage, pass_percentage, pdf_path
  ) values (
    p_certificate_no, v_user_id, p_course_id, v_enrollment.id, p_attempt_id,
    v_score, v_course.certificate_pass_percentage, p_pdf_path
  )
  on conflict (user_id, course_id) do nothing
  returning * into v_result;

  if v_result.id is null then
    select * into v_result
    from public.certificates
    where user_id = v_user_id and course_id = p_course_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.issue_course_certificate(uuid, uuid, text, text) from public;
grant execute on function public.issue_course_certificate(uuid, uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do update set public = false;

drop policy if exists "Certificate owners upload PDFs" on storage.objects;
create policy "Certificate owners upload PDFs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'certificates'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.enrollments
    where enrollments.student_id = auth.uid()
      and enrollments.course_id::text = (storage.foldername(name))[1]
      and enrollments.status::text in ('approved', 'active', 'completed', 'certified')
  )
);

drop policy if exists "Certificate owners update PDFs" on storage.objects;
create policy "Certificate owners update PDFs"
on storage.objects for update
to authenticated
using (bucket_id = 'certificates' and (storage.foldername(name))[2] = auth.uid()::text)
with check (bucket_id = 'certificates' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Certificate owners read PDFs" on storage.objects;
create policy "Certificate owners read PDFs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'certificates'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
);
