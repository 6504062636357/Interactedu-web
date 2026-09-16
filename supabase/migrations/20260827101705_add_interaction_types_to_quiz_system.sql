-- Reconstructed from live Supabase schema (2026-09-16).

create type interaction_type as enum (
  'multiple_choice', 'true_false', 'sequencing', 'matching', 'fill_in_blank', 'note_callout'
);

-- question_bank.interaction_type already existed with this enum by the time
-- this snapshot was taken; quiz_questions gained the same column here so
-- lesson-video quiz questions (not just question-bank ones) can declare a type.
alter table public.quiz_questions
  add column if not exists interaction_type interaction_type not null default 'multiple_choice';
