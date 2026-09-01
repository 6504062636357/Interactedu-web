-- Virtual chapters for a lesson video. The original video stays as one file;
-- chapters and in-video quizzes share the same absolute video timeline.

create table if not exists public.lesson_video_segments (
  id uuid primary key default gen_random_uuid(),
  lesson_draft_id uuid not null references public.lesson_drafts(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  summary text null,
  start_seconds double precision not null,
  end_seconds double precision not null,
  source text not null default 'manual',
  confidence double precision null,
  order_index integer not null,
  created_at timestamptz not null default now(),
  constraint lesson_video_segments_title_length check (char_length(title) between 1 and 200),
  constraint lesson_video_segments_summary_length check (summary is null or char_length(summary) <= 500),
  constraint lesson_video_segments_start_nonnegative check (start_seconds >= 0),
  constraint lesson_video_segments_valid_range check (end_seconds > start_seconds),
  constraint lesson_video_segments_source check (source in ('ai', 'manual', 'timed')),
  constraint lesson_video_segments_confidence check (confidence is null or confidence between 0 and 1),
  constraint lesson_video_segments_order_nonnegative check (order_index >= 0),
  constraint lesson_video_segments_draft_order_unique unique (lesson_draft_id, order_index)
);

create index if not exists lesson_video_segments_lesson_id_idx
  on public.lesson_video_segments (lesson_id, order_index);

alter table public.lesson_video_segments enable row level security;

drop policy if exists "Teachers manage lesson video segments" on public.lesson_video_segments;
create policy "Teachers manage lesson video segments"
on public.lesson_video_segments
for all
to authenticated
using (
  exists (
    select 1
    from public.lesson_drafts
    where lesson_drafts.id = lesson_video_segments.lesson_draft_id
      and lesson_drafts.lesson_id = lesson_video_segments.lesson_id
      and (
        lesson_drafts.teacher_id = auth.uid()
        or exists (
          select 1
          from public.profiles
          where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.lesson_drafts
    where lesson_drafts.id = lesson_video_segments.lesson_draft_id
      and lesson_drafts.lesson_id = lesson_video_segments.lesson_id
      and (
        lesson_drafts.teacher_id = auth.uid()
        or exists (
          select 1
          from public.profiles
          where profiles.id = auth.uid()
            and profiles.role = 'admin'
        )
      )
  )
);

comment on table public.lesson_video_segments is
  'Virtual chapter boundaries on the original lesson video timeline.';
