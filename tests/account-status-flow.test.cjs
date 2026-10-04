const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies, env = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, process: { env }, URL, URLSearchParams, setTimeout: () => 0, console: { log() {}, warn() {}, error() {} },
    require: name => dependencies[name] ?? require(name),
  });
  return exports;
}

const redirect = href => { throw new Error(`REDIRECT:${href}`); };
const link = ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children);
const icon = () => React.createElement('span');
const userFilters = load('src/components/admin/AdminUserFilters.tsx', {
  'next/navigation': { useRouter: () => ({ push() {} }) },
  'lucide-react': { ChevronDown: icon, Search: icon },
}).default;

async function inactivePage(user, active, env = {}, { archivedAt = null, reason } = {}) {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: user ? { id: 'student-1' } : null } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { is_active: active, archived_at: archivedAt }, error: null }) }),
  };
  const page = load('src/app/account-inactive/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    '@/components/AppBrand': { default: () => React.createElement('span', null, 'Interact Edu') },
    '@/components/LogoutButton': { default: () => React.createElement('button', null, 'ออกจากระบบ') },
    'next/link': { default: link },
    'next/navigation': { redirect },
    'lucide-react': { ArrowLeft: icon, Mail: icon, ShieldAlert: icon },
  }, env).default;
  return renderToStaticMarkup(await page({ searchParams: Promise.resolve({ reason }) }));
}

test('suspended users see the status page and can sign out', async () => {
  const html = await inactivePage(true, false);
  assert.match(html, /บัญชีของคุณถูกพักการใช้งาน/);
  assert.match(html, /ออกจากระบบ/);
  assert.doesNotMatch(html, /href="mailto:/);
});

test('a signed-out user can see the same explanation after login is refused', async () => {
  const html = await inactivePage(false, false, { SUPPORT_EMAIL: 'help@example.com' });
  assert.match(html, /กลับหน้าเข้าสู่ระบบ/);
  assert.match(html, /mailto:help@example.com/);
});

test('an active user visiting the suspension page returns to the dashboard', async () => {
  await assert.rejects(inactivePage(true, true), /REDIRECT:\/dashboard/);
});

test('archived users see account closure instead of a temporary suspension', async () => {
  const html = await inactivePage(true, false, {}, { archivedAt: '2026-10-05T12:00:00Z' });
  assert.match(html, /บัญชีของคุณถูกปิดการใช้งาน/);
  assert.doesNotMatch(html, /บัญชีของคุณถูกพักการใช้งาน/);
});

test('archived users see the same closure after login signs them out', async () => {
  const html = await inactivePage(false, false, {}, { reason: 'archived' });
  assert.match(html, /บัญชีของคุณถูกปิดการใช้งาน/);
  assert.match(html, /กลับหน้าเข้าสู่ระบบ/);
});

test('suspended accounts cannot open learning and purchase routes', async () => {
  const supabase = {
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { role: 'student', is_active: false }, error: null }) }),
  };
  const response = { allowed: true };
  const NextResponse = { next: () => response, redirect: url => ({ location: String(url) }), json: (_, options) => ({ status: options.status }) };
  const proxy = load('src/proxy.ts', {
    'next/server': { NextResponse },
    './utils/supabase/middleware': { updateSession: async () => ({ supabaseResponse: response, supabase, user: { id: 'student-1' } }) },
  }).proxy;
  for (const pathname of ['/dashboard/student', '/play/course/lesson', '/courses/course/enroll', '/courses/course/success']) {
    const result = await proxy({ headers: { get: () => null }, nextUrl: { pathname }, url: `http://localhost:3000${pathname}` });
    assert.equal(result.location, 'http://localhost:3000/account-inactive');
  }
  const apiResult = await proxy({ headers: { get: () => null }, nextUrl: { pathname: '/api/scorm/tracking' }, url: 'http://localhost:3000/api/scorm/tracking' });
  assert.equal(apiResult.status, 403);
});

test('suspended students cannot invoke free enrollment directly', async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'student-1' } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: 'student', is_active: false }, error: null }) }),
  };
  const action = load('src/app/courses/[slug]/enroll/actions.ts', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    'next/navigation': { redirect },
    '@/lib/notifications/service': { createNotification() {}, notifyAdmins() {} },
  }).enrollFreeCourse;
  await assert.rejects(action('course-1', 'course-one'), /REDIRECT:\/account-inactive/);
});

test('admin user directory restores missing status values before enabling switches', async () => {
  const directoryRows = [{ id: 'student-1', role: 'student', full_name: 'Learner', email: null, phone: null, university: null, faculty: null, created_at: '2026-01-01', last_sign_in_at: null, enrollment_count: 0, certificate_count: 0 }];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: 'admin', is_active: true }, error: null }) }),
    rpc: async () => ({ data: directoryRows, error: null }),
  };
  const admin = {
    from: () => ({ select() { return this; }, in: async () => ({ data: [{ id: 'student-1', is_active: false }], error: null }) }),
  };
  const page = load('src/app/dashboard/admin/users/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    '@/utils/supabase/admin': { createAdminClient: () => admin },
    '@/components/admin/AdminUserFilters': { default: userFilters },
    '@/components/admin/AdminUserDirectoryTable': { default: ({ users, statusReady }) => React.createElement('div', { 'data-ready': String(statusReady) }, `${users[0].id}:${users[0].is_active}`) },
    'next/link': { default: link },
    'next/navigation': { redirect },
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
  assert.match(html, /data-ready="true"/);
  assert.match(html, /student-1:false/);
});

test('admin user directory filters by account status while keeping role and search', async () => {
  const rows = [
    { id: 'student-off', role: 'student', full_name: 'Learner One', is_active: false },
    { id: 'student-on', role: 'student', full_name: 'Learner Two', is_active: true },
    { id: 'teacher-off', role: 'teacher', full_name: 'Learner Three', is_active: false },
  ];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: 'admin', is_active: true }, error: null }) }),
    rpc: async () => ({ data: rows, error: null }),
  };
  const page = load('src/app/dashboard/admin/users/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    '@/utils/supabase/admin': { createAdminClient: () => { throw new Error('Unexpected status fallback'); } },
    '@/components/admin/AdminUserFilters': { default: userFilters },
    '@/components/admin/AdminUserDirectoryTable': { default: ({ users }) => React.createElement('div', { 'data-users': users.map(user => user.id).join(',') }) },
    'next/link': { default: link },
    'next/navigation': { redirect },
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ role: 'student', status: 'inactive', q: 'learner' }) }));
  assert.match(html, /data-users="student-off"/);
  assert.match(html, /<option value="student" selected="">/);
  assert.match(html, /<option value="inactive" selected="">/);
  assert.match(html, /value="learner"/);
});

test('admin user directory does not guess account status when its RPC is unavailable', async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({
      select() { return this; }, eq() { return this; }, is() { return this; },
      maybeSingle: async () => ({ data: { role: 'admin', is_active: true }, error: null }),
      order: async () => ({ data: [{ id: 'student-1', role: 'student', full_name: 'Learner' }], error: null }),
    }),
    rpc: async () => ({ data: null, error: { message: 'RPC unavailable' } }),
  };
  const page = load('src/app/dashboard/admin/users/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    '@/utils/supabase/admin': { createAdminClient: () => { throw new Error('Unexpected status fallback'); } },
    '@/components/admin/AdminUserFilters': { default: userFilters },
    '@/components/admin/AdminUserDirectoryTable': { default: ({ users, statusReady }) => React.createElement('div', { 'data-status': String(users[0].is_active), 'data-ready': String(statusReady) }) },
    'next/link': { default: link },
    'next/navigation': { redirect },
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
  assert.match(html, /data-status="null" data-ready="false"/);
});

async function adminUserDetail({ actorId = 'admin-1', profileStatus = false, fallbackStatus = null, archiveReady = true, archivedAt = null, profileReadable = true, directoryVisible = true } = {}) {
  const profile = {
    id: 'student-1', full_name: 'Learner', role: actorId === 'student-1' ? 'admin' : 'student', phone: null,
    university: null, faculty: null, created_at: '2026-01-01',
    ...(profileStatus === null ? {} : { is_active: profileStatus }),
  };
  const directoryUser = {
    ...profile, email: 'learner@example.com', last_sign_in_at: null,
    enrollment_count: 0, certificate_count: 0,
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: actorId } } }) },
    from: () => ({
      select() { return this; },
      eq(_column, value) { this.id = value; return this; },
      maybeSingle: async function () {
        return { data: this.id === actorId ? { role: 'admin', is_active: true } : profileReadable ? profile : null, error: null };
      },
      order: async () => ({ data: [], error: null }),
    }),
    rpc: async name => name === 'admin_get_user_account_state'
      ? archiveReady
        ? { data: [{ ...directoryUser, is_active: profileStatus ?? fallbackStatus ?? true, archived_at: archivedAt }], error: null }
        : { data: null, error: { code: 'PGRST202' } }
      : { data: directoryVisible ? [directoryUser] : [], error: null },
  };
  const admin = {
    from: () => ({
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: fallbackStatus === null ? null : { is_active: fallbackStatus }, error: null }),
    }),
  };
  const page = load('src/app/dashboard/admin/users/[userId]/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    '@/utils/supabase/admin': { createAdminClient: () => admin },
    '@/components/admin/AdminAccountStatusSwitch': {
      default: ({ initialActive, disabledReason }) => React.createElement('span', {
        'data-active': String(initialActive), 'data-disabled': String(disabledReason),
      }),
    },
    '@/components/admin/AdminUserProfileForm': { default: () => null },
    '@/components/admin/AdminUserArchivePanel': {
      default: ({ confirmationValue, disabledReason, archivedAt }) => React.createElement('div', {
        'data-confirmation': confirmationValue, 'data-archive-disabled': String(disabledReason), 'data-archived-at': String(archivedAt),
      }),
    },
    'next/link': { default: link },
    'next/navigation': { redirect, notFound: () => { throw new Error('NOT_FOUND'); } },
  }).default;
  return renderToStaticMarkup(await page({ params: Promise.resolve({ userId: 'student-1' }) }));
}

test('admin user detail shows the account switch with the target status', async () => {
  const html = await adminUserDetail();
  assert.match(html, /สถานะบัญชี/);
  assert.match(html, /data-active="false" data-disabled="null"/);
});

test('admin user detail loads status when the directory RPC omits it', async () => {
  const html = await adminUserDetail({ profileStatus: null, fallbackStatus: true, archiveReady: false });
  assert.match(html, /data-active="true" data-disabled="null"/);
});

test('admin user detail does not allow suspending your own account', async () => {
  const html = await adminUserDetail({ actorId: 'student-1' });
  assert.match(html, /data-disabled="ไม่สามารถเปลี่ยนสถานะบัญชีตัวเอง"/);
  assert.match(html, /data-archive-disabled="ไม่สามารถลบบัญชีตัวเอง"/);
});

test('admin user detail uses the database email for archive confirmation', async () => {
  const html = await adminUserDetail();
  assert.match(html, /data-confirmation="learner@example.com" data-archive-disabled="null"/);
});

test('archive controls remain disabled until the new database function is ready', async () => {
  const html = await adminUserDetail({ archiveReady: false });
  assert.match(html, /data-archive-disabled="ระบบลบบัญชียังไม่พร้อม/);
});

test('archived details remain readable when the account is absent from the normal directory', async () => {
  const html = await adminUserDetail({ archivedAt: '2026-10-05T12:00:00Z', profileReadable: false, directoryVisible: false });
  assert.match(html, /learner@example.com/);
  assert.match(html, /data-disabled="บัญชีนี้ถูกลบแล้ว"/);
  assert.match(html, /data-archived-at="2026-10-05T12:00:00Z"/);
});

const archiveActorId = '10000000-0000-4000-8000-000000000001';
const archiveTargetId = '20000000-0000-4000-8000-000000000002';

function archiveAction({ signedIn = true, role = 'admin', active = true, result = null, rpcError = null } = {}) {
  const calls = [];
  const invalidations = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: archiveActorId } : null } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role, is_active: active }, error: null }) }),
    rpc: async (name, params) => { calls.push({ name, params }); return { data: result, error: rpcError }; },
  };
  const actions = load('src/app/dashboard/admin/users/actions.ts', {
    '@/utils/supabase/server': { createClient: async () => supabase },
    'next/cache': { revalidatePath: path => invalidations.push(path) },
  });
  return { ...actions, calls, invalidations };
}

test('archive action rejects unauthorized, inactive and self-account requests before mutation', async () => {
  for (const options of [{ signedIn: false }, { role: 'student' }, { active: false }, { active: null }]) {
    const action = archiveAction(options);
    const response = await action.archiveUserAccount(archiveTargetId, 'learner@example.com');
    assert.ok(response.error);
    assert.equal(action.calls.length, 0);
  }
  const action = archiveAction();
  assert.match((await action.archiveUserAccount(archiveActorId, 'admin@example.com')).error, /บัญชีตัวเอง/);
  assert.equal(action.calls.length, 0);
});

test('archive action validates input before accessing a user or mutating data', async () => {
  const action = archiveAction();
  for (const [userId, confirmation] of [['not-a-uuid', 'email@example.com'], [archiveTargetId, ''], [archiveTargetId, 'x'.repeat(321)]]) {
    assert.ok((await action.archiveUserAccount(userId, confirmation)).error);
  }
  assert.equal(action.calls.length, 0);
});

test('archive action reports email mismatch, last-admin protection and missing migration as failures', async () => {
  for (const [result, expected] of [['confirmation_mismatch', /ข้อมูลยืนยันไม่ตรง/], ['last_admin', /อย่างน้อยหนึ่งบัญชี/], ['forbidden', /ไม่มีสิทธิ์/], ['not_found', /ไม่พบบัญชี/]]) {
    const action = archiveAction({ result });
    assert.match((await action.archiveUserAccount(archiveTargetId, 'learner@example.com')).error, expected);
    assert.equal(action.invalidations.length, 0);
  }
  const action = archiveAction({ rpcError: { code: 'PGRST202' } });
  assert.match((await action.archiveUserAccount(archiveTargetId, 'learner@example.com')).error, /migration/);
  assert.equal(action.invalidations.length, 0);
});

test('archive action calls only the atomic archive RPC and refreshes the directory and details on success', async () => {
  const action = archiveAction();
  assert.equal((await action.archiveUserAccount(archiveTargetId, ' learner@example.com ')).error, undefined);
  assert.equal(action.calls[0].name, 'admin_archive_user');
  assert.equal(action.calls[0].params.p_user_id, archiveTargetId);
  assert.equal(action.calls[0].params.p_confirmation, 'learner@example.com');
  assert.deepEqual(action.invalidations, ['/dashboard/admin/users', `/dashboard/admin/users/${archiveTargetId}`]);
});

test('account status action cannot report success when an archived account is reactivated', async () => {
  const action = archiveAction({ result: 'archived' });
  assert.match((await action.setUserActive(archiveTargetId, true)).error, /บัญชีนี้ถูกลบแล้ว/);
  assert.equal(action.invalidations.length, 0);
});
