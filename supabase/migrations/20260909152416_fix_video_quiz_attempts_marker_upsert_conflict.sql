-- Reconstructed from live Supabase schema (2026-09-16).
-- video_quiz_attempts already had a unique(student_id, question_id) target
-- for upserting attempts on question-bank-backed questions, but random
-- popup-quiz attempts are keyed by marker_id instead (question_id is null
-- for those rows per video_quiz_attempts_source_check). Upserting those
-- had no matching unique target to conflict on, so this adds one.
create unique index if not exists video_quiz_attempts_student_marker_uidx
  on public.video_quiz_attempts (student_id, marker_id);
