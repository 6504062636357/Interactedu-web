// Run against a disposable PostgreSQL instance using PGlite, not live Supabase:
// node tests/membership-learning-start.integration.mjs <PGlite package directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Provide the directory of an installed @electric-sql/pglite package');
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2], 'dist/index.js')).href);
const db = new PGlite();
const student = '10000000-0000-4000-8000-000000000001';
const direct = '10000000-0000-4000-8000-000000000002';
const prior = '10000000-0000-4000-8000-000000000003';
const fresh = '10000000-0000-4000-8000-000000000004';
const teacher = '10000000-0000-4000-8000-000000000010';
const course = '20000000-0000-4000-8000-000000000001';
const lesson = '30000000-0000-4000-8000-000000000001';
const otherLesson = '30000000-0000-4000-8000-000000000002';

async function count(sql, args = []) {
  return Number((await db.query(sql, args)).rows[0].count);
}
async function start(user, targetCourse = course, targetLesson = lesson) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  return (await db.query('select public.start_course_learning($1, $2) as started', [targetCourse, targetLesson])).rows[0].started;
}
async function forbidden(user, targetCourse = course, targetLesson = lesson) {
  await assert.rejects(start(user, targetCourse, targetLesson), error => error.code === '42501');
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles (id uuid primary key, full_name text, role text, is_active boolean default true);
    create table public.courses (id uuid primary key, title text, created_by uuid, status text default 'published');
    create table public.lessons (id uuid primary key, course_id uuid, is_published boolean default true);
    create table public.enrollments (
      id uuid primary key default gen_random_uuid(), student_id uuid, course_id uuid,
      membership_order_id uuid, status text default 'approved', access_expires_at timestamptz,
      created_at timestamptz default now()
    );
    create table public.scorm_tracking (enrollment_id uuid, last_accessed timestamptz);
    create table public.student_study_time (enrollment_id uuid, total_seconds bigint, updated_at timestamptz);
    create table public.notifications (
      id uuid primary key default gen_random_uuid(), user_id uuid, type text default 'system',
      title text, message text, link text, related_type text, related_id uuid, action_url text,
      dedupe_key text unique, is_read boolean default false, created_at timestamptz default now()
    );
    alter table public.notifications enable row level security;
    create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
    create policy "Legacy own notification reads" on public.notifications for select to authenticated using (user_id = auth.uid());
    grant select on public.notifications to authenticated;
    create function public.legacy_enrollment_notification() returns trigger language plpgsql as $$
    begin
      insert into public.notifications (user_id, title, message, link)
      select c.created_by, 'มีนักเรียนใหม่สมัครคอร์ส',
        p.full_name || ' ได้ลงทะเบียนเรียนคอร์ส "' || c.title || '"',
        '/dashboard/teacher/courses/' || c.id::text
      from public.courses c, public.profiles p
      where c.id = new.course_id and p.id = new.student_id;
      return new;
    end;
    $$;
    create trigger legacy_enrollment_notification after insert or update of status on public.enrollments
      for each row execute function public.legacy_enrollment_notification();
    insert into public.profiles (id, full_name, role) values
      ('${student}', 'Alice', 'student'), ('${direct}', 'Alice', 'student'),
      ('${prior}', 'Prior learner', 'student'), ('${fresh}', 'Fresh member', 'student'),
      ('${teacher}', 'Teacher', 'teacher');
    insert into public.courses (id, title, created_by) values ('${course}', 'Running', '${teacher}');
    insert into public.lessons values ('${lesson}', '${course}', true), ('${otherLesson}', gen_random_uuid(), true);
    begin;
    insert into public.enrollments (student_id, course_id, membership_order_id)
      values ('${student}', '${course}', gen_random_uuid()), ('${prior}', '${course}', gen_random_uuid());
    commit;
    insert into public.scorm_tracking select id, clock_timestamp() from public.enrollments where student_id = '${prior}';
  `);
  // A separate registration transaction, as in the application's enroll action.
  await db.exec(`insert into public.enrollments (student_id, course_id) values ('${direct}', '${course}')`);
  const original = await count('select count(*) from public.notifications');
  assert.equal(original, 3);
  await db.exec(await fs.readFile('supabase/migrations/20261006090000_membership_course_learning_start.sql', 'utf8'));
  assert.equal(await count('select count(*) from public.notifications'), original);
  assert.equal(await count('select count(*) from public.notifications where is_suppressed'), 2);
  assert.equal(await count('select count(*) from public.enrollments where learning_started_at is not null'), 1);
  console.log('PASS: migration hides automatic notices, preserves direct registrations and backfills prior activity');

  await db.exec(`insert into public.enrollments (student_id, course_id, membership_order_id)
    values ('${fresh}', '${course}', gen_random_uuid())`);
  assert.equal(await count('select count(*) from public.notifications'), original);
  await db.exec(`update public.enrollments set status = 'approved' where student_id = '${fresh}'`);
  assert.equal(await count('select count(*) from public.notifications'), original);
  console.log('PASS: new automatic grants and renewals do not generate registration notifications');

  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [teacher]);
  assert.equal(await count('select count(*) from public.notifications where not is_read'), 1);
  await db.exec('reset role');
  console.log('PASS: restrictive RLS hides false notices from lists and unread counts');

  await db.exec('set role authenticated');
  assert.equal(await start(student), true);
  await db.exec('reset role');
  assert.equal(await count("select count(*) from public.notifications where type = 'student_started_course'"), 1);
  const notice = (await db.query("select * from public.notifications where type = 'student_started_course'")).rows[0];
  assert.equal(notice.related_type, 'enrollment');
  assert.equal(notice.action_url, `/dashboard/teacher/courses/${course}`);
  await db.query('update public.notifications set is_read = true where id = $1', [notice.id]);
  assert.equal(await start(student), false);
  assert.equal(await count("select count(*) from public.notifications where type = 'student_started_course'"), 1);
  assert.equal((await db.query('select is_read from public.notifications where id = $1', [notice.id])).rows[0].is_read, true);
  assert.equal(await start(prior), false);
  assert.equal(await start(direct), true);
  assert.equal(await count("select count(*) from public.notifications where type = 'student_started_course'"), 1);
  console.log('PASS: first learning-room entry notifies once; retries and direct purchases do not duplicate notifications');

  await forbidden('');
  await forbidden(teacher);
  await forbidden(fresh, course, otherLesson);
  await db.exec(`update public.profiles set is_active = false where id = '${fresh}'`);
  await forbidden(fresh);
  await db.exec(`update public.profiles set is_active = true where id = '${fresh}';
    update public.enrollments set access_expires_at = now() - interval '1 minute' where student_id = '${fresh}'`);
  await forbidden(fresh);
  await db.exec(`update public.enrollments set access_expires_at = now() + interval '1 day', status = 'pending' where student_id = '${fresh}'`);
  await forbidden(fresh);
  await db.exec(`update public.enrollments set status = 'approved' where student_id = '${fresh}';
    update public.lessons set is_published = false where id = '${lesson}'`);
  await forbidden(fresh);
  console.log('PASS: RPC rejects anonymous, non-student, mismatched lesson, inactive, expired, pending and unpublished access');

  await db.exec(await fs.readFile('supabase/migrations/20261006100000_student_course_library.sql', 'utf8'));
  const save = async user => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    return (await db.query('select public.save_course_to_library($1) as saved', [course])).rows[0].saved;
  };
  const enrollmentBefore = (await db.query('select to_jsonb(e) as row from public.enrollments e where student_id = $1', [fresh])).rows[0].row;
  const noticesBefore = await count('select count(*) from public.notifications');
  await db.exec('set role authenticated');
  assert.equal(await save(fresh), true);
  assert.equal(await save(fresh), false);
  assert.equal(await count('select count(*) from public.student_course_library'), 1);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [student]);
  assert.equal(await count('select count(*) from public.student_course_library'), 0);
  await assert.rejects(db.exec(`insert into public.student_course_library (enrollment_id, student_id) values (gen_random_uuid(), '${student}')`), error => error.code === '42501');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select to_jsonb(e) as row from public.enrollments e where student_id = $1', [fresh])).rows[0].row, enrollmentBefore);
  assert.equal(await count('select count(*) from public.notifications'), noticesBefore);
  assert.equal(await count('select count(*) from public.student_study_time'), 0);
  console.log('PASS: saving is idempotent, private and never changes enrollment, learning or notifications');

  await db.exec(`update public.lessons set is_published = true where id = '${lesson}'; set role authenticated`);
  assert.equal(await start(fresh), true);
  assert.equal(await start(fresh), false);
  await db.exec('reset role');
  assert.equal(await count('select count(*) from public.notifications'), noticesBefore + 1);
  assert.equal(await count('select count(*) from public.student_course_library'), 1);
  assert.equal(await count(`select count(*) from public.enrollments where student_id = '${fresh}' and learning_started_at is not null`), 1);
  console.log('PASS: a saved course starts normally and sends exactly one first-start notification');

  for (const user of ['', teacher, direct]) await assert.rejects(save(user), error => error.code === '42501');
  await db.exec(`update public.profiles set is_active = false where id = '${fresh}'`);
  await assert.rejects(save(fresh), error => error.code === '42501');
  await db.exec(`update public.profiles set is_active = true where id = '${fresh}';
    update public.enrollments set access_expires_at = now() - interval '1 minute' where student_id = '${fresh}'`);
  await assert.rejects(save(fresh), error => error.code === '42501');
  await db.exec(`update public.enrollments set access_expires_at = now() + interval '1 day', status = 'pending' where student_id = '${fresh}'`);
  await assert.rejects(save(fresh), error => error.code === '42501');
  await db.exec(`update public.enrollments set status = 'approved' where student_id = '${fresh}';
    update public.courses set status = 'draft' where id = '${course}'`);
  await assert.rejects(save(fresh), error => error.code === '42501');
  await db.exec(`update public.courses set status = 'published' where id = '${course}'; set role anon`);
  await assert.rejects(save(fresh), error => error.code === '42501');
  await db.exec('reset role');
  console.log('PASS: saving rejects anonymous, non-student, inactive, expired, pending, non-Plus and unpublished access');
} finally {
  await db.close();
}
