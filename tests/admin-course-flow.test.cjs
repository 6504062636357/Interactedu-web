const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise server actions without contacting production or generating real SCORM files.
function setup(options = {}) {
  const draft = { id: 'draft', lesson_id: 'lesson', teacher_id: options.draftOwner ?? 'admin', status: 'draft', created_at: '2026-09-20', video_url: 'video.mp4', video_quiz_markers: [] };
  const course = { id: 'course', created_by: options.owner ?? 'admin', title: 'Course', status: 'draft', exam_status: options.examStatus ?? 'pending' };
  const lesson = { id: 'lesson', course_id: 'course', title: 'Lesson', lesson_drafts: [draft] };
  const question = { id: 'question', lesson_draft_id: 'draft', question_text: 'Question', video_timestamp_seconds: null, quiz_choices: [{ choice_text: 'Yes', is_correct: true }, { choice_text: 'No', is_correct: false }] };
  const tables = {
    profiles: [{ id: 'admin', role: options.role ?? 'admin' }],
    courses: [course], lessons: [lesson], lesson_drafts: [draft],
    quiz_questions: options.noExam ? [] : [question],
    course_exam_configs: options.bank ? [{ course_id: 'course', custom_constraints: [] }] : [],
    lesson_video_segments: [], video_quiz_markers: [],
  };
  const writes = [];
  const generated = [];
  const notifications = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'admin' } } }) },
    from(table) {
      const filters = [];
      let operation = 'select', payload, single = false;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        is(key, value) { filters.push(row => row[key] === value); return query; },
        not(key, _operator, value) { filters.push(row => row[key] !== value); return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle() { single = true; return query; }, single() { single = true; return query; },
        update(value) { operation = 'update'; payload = value; return query; },
        delete() { operation = 'delete'; return query; },
        then(resolve, reject) {
          if (options.failTable === table) return Promise.resolve({ data: null, error: { message: 'database unavailable' } }).then(resolve, reject);
          let rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
          if (operation !== 'select') {
            writes.push({ table, operation, payload });
            if (options.zeroUpdate === table) rows = [];
            if (operation === 'update') rows.forEach(row => Object.assign(row, payload));
            if (operation === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
          }
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const dependencies = {
    '@/utils/supabase/server': { createClient: async () => client },
    'next/cache': { revalidatePath() {} },
    '@/lib/notifications/service': { createNotification: async value => notifications.push(value), notifyAdmins: async value => notifications.push(value) },
    '@/lib/courses/question-bank-sampling': {
      loadSampledPopupQuestion: async () => ({}),
      loadSampledFinalExamQuestions: async () => {
        if (options.bankError) throw new Error('Insufficient questions');
        return options.emptyBank ? [] : [question];
      },
    },
    '@/lib/scorm/generate': { generateScormPackage: async (_client, draftId, lessonId) => {
      generated.push({ draftId, lessonId });
      return options.generationError ? { error: 'Generation failed' } : {};
    } },
  };
  function load(path) {
    const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(output, { exports, console, setTimeout, require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    } });
    return exports;
  }
  const teacher = load('src/app/dashboard/teacher/courses/actions.ts');
  dependencies['@/app/dashboard/teacher/courses/actions'] = teacher;
  const review = load('src/app/dashboard/admin/courses/[courseId]/review/actions.ts');
  const editor = load('src/app/dashboard/teacher/courses/[courseId]/lessons/new/actions.ts');
  return { teacher, review, editor, tables, course, lesson, draft, question, writes, generated, notifications };
}

test('admin cannot publish or approve an exam when no final exam exists', async () => {
  const app = setup({ noExam: true });
  assert.ok((await app.review.approveCourse('course')).error);
  assert.ok((await app.review.approveCourseExam('course')).error);
  assert.equal(app.writes.length, 0);
  assert.equal(app.generated.length, 0);
});

test('own complete course publishes directly, including draft lessons and exam', async () => {
  const app = setup();
  assert.equal((await app.review.approveCourse('course')).error, undefined);
  assert.equal(app.course.status, 'published');
  assert.equal(app.course.exam_status, 'approved');
  assert.equal(app.draft.status, 'approved');
  assert.equal(app.generated.length, 1);
  assert.equal(app.notifications.length, 0);
});

test('non-admin cannot invoke direct publication', async () => {
  const app = setup({ role: 'teacher' });
  assert.ok((await app.review.approveCourse('course')).error);
  assert.equal(app.writes.length, 0);
});

test('a teacher-owned course still requires exam approval and submitted lessons', async () => {
  const app = setup({ owner: 'teacher' });
  assert.ok((await app.review.approveCourse('course')).error);
  app.course.exam_status = 'approved';
  assert.ok((await app.review.approveCourse('course')).error);
  app.draft.status = 'pending_review';
  assert.equal((await app.review.approveCourse('course')).error, undefined);
  assert.equal(app.course.status, 'published');
});

test('readiness rejects empty random exams, insufficient bank and database failures', async () => {
  for (const options of [{ bank: true, emptyBank: true }, { bank: true, bankError: true }, { failTable: 'course_exam_configs' }, { failTable: 'quiz_questions' }]) {
    const app = setup(options);
    assert.equal((await app.teacher.checkCourseReadiness('course')).ready, false);
  }
});

test('old draft questions do not satisfy the current final exam requirement', async () => {
  const app = setup();
  app.lesson.lesson_drafts.push({ ...app.draft, id: 'new-draft', created_at: '2026-09-21' });
  assert.equal((await app.teacher.checkCourseReadiness('course')).ready, false);
});

test('an incomplete custom exam cannot be published', async () => {
  const app = setup();
  app.question.quiz_choices = [];
  assert.ok((await app.review.approveCourse('course')).error);
  assert.equal(app.writes.length, 0);
});

test('SCORM generation failure never publishes a course', async () => {
  const app = setup({ generationError: true });
  assert.ok((await app.review.approveCourse('course')).error);
  assert.equal(app.course.status, 'draft');
});

const editInput = { courseId: 'course', lessonId: 'lesson', draftId: 'draft', title: 'Edited', videoUrl: 'video.mp4', contentHtml: 'Edited content', videoSegments: [], questions: [], randomMarkers: [] };

test('admin can save lesson edits while preserving final exam questions', async () => {
  const app = setup({ draftOwner: 'previous-author' });
  app.course.status = 'published';
  const result = await app.editor.updateLessonDraft(editInput);
  assert.equal(result.error, undefined);
  assert.equal(app.lesson.title, 'Edited');
  assert.equal(app.draft.content_html, 'Edited content');
  assert.equal(app.course.status, 'draft');
  assert.equal(app.tables.quiz_questions.length, 1);
});

test('teacher cannot edit foreign content, nor can admin mix course and lesson IDs', async () => {
  const teacher = setup({ role: 'teacher', owner: 'someone-else' });
  assert.ok((await teacher.editor.updateLessonDraft(editInput)).error);
  assert.equal(teacher.writes.length, 0);
  const admin = setup();
  admin.lesson.course_id = 'another-course';
  assert.ok((await admin.editor.updateLessonDraft(editInput)).error);
  assert.equal(admin.writes.length, 0);
});

test('an RLS-filtered draft update is reported as failure instead of success', async () => {
  const app = setup({ zeroUpdate: 'lesson_drafts' });
  assert.ok((await app.editor.updateLessonDraft(editInput)).error);
});
