-- Reconstructed from live Supabase schema (2026-09-16).
-- This migration existed in Supabase's applied history but had no matching
-- .sql file in this repo. Written back from information_schema/pg_catalog
-- so the repo reflects what is actually running in production.

create type exam_build_mode as enum ('preset', 'custom');
create type exam_preset_type as enum ('quick_check', 'standard_final', 'challenging_final');

create table public.course_exam_configs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.courses(id) on delete cascade,
  build_mode exam_build_mode not null default 'preset',
  total_questions integer not null default 10 check (total_questions > 0),
  preset_type exam_preset_type,
  custom_constraints jsonb,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.course_exam_configs enable row level security;

create policy exam_config_admin_all
on public.course_exam_configs for all
using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy exam_config_owner_all
on public.course_exam_configs for all
using (exists (select 1 from courses c where c.id = course_exam_configs.course_id and c.created_by = auth.uid()))
with check (exists (select 1 from courses c where c.id = course_exam_configs.course_id and c.created_by = auth.uid()));

create policy exam_config_student_select
on public.course_exam_configs for select
using (exists (
  select 1 from enrollments e
  where e.course_id = course_exam_configs.course_id
    and e.student_id = auth.uid()
    and e.status = 'approved'
));
