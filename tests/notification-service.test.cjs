const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadService() {
  const writes = [];
  const client = {
    from(table) {
      return {
        upsert(row, options) {
          writes.push({ table, operation: 'upsert', row, options });
          return Promise.resolve({ error: null });
        },
        insert(row) {
          writes.push({ table, operation: 'insert', row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const source = fs.readFileSync('src/lib/notifications/service.ts', 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    console,
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/utils/supabase/admin') return { createAdminClient: () => client };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { service: exports, writes };
}

test('deduplicated notifications refresh their content and unread state', async () => {
  const { service, writes } = loadService();
  const result = await service.createNotification({
    userId: 'teacher',
    type: 'course_approved',
    title: 'Updated course title',
    message: 'Updated course message',
    relatedType: 'course',
    relatedId: 'course',
    actionUrl: '/dashboard/teacher/courses/course',
    dedupeKey: 'course_approved:course',
  });

  assert.equal(result.created, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].operation, 'upsert');
  assert.equal(writes[0].options.onConflict, 'dedupe_key');
  assert.equal(writes[0].options.ignoreDuplicates, false);
  assert.equal(writes[0].row.is_read, false);
  assert.equal(writes[0].row.read_at, null);
  assert.equal(writes[0].row.action_url, '/dashboard/teacher/courses/course');
  assert.ok(!Number.isNaN(Date.parse(writes[0].row.created_at)));
});

function loadCourseStart(options = {}, file = 'src/app/api/student/course-start/route.ts') {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'student' } }, error: options.authError ?? null }) },
    from(table) {
      assert.equal(table, 'profiles');
      const query = {
        select() { return query; }, eq(column, value) { assert.equal(column, 'id'); assert.equal(value, 'student'); return query; },
        maybeSingle: async () => ({ data: options.profileError ? null : { role: options.role ?? 'student' }, error: options.profileError ? { message: 'Unavailable' } : null }),
      };
      return query;
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: options.started ?? true, error: options.error ?? null };
    },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Response, console: { warn() {} }, require(name) {
    if (name === '@/utils/supabase/server') return { createClient: async () => client };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return { post: exports.POST, calls };
}

const startPayload = { courseId: '20000000-0000-4000-8000-000000000001', lessonId: '30000000-0000-4000-8000-000000000001' };
const startRequest = (body = startPayload) => new Request('https://example.test/api/student/course-start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('course start validates input and authentication before executing the RPC', async () => {
  const invalid = loadCourseStart();
  assert.equal((await invalid.post(startRequest({ courseId: 'invalid' }))).status, 400);
  assert.equal(invalid.calls.length, 0);
  const anonymous = loadCourseStart({ noUser: true });
  assert.equal((await anonymous.post(startRequest())).status, 401);
  assert.equal(anonymous.calls.length, 0);
});

test('admin and teacher previews never start a learner enrollment', async () => {
  for (const role of ['admin', 'teacher']) {
    const app = loadCourseStart({ role });
    assert.equal((await app.post(startRequest())).status, 200);
    assert.equal(app.calls.length, 0);
  }
  const failed = loadCourseStart({ profileError: true });
  assert.equal((await failed.post(startRequest())).status, 503);
  assert.equal(failed.calls.length, 0);
});

test('course start uses the authenticated RPC and reports permission and database errors', async () => {
  const app = loadCourseStart();
  const response = await app.post(startRequest({ ...startPayload, studentId: 'someone-else' }));
  assert.equal((await response.json()).started, true);
  assert.equal(app.calls[0].name, 'start_course_learning');
  assert.equal(app.calls[0].args.p_course_id, startPayload.courseId);
  assert.equal(app.calls[0].args.p_lesson_id, startPayload.lessonId);
  assert.equal(Object.keys(app.calls[0].args).length, 2);
  assert.equal((await loadCourseStart({ error: { code: '42501' } }).post(startRequest())).status, 403);
  assert.equal((await loadCourseStart({ error: { code: 'PGRST202' } }).post(startRequest())).status, 503);
  const repeated = await loadCourseStart({ started: false }).post(startRequest());
  assert.equal((await repeated.json()).started, false);
});

test('course overview and prefetch do not start learning; the ready learning room does', async () => {
  let effect;
  const calls = [];
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/lib/courses/use-course-learning-start.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, console, fetch: async (...args) => { calls.push(args); return { ok: true }; },
    require(name) { if (name === 'react') return { useEffect: callback => { effect = callback; } }; throw new Error(name); },
  });
  exports.useCourseLearningStart(startPayload.courseId, startPayload.lessonId, false);
  effect();
  assert.equal(calls.length, 0);
  exports.useCourseLearningStart(startPayload.courseId, startPayload.lessonId, true);
  effect();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/student/course-start');
  assert.deepEqual(JSON.parse(calls[0][1].body), startPayload);
});

test('saving validates input and login before requesting a scoped library write', async () => {
  const file = 'src/app/api/student/course-library/route.ts';
  const invalid = loadCourseStart({}, file);
  assert.equal((await invalid.post(startRequest({ courseId: 'invalid' }))).status, 400);
  assert.equal((await invalid.post(new Request('https://example.test', { method: 'POST', body: '{' }))).status, 400);
  assert.equal(invalid.calls.length, 0);
  for (const options of [{ noUser: true }, { authError: { message: 'Invalid session' } }]) {
    const app = loadCourseStart(options, file);
    assert.equal((await app.post(startRequest())).status, 401);
    assert.equal(app.calls.length, 0);
  }
});

test('saving uses authenticated ownership and never invokes the learning-start RPC', async () => {
  const file = 'src/app/api/student/course-library/route.ts';
  for (const started of [true, false]) {
    const app = loadCourseStart({ started }, file);
    const response = await app.post(startRequest({ ...startPayload, studentId: 'another-student' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).saved, true);
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0].name, 'save_course_to_library');
    assert.equal(app.calls[0].args.p_course_id, startPayload.courseId);
    assert.equal(Object.keys(app.calls[0].args).length, 1);
  }
  assert.equal((await loadCourseStart({ error: { code: '42501' } }, file).post(startRequest())).status, 403);
  assert.equal((await loadCourseStart({ error: { code: 'PGRST202' } }, file).post(startRequest())).status, 503);
});
