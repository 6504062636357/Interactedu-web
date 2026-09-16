-- Reconstructed from live Supabase schema (2026-09-16).
create table public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  meets_expectation boolean not null default true,
  liked_tags text[] not null default '{}',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, student_id)
);

alter table public.course_reviews enable row level security;

create policy course_reviews_select_published
on public.course_reviews for select
using (exists (select 1 from courses c where c.id = course_reviews.course_id and c.status = 'published'));

create policy course_reviews_insert_enrolled
on public.course_reviews for insert
with check (
  auth.uid() = student_id
  and exists (
    select 1 from enrollments e
    where e.student_id = auth.uid()
      and e.course_id = course_reviews.course_id
      and e.status = 'approved'
  )
);

create policy course_reviews_update_own
on public.course_reviews for update
using (auth.uid() = student_id)
with check (auth.uid() = student_id);

create policy course_reviews_delete_own
on public.course_reviews for delete
using (auth.uid() = student_id);
