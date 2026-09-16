-- Reconstructed from live Supabase schema (2026-09-16).
-- Snapshots the reviewer's display name/avatar at review time so a later
-- profile edit (or account deletion) doesn't silently change/blank out
-- reviews already shown to other users.
alter table public.course_reviews
  add column if not exists student_name text not null default 'ผู้เรียน',
  add column if not exists student_avatar_url text;
