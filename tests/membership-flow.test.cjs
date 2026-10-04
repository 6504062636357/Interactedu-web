const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}, env = { OMISE_SECRET_KEY: 'test', SUPABASE_SECRET_KEY: 'test' }) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, console: { error() {} }, require: name => dependencies[name] ?? require(name) });
  return exports;
}
const errors = load('src/lib/payments/membership-errors.ts');
const missing = { code: 'PGRST205', message: "Could not find the table 'public.membership_settings' in the schema cache" };

function setup(options = {}) {
  const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.loggedOut ? null : { id: 'user' } } }) },
    from(table) {
      let write = false, selection = '';
      const query = {
        select(value) { selection = value; return query; }, eq() { return query; }, gt() { return query; }, is() { return query; }, or() { return query; },
        order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
        update(payload) { writes.push(payload); write = true; return query; },
        then(resolve, reject) {
          const response = table === 'profiles'
            ? { data: { role: options.role ?? 'admin', is_active: true, full_name: 'สมชาย' }, error: null }
            : table === 'membership_settings'
              ? { data: options.missingRow || options.error ? null : write ? { id: true } : { monthly_price: options.price ?? 199, enabled: options.enabled ?? true }, error: options.error ?? null }
              : table === 'enrollments'
                ? options.legacyBilling && selection.includes('membership_order_id')
                  ? { data: null, error: { code: '42703', message: 'column enrollments.membership_order_id does not exist' } }
                  : { data: options.billingRows ?? [], error: null }
                : table === 'certificates'
                  ? { data: [], count: 0, error: null }
                  : { data: options.membershipExpiresAt ? { expires_at: options.membershipExpiresAt } : null, error: options.membershipError ?? null };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const dependencies = {
    '@/utils/supabase/server': { createClient: async () => client },
    '@/lib/payments/membership-errors': errors,
    '@/components/MembershipPayment': { default: () => React.createElement('button', null, 'PAYMENT') },
    '@/components/AppBrand': { default: ({ href }) => React.createElement('a', { href }, 'Interact Edu') },
    '@/lib/courses/student-progress': { summarizeStudentProgress() { throw new Error('No enrollments expected'); } },
    '@/lib/courses/study-time': { formatStudyTime: () => '0', formatCourseVideoDuration: () => null },
    '@/lib/constants/course-cover': { DEFAULT_COURSE_COVER_URL: '/cover.png' },
    'next/navigation': { redirect: url => { throw new Error('REDIRECT:' + url); } },
    'next/cache': { revalidatePath() {} },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    './actions': { updateMembershipOffer() {} },
  };
  return { dependencies, writes };
}

test('missing membership schema is distinguished from permission and network failures', () => {
  assert.equal(errors.isMissingMembershipSchema(missing), true);
  assert.equal(errors.isMissingMembershipSchema({ code: '42703', message: 'column enrollments.access_expires_at does not exist' }), true);
  assert.equal(errors.isMissingMembershipSchema({ code: '42501', message: 'permission denied for membership_settings' }), false);
  assert.equal(errors.isMissingMembershipSchema({ code: 'PGRST205', message: 'profiles missing' }), false);
  assert.equal(errors.isMissingMembershipSchema(null), false);
});

for (const scenario of [{ error: missing }, { missingRow: true }, { error: { code: '42501', message: 'permission denied' } }]) {
  test(`admin page renders a disabled form instead of crashing: ${JSON.stringify(scenario)}`, async () => {
    const { dependencies } = setup(scenario);
    const page = load('src/app/dashboard/admin/membership/page.tsx', dependencies).default;
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ saved: '1' }) }));
    assert.match(html, /role="alert"/);
    assert.match(html, /disabled=""/);
    assert.doesNotMatch(html, /บันทึกแพ็กเกจเรียบร้อยแล้ว/);
  });
}

test('saving a missing or RLS-filtered settings row cannot report success', async () => {
  const { dependencies } = setup({ missingRow: true });
  const action = load('src/app/dashboard/admin/membership/actions.ts', dependencies).updateMembershipOffer;
  const data = new FormData(); data.set('monthlyPrice', '199'); data.set('enabled', 'on');
  await assert.rejects(action(data), /REDIRECT:.*error=save/);
});

test('admin page identifies the exact missing server setting without revealing a key', async () => {
  const { dependencies } = setup();
  const page = load('src/app/dashboard/admin/membership/page.tsx', dependencies, { OMISE_SECRET_KEY: 'private-value' }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
  assert.match(html, /SUPABASE_SECRET_KEY หรือ SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(html, /private-value/);
  assert.doesNotMatch(html, /ยังไม่เห็นค่า OMISE_SECRET_KEY/);
});

test('zero-price package may be disabled, but cannot be sold', async () => {
  const { dependencies, writes } = setup();
  const action = load('src/app/dashboard/admin/membership/actions.ts', dependencies).updateMembershipOffer;
  const data = new FormData(); data.set('monthlyPrice', '0');
  await assert.rejects(action(data), /REDIRECT:.*saved=1/);
  assert.equal(writes[0].enabled, false);
  data.set('enabled', 'on');
  await assert.rejects(action(data), /REDIRECT:.*error=price/);
  assert.equal(writes.length, 1);
});

test('students cannot modify the membership offer', async () => {
  const { dependencies, writes } = setup({ role: 'student' });
  const action = load('src/app/dashboard/admin/membership/actions.ts', dependencies).updateMembershipOffer;
  await assert.rejects(action(new FormData()), /REDIRECT:\/dashboard$/);
  assert.equal(writes.length, 0);
});

test('student payment is unavailable if either offer or membership history cannot load', async () => {
  for (const scenario of [{ error: missing }, { membershipError: missing }]) {
    const { dependencies } = setup({ role: 'student', ...scenario });
    const page = load('src/app/membership/page.tsx', dependencies).default;
    const html = renderToStaticMarkup(await page());
    assert.match(html, /ตรวจสอบข้อมูลแพ็กเกจหรือสิทธิ์สมาชิกไม่ได้/);
    assert.doesNotMatch(html, /PAYMENT/);
  }
});

test('configured offer renders the monthly price and payment button', async () => {
  const { dependencies } = setup({ role: 'student' });
  const page = load('src/app/membership/page.tsx', dependencies).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /199/);
  assert.match(html, /PAYMENT/);
});

test('student cannot start payment when the server key is missing', async () => {
  const { dependencies } = setup({ role: 'student' });
  const page = load('src/app/membership/page.tsx', dependencies, { OMISE_SECRET_KEY: 'test' }).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /199/);
  assert.match(html, /ยังไม่เปิดรับชำระเงิน/);
  assert.match(html, /ดูคอร์สทั้งหมด/);
  assert.doesNotMatch(html, /PAYMENT/);
});

test('billing preserves legacy purchases and handles an inaccessible course', async () => {
  const { dependencies } = setup({
    role: 'student', legacyBilling: true, membershipError: missing,
    billingRows: [{ id: 'purchase', status: 'approved', created_at: '2026-10-01T00:00:00Z', courses: null }],
  });
  const page = load('src/app/dashboard/student/billing/page.tsx', dependencies).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /PURCHASE/);
  assert.match(html, /โหลดประวัติการชำระเงินได้ไม่ครบ/);
  assert.doesNotMatch(html, /ยังไม่มีประวัติ/);
});

test('student dashboard shows the live offer price and an honest payment status', async () => {
  const { dependencies } = setup({ role: 'student', price: 7500 });
  const page = load('src/app/dashboard/student/page.tsx', dependencies, { OMISE_SECRET_KEY: 'test' }).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /7,500/);
  assert.match(html, /href="\/membership"/);
  assert.match(html, /ยังไม่เปิดรับชำระเงิน/);
});

test('student dashboard shows active membership and no unavailable-payment notice when configured', async () => {
  const { dependencies } = setup({ role: 'student', membershipExpiresAt: '2026-11-02T00:00:00Z' });
  const page = load('src/app/dashboard/student/page.tsx', dependencies).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /สิทธิ์เรียนทุกคอร์สของคุณ/);
  assert.match(html, /ไปคอร์สของฉัน/);
  assert.doesNotMatch(html, /ยังไม่เปิดรับชำระเงิน/);
});
