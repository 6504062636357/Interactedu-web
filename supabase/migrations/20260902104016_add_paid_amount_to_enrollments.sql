-- Reconstructed from live Supabase schema (2026-09-16).
alter table public.enrollments
  add column if not exists paid_amount numeric;
