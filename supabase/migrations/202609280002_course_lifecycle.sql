-- Archived courses are hidden from the public catalog but remain visible to
-- students who already have an approved enrollment.
drop policy if exists "Enrolled students read archived courses" on public.courses;
create policy "Enrolled students read archived courses"
on public.courses for select to authenticated
using (
  status = 'archived'
  and exists (
    select 1 from public.enrollments e
    where e.course_id = courses.id
      and e.student_id = auth.uid()
      and e.status = 'approved'
  )
);

create or replace function public.set_course_archived(p_course_id uuid, p_archived boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status text;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    return 'forbidden';
  end if;

  select status::text into current_status
  from public.courses where id = p_course_id for update;
  if not found then return 'not_found'; end if;
  if p_archived and current_status = 'archived' then return null; end if;
  if not p_archived and current_status <> 'archived' then return 'not_archived'; end if;

  if p_archived then
    update public.courses set status = 'archived' where id = p_course_id;
  else
    perform set_config('app.allow_course_restore', 'on', true);
    update public.courses set status = 'draft' where id = p_course_id;
  end if;
  return null;
end;
$$;

-- Existing edit/publish actions must not silently reactivate an archived course.
create or replace function public.prevent_archived_course_status_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' and new.status is distinct from 'archived'
    and current_setting('app.allow_course_restore', true) is distinct from 'on'
  then
    raise exception 'Restore the archived course before editing or publishing it';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_archived_course_status_change on public.courses;
create trigger prevent_archived_course_status_change
before update of status on public.courses
for each row execute function public.prevent_archived_course_status_change();

create or replace function public.delete_draft_course(p_course_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  course_row public.courses%rowtype;
begin
  select role::text into actor_role from public.profiles where id = auth.uid();
  if actor_role not in ('admin', 'teacher') or actor_role is null then
    return 'forbidden';
  end if;

  select * into course_row from public.courses where id = p_course_id for update;
  if not found then return 'not_found'; end if;
  if actor_role = 'teacher' and course_row.created_by is distinct from auth.uid() then
    return 'forbidden';
  end if;
  if course_row.status <> 'draft' then return 'not_draft'; end if;

  if exists (select 1 from public.enrollments where course_id = p_course_id)
    or exists (select 1 from public.course_reviews where course_id = p_course_id)
    or exists (select 1 from public.certificates where course_id = p_course_id)
  then
    return 'has_history';
  end if;

  -- Remove unpublished lesson content first. Existing progress FKs still block
  -- deletion and roll the whole function back if any historical data remains.
  delete from public.lessons where course_id = p_course_id;
  delete from public.modules where course_id = p_course_id;
  delete from public.courses where id = p_course_id;
  return null;
exception when foreign_key_violation then
  return 'has_dependencies';
end;
$$;

revoke all on function public.set_course_archived(uuid, boolean) from public;
revoke all on function public.delete_draft_course(uuid) from public;
grant execute on function public.set_course_archived(uuid, boolean) to authenticated;
grant execute on function public.delete_draft_course(uuid) to authenticated;

notify pgrst, 'reload schema';
