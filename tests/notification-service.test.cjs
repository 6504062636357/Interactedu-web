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
