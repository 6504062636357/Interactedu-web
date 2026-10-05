-- Membership access is not a student's choice to start a course.
-- Requires the membership and in-app notification migrations. Existing access,
-- learning progress, payments and certificates are preserved.
begin;

alter table public.enrollments add column if not exists learning_started_at timestamptz;
alter table public.notifications add column if not exists is_suppressed boolean not null default false;

-- Preserve courses that members had already started before this change.
update public.enrollments e
set learning_started_at = coalesce(
  (select min(st.last_accessed) from public.scorm_tracking st where st.enrollment_id = e.id),
  (select s.updated_at from public.student_study_time s where s.enrollment_id = e.id and s.total_seconds > 0),
  e.created_at
)
where e.learning_started_at is null
  and (
    exists (
      select 1 from public.scorm_tracking st
      where st.enrollment_id = e.id and (
        st.last_accessed is not null
        or to_jsonb(st)->>'video_completed' = 'true'
        or (jsonb_typeof(to_jsonb(st)->'completed_scos') = 'array' and to_jsonb(st)->'completed_scos' <> '[]'::jsonb)
        or case
          when coalesce(to_jsonb(st)#>>'{cmi_data,core,lesson_location}', to_jsonb(st)#>>'{cmi_data,location}', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then coalesce(to_jsonb(st)#>>'{cmi_data,core,lesson_location}', to_jsonb(st)#>>'{cmi_data,location}')::numeric >= 1
          else false
        end
      )
    )
    or exists (select 1 from public.student_study_time s where s.enrollment_id = e.id and s.total_seconds > 0)
  );

-- Legacy enrollment triggers populate only title/message/link. Match their
-- course, recipient and student, rather than hiding all registration notices.
create or replace function public.is_membership_access_notification(
  p_user_id uuid, p_type text, p_title text, p_message text,
  p_url text, p_created_at timestamptz, p_match_transaction boolean default false
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_type, 'system') = 'system'
    and p_title = 'มีนักเรียนใหม่สมัครคอร์ส'
    and p_url ~ '^/dashboard/(teacher|admin)/courses/[0-9a-fA-F-]{36}(/|$)'
    and exists (
      select 1
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.profiles p on p.id = e.student_id
      where e.membership_order_id is not null
        and e.course_id::text = split_part(p_url, '/', 5)
        and c.created_by = p_user_id
        and (e.created_at = p_created_at or (
          p_match_transaction and e.xmin = pg_current_xact_id_if_assigned()::text::xid
        ))
        and starts_with(coalesce(p_message, ''), coalesce(p.full_name, 'นักเรียน') || ' ได้ลงทะเบียนเรียนคอร์ส "')
    );
$$;

revoke all on function public.is_membership_access_notification(uuid, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;

create or replace function public.suppress_membership_access_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_membership_access_notification(
    new.user_id, new.type, new.title, new.message,
    coalesce(new.action_url, to_jsonb(new)->>'link'), new.created_at, true
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.suppress_membership_access_notification() from public, anon, authenticated;
drop trigger if exists suppress_membership_access_notification on public.notifications;
create trigger suppress_membership_access_notification
before insert on public.notifications
for each row execute function public.suppress_membership_access_notification();

-- Hide existing automatic notices without deleting the notification history.
update public.notifications n
set is_suppressed = true
where public.is_membership_access_notification(
  n.user_id, n.type, n.title, n.message,
  coalesce(n.action_url, to_jsonb(n)->>'link'), n.created_at
);

-- Restrictive policies combine with all existing SELECT policies, including
-- legacy policies. Lists, detail pages, unread counts and Realtime agree.
drop policy if exists "Suppress automatic membership notices" on public.notifications;
create policy "Suppress automatic membership notices"
on public.notifications as restrictive for select to authenticated
using (not is_suppressed);

create or replace function public.start_course_learning(p_course_id uuid, p_lesson_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_enrollment_id uuid;
  v_membership_order_id uuid;
  v_started_at timestamptz;
  v_owner_id uuid;
  v_owner_role text;
  v_course_title text;
  v_student_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select e.id, e.membership_order_id, e.learning_started_at,
    c.created_by, owner.role::text, c.title, coalesce(p.full_name, 'นักเรียน')
  into v_enrollment_id, v_membership_order_id, v_started_at,
    v_owner_id, v_owner_role, v_course_title, v_student_name
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  join public.courses c on c.id = e.course_id
  join public.lessons l on l.course_id = c.id and l.id = p_lesson_id
  left join public.profiles owner on owner.id = c.created_by
  where e.student_id = auth.uid()
    and e.course_id = p_course_id
    and e.status::text = 'approved'
    and (e.access_expires_at is null or e.access_expires_at > clock_timestamp())
    and p.role::text = 'student' and p.is_active is true
    and l.is_published is true
  for update of e;

  if v_enrollment_id is null then
    raise exception using errcode = '42501', message = 'An active enrollment and published lesson are required';
  end if;
  if v_started_at is not null then
    return false;
  end if;

  update public.enrollments
  set learning_started_at = clock_timestamp()
  where id = v_enrollment_id;

  if v_membership_order_id is not null and v_owner_id is not null then
    insert into public.notifications (
      user_id, type, title, message, related_type, related_id, action_url, dedupe_key
    ) values (
      v_owner_id, 'student_started_course', 'มีผู้เรียนเริ่มเรียนคอร์ส',
      format('%s เริ่มเรียนคอร์ส "%s"', v_student_name, v_course_title),
      'enrollment', v_enrollment_id,
      '/dashboard/' || case when v_owner_role = 'admin' then 'admin' else 'teacher' end || '/courses/' || p_course_id::text,
      'student_started_course:' || v_enrollment_id::text || ':' || v_owner_id::text
    ) on conflict (dedupe_key) do nothing;
  end if;
  return true;
end;
$$;

revoke all on function public.start_course_learning(uuid, uuid) from public, anon;
grant execute on function public.start_course_learning(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
