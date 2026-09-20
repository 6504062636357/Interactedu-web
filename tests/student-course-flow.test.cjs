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
    enrollments: [{ id: 'enrollment', course_id: 'course', student_id: options.foreign ? 'other-student' : 'student', status: options.pending ? 'pending' : 'approved', courses: course }],
    modules: [{ id: 'module', course_id: 'course', title: 'Module', order_index: 0, lessons: [
      { id: 'first', title: 'First lesson', order_index: 0, is_published: true, scorm_source: 'generated' },
      { id: 'second', title: 'Second lesson', order_index: 1, is_published: !options.unpublished, scorm_source: 'generated' },
    ] }],
    scorm_tracking: ['first', 'second'].map(id => ({ ...record(id, !!options.complete, id === 'second' ? '2026-09-21' : '2026-09-20'), enrollment_id: 'enrollment', cmi_data: { core: { lesson_location: '297' } } })),
    courses: [course],
    certificates: options.certificate ? [{ id: 'certificate', course_id: 'course', user_id: 'student', status: options.certificate, issued_at: '2026-09-21' }] : [],
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
});
