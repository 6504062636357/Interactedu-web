-- Reconstructed from live Supabase schema (2026-09-16).
-- Reverts the previous migration: the column turned out to be unused and
-- was dropped again the same day.
alter table public.lesson_drafts
  drop column if exists video_duration_seconds;
