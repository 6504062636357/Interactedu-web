import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { ArrowLeft, ArrowRight, Banknote, BookOpen, Check, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import AppBrand from "@/components/AppBrand";
import MembershipPayment from "@/components/MembershipPayment";
import { createClient } from "@/utils/supabase/server";

export default async function MembershipPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/membership");

  const [{ data: profile, error: profileError }, { data: offer, error: offerError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle(),
      supabase.from("membership_settings").select("monthly_price, enabled").eq("id", true).maybeSingle(),
      supabase.from("student_membership_orders")
        .select("expires_at")
        .eq("student_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (profileError) throw new Error("โหลดข้อมูลบัญชีไม่สำเร็จ");
  if (profile?.role !== "student" || !profile.is_active) redirect("/dashboard");
  if (offerError || membershipError) {
    console.error("[membership] Failed to load offer or membership", offerError?.message, membershipError?.message);
  }

  const price = Number(offer?.monthly_price);
  const offerOpen = !offerError && offer?.enabled && Number.isFinite(price) && price > 0;
  const paymentReady = Boolean(process.env.OMISE_SECRET_KEY && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));
  const canPay = offerOpen && !membershipError && paymentReady;
  const expiresAt = membershipError ? null : membership?.expires_at ?? null;

  return (
    <main className="app-canvas min-h-screen pb-16">
      <header className="app-topbar">
        <div className="mx-auto flex h-[74px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <AppBrand href="/dashboard/student" compact />
          <Link href="/dashboard/student" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#0F1B3D]">
            <ArrowLeft size={16} aria-hidden="true" /> <span className="sm:hidden">กลับ</span><span className="hidden sm:inline">กลับหน้าเรียนของฉัน</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-8 sm:pt-12">
        <section className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(125deg,#0F1B3D,#203B7A)] px-6 py-9 text-white shadow-[0_22px_55px_-25px_rgba(15,27,61,0.5)] sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-12 -top-28 h-72 w-72 rounded-full border-[54px] border-white/[0.06]" />
          <div className="pointer-events-none absolute bottom-[-100px] right-[12%] h-48 w-48 rounded-full bg-[#3157D5]/30 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
              <Sparkles size={14} aria-hidden="true" /> MEMBERSHIP
            </span>
            <h1 className="mt-5 text-balance text-[31px] font-black leading-tight tracking-[-0.04em] sm:text-[43px]">คอร์สที่อยากเรียน<br />อยู่ในแพ็กเกจเดียว</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/75 sm:text-[15px]">เป็นสมาชิกรายเดือนเพื่อเข้าเรียนคอร์สที่เผยแพร่บน Interact Edu ได้ตลอดช่วงเวลาที่สมาชิกยังใช้งานอยู่</p>
          </div>
        </section>

        {expiresAt && (
          <section aria-label="สถานะสมาชิกของคุณ" className="mt-6 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={18} aria-hidden="true" /></span>
              <div>
                <p className="text-sm font-extrabold text-emerald-900">สมาชิกของคุณกำลังใช้งาน</p>
                <p className="mt-1 text-sm text-emerald-800">เข้าเรียนได้ถึง {new Date(expiresAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })}</p>
              </div>
            </div>
            <Link href="/dashboard/student/courses" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800">ไปคอร์สของฉัน <ArrowRight size={15} aria-hidden="true" /></Link>
          </section>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="order-2 rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8 lg:order-1">
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
                <h3 className="mt-4 text-[15px] font-bold text-[#0F1B3D]">ใช้งานได้ 1 เดือน</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">เริ่มนับเมื่อชำระเงินสำเร็จ ซื้อเพิ่มได้หากต้องการต่ออายุ</p>
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

          <aside aria-label="สรุปแพ็กเกจและการสมัคร" className="order-1 overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_15px_45px_-25px_rgba(15,27,61,0.25)] lg:order-2">
            <div className="border-b border-slate-100 px-6 py-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFCB47]/25 text-[#0F1B3D]"><Banknote size={21} aria-hidden="true" /></span>
              <p className="mt-4 text-sm font-bold text-[#0F1B3D]">สมาชิกรายเดือน</p>
              {offerOpen ? (
                <p className="mt-2 text-[36px] font-black leading-none tracking-[-0.045em] text-[#0F1B3D]">฿{price.toLocaleString("th-TH")}<span className="ml-2 text-sm font-medium tracking-normal text-slate-500">/ เดือน</span></p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">ยังไม่เปิดรับสมัครแพ็กเกจนี้</p>
              )}
              <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} aria-hidden="true" /> ชำระครั้งเดียว ไม่มีการตัดเงินอัตโนมัติ</p>
            </div>
            <div className="px-6 py-6">
              {offerError || membershipError ? (
                <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">ตรวจสอบข้อมูลแพ็กเกจหรือสิทธิ์สมาชิกไม่ได้ในขณะนี้ กรุณาลองโหลดหน้านี้ใหม่</div>
              ) : !offerOpen ? (
                <div role="status" className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">ขณะนี้ยังไม่เปิดรับสมัครแพ็กเกจรายเดือน คุณยังเลือกเรียนคอร์สแยกได้ตามปกติ</div>
              ) : canPay ? (
                <MembershipPayment />
              ) : (
                <div role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  <p className="font-bold">ยังไม่เปิดรับชำระเงิน</p>
                  <p className="mt-1">คุณดูรายละเอียดแพ็กเกจได้ก่อน และกลับมาสมัครเมื่อระบบพร้อม</p>
                </div>
              )}
              {!canPay && (
                <Link href="/courses" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-[#0F1B3D] transition hover:border-[#3157D5] hover:text-[#3157D5]">ดูคอร์สทั้งหมด <ArrowRight size={15} aria-hidden="true" /></Link>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
