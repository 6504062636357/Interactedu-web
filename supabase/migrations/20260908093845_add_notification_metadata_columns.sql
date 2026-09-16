-- Reconstructed from live Supabase schema (2026-09-16).
alter table public.notifications
  add column if not exists type text not null default 'system',
  add column if not exists related_type text,
  add column if not exists related_id uuid,
  add column if not exists action_url text,
  add column if not exists read_at timestamptz,
  add column if not exists dedupe_key text;
