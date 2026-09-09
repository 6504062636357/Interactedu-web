-- งานข้อ 03: ย้ายผลสอบปลายคอร์สออกจากแถวของบทเรียนสุดท้ายใน scorm_tracking
--
-- ก่อนหน้านี้ gradeCourseFinalExam() ยัด score_raw/quiz_passed ลงแถว scorm_tracking ของ
-- "data.lessons[data.lessons.length - 1]" ซึ่งพังถ้าครูเพิ่มบทเรียนใหม่ทีหลัง (คะแนนย้ายไป
-- แถวอื่นทันที) หรือ throw หลังบันทึกคำตอบไปแล้วถ้า enrollment ไม่เคยมีแถว scorm_tracking ของ
-- บทนั้นมาก่อน แหล่งความจริงของคะแนน/ผ่านสอบ ย้ายมาเป็น quiz_attempts (ผูกกับ enrollment_id
-- ตรงๆ ไม่ต้องอิงบทเรียนใดบทเรียนหนึ่ง) — scorm_tracking เหลือแค่ใช้ตัดสิน completion

-- certificates.attempt_id เคยชี้ไป scorm_tracking(id) ตอนนี้ต้องชี้ไป quiz_attempts(id) แทน
-- ใบเซอร์ 4 ใบที่ออกไปแล้วก่อนงานนี้ attempt_id ยังเก็บค่า scorm_tracking(id) เดิมอยู่ (ไม่มีแถว
-- คู่กันใน quiz_attempts) จึงเพิ่ม FK แบบ NOT VALID กันพังตอน migrate — ตรวจ FK เฉพาะข้อมูลใหม่
-- จากนี้ไป ค่าเก่ายังอยู่ครบ ไม่ลบไม่แก้ แค่ไม่ตรวจสอบย้อนหลัง (ใบเซอร์เก่าไม่ได้ re-verify ใหม่)
alter table public.certificates
  drop constraint if exists certificates_attempt_id_fkey;

alter table public.certificates
  add constraint certificates_attempt_id_fkey
  foreign key (attempt_id) references public.quiz_attempts(id) on delete set null
  not valid;

comment on column public.certificates.attempt_id is
  'References quiz_attempts.id as of migration 202609070002 (task #03). Certificates issued before this migration still hold their old scorm_tracking.id value (FK added NOT VALID so historical rows are exempt from validation) — kept as a historical record only, not re-verified.';

-- RPC ใหม่: อ่านคะแนน/ผ่าน-ไม่ผ่านจาก quiz_attempts แทน scorm_tracking.score_raw
-- completion (จบทุกบทหรือยัง) ยังอ่านจาก scorm_tracking.video_completed เหมือนเดิมทุกอย่าง
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

  -- แหล่งความจริงของคะแนน [งานข้อ 03] — ต้องเป็น attempt ของ enrollment นี้จริง และต้อง
  -- submit แล้ว (ไม่ใช่แถวที่ยังทำไม่เสร็จ)
  select qa.score into v_score
  from public.quiz_attempts qa
  where qa.id = p_attempt_id
    and qa.enrollment_id = v_enrollment.id
    and qa.submitted_at is not null;
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
  if v_score is null or v_score < v_course.certificate_pass_percentage then
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
