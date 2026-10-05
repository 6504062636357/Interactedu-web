async function registerTests() {
  const [
    { default: test }, { default: assert }, { default: fs },
    { default: vm }, { default: ts }, { createClient },
  ] = await Promise.all([
    import('node:test'), import('node:assert/strict'), import('node:fs'),
    import('node:vm'), import('typescript'), import('@supabase/supabase-js'),
  ]);

  const jsx = (type, props) => ({ type, props });

  function load(file, modules, globals = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(code, { exports, ...globals, require(name) {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    } });
    return exports.default;
  }

  function find(node, type) {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === type) return node;
    return [node.props?.children].flat(Infinity).map(child => find(child, type)).find(Boolean);
  }

  // Use the installed Supabase query builder with a fake HTTP transport. No live
  // database, credentials, or mutations are involved in these page tests.
  function setup(options = {}) {
    const calls = [];
    const warnings = [];
    const errors = [];
    const clientOptions = [];
    const question = (draftId, text, order, timestamp = null) => ({
      lesson_draft_id: draftId, question_text: text, explanation: 'Explanation', order_index: order,
      video_timestamp_seconds: timestamp, interaction_type: 'multiple_choice', answer_data: null,
      image_url: 'image.png', image_caption: 'Caption', image_pins: [{ id: 'pin', x: 40, y: 30 }],
      quiz_choices: [
        { choice_text: 'Incorrect', is_correct: false, order_index: 1 },
        { choice_text: 'Correct', is_correct: true, order_index: 0 },
      ],
    });
    const tables = {
      profiles: [{ id: 'user', role: options.role ?? 'admin' }],
      courses: options.noCourse ? [] : [{
        id: 'course', title: 'Running', created_by: options.owner ?? 'user',
        certificate_enabled: true, certificate_pass_percentage: 80, exam_status: 'approved',
      }],
      lessons: options.noLessons ? [] : [{
        id: 'lesson', course_id: 'course', order_index: 0,
        lesson_drafts: [{ id: 'old', created_at: '2026-09-01' }, { id: 'latest', created_at: '2026-10-01' }],
      }],
      quiz_questions: [
        question('old', 'Obsolete exam', 0), question('latest', 'Popup', 0, 15),
        ...(!options.emptyLatest ? [question('latest', 'Second', 1), question('latest', 'First', 0)] : []),
      ],
      course_exam_configs: [{ course_id: 'course', custom_constraints: [{ lessonId: null, difficulty: 'easy', count: 5 }] }],
    };
    const transport = async (input, init) => {
      const url = new URL(input);
      const table = url.pathname.split('/').at(-1);
      const selection = url.searchParams.get('select');
      const label = table === 'courses'
        ? selection.startsWith('certificate_') ? 'certificate' : selection === 'exam_status' ? 'review' : 'course'
        : table;
      calls.push({ table, label, url, method: init.method });
      assert.equal(init.method, 'GET');
      if (label === options.fail) {
        if (options.timeout) {
          const error = new Error('Supabase request timed out after 30000ms');
          error.name = 'TimeoutError';
          throw error;
        }
        return new Response(JSON.stringify({ code: options.errorCode ?? 'XX000', message: 'Database unavailable' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      let rows = tables[table].map(row => structuredClone(row));
      for (const [column, filter] of url.searchParams) {
        if (filter.startsWith('eq.')) rows = rows.filter(row => row[column] === filter.slice(3));
        if (filter.startsWith('in.(')) rows = rows.filter(row => filter.slice(4, -1).split(',').includes(row[column]));
        if (filter === 'is.null') rows = rows.filter(row => row[column] == null);
      }
      if (table === 'lessons') {
        rows.sort((a, b) => a.order_index - b.order_index);
        for (const row of rows) {
          if (url.searchParams.get('lesson_drafts.order') === 'created_at.desc') {
            row.lesson_drafts.sort((a, b) => b.created_at.localeCompare(a.created_at));
          }
          const limit = url.searchParams.get('lesson_drafts.limit');
          if (limit) row.lesson_drafts = row.lesson_drafts.slice(0, Number(limit));
        }
      }
      if (table === 'quiz_questions') rows.sort((a, b) => a.order_index - b.order_index);
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
    };
    const queryClient = createClient('https://example.test', 'fake-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport },
    });
    const client = {
      auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'user' } } }) },
      from: queryClient.from.bind(queryClient),
    };
    const page = load('src/components/courses/CourseExamManagementPage.tsx', {
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/link': { default: 'link' },
      'next/navigation': {
        redirect(href) { throw new Error(`redirect:${href}`); },
        notFound() { throw new Error('not-found'); },
      },
      '@/utils/supabase/server': { createClient: async options => { clientOptions.push(options); return client; } },
      '@/components/courses/CourseExamEditor': { default: 'exam-editor' },
      '@/components/courses/CourseExamLoadError': { default: 'load-error' },
      '@/components/CourseExamReviewActions': { default: 'review-actions' },
    }, { console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) } });
    return { page: () => page({ courseId: 'course', workspace: options.workspace ?? 'admin' }), calls, warnings, errors, clientOptions };
  }

  test('exam page loads final questions only from the latest draft and preserves editor fields', async () => {
    const app = setup();
    const tree = await app.page();
    const editor = find(tree, 'exam-editor');
    assert.ok(editor);
    assert.deepEqual(Array.from(editor.props.initialQuestions, question => question.questionText), ['First', 'Second']);
    assert.equal(editor.props.initialQuestions[0].choices[0].text, 'Correct');
    assert.equal(editor.props.initialQuestions[0].choices[0].isCorrect, true);
    assert.equal(editor.props.initialQuestions[0].imageCaption, 'Caption');
    assert.equal(editor.props.initialQuestions[0].imagePins[0].x, 40);
    assert.equal(editor.props.initialExamConfig.customConstraints[0].count, 5);
    assert.equal(editor.props.readOnly, false);
    assert.equal(app.clientOptions[0].timeoutMs, 30000);
    const lessonQuery = app.calls.find(call => call.table === 'lessons').url.searchParams;
    assert.equal(lessonQuery.get('lesson_drafts.limit'), '1');
    assert.equal(lessonQuery.get('lesson_drafts.order'), 'created_at.desc');
    assert.ok(!lessonQuery.get('select').includes('quiz_questions'));
    const questionQuery = app.calls.find(call => call.table === 'quiz_questions').url.searchParams;
    assert.equal(questionQuery.get('lesson_draft_id'), 'in.(latest)');
    assert.equal(questionQuery.get('video_timestamp_seconds'), 'is.null');
  });

  test('an empty latest draft never revives final questions from older drafts', async () => {
    const app = setup({ emptyLatest: true });
    const editor = find(await app.page(), 'exam-editor');
    assert.equal(editor.props.initialQuestions.length, 0);
  });

  test('a course without lessons renders without issuing a question query', async () => {
    const app = setup({ noLessons: true });
    const editor = find(await app.page(), 'exam-editor');
    assert.equal(editor.props.initialQuestions.length, 0);
    assert.equal(editor.props.lessons.length, 0);
    assert.ok(!app.calls.some(call => call.table === 'quiz_questions'));
  });

  test('a lesson timeout renders a retry state after one bounded attempt', async () => {
    const app = setup({ fail: 'lessons', timeout: true });
    const tree = await app.page();
    assert.equal(tree.type, 'load-error');
    assert.equal(tree.props.backHref, '/dashboard/admin/courses/course');
    assert.equal(app.calls.filter(call => call.table === 'lessons').length, 1);
    assert.ok(!app.calls.some(call => call.table === 'quiz_questions'));
    assert.equal(app.errors.length, 0);
    assert.equal(app.warnings.length, 1);
  });

  test('failed exam reads never open an editor with empty questions or default settings', async () => {
    for (const fail of ['profiles', 'course', 'certificate', 'course_exam_configs', 'quiz_questions', 'review']) {
      const app = setup({ fail });
      assert.equal((await app.page()).type, 'load-error', fail);
      assert.equal(app.warnings.length, 1);
    }
  });

  test('optional missing course columns retain compatibility without hiding other query failures', async () => {
    for (const fail of ['certificate', 'review']) {
      const app = setup({ fail, errorCode: '42703' });
      assert.ok(find(await app.page(), 'exam-editor'), fail);
    }
  });

  test('authentication and course ownership are checked before loading exam content', async () => {
    const anonymous = setup({ noUser: true });
    await assert.rejects(anonymous.page(), /redirect:\/login/);
    assert.equal(anonymous.calls.length, 0);
    for (const options of [{ role: 'student' }, { role: 'teacher', owner: 'someone-else', workspace: 'teacher' }]) {
      const app = setup(options);
      await assert.rejects(app.page(), /redirect:\/dashboard/);
      assert.ok(!app.calls.some(call => ['lessons', 'quiz_questions', 'course_exam_configs'].includes(call.table)));
    }
    const missing = setup({ noCourse: true });
    await assert.rejects(missing.page(), /not-found/);
    assert.ok(!missing.calls.some(call => call.table === 'lessons'));
  });

  test('teacher-owned exams remain editable by their teacher and read-only for admin review', async () => {
    const teacher = setup({ role: 'teacher', workspace: 'teacher' });
    assert.equal(find(await teacher.page(), 'exam-editor').props.readOnly, false);
    assert.ok(!teacher.calls.some(call => call.label === 'review'));
    const admin = setup({ owner: 'teacher' });
    const tree = await admin.page();
    assert.equal(find(tree, 'exam-editor').props.readOnly, true);
    assert.equal(find(tree, 'review-actions').props.examStatus, 'approved');
  });

  test('retry requests a new server render and disables the button while pending', () => {
    let pending = false;
    let refreshes = 0;
    const component = load('src/components/courses/CourseExamLoadError.tsx', {
      'react/jsx-runtime': { jsx, jsxs: jsx },
      react: { useTransition: () => [pending, callback => callback()] },
      'next/link': { default: 'link' },
      'next/navigation': { useRouter: () => ({ refresh() { refreshes += 1; } }) },
    });
    const props = { message: 'Load failed', backHref: '/dashboard/admin/courses/course' };
    const button = find(component(props), 'button');
    assert.equal(button.props.disabled, false);
    button.props.onClick();
    assert.equal(refreshes, 1);
    pending = true;
    assert.equal(find(component(props), 'button').props.disabled, true);
  });
}

registerTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
