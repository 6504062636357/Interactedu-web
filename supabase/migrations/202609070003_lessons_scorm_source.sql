alter table public.lessons
  add column scorm_source text not null default 'generated'
    check (scorm_source in ('generated', 'imported'));

comment on column public.lessons.scorm_source is
  'generated = built by this platform''s own SCORM generator (lib/scorm/generate.ts) via the course editor; imported = uploaded as a third-party .zip via /api/admin/scorm-upload. Read by api/scorm/tracking POST to decide whether the score the SCO itself reports through cmi.core.score.raw / cmi.score.raw can be trusted and written to scorm_tracking.score_raw: imported packages grade themselves internally with no equivalent to quiz_attempts, so their self-reported score is the only score that exists; generated-package final exam scores are always sourced from quiz_attempts (see task 03), never from a browser-reported CMI value, so score_raw stays null there regardless of what the SCO reports.';

-- Backfill: every lesson currently flagged is_scorm = true that has no matching scorm_packages
-- row was never touched by lib/scorm/generate.ts (that pipeline always upserts one row per
-- lesson into scorm_packages). The only other path that sets is_scorm = true is
-- /api/admin/scorm-upload, which writes straight to lessons and never touches scorm_packages.
-- So "is_scorm and no scorm_packages row" reliably means "uploaded, not generated" for all
-- existing data (verified against the live DB: 33 is_scorm lessons, 24 with a scorm_packages
-- row, 9 without).
update public.lessons l
set scorm_source = 'imported'
where l.is_scorm = true
  and not exists (select 1 from public.scorm_packages sp where sp.lesson_id = l.id);
