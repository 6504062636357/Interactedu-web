const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => dependencies[name] ?? require(name) });
  return exports;
}
const progress = load('src/lib/courses/student-progress.ts');
const resume = load('src/lib/courses/scorm-resume.ts');
const lessons = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
const record = (lesson_id, complete, last_accessed) => ({ lesson_id, video_completed: complete, lesson_status: 'incomplete', last_accessed });

test('new students start at the first lesson, while an empty course has no play target', () => {
  assert.equal(progress.summarizeStudentProgress(lessons, []).resumeLesson.id, 'first');
  assert.equal(progress.summarizeStudentProgress([], []).resumeLesson, null);
});
test('resume selects the most recently accessed incomplete lesson, not always the first', () => {
  const result = progress.summarizeStudentProgress(lessons, [record('first', false, '2026-09-19'), record('third', false, '2026-09-21')]);
  assert.equal(result.resumeLesson.id, 'third');
  assert.equal(result.started, true);
});
test('finishing a lesson advances to the next incomplete lesson', () => {
  const result = progress.summarizeStudentProgress(lessons, [record('first', true, '2026-09-21')]);
  assert.equal(result.resumeLesson.id, 'second');
  assert.equal(result.completed, 1);
});
test('completion agrees with the final exam gate, even if SCORM lesson_status differs', () => {
  assert.equal(progress.isLessonComplete({ video_completed: false, lesson_status: 'passed' }), false);
  assert.equal(progress.isLessonComplete({ video_completed: true, lesson_status: 'incomplete' }), true);
});
test('stored SCORM chapter completion contributes partial course progress', () => {
  const segmentedLesson = {
    id: 'segmented',
    scorm_source: 'generated',
    scorm_manifest: {
      items: [{
        identifier: 'ITEM-LESSON', href: null, children: [
          { identifier: 'ITEM-CHAPTER-1', href: 'lesson.html?chapter=1', type: 'lesson' },
          { identifier: 'ITEM-CHAPTER-2', href: 'lesson.html?chapter=2', type: 'lesson' },
          { identifier: 'ITEM-CHAPTER-3', href: 'lesson.html?chapter=3', type: 'lesson' },
        ],
      }, { identifier: 'ITEM-QUIZ', href: 'quiz.html', type: 'quiz' }],
    },
  };
  const result = progress.summarizeStudentProgress([segmentedLesson], [{
    ...record('segmented', false, '2026-09-21'),
    completed_scos: ['lesson.html?chapter=1', 'lesson.html?chapter=2'],
  }]);
  assert.equal(result.completed, 0);
  assert.equal(result.percent, 67);
  assert.equal(result.started, true);
});
test('resume opens the unfinished chapter containing the saved video position', () => {
  const manifest = {
    items: [{ identifier: 'ITEM-LESSON', href: null, children: [
      { identifier: 'ITEM-CHAPTER-1', href: 'lesson.html?chapter=1', type: 'lesson', startSeconds: 0, endSeconds: 300 },
      { identifier: 'ITEM-CHAPTER-2', href: 'lesson.html?chapter=2', type: 'lesson', startSeconds: 300, endSeconds: 600 },
      { identifier: 'ITEM-CHAPTER-3', href: 'lesson.html?chapter=3', type: 'lesson', startSeconds: 600, endSeconds: 1200 },
    ] }],
  };
  assert.equal(resume.selectResumeScoPath({
    entryPoint: 'lesson.html?chapter=1',
    manifest,
    scormSource: 'generated',
    completedScos: ['lesson.html?chapter=1', 'lesson.html?chapter=2'],
    resumeSeconds: 960,
    videoCompleted: false,
  }), 'lesson.html?chapter=3');
});
test('removed lessons never affect progress or resume, and partial completion stays below 100%', () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
  const tracking = rows.slice(0, 199).map(row => record(row.id, true, '2026-09-20'));
  tracking.push(record('removed', true, '2026-09-22'));
  const result = progress.summarizeStudentProgress(rows, tracking);
  assert.equal(result.percent, 99);
  assert.equal(result.resumeLesson.id, '199');
});
test('complete courses remain available for review', () => {
  const result = progress.summarizeStudentProgress(lessons, lessons.map(row => record(row.id, true, '2026-09-20')));
  assert.equal(result.allComplete, true);
  assert.equal(result.percent, 100);
  assert.equal(result.resumeLesson.id, 'first');
});
test('resume time reads SCORM 1.2 and 2004, ignoring invalid bookmarks', () => {
  assert.equal(progress.getResumeSeconds({ cmi_data: { core: { lesson_location: '297.1' } } }), 297);
  assert.equal(progress.getResumeSeconds({ cmi_data: { location: '75' } }), 75);
  assert.equal(progress.getResumeSeconds({ cmi_data: { location: 'slide-4' } }), 0);
  assert.equal(progress.getResumeSeconds({ cmi_data: { location: -4 } }), 0);
});

async function renderOverview(options = {}) {
  const course = { id: 'course', title: 'Course details', description: 'Learn the course objectives', certificate_enabled: true, certificate_pass_percentage: 70 };
  const tables = {
    enrollments: [{
      id: 'enrollment',
      course_id: 'course',
      student_id: options.foreign ? 'other-student' : 'student',
      status: options.pending ? 'pending' : 'approved',
      access_expires_at: options.expired ? '2000-01-01T00:00:00.000Z' : options.membership ? '2999-01-01T00:00:00.000Z' : null,
      courses: course,
    }],
    modules: [{ id: 'module', course_id: 'course', title: 'Module', order_index: 0, lessons: [
      { id: 'first', title: 'First lesson', order_index: 0, is_published: true, scorm_source: 'generated' },
      { id: 'second', title: 'Second lesson', order_index: 1, is_published: !options.unpublished, scorm_source: 'generated' },
    ] }],
    scorm_tracking: ['first', 'second'].map(id => ({ ...record(id, !!options.complete, id === 'second' ? '2026-09-21' : '2026-09-20'), enrollment_id: 'enrollment', cmi_data: { core: { lesson_location: '297' } } })),
    courses: [course],
    certificates: options.certificate ? [{ id: 'certificate', course_id: 'course', user_id: 'student', status: options.certificate, issued_at: '2026-09-21' }] : [],
    student_study_time: [],
    quiz_attempts: options.passed ? [{ id: 'attempt', enrollment_id: 'enrollment', passed: true, score: 90, submitted_at: '2026-09-21' }] : [],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'student' } } }) },
    from(table) {
      let single = false;
      const filters = [];
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        or(expression) {
          const expiry = expression.match(/access_expires_at\.is\.null,access_expires_at\.gt\.(.+)$/)?.[1];
          if (expiry) filters.push(row => !row.access_expires_at || new Date(row.access_expires_at) > new Date(expiry));
          return query;
        },
        not(key, _operator, value) { filters.push(row => row[key] !== value); return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          if (table === options.failTable) return Promise.resolve({ data: null, error: { message: 'Unavailable' } }).then(resolve, reject);
          const rows = tables[table].filter(row => filters.every(filter => filter(row)));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const page = load('src/app/dashboard/student/courses/[courseId]/page.tsx', {
    'next/link': { default: props => React.createElement('a', props) },
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); }, redirect() { throw new Error('REDIRECT'); } },
    '@/utils/supabase/server': { createClient: async () => client },
    '@/lib/constants/course-cover': { DEFAULT_COURSE_COVER_URL: '/cover.png' },
    '@/lib/courses/student-progress': progress,
    '@/lib/courses/study-time': load('src/lib/courses/study-time.ts'),
    '@/components/certificates/ClaimCertificateButton': { default: () => React.createElement('button', { 'data-claim': true }, 'Claim') },
  }).default;
  return renderToStaticMarkup(await page({ params: Promise.resolve({ courseId: 'course' }) }));
}
test('overview shows description and saved resume lesson before entering the player', async () => {
  const html = await renderOverview();
  assert.ok(html.includes('Learn the course objectives'));
  assert.ok(html.includes('/play/course/second'));
  assert.ok(html.includes('4:57'));
  assert.ok(!html.includes('href="/dashboard/student/courses/course/final-exam"'));
});
test('completed lessons unlock the final exam; passing enables certificate recovery', async () => {
  assert.ok((await renderOverview({ complete: true })).includes('href="/dashboard/student/courses/course/final-exam"'));
  assert.ok((await renderOverview({ complete: true, passed: true })).includes('data-claim="true"'));
});
test('issued certificates download from the course, while revoked certificates never do', async () => {
  assert.ok((await renderOverview({ certificate: 'issued' })).includes('/api/me/certificates/certificate/download'));
  const revoked = await renderOverview({ certificate: 'revoked', complete: true, passed: true });
  assert.ok(!revoked.includes('/api/me/certificates/certificate/download'));
  assert.ok(!revoked.includes('data-claim'));
});
test('unpublished lessons are hidden and progress errors never unlock an exam', async () => {
  assert.ok(!(await renderOverview({ unpublished: true })).includes('/play/course/second'));
  assert.ok(!(await renderOverview({ complete: true, failTable: 'scorm_tracking' })).includes('href="/dashboard/student/courses/course/final-exam"'));
});
test('overview requires login and the current student approved enrollment', async () => {
  await assert.rejects(renderOverview({ noUser: true }), /REDIRECT/);
  await assert.rejects(renderOverview({ foreign: true }), /NOT_FOUND/);
  await assert.rejects(renderOverview({ pending: true }), /NOT_FOUND/);
  await assert.rejects(renderOverview({ expired: true }), /NOT_FOUND/);
  assert.ok((await renderOverview({ membership: true })).includes('Learn the course objectives'));
});

const learningEnrollment = load('src/lib/courses/learning-enrollment.ts', { './student-progress': progress });

test('libraries keep legacy enrollment data while the start marker migration is pending', async () => {
  for (const code of ['42703', 'PGRST204']) {
    const calls = [];
    const rows = [{ membership_order_id: null }, { membership_order_id: 'plus', scorm_tracking: [] }];
    const result = await learningEnrollment.loadLearningEnrollments(async includeStart => {
      calls.push(includeStart);
      return includeStart
        ? { data: null, error: { code, message: 'column enrollments.learning_started_at does not exist' } }
        : { data: rows, error: null };
    });
    assert.deepEqual(calls, [true, false]);
    assert.equal(result.data, rows);
    assert.deepEqual(result.data.filter(learningEnrollment.isLearningEnrollment), [rows[0]]);
  }
});

test('enrollment reads do not retry success, access failures, timeouts or unrelated schema errors', async () => {
  for (const error of [
    null,
    { code: '42501', message: 'Permission denied for learning_started_at' },
    { code: '', message: 'Supabase request timed out' },
    { code: '42703', message: 'column different_column does not exist' },
  ]) {
    let calls = 0;
    const response = { data: error ? null : [], error };
    const result = await learningEnrollment.loadLearningEnrollments(async () => {
      calls++;
      return response;
    });
    assert.equal(calls, 1);
    assert.equal(result, response);
  }
});

test('Plus access alone does not add every course to the learner library', () => {
  const unstarted = { membership_order_id: 'plus', scorm_tracking: [], student_study_time: null };
  assert.equal(learningEnrollment.isLearningEnrollment(unstarted), false);
  assert.equal(learningEnrollment.isLearningEnrollment({ ...unstarted, scorm_tracking: [record('first', false, null)], student_study_time: { total_seconds: 0 } }), false);
  assert.equal(learningEnrollment.isLearningEnrollment({ ...unstarted, membership_order_id: null }), true);
});

test('Plus courses appear after starting, including 0 percent progress and legacy activity', () => {
  for (const activity of [
    { learning_started_at: '2026-10-06T09:00:00Z' },
    { scorm_tracking: [record('first', false, '2026-10-05')] },
    { scorm_tracking: [record('first', true, null)] },
    { scorm_tracking: [{ ...record('first', false, null), completed_scos: ['chapter'] }] },
    { scorm_tracking: [{ ...record('first', false, null), cmi_data: { core: { lesson_location: '12' } } }] },
    { student_study_time: { total_seconds: 10 } },
  ]) assert.equal(learningEnrollment.isLearningEnrollment({ membership_order_id: 'plus', ...activity }), true);
});

async function renderStudentProfile(enrollmentRows, options = {}) {
  const enrollmentSelections = [];
  const tables = {
    profiles: [{ id: 'student', full_name: 'Learner', avatar_url: null }],
    student_membership_orders: [],
    enrollments: enrollmentRows,
    scorm_tracking: enrollmentRows.flatMap(enrollment => (enrollment.scorm_tracking ?? []).map(row => ({ ...row, enrollment_id: enrollment.id }))),
    lessons: enrollmentRows.map(enrollment => ({ id: enrollment.course_id + '-lesson', course_id: enrollment.course_id, is_published: true })),
    certificates: [],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'student', email: 'learner@example.test' } } }) },
    from(table) {
      const filters = [];
      let selection = '', single = false;
      const query = {
        select(value) { selection = value; if (table === 'enrollments') enrollmentSelections.push(value); return query; },
        order() { return query; }, limit() { return query; },
        single() { single = true; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        gt(key, value) { filters.push(row => row[key] > value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        or(expression) {
          const expiry = expression.match(/access_expires_at\.is\.null,access_expires_at\.gt\.(.+)$/)?.[1];
          if (expiry) filters.push(row => !row.access_expires_at || row.access_expires_at > expiry);
          return query;
        },
        then(resolve, reject) {
          if (table === 'enrollments' && options.missingMarker && selection.includes('learning_started_at')) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column enrollments.learning_started_at does not exist' } }).then(resolve, reject);
          }
          const rows = tables[table].filter(row => filters.every(filter => filter(row)));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const page = load('src/app/dashboard/student/profile/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => client },
    '@/lib/courses/student-progress': progress,
    '@/lib/courses/learning-enrollment': learningEnrollment,
    '@/lib/payments/plus-plan': load('src/lib/payments/plus-plan.ts'),
    '@/components/StudentProfileClient': { default: ({ children }) => React.createElement('div', null, children) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  }).default;
  return { html: renderToStaticMarkup(await page()), enrollmentSelections };
}

function profileEnrollment(id, activity = {}) {
  return {
    id, course_id: id, student_id: 'student', status: 'approved', membership_order_id: 'plus',
    access_expires_at: '2999-01-01T00:00:00Z', scorm_tracking: [], student_study_time: null,
    courses: { id, title: id, slug: id, category: null, cover_image_url: null },
    ...activity,
  };
}

test('student profile shows zero learning courses for 31 untouched Plus entitlements', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => profileEnrollment('UNSTARTED_PLUS_' + index));
  const { html } = await renderStudentProfile(rows);
  assert.match(html, /คอร์สที่เรียนอยู่<\/p><p[^>]*>0<\/p>/);
  assert.match(html, /ยังไม่มีคอร์สที่กำลังเรียน/);
  assert.doesNotMatch(html, /UNSTARTED_PLUS_/);
});

test('profile counts only chosen Plus courses and preserves direct registrations and completed courses', async () => {
  const rows = [
    profileEnrollment('UNSTARTED_PLUS'),
    profileEnrollment('STARTED_MARKER', { learning_started_at: '2026-10-06T09:00:00Z' }),
    profileEnrollment('STARTED_LEGACY', { scorm_tracking: [record('STARTED_LEGACY-lesson', false, '2026-10-05')] }),
    profileEnrollment('COMPLETED_PLUS', { scorm_tracking: [record('COMPLETED_PLUS-lesson', true, '2026-10-05')] }),
    profileEnrollment('DIRECT_REGISTRATION', { membership_order_id: null }),
    profileEnrollment('EXPIRED_ACCESS', { learning_started_at: '2026-10-05', access_expires_at: '2000-01-01T00:00:00Z' }),
    profileEnrollment('PENDING_ACCESS', { learning_started_at: '2026-10-05', status: 'pending' }),
    profileEnrollment('FOREIGN_STUDENT', { learning_started_at: '2026-10-05', student_id: 'another-student' }),
  ];
  const { html } = await renderStudentProfile(rows);
  assert.match(html, /คอร์สที่เรียนอยู่<\/p><p[^>]*>3<\/p>/);
  assert.match(html, /เรียนจบแล้ว<\/p><p[^>]*>1<\/p>/);
  for (const title of ['STARTED_MARKER', 'STARTED_LEGACY', 'DIRECT_REGISTRATION']) assert.ok(html.includes(title));
  assert.doesNotMatch(html, /UNSTARTED_PLUS|COMPLETED_PLUS|EXPIRED_ACCESS|PENDING_ACCESS|FOREIGN_STUDENT/);
});

test('profile keeps legacy learning activity while the marker migration is pending', async () => {
  const { html, enrollmentSelections } = await renderStudentProfile([
    profileEnrollment('UNSTARTED_PLUS'),
    profileEnrollment('STARTED_LEGACY', { scorm_tracking: [record('STARTED_LEGACY-lesson', false, '2026-10-05')] }),
  ], { missingMarker: true });
  assert.equal(enrollmentSelections.length, 2);
  assert.match(enrollmentSelections[0], /learning_started_at/);
  assert.doesNotMatch(enrollmentSelections[1], /learning_started_at/);
  assert.match(enrollmentSelections[1], /membership_order_id/);
  assert.match(html, /คอร์สที่เรียนอยู่<\/p><p[^>]*>1<\/p>/);
  assert.match(html, /STARTED_LEGACY/);
  assert.doesNotMatch(html, /UNSTARTED_PLUS/);
});
