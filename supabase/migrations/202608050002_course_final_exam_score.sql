-- A certificate is decided by the trusted course-wide final exam attempt,
-- not by an average of lesson tracking scores.
alter table public.scorm_tracking
  add column if not exists course_final_exam_recorded boolean not null default false;

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
  v_score numeric(5,2);
  v_result public.certificates%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_existing from public.certificates
  where user_id = v_user_id and course_id = p_course_id;
  if found then return v_existing; end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then raise exception using errcode = 'P0002', message = 'Course not found'; end if;
  if not v_course.certificate_enabled then
    raise exception using errcode = 'P0001', message = 'Certificates are disabled for this course';
  end if;

  select * into v_enrollment from public.enrollments
  where student_id = v_user_id
    and course_id = p_course_id
    and status::text in ('approved', 'active', 'completed', 'certified')
  order by created_at desc limit 1;
  if not found then raise exception using errcode = '42501', message = 'An eligible enrollment is required'; end if;

  select st.score_raw into v_score
  from public.scorm_tracking st
  join public.lessons l on l.id = st.lesson_id
  where st.id = p_attempt_id
    and st.enrollment_id = v_enrollment.id
    and l.course_id = p_course_id
    and st.quiz_score_recorded = true
    and st.course_final_exam_recorded = true;
  if not found then raise exception using errcode = 'P0002', message = 'Trusted final exam attempt not found'; end if;

  select count(*) into v_total_lessons from public.lessons where course_id = p_course_id;
  select count(*) into v_completed_lessons
  from public.scorm_tracking st
  join public.lessons l on l.id = st.lesson_id
  where st.enrollment_id = v_enrollment.id
    and l.course_id = p_course_id
    and st.video_completed = true;
  if v_total_lessons = 0 or v_completed_lessons < v_total_lessons then
    raise exception using errcode = 'P0001', message = 'Complete every lesson before the final exam';
  end if;
  if v_score < v_course.certificate_pass_percentage then
    raise exception using errcode = 'P0001', message = 'Score does not meet the certificate threshold';
  end if;
  if p_certificate_no !~ '^CERT-[0-9]{8}-[A-Z0-9]{1,10}-[A-F0-9]{6}$'
    or p_pdf_path <> p_course_id::text || '/' || v_user_id::text || '/' || p_certificate_no || '.pdf' then
    raise exception using errcode = '22023', message = 'Invalid certificate PDF path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'certificates' and name = p_pdf_path) then
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
    select * into v_result from public.certificates
    where user_id = v_user_id and course_id = p_course_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.issue_course_certificate(uuid, uuid, text, text) from public;
grant execute on function public.issue_course_certificate(uuid, uuid, text, text) to authenticated;
