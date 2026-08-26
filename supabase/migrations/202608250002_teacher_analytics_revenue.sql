-- Store the course price at enrollment time so teacher revenue analytics do
-- not change when a course price is edited later.

alter table public.enrollments
add column if not exists paid_amount numeric(12, 2);

-- Backfill legacy enrollments. Paid rows are identified by the existing
-- payment reference; free enrollments remain zero.
update public.enrollments as enrollments
set paid_amount = case
  when enrollments.payment_slip_url is not null then greatest(coalesce(courses.price, 0), 0)
  else 0
end
from public.courses as courses
where courses.id = enrollments.course_id
  and enrollments.paid_amount is null;

update public.enrollments
set paid_amount = 0
where paid_amount is null;

alter table public.enrollments
alter column paid_amount set default 0,
alter column paid_amount set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'enrollments_paid_amount_nonnegative'
      and conrelid = 'public.enrollments'::regclass
  ) then
    alter table public.enrollments
    add constraint enrollments_paid_amount_nonnegative check (paid_amount >= 0);
  end if;
end;
$$;

comment on column public.enrollments.paid_amount is
  'Course price snapshot in THB used for approved-enrollment revenue analytics.';
