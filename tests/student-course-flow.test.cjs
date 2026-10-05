const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, dependencies = {}, runtime = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { ...runtime, exports, require: name => dependencies[name] ?? require(name) });
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
      membership_order_id: options.membership ? 'plus' : null,
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
    student_course_library: [],
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
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); }, redirect(url) { throw new Error('REDIRECT:' + url); } },
    '@/utils/supabase/server': { createClient: async () => client },
    '@/lib/constants/course-cover': { DEFAULT_COURSE_COVER_URL: '/cover.png' },
    '@/lib/courses/student-progress': progress,
    '@/lib/courses/learning-enrollment': learningEnrollment,
    '@/lib/courses/course-library': courseLibrary,
    '@/components/courses/SaveCourseButton': { default: () => React.createElement('button', null, 'Save for later') },
    '@/lib/courses/study-time': load('src/lib/courses/study-time.ts'),
    '@/components/certificates/ClaimCertificateButton': { default: () => React.createElement('button', { 'data-claim': true }, 'Claim') },
  }).default;
  return renderToStaticMarkup(await page({ params: Promise.resolve({ courseId: 'course' }), searchParams: Promise.resolve({ start: options.start }) }));
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
const courseLibrary = load('src/lib/courses/course-library.ts', { 'server-only': {} });

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
    student_course_library: (options.savedIds ?? []).map(enrollment_id => ({ enrollment_id, student_id: 'student' })),
    enrollments: enrollmentRows,
    scorm_tracking: enrollmentRows.flatMap(enrollment => (enrollment.scorm_tracking ?? []).map(row => ({ ...row, enrollment_id: enrollment.id }))),
    lessons: enrollmentRows.map(enrollment => ({ id: enrollment.course_id + '-lesson', course_id: enrollment.course_id, is_published: true })),
    modules: enrollmentRows.map(enrollment => ({ id: enrollment.course_id + '-module', course_id: enrollment.course_id, order_index: 0, lessons: [{ id: enrollment.course_id + '-lesson', is_published: true, order_index: 0 }] })),
    student_study_time: [],
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
  const page = load(options.myCourses ? 'src/app/dashboard/student/courses/page.tsx' : 'src/app/dashboard/student/profile/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => client },
    '@/lib/courses/student-progress': progress,
    '@/lib/courses/learning-enrollment': learningEnrollment,
    '@/lib/courses/course-library': courseLibrary,
    '@/lib/payments/plus-plan': load('src/lib/payments/plus-plan.ts'),
    '@/lib/constants/course-cover': { DEFAULT_COURSE_COVER_URL: '/cover.png' },
    '@/lib/courses/access-expiry': load('src/lib/courses/access-expiry.ts'),
    '@/lib/courses/study-time': load('src/lib/courses/study-time.ts'),
    'next/navigation': { redirect() { throw new Error('REDIRECT'); } },
    '@/components/StudentProfileClient': { default: ({ children }) => React.createElement('div', null, children) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  }).default;
  return { html: renderToStaticMarkup(await page({ searchParams: Promise.resolve({ status: options.status }) })), enrollmentSelections };
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

test('profile counts only started courses and separates unstarted direct registrations', async () => {
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
  assert.match(html, /คอร์สที่เรียนอยู่<\/p><p[^>]*>2<\/p>/);
  assert.match(html, /เรียนจบแล้ว<\/p><p[^>]*>1<\/p>/);
  for (const title of ['STARTED_MARKER', 'STARTED_LEGACY']) assert.ok(html.includes(title));
  assert.doesNotMatch(html, /UNSTARTED_PLUS|COMPLETED_PLUS|EXPIRED_ACCESS|PENDING_ACCESS|FOREIGN_STUDENT|DIRECT_REGISTRATION/);
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

test('saving two Plus courses does not increment the profile learning count', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => profileEnrollment('UNSTARTED_PLUS_' + index));
  const { html } = await renderStudentProfile(rows, { savedIds: [rows[0].id, rows[1].id] });
  assert.match(html, /คอร์สที่เรียนอยู่<\/p><p[^>]*>0<\/p>/);
  assert.doesNotMatch(html, /UNSTARTED_PLUS_/);
});

test('start action enters the saved resume lesson without marking an overview visit as learning', async () => {
  await assert.rejects(renderOverview({ membership: true, start: '1' }), /REDIRECT:\/play\/course\/second/);
  assert.ok((await renderOverview({ membership: true })).includes('Learn the course objectives'));
  assert.match(await renderOverview({ failTable: 'scorm_tracking', start: '1' }), /โหลดความคืบหน้าไม่สำเร็จ/);
});

test('saved Plus courses and direct registrations are in the library without counting as started', () => {
  const saved = new Set(['chosen']);
  const unstarted = profileEnrollment('chosen');
  assert.equal(learningEnrollment.isCourseInLibrary(unstarted, saved), true);
  assert.equal(learningEnrollment.hasStartedLearning(unstarted), false);
  assert.equal(learningEnrollment.getLearningCourseStatus(unstarted, false), 'not_started');
  assert.equal(learningEnrollment.isCourseInLibrary(profileEnrollment('unselected'), saved), false);
  const direct = profileEnrollment('direct', { membership_order_id: null });
  assert.equal(learningEnrollment.isCourseInLibrary(direct, saved), true);
  assert.equal(learningEnrollment.getLearningCourseStatus(direct, false), 'not_started');
  assert.equal(learningEnrollment.getLearningCourseStatus({ ...unstarted, learning_started_at: '2026-10-06' }, false), 'in_progress');
  assert.equal(learningEnrollment.getLearningCourseStatus(unstarted, true), 'completed');
});

test('my courses separates saved, started and completed courses with consistent tab counts', async () => {
  const rows = [
    ...Array.from({ length: 31 }, (_, index) => profileEnrollment('UNSELECTED_' + index)),
    profileEnrollment('SAVED_ONE'), profileEnrollment('SAVED_TWO'),
    profileEnrollment('STARTED_NOW', { learning_started_at: '2026-10-06' }),
    profileEnrollment('FINISHED', { scorm_tracking: [record('FINISHED-lesson', true, '2026-10-06')] }),
  ];
  for (const [status, titles] of [
    ['not_started', ['SAVED_ONE', 'SAVED_TWO']], ['in_progress', ['STARTED_NOW']], ['completed', ['FINISHED']],
  ]) {
    const { html } = await renderStudentProfile(rows, { myCourses: true, savedIds: ['SAVED_ONE', 'SAVED_TWO'], status });
    assert.match(html, /ยังไม่เริ่ม<span[^>]*>2<\/span>/);
    assert.match(html, /กำลังเรียน<span[^>]*>1<\/span>/);
    assert.match(html, /เรียนจบแล้ว<span[^>]*>1<\/span>/);
    assert.match(html, new RegExp(`href="/dashboard/student/courses\\?status=${status}" aria-current="page"`));
    for (const title of ['SAVED_ONE', 'SAVED_TWO', 'STARTED_NOW', 'FINISHED']) assert.equal(html.includes(title), titles.includes(title));
    assert.doesNotMatch(html, /UNSELECTED_/);
    if (status === 'not_started') assert.doesNotMatch(html, /เรียนไปแล้ว 0%/);
  }
});

test('course actions offer saving only for unstarted Plus access and allow immediate learning', () => {
  const Actions = load('src/components/courses/CourseAccessActions.tsx', {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    './SaveCourseButton': { default: ({ initialSaved }) => React.createElement('button', { disabled: initialSaved }, 'SAVE_COURSE') },
  }).default;
  const render = props => renderToStaticMarkup(React.createElement(Actions, { courseId: 'course', slug: 'course-slug', ...props }));
  const unstarted = render({ hasAccess: true, membership: true });
  assert.match(unstarted, /SAVE_COURSE/);
  assert.match(unstarted, /href="\/dashboard\/student\/courses\/course\?start=1"/);
  assert.match(unstarted, /เริ่มเรียน/);
  assert.match(render({ hasAccess: true, membership: true, saved: true }), /disabled=""/);
  assert.doesNotMatch(render({ hasAccess: true, membership: true, started: true }), /SAVE_COURSE/);
  assert.doesNotMatch(render({ hasAccess: true, membership: false }), /SAVE_COURSE/);
  const visitor = render({ hasAccess: false });
  assert.match(visitor, /href="\/courses\/course-slug\/enroll"/);
  assert.doesNotMatch(visitor, /SAVE_COURSE/);
});

test('save button prevents duplicate clicks and only confirms successful saves', async () => {
  const states = [], inFlight = { current: false }, calls = [];
  let cursor = 0, reply, refreshes = 0;
  const Button = load('src/components/courses/SaveCourseButton.tsx', {
    'react': {
      useRef: () => inFlight,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
    },
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
  }, { fetch: (...args) => { calls.push(args); return new Promise(resolve => { reply = resolve; }); } }).default;
  const render = props => { cursor = 0; return Button({ courseId: 'course', ...props }); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const first = render().props.children[0];
  first.props.onClick(); first.props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(render().props.children[0].props.disabled, true);
  assert.equal(calls[0][0], '/api/student/course-library');
  assert.deepEqual(JSON.parse(calls[0][1].body), { courseId: 'course' });
  reply({ ok: false, json: async () => ({ error: 'Try again' }) });
  await flush();
  assert.equal(refreshes, 0);
  assert.equal(render().props.children[0].props.disabled, false);
  assert.match(renderToStaticMarkup(render()), /Try again/);
  render().props.children[0].props.onClick();
  reply({ ok: true, json: async () => ({ saved: true }) });
  await flush();
  assert.equal(refreshes, 1);
  assert.equal(render().props.children[0].props.disabled, true);
  assert.match(renderToStaticMarkup(render()), /เก็บคอร์สไว้แล้ว ยังไม่ได้เริ่มเรียน/);
  assert.equal(render({ available: false }).props.children[0].props.disabled, true);
});

test('saved-course reads are scoped to the current student and failures disable saving', async () => {
  for (const error of [null, { code: 'PGRST205', message: 'student_course_library not found' }, { code: '42501', message: 'Permission denied' }, { code: '', message: 'Timed out' }]) {
    const query = { select() { return query; }, eq(key, id) {
      assert.equal(key, 'student_id'); assert.equal(id, 'student');
      return Promise.resolve({ data: error ? null : [{ enrollment_id: 'saved' }], error });
    } };
    const result = await courseLibrary.loadSavedCourseEnrollments({ from(table) { assert.equal(table, 'student_course_library'); return query; } }, 'student');
    assert.equal(result.ready, !error);
    assert.equal(result.enrollmentIds.has('saved'), !error);
    assert.equal(Boolean(result.error), Boolean(error));
  }
});
