-- Reconstructed from live Supabase schema (2026-09-16).
create or replace function public.is_question_visible_to_enrolled_student(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from question_bank_topic_tags tag
    join enrollments e on e.course_id = tag.course_id
    where tag.question_id = p_question_id
      and e.student_id = auth.uid()
      and e.status = 'approved'
  );
$$;
