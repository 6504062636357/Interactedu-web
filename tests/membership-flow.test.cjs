const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}, env = { OMISE_SECRET_KEY: 'test', SUPABASE_SECRET_KEY: 'test' }, runtime = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { ...runtime, exports, process: { env }, console: { error() {} }, require: name => dependencies[name] ?? require(name) });
  return exports;
}
const errors = load('src/lib/payments/membership-errors.ts');
const accessExpiry = load('src/lib/courses/access-expiry.ts');
const plusPlan = load('src/lib/payments/plus-plan.ts');
const learningEnrollment = load('src/lib/courses/learning-enrollment.ts', {
  './student-progress': load('src/lib/courses/student-progress.ts'),
});
const missing = { code: 'PGRST205', message: "Could not find the table 'public.membership_settings' in the schema cache" };

function setup(options = {}) {
  const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.loggedOut ? null : { id: 'user' } } }) },
    from(table) {
      let write = false, selection = '';
      const query = {
        select(value) { selection = value; return query; }, eq() { return query; }, gt() { return query; }, lte() { return query; }, is() { return query; }, or() { return query; },
        order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
        update(payload) { writes.push(payload); write = true; return query; },
        then(resolve, reject) {
          const response = table === 'profiles'
            ? { data: { role: options.role ?? 'admin', is_active: true, full_name: 'สมชาย' }, error: null }
            : table === 'membership_settings'
              ? { data: options.missingRow || options.error ? null : write ? { id: true } : { monthly_price: options.price ?? 199, annual_price: options.annualPrice ?? 7500, annual_regular_price: options.annualRegularPrice ?? 12000, enabled: options.enabled ?? true }, error: options.error ?? null }
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
    '@/lib/courses/access-expiry': accessExpiry,
    '@/lib/courses/learning-enrollment': learningEnrollment,
    '@/components/MembershipPayment': { default: () => React.createElement('button', null, 'PAYMENT') },
    '@/components/PlusBadge': { default: () => React.createElement('span', null, '✦ Plus') },
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
  const data = new FormData(); data.set('monthlyPrice', '199'); data.set('annualPrice', '7500'); data.set('annualRegularPrice', '12000'); data.set('enabled', 'on');
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
  const data = new FormData(); data.set('monthlyPrice', '0'); data.set('annualPrice', '7500'); data.set('annualRegularPrice', '12000');
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
  assert.match(html, /รายเดือน/);
  assert.match(html, /รายปี/);
  assert.match(html, /12 เดือน/);
  assert.match(html, /12,000/);
  assert.match(html, /<details[^>]*>\s*<summary[^>]*>.*?ดูรายละเอียดแพ็กเกจและการชำระเงิน.*?<\/summary>[\s\S]*?PAYMENT[\s\S]*?<\/details>/);
  const hero = html.match(/<section[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.doesNotMatch(hero, /Plus รายปี|7,500/);
  assert.match(html, /aria-label="เลือกแพ็กเกจสมาชิก"[\s\S]*?<article[^>]*>[\s\S]*?Plus รายปี/);
});

test('visitors can compare Plus plans before signing in, without a payment button', async () => {
  const { dependencies } = setup({ loggedOut: true });
  const page = load('src/app/membership/page.tsx', dependencies).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /รายเดือน/);
  assert.match(html, /รายปี/);
  assert.match(html, /7,500/);
  assert.match(html, /เข้าสู่ระบบเพื่อชำระเงิน/);
  assert.doesNotMatch(html, /PAYMENT/);
});

test('remaining access shows a day count, a partial final day, and expiration accurately', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  assert.equal(accessExpiry.formatRemainingAccess('2026-10-06T10:00:00Z', now), 'เหลืออีก 2 วัน');
  assert.equal(accessExpiry.formatRemainingAccess('2026-10-05T09:00:00Z', now), 'เหลือไม่ถึง 1 วัน');
  assert.equal(accessExpiry.formatRemainingAccess('2026-10-04T10:00:00Z', now), 'หมดอายุแล้ว');
  assert.equal(accessExpiry.formatRemainingAccess('invalid', now), null);
});

test('Plus badge uses only a started paid term while showing a future annual term separately', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  const monthly = { durationMonths: 1, startsAt: '2026-09-20T10:00:00Z', expiresAt: '2026-10-20T10:00:00Z' };
  const annual = { durationMonths: 12, startsAt: '2026-10-20T10:00:00Z', expiresAt: '2027-10-20T10:00:00Z' };
  assert.equal(plusPlan.selectPlusPlans([annual, monthly], now).current, monthly);
  assert.equal(plusPlan.selectPlusPlans([annual, monthly], now).upcoming, annual);
  assert.equal(plusPlan.selectPlusPlans([annual], now).current, null);
  assert.equal(plusPlan.selectPlusPlans([monthly], new Date(monthly.expiresAt)).current, null);
});

test('Plus badge query requires an active order within its paid access period', async () => {
  const filters = [];
  const query = {
    select() { return query; },
    eq(column, value) { filters.push(['eq', column, value]); return query; },
    lte(column) { filters.push(['lte', column]); return query; },
    gt(column) { filters.push(['gt', column]); return query; },
    limit() { return query; },
    maybeSingle: async () => ({ data: { expires_at: '2026-11-01T00:00:00Z' }, error: null }),
  };
  const getExpiry = load('src/lib/payments/active-plus.ts', { 'server-only': {} }).getActivePlusExpiry;
  assert.equal(await getExpiry({ from: () => query }, 'student-1'), '2026-11-01T00:00:00Z');
  assert.deepEqual(filters.slice(0, 2), [['eq', 'student_id', 'student-1'], ['eq', 'status', 'active']]);
  assert.ok(filters.some(([method, column]) => method === 'lte' && column === 'starts_at'));
  assert.ok(filters.some(([method, column]) => method === 'gt' && column === 'expires_at'));
});

test('annual discount cannot exceed its regular price', async () => {
  const { dependencies } = setup({ role: 'admin' });
  const action = load('src/app/dashboard/admin/membership/actions.ts', dependencies).updateMembershipOffer;
  const data = new FormData();
  data.set('monthlyPrice', '1200');
  data.set('annualPrice', '7500');
  data.set('annualRegularPrice', '7000');
  data.set('enabled', 'on');
  await assert.rejects(action(data), /REDIRECT:.*error=price/);
});

test('annual membership migration persists the selected term and extends access for that term', () => {
  const migration = fs.readFileSync('supabase/migrations/20261004120000_add_annual_membership_plans.sql', 'utf8');
  assert.match(migration, /monthly_price = 1200/);
  assert.match(migration, /annual_price = 7500/);
  assert.match(migration, /annual_regular_price = 12000/);
  assert.match(migration, /check \(duration_months in \(1, 12\)\)/i);
  assert.match(migration, /v_order\.duration_months \* interval '1 month'/);
});

test('membership charge uses the selected server-side plan price and records its duration', async () => {
  const insertedOrders = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) },
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({
          data: table === 'profiles'
            ? { role: 'student', is_active: true }
            : { monthly_price: 1200, annual_price: 7500, enabled: true },
          error: null,
        }),
      };
      return query;
    },
  };
  const admin = {
    from() {
      return {
        select() { return this; },
        limit: async () => ({ error: null }),
        insert: async order => { insertedOrders.push(order); return { error: null }; },
      };
    },
  };
  const dependencies = {
    '@/utils/supabase/server': { createClient: async () => supabase },
    '@/utils/supabase/admin': { createAdminClient: () => admin },
    'next/server': { NextResponse: { json: (data, init = {}) => ({ status: init.status ?? 200, json: async () => data }) } },
  };
  const handler = load(
    'src/app/api/omise/create-membership-charge/route.ts',
    dependencies,
    { OMISE_SECRET_KEY: 'test', SUPABASE_SECRET_KEY: 'test' },
    {
      Buffer,
      URLSearchParams,
      fetch: async () => ({
        ok: true,
        json: async () => ({ id: `charge-${insertedOrders.length}`, status: 'pending', source: { scannable_code: { image: { download_uri: 'https://example.test/qr' } } } }),
      }),
    },
  ).POST;

  for (const plan of [{ durationMonths: 1, price: 1200 }, { durationMonths: 12, price: 7500 }]) {
    const response = await handler({ json: async () => ({ durationMonths: plan.durationMonths }) });
    assert.equal(response.status, 200);
    assert.equal(insertedOrders.at(-1).paid_amount, plan.price);
    assert.equal(insertedOrders.at(-1).duration_months, plan.durationMonths);
  }

  const invalidResponse = await handler({ json: async () => ({ durationMonths: 6 }) });
  assert.equal(invalidResponse.status, 400);
  assert.equal(insertedOrders.length, 2);
});

test('student cannot start payment when the server key is missing', async () => {
  const { dependencies } = setup({ role: 'student' });
  const page = load('src/app/membership/page.tsx', dependencies, { OMISE_SECRET_KEY: 'test' }).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /199/);
  assert.match(html, /ระบบชำระเงินยังไม่พร้อมใช้งาน/);
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

test('student dashboard shows monthly and annual prices with their billing periods', async () => {
  const { dependencies } = setup({ role: 'student', price: 1200, annualPrice: 7500 });
  const page = load('src/app/dashboard/student/page.tsx', dependencies, { OMISE_SECRET_KEY: 'test' }).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /฿1,200 \/ เดือน/);
  assert.match(html, /฿7,500 \/ ปี/);
  assert.match(html, /href="\/membership"/);
  assert.match(html, /ยังไม่เปิดรับชำระเงิน/);
});

test('student dashboard shows active membership and no unavailable-payment notice when configured', async () => {
  const { dependencies } = setup({ role: 'student', membershipExpiresAt: '2026-11-02T00:00:00Z' });
  const page = load('src/app/dashboard/student/page.tsx', dependencies).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /สิทธิ์เรียนทุกคอร์สของคุณ/);
  assert.doesNotMatch(html, /ไปคอร์สของฉัน|ประวัติการชำระเงิน/);
  assert.doesNotMatch(html, /ยังไม่เปิดรับชำระเงิน/);
});

test('dashboard and my courses exclude untouched Plus entitlements', async () => {
  const { dependencies } = setup({ role: 'student', billingRows: [
    { id: 'access-one', course_id: 'one', membership_order_id: 'plus', scorm_tracking: [], student_study_time: null, courses: { id: 'one', title: 'UNSTARTED_PLUS_COURSE' } },
    { id: 'access-two', course_id: 'two', membership_order_id: 'plus', scorm_tracking: [], student_study_time: { total_seconds: 0 }, courses: { id: 'two', title: 'UNSTARTED_PLUS_COURSE' } },
  ] });
  for (const file of ['src/app/dashboard/student/page.tsx', 'src/app/dashboard/student/courses/page.tsx']) {
    const page = load(file, dependencies).default;
    const html = renderToStaticMarkup(await page());
    assert.doesNotMatch(html, /UNSTARTED_PLUS_COURSE/);
    assert.match(html, /href="\/courses"/);
  }
});
