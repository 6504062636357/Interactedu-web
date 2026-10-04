import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowLeft, ArrowRight, Banknote, BookOpen, Check, Clock3, ShieldCheck, Sparkles, Tag } from "lucide-react";
import AppBrand from "@/components/AppBrand";
import MembershipPayment from "@/components/MembershipPayment";
import { formatRemainingAccess } from "@/lib/courses/access-expiry";
import { createClient } from "@/utils/supabase/server";

export default async function MembershipPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const [profileResult, offerResult, membershipResult] = await Promise.all([
    user
      ? supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("membership_settings").select("monthly_price, annual_price, annual_regular_price, enabled").eq("id", true).maybeSingle(),
    user
      ? supabase.from("student_membership_orders")
        .select("expires_at")
        .eq("student_id", user.id)
        .eq("status", "active")
        .lte("starts_at", now)
        .gt("expires_at", now)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data: profile, error: profileError } = profileResult;
  const { data: offer, error: offerError } = offerResult;
  const { data: membership, error: membershipError } = membershipResult;
  if (offerError || membershipError) {
    console.error("[membership] Failed to load offer or membership", offerError?.message, membershipError?.message);
  }

  const monthlyPrice = Number(offer?.monthly_price);
  const annualPrice = Number(offer?.annual_price);
  const annualRegularPrice = Number(offer?.annual_regular_price);
  const offerOpen = !offerError && offer?.enabled && Number.isFinite(monthlyPrice) && monthlyPrice > 0
    && Number.isFinite(annualPrice) && annualPrice > 0
    && Number.isFinite(annualRegularPrice) && annualRegularPrice >= annualPrice;
  const paymentReady = Boolean(process.env.OMISE_SECRET_KEY && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));
  const eligibleStudent = Boolean(user && !profileError && profile?.role === "student" && profile.is_active);
  const canPay = eligibleStudent && offerOpen && !membershipError && paymentReady;
  const expiresAt = membershipError ? null : membership?.expires_at ?? null;

  return (
    <main className="app-canvas min-h-screen pb-16">
      <header className="app-topbar">
        <div className="mx-auto flex h-[68px] w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-[74px] sm:px-8">
          <AppBrand href={user ? "/dashboard" : "/"} compact />
          <Link href={user ? "/dashboard" : "/courses"} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#0F1B3D] sm:px-3 sm:text-sm">
            <ArrowLeft size={16} aria-hidden="true" /> <span className="sm:hidden">กลับ</span><span className="hidden sm:inline">{user ? "กลับหน้าเรียนของฉัน" : "ดูคอร์สทั้งหมด"}</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pt-5 sm:px-8 sm:pt-10">
        <section className="relative isolate overflow-hidden rounded-[24px] border border-white/15 bg-[#101D42] px-5 py-7 text-left text-white shadow-[0_30px_70px_-28px_rgba(12,27,66,0.65)] sm:rounded-[30px] sm:px-9 sm:py-9 lg:px-12 lg:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(93,135,255,0.3),transparent_36%),linear-gradient(120deg,#101B3B_8%,#183267_65%,#284D9E_115%)]" />
          <div className="pointer-events-none absolute -right-12 -top-28 h-72 w-72 rounded-full border-[42px] border-white/[0.055]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-80 rounded-full bg-[#5274EF]/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent" />
          <div className="relative min-w-0 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.11] px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-blue-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md">
                <Sparkles size={14} aria-hidden="true" /> INTERACT EDU PLUS
              </span>
              <h1 className="mt-6 max-w-[680px] text-[clamp(2rem,5vw,3.25rem)] font-black leading-[1.16] tracking-[-0.045em]"><span className="block">เลือก Interact Edu Plus</span><span className="block">ที่เหมาะกับคุณ</span></h1>
              <p className="mt-5 max-w-[45ch] text-sm leading-7 text-blue-50/85 sm:text-base">เรียนได้ทุกคอร์สที่เผยแพร่ เลือกจ่ายรายเดือนเพื่อเริ่มต้น หรือประหยัดกว่าเมื่อสมัครรายปี</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-semibold text-blue-100 sm:text-sm">
                <span className="inline-flex items-center gap-2"><Check size={16} className="text-[#BDEDDC]" aria-hidden="true" />ชำระครั้งเดียว</span>
                <span className="inline-flex items-center gap-2"><Check size={16} className="text-[#BDEDDC]" aria-hidden="true" />ไม่มีต่ออายุอัตโนมัติ</span>
              </div>
          </div>
        </section>

        {expiresAt && (
          <section aria-label="สถานะสมาชิกของคุณ" className="mt-6 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={18} aria-hidden="true" /></span>
              <div>
                <p className="text-sm font-extrabold text-emerald-900">Plus กำลังใช้งาน</p>
                <p className="mt-1 text-sm font-bold text-emerald-800">{formatRemainingAccess(expiresAt)}</p>
                <p className="mt-1 text-xs text-emerald-800">เข้าเรียนได้ถึง {new Date(expiresAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
              </div>
            </div>
            <Link href="/dashboard/student/courses" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800">ไปคอร์สของฉัน <ArrowRight size={15} aria-hidden="true" /></Link>
          </section>
        )}

        <section id="plus-plans" aria-label="เลือกแพ็กเกจสมาชิก" className="mx-auto mt-7 grid max-w-4xl min-w-0 scroll-mt-24 items-stretch gap-5 lg:grid-cols-2">
          {[
            {
              durationMonths: 1 as const,
              title: "Plus รายเดือน",
              description: "เหมาะสำหรับเริ่มต้น เรียนตามจังหวะของคุณ",
              price: monthlyPrice,
              unit: "เดือน",
            },
            {
              durationMonths: 12 as const,
              title: "Plus รายปี",
              description: "จ่ายครั้งเดียว เรียนต่อเนื่องตลอดทั้งปี",
              price: annualPrice,
              unit: "ปี",
            },
          ].map((plan) => {
            const annual = plan.durationMonths === 12;
            const savingVsRegular = annual ? Math.max(0, annualRegularPrice - annualPrice) : 0;
            const savingVsMonthly = annual ? Math.max(0, monthlyPrice * 12 - annualPrice) : 0;
            return (
              <article key={plan.durationMonths} className={`relative isolate flex min-w-0 flex-col rounded-[24px] border p-5 sm:p-7 ${annual ? "border-[#4267E4] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(244,248,255,0.96)_56%,rgba(228,238,255,0.9)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_28px_65px_-25px_rgba(39,79,185,0.42)] backdrop-blur-xl" : "border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,27,61,0.05)]"}`}>
                {annual && (
                  <>
                    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[24px]">
                      <div className="absolute -right-16 -top-24 h-64 w-52 rotate-[-28deg] bg-gradient-to-r from-transparent via-white/90 to-transparent blur-xl" />
                      <div className="absolute -right-16 top-10 h-52 w-52 rounded-full bg-[#8EADFF]/20 blur-3xl" />
                      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                    </div>
                    <span className="absolute -top-3 right-5 rounded-full border border-white/50 bg-[#3157D5] px-3 py-1.5 text-[11px] font-extrabold text-white shadow-[0_8px_22px_rgba(49,87,213,0.28)]">คุ้มกว่าสำหรับการเรียนต่อเนื่อง</span>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#EFF3FF] px-3 py-1.5 text-[10px] font-extrabold text-[#3157D5]">{annual ? "แพ็กเกจแนะนำ" : "ยืดหยุ่น เริ่มต้นง่าย"}</span>
                  {annual ? <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-white/70 text-[#3157D5] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_7px_18px_rgba(49,87,213,0.12)]"><Banknote size={19} aria-hidden="true" /></span> : <Clock3 size={19} className="text-slate-400" aria-hidden="true" />}
                </div>
                <h2 className="mt-5 text-xl font-extrabold text-[#0F1B3D]">{plan.title}</h2>
                <p className="mt-1 min-h-5 text-xs text-slate-500">{plan.description}</p>
                <div className="mt-5 flex flex-wrap items-baseline gap-2">
                  <span className={`text-[clamp(1.75rem,8vw,2.375rem)] font-black leading-none tracking-[-0.045em] ${annual ? "text-[#2448B4]" : "text-[#0F1B3D]"}`}>{offerOpen ? `฿${plan.price.toLocaleString("th-TH")}` : "ยังไม่แสดงราคา"}</span>
                  {offerOpen && <span className="text-sm text-slate-500">/ {plan.unit}</span>}
                </div>
                {offerOpen && annual ? (
                  <>
                    <p className="mt-2 text-xs text-slate-500">เฉลี่ย ฿{Math.round(annualPrice / 12).toLocaleString("th-TH")} / เดือน เมื่อชำระรายปี</p>
                    <p className="mt-2 text-xs text-slate-500">ราคาปกติ <s>฿{annualRegularPrice.toLocaleString("th-TH")}</s></p>
                    <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-700 shadow-[0_5px_16px_rgba(5,150,105,0.08)]">
                      <Tag size={14} aria-hidden="true" />ลด ฿{savingVsRegular.toLocaleString("th-TH")} จากราคาปกติ ฿{annualRegularPrice.toLocaleString("th-TH")}
                    </p>
                    {savingVsMonthly > 0 && <p className="mt-2 text-[11px] text-slate-500">ประหยัด ฿{savingVsMonthly.toLocaleString("th-TH")} เมื่อเทียบกับจ่ายรายเดือนครบ 12 เดือน</p>}
                  </>
                ) : offerOpen ? (
                  <p className="mt-2 text-xs text-slate-500">ชำระครั้งเดียว ใช้งานได้ 1 เดือน</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-emerald-600" aria-hidden="true" />ทุกคอร์สที่เผยแพร่</span>
                  <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-emerald-600" aria-hidden="true" />ไม่ต่ออายุอัตโนมัติ</span>
                </div>
                <details className={`group mt-6 rounded-2xl border open:bg-white ${annual ? "border-blue-200/70 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_rgba(49,87,213,0.08)]" : "border-slate-200 bg-slate-50/60"}`}>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 text-sm font-bold text-[#3157D5] marker:hidden hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] [&::-webkit-details-marker]:hidden">
                    ดูรายละเอียดแพ็กเกจและการชำระเงิน <ArrowRight size={17} className="shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-slate-100 px-4 pb-4">
                    <ul className="mb-5 divide-y divide-slate-100 text-xs text-slate-600">
                      <li className="flex items-center gap-2.5 py-3"><Check size={15} className="text-emerald-600" aria-hidden="true" />เข้าเรียนได้ทุกคอร์สที่เผยแพร่</li>
                      <li className="flex items-center gap-2.5 py-3"><Check size={15} className="text-emerald-600" aria-hidden="true" />{annual ? "ใช้งานต่อเนื่อง 12 เดือนเต็ม" : "ใช้งานได้นาน 1 เดือน"}</li>
                      <li className="flex items-center gap-2.5 py-3"><Check size={15} className="text-emerald-600" aria-hidden="true" />จ่ายครั้งเดียว ไม่มีต่ออายุอัตโนมัติ</li>
                    </ul>
                    {offerError || membershipError ? (
                      <div role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">ตรวจสอบข้อมูลแพ็กเกจหรือสิทธิ์สมาชิกไม่ได้ กรุณาลองใหม่</div>
                    ) : !offerOpen ? (
                      <div role="status" className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">แพ็กเกจยังไม่พร้อมเปิดรับสมัคร</div>
                    ) : !user ? (
                      <Link href="/login?redirect=/membership" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFCB47] px-4 text-center text-sm font-extrabold text-[#0F1B3D] transition hover:bg-[#f0bc3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]">เข้าสู่ระบบเพื่อชำระเงิน <ArrowRight size={17} aria-hidden="true" /></Link>
                    ) : profileError ? (
                      <div role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">ตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่ภายหลัง</div>
                    ) : !eligibleStudent ? (
                      <div role="status" className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">แพ็กเกจนี้สำหรับบัญชีผู้เรียน</div>
                    ) : canPay ? (
                      <MembershipPayment durationMonths={plan.durationMonths} />
                    ) : (
                      <div role="status" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณากลับมาสมัครภายหลัง</div>
                    )}
                    {!canPay && user && (
                      <Link href="/courses" className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-[#0F1B3D] transition hover:border-[#3157D5] hover:text-[#3157D5]">
                        ดูคอร์สทั้งหมด <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                    <p className="mt-3 text-center text-[10px] text-slate-400">ชำระด้วย PromptPay ผ่าน QR Code · ปลอดภัย ไม่ตัดเงินอัตโนมัติ</p>
                  </div>
                </details>
              </article>
            );
          })}
        </section>

        <div className="mx-auto mt-6 flex max-w-4xl items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs leading-6 text-slate-600">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={18} aria-hidden="true" />
          <p><strong className="text-[#0F1B3D]">ชำระเงินอย่างมั่นใจ</strong> ระบบจะเปิดสิทธิ์สมาชิกหลังตรวจสอบการชำระเงินสำเร็จ และคุณตรวจสอบรายการย้อนหลังได้จากประวัติการชำระเงิน</p>
        </div>

        <section className="mx-auto mt-8 max-w-4xl rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#3157D5]">สิ่งที่ได้รับ</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.025em] text-[#0F1B3D]">เรียนได้ต่อเนื่องในแบบของคุณ</h2>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#F4F7FF] p-5">
                <BookOpen className="text-[#3157D5]" size={22} aria-hidden="true" />
                <h3 className="mt-4 text-[15px] font-bold text-[#0F1B3D]">เข้าถึงทุกคอร์สที่เผยแพร่</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">เลือกเรียนคอร์สปัจจุบันและคอร์สใหม่ที่เปิดระหว่างอายุสมาชิก</p>
              </div>
              <div className="rounded-2xl bg-[#FFF8E9] p-5">
                <Clock3 className="text-amber-700" size={22} aria-hidden="true" />
                <h3 className="mt-4 text-[15px] font-bold text-[#0F1B3D]">เลือกช่วงเวลาที่เหมาะ</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">เลือกรายเดือนหรือรายปี หากมี Plus อยู่แล้ว ระยะเวลาใหม่จะเริ่มต่อจากวันหมดอายุเดิม</p>
              </div>
            </div>
            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-bold text-[#0F1B3D]">สมัครอย่างไร</h3>
              <ol className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[#0F1B3D]">1</span><span>เลือกชำระด้วย PromptPay</span></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[#0F1B3D]">2</span><span>สแกน QR และรอยืนยันรายการ</span></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[#0F1B3D]">3</span><span>เริ่มเรียนจากคอร์สของฉัน</span></li>
              </ol>
            </div>
        </section>
      </div>
    </main>
  );
}
