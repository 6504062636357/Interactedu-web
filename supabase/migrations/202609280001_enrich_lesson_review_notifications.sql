-- Store enough context on lesson-review notifications to identify and open
-- the affected course. The trigger is the canonical source for these events.

create or replace function public.notify_teacher_on_lesson_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lesson_title text;
  v_course_id uuid;
  v_course_title text;
  v_action_url text;
  v_type text;
  v_title text;
  v_message text;
  v_dedupe_key text;
begin
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  select l.title, l.course_id, c.title
  into v_lesson_title, v_course_id, v_course_title
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.id = new.lesson_id;

  if v_course_id is null then
    return new;
  end if;

  v_action_url := '/dashboard/teacher/courses/' || v_course_id;

  if new.status = 'approved' then
    v_type := 'lesson_approved';
    v_title := format('บทเรียน “%s” ได้รับการอนุมัติ', coalesce(v_lesson_title, 'ไม่ระบุชื่อ'));
    v_message := format(
      'บทเรียน “%s” ในคอร์ส “%s” ได้รับการอนุมัติและเผยแพร่แล้ว',
      coalesce(v_lesson_title, 'ไม่ระบุชื่อ'),
      coalesce(v_course_title, 'ไม่ระบุชื่อ')
    );
    v_dedupe_key := 'lesson_approved:' || new.id;
  else
    v_type := 'lesson_rejected';
    v_title := format('บทเรียน “%s” ต้องแก้ไข', coalesce(v_lesson_title, 'ไม่ระบุชื่อ'));
    v_message := format(
      'บทเรียน “%s” ในคอร์ส “%s” ถูกส่งกลับให้แก้ไข เหตุผล: %s',
      coalesce(v_lesson_title, 'ไม่ระบุชื่อ'),
      coalesce(v_course_title, 'ไม่ระบุชื่อ'),
      coalesce(new.rejection_reason, 'ไม่ระบุ')
    );
    v_dedupe_key := 'lesson_rejected:' || new.id;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    link,
    related_type,
    related_id,
    action_url,
    dedupe_key,
    is_read,
    read_at,
    created_at
  )
  values (
    new.teacher_id,
    v_type,
    v_title,
    v_message,
    v_action_url,
    'lesson',
    new.lesson_id,
    v_action_url,
    v_dedupe_key,
    false,
    null,
    now()
  )
  on conflict (dedupe_key) do update
  set user_id = excluded.user_id,
      type = excluded.type,
      title = excluded.title,
      message = excluded.message,
      link = excluded.link,
      related_type = excluded.related_type,
      related_id = excluded.related_id,
      action_url = excluded.action_url,
      is_read = false,
      read_at = null,
      created_at = now();

  return new;
end;
$function$;

-- Backfill legacy approval rows only when an approved draft owned by the same
-- teacher can be matched within 30 seconds. Ambiguous lesson batches still
-- receive the correct course because they are approved as one course action.
with matched as (
  select
    n.id as notification_id,
    c.id as course_id,
    c.title as course_title
  from public.notifications n
  join lateral (
    select ld.lesson_id, ld.reviewed_at
    from public.lesson_drafts ld
    where ld.teacher_id = n.user_id
      and ld.status = 'approved'
      and ld.reviewed_at is not null
    order by abs(extract(epoch from n.created_at - ld.reviewed_at))
    limit 1
  ) d on true
  join public.lessons l on l.id = d.lesson_id
  join public.courses c on c.id = l.course_id
  where n.title = 'บทเรียนได้รับการอนุมัติ'
    and n.related_id is null
    and abs(extract(epoch from n.created_at - d.reviewed_at)) <= 30
)
update public.notifications n
set type = 'lesson_approved',
    title = format('บทเรียนในคอร์ส “%s” ได้รับการอนุมัติ', matched.course_title),
    message = format('บทเรียนในคอร์ส “%s” ได้รับการอนุมัติและเผยแพร่แล้ว', matched.course_title),
    link = '/dashboard/teacher/courses/' || matched.course_id,
    related_type = 'course',
    related_id = matched.course_id,
    action_url = '/dashboard/teacher/courses/' || matched.course_id
from matched
where n.id = matched.notification_id;

-- Course-approval rows already identify their course, so they can be safely
-- enriched without relying on timestamps.
update public.notifications n
set title = format('คอร์ส “%s” ได้รับการอนุมัติ', c.title),
    message = format('คอร์ส “%s” ได้รับการอนุมัติและเผยแพร่แล้ว', c.title),
    link = '/dashboard/teacher/courses/' || c.id,
    related_type = 'course',
    action_url = '/dashboard/teacher/courses/' || c.id
from public.courses c
where n.type = 'course_approved'
  and n.related_id = c.id;
