const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function render({ role = 'teacher', courses = [{ id: 'owned-course', title: 'Course', price: 0 }], failure = false, examFailure = false, examRows = [], courseId } = {}) {
  const calls = [];
  const data = {
    profiles: { role }, courses,
    enrollments: [{ id: 'enrollment', student_id: 'student', course_id: 'owned-course' }],
    modules: [{ id: 'module', course_id: 'owned-course', lessons: [{ id: 'owned-lesson', title: 'Lesson', order_index: 0 }] }],
    scorm_tracking: [], quiz_attempts: [],
  };
  function query(table, privileged) {
    const filters = [];
    const q = {
      select() { return q; }, order() { return q; }, not(...args) { filters.push(args); return q; },
      eq(key, value) { filters.push([key, value]); return q; },
      in(key, values) { filters.push([key, [...values]]); return q; },
      maybeSingle() { return q; },
      then(resolve, reject) {
        calls.push({ table, privileged, filters });
        return Promise.resolve(privileged && table === 'quiz_attempts' ? { data: examFailure ? null : examRows, error: examFailure ? { message: 'Unavailable' } : null } : privileged
          ? { data: failure ? null : [{ lesson_id: 'owned-lesson', student_id: 'student', is_correct: false }], error: failure ? { message: 'Unavailable' } : null }
          : { data: data[table], error: null }).then(resolve, reject);
      },
    };
    return q;
  }
  const dependencies = {
    'next/navigation': { notFound() { throw new Error('not-found'); }, redirect(path) { throw new Error(`redirect:${path}`); } },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'teacher' } } }) }, from: table => query(table, false) }) },
    '@/utils/supabase/admin': { createAdminClient: () => ({ from: table => query(table, true) }) },
    '@/components/teacher/TeacherAnalyticsClient': { default: () => null },
  };
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync('src/components/teacher/TeacherAnalyticsPage.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, { exports, console: { error() {} }, require: name => dependencies[name] ?? require(name) });
  return { page: await exports.default({ courseId }), calls };
}

test('teacher analytics reads only owned lesson scores and retains a real zero score', async () => {
  const { page, calls } = await render();
  assert.equal(page.props.lessons[0].videoQuizAverageScore, 0);
  assert.equal(page.props.lessons[0].videoQuizAttemptedStudents, 1);
  assert.equal(page.props.videoQuizLoadError, false);
  assert.deepEqual(calls.find(c => c.table === 'courses').filters, [['created_by', 'teacher']]);
  assert.deepEqual(calls.filter(c => c.privileged && c.table === 'video_quiz_attempts'), [{ table: 'video_quiz_attempts', privileged: true, filters: [['lesson_id', ['owned-lesson']]] }]);
});
test('students cannot access teacher analytics', async () => {
  await assert.rejects(render({ role: 'student' }), /redirect:\/dashboard/);
});
test('no owned courses means no privileged read', async () => {
  const { calls } = await render({ courses: [] });
  assert.equal(calls.some(c => c.privileged), false);
});
test('score query failure is surfaced separately from an empty score set', async () => {
  const { page } = await render({ failure: true });
  assert.equal(page.props.videoQuizLoadError, true);
  assert.equal(page.props.lessons[0].videoQuizAverageScore, null);
});

test('final exam reads are scoped to owned enrollments and use the latest submitted score', async () => {
  const { page, calls } = await render({ examRows: [
    { enrollment_id: 'enrollment', score: 80, submitted_at: '2026-10-01' },
    { enrollment_id: 'enrollment', score: 0, submitted_at: '2026-10-02' },
  ] });
  assert.equal(page.props.summary.averageScore, 0);
  assert.equal(page.props.summary.scoredStudents, 1);
  assert.equal(page.props.courses[0].averageScore, 0);
  assert.equal(page.props.finalExamLoadError, false);
  assert.deepEqual(calls.find(c => c.table === 'quiz_attempts'), { table: 'quiz_attempts', privileged: true, filters: [['enrollment_id', ['enrollment']], ['submitted_at', 'is', null]] });
});
test('exam failure is distinguished from no submitted exams', async () => {
  const failed = await render({ examFailure: true });
  assert.equal(failed.page.props.finalExamLoadError, true);
  const empty = await render();
  assert.equal(empty.page.props.finalExamLoadError, false);
  assert.equal(empty.page.props.summary.averageScore, null);
});
test('course detail scopes reads to the selected owned course', async () => {
  const { page, calls } = await render({ courseId: 'owned-course' });
  assert.equal(page.props.selectedCourseId, 'owned-course');
  assert.deepEqual(calls.find(c => c.table === 'courses').filters, [['created_by', 'teacher'], ['id', 'owned-course']]);
});
test('missing or inaccessible course returns not found', async () => {
  await assert.rejects(render({ courseId: 'other-course', courses: [] }), /not-found/);
});

test('overview shows submitted count and detail shows exam and lesson scores', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync('src/components/teacher/TeacherAnalyticsClient.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, { exports, require: name => name === 'next/link' ? { default: ({ children, ...props }) => React.createElement('a', props, children) } : require(name) });
  const props = {
    summary: { uniqueStudents: 2, enrollments: 2, activeStudents: 1, averageProgress: 20, completionRate: 0, averageScore: 75, scoredStudents: 1, totalRevenue: 100, notStarted: 1, inProgress: 1, completed: 0 },
    courses: [{ courseId: 'course', courseTitle: 'ตัวอย่าง', totalStudents: 2, activeStudents: 1, averageProgress: 20, completionRate: 0, averageScore: 75, scoredStudents: 1, revenue: 100, notStarted: 1, inProgress: 1, completed: 0 }],
    lessons: [],
  };
  const overview = renderToStaticMarkup(React.createElement(exports.default, props));
  assert.match(overview, /รายการที่สอบท้ายคอร์สแล้ว/);
  assert.match(overview, /ค้นหาคอร์ส/);
  assert.match(overview, /\/dashboard\/teacher\/analytics\/course/);
  assert.doesNotMatch(overview, /เจาะลึกบทเรียน|75%/);
  const detail = renderToStaticMarkup(React.createElement(exports.default, { ...props, selectedCourseId: 'course' }));
  assert.match(detail, /75%/);
  assert.match(detail, /เจาะลึกบทเรียน/);
  assert.doesNotMatch(detail, /ค้นหาคอร์ส/);
});
test('course search, enrollment filter, sorting and pagination compose correctly', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const output = ts.transpileModule(fs.readFileSync('src/components/teacher/TeacherAnalyticsClient.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  function html(values) {
    let index = 0;
    const exports = {};
    vm.runInNewContext(output, { exports, require: name => name === 'react' ? { ...React, useState: () => [values[index++], () => {}] } : name === 'next/link' ? { default: ({ children, ...props }) => React.createElement('a', props, children) } : require(name) });
    const courses = Array.from({ length: 12 }, (_, i) => ({ courseId: `c${i}`, courseTitle: `Course ${String(i).padStart(2, '0')}`, totalStudents: i, activeStudents: 0, averageProgress: 0, completionRate: 0, averageScore: null, scoredStudents: 0, revenue: i * 100, notStarted: i, inProgress: 0, completed: 0 }));
    return renderToStaticMarkup(React.createElement(exports.default, { courses, lessons: [], summary: { uniqueStudents: 12, enrollments: 12, activeStudents: 0, completionRate: 0, averageProgress: 0, averageScore: null, scoredStudents: 0, totalRevenue: 0, notStarted: 12, inProgress: 0, completed: 0 } }));
  }
  const searched = html([' course 01 ', 'all', 'name', 1]);
  assert.match(searched, /analytics\/c1"/);
  assert.doesNotMatch(searched, /analytics\/c2"/);
  const empty = html(['', 'empty', 'name', 1]);
  assert.match(empty, /analytics\/c0"/);
  assert.doesNotMatch(empty, /analytics\/c1"/);
  const sorted = html(['', 'all', 'revenue', 1]);
  assert.ok(sorted.indexOf('analytics/c11"') < sorted.indexOf('analytics/c10"'));
  assert.doesNotMatch(sorted, /analytics\/c0"/);
  const second = html(['', 'all', 'name', 2]);
  assert.match(second, /analytics\/c10"/);
  assert.doesNotMatch(second, /analytics\/c9"/);
  assert.match(html(['missing', 'all', 'name', 1]), /ไม่พบคอร์สที่ตรงกับการค้นหา/);
});
