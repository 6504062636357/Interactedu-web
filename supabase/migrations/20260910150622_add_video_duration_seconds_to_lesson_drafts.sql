-- Reconstructed from live Supabase schema (2026-09-16).
-- Kept for historical accuracy of the applied-migration sequence — see the
-- immediately following migration, which drops this same column again.
alter table public.lesson_drafts
  add column if not exists video_duration_seconds integer;
