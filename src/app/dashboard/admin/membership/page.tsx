import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";
import { updateMembershipOffer } from "./actions";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, CirclePlus, Info, Save, Settings2, ShieldCheck } from "lucide-react";
import { isMissingMembershipSchema } from "@/lib/payments/membership-errors";

function PriceField({ name, label, description, value, disabled }: {
  name: string;
  label: string;
  description: string;
  value: number | null | undefined;
  disabled: boolean;
}): ReactElement {
  return (
    <div className="min-w-0">
      <label htmlFor={name} className="block text-[13px] font-semibold text-slate-700">{label}</label>
      <div className="relative mt-2">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="0.01"
          required
          disabled={disabled}
          defaultValue={value ?? ""}
          aria-describedby={`${name}-help`}
          className="block min-h-12 w-full !rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-14 text-[17px] font-semibold tabular-nums text-[#0F1B3D] outline-none focus:border-[#3157D5] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-medium text-slate-400">บาท</span>
      </div>
      <p id={`${name}-help`} className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

export default async function AdminMembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}): Promise<ReactElement> {
  const [{ error: saveError, saved }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/admin/membership");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("โหลดสิทธิ์ผู้ดูแลไม่สำเร็จ");
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: offer, error } = await supabase
    .from("membership_settings")
    .select("monthly_price, annual_price, annual_regular_price, enabled")
    .eq("id", true)
    .maybeSingle();
  if (error) console.error("[admin membership] Failed to load offer", error.code, error.message);
  const unavailable = Boolean(error || !offer);
  const needsSetup = isMissingMembershipSchema(error) || (!error && !offer);
  const missingPaymentSettings = [
    !process.env.OMISE_SECRET_KEY && "OMISE_SECRET_KEY",
    !(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY) && "SUPABASE_SECRET_KEY หรือ SUPABASE_SERVICE_ROLE_KEY",
  ].filter((setting): setting is string => Boolean(setting));

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-[#0F1B3D]">
      <nav aria-label="เส้นทางหน้าปัจจุบัน" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="inline-flex min-h-8 items-center gap-1.5 font-medium transition-colors hover:text-[#0F1B3D]">
          <ArrowLeft size={14} aria-hidden="true" /> ภาพรวมระบบ
        </Link>
        <ChevronRight size={13} className="text-slate-300" aria-hidden="true" />
        <span aria-current="page" className="font-semibold text-slate-700">แพ็กเกจสมาชิก</span>
      </nav>

      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Membership management</p>
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[30px]">จัดการแพ็กเกจสมาชิก</h1>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">กำหนดราคาและการเปิดขาย Interact Edu Plus สำหรับนักเรียน</p>
        </div>
        <Link href="/membership" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:self-auto">
          ดูหน้าสมัครสมาชิก <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
        <form action={updateMembershipOffer} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-5 sm:px-6">
            <Settings2 size={20} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-[15px] font-bold">ตั้งค่าแพ็กเกจ</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">จัดการราคาแพ็กเกจและสถานะการรับสมัคร</p>
            </div>
          </div>

          <div className="space-y-4 px-5 pt-5 sm:px-6">
            {missingPaymentSettings.length > 0 && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
                เซิร์ฟเวอร์ที่กำลังรันเว็บยังไม่เห็นค่า {missingPaymentSettings.join(" และ ")} กรุณาตั้งค่าในสภาพแวดล้อมนี้แล้วรีสตาร์ตแอปก่อนเปิดรับชำระเงิน
              </p>
            )}
            {unavailable && (
              <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-xs leading-6 text-amber-900">
                <p className="font-bold">{needsSetup ? "ระบบแพ็กเกจสมาชิกยังไม่พร้อมใช้งาน" : "โหลดแพ็กเกจสมาชิกไม่สำเร็จ"}</p>
                <p className="mt-1">{needsSetup ? "กรุณาติดตั้งฐานข้อมูลแพ็กเกจสมาชิกให้เรียบร้อย แล้วกลับมาตั้งราคาและเปิดขาย" : "กรุณาลองโหลดหน้านี้ใหม่อีกครั้ง ยังไม่มีการเปลี่ยนแปลงแพ็กเกจ"}</p>
                <Link href="/dashboard/admin/membership" className="mt-3 inline-flex font-bold underline">โหลดข้อมูลใหม่</Link>
              </div>
            )}
            {saved && !unavailable && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700"><CheckCircle2 size={17} className="shrink-0" aria-hidden="true" />บันทึกแพ็กเกจเรียบร้อยแล้ว</p>}
            {saveError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold leading-6 text-red-700">
                {saveError === "price" ? "กรุณากำหนดราคาทุกแพ็กเกจเป็น 0–1,000,000 บาท (มากกว่า 0 บาทเมื่อเปิดขาย) และราคาปกติรายปีต้องไม่น้อยกว่าราคาขาย" : "บันทึกไม่สำเร็จ กรุณาลองใหม่"}
              </p>
            )}
          </div>

          <section aria-labelledby="membership-prices" className="px-5 pb-6 pt-2 sm:px-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 id="membership-prices" className="text-xs font-bold text-slate-600">ราคาแพ็กเกจ</h3>
              <span className="text-[11px] text-slate-400">สกุลเงิน THB</span>
            </div>

            <div className="grid gap-5 border-b border-slate-100 pb-6 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex items-start gap-2.5">
                <CalendarDays size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-semibold">รายเดือน</h4>
                  <p className="mt-1 text-xs text-slate-500">ระยะเวลา 1 เดือน</p>
                </div>
              </div>
              <div className="sm:max-w-[240px]">
                <PriceField name="monthlyPrice" label="ราคาขายรายเดือน" description="ราคาสำหรับสมาชิก 1 เดือน" value={offer?.monthly_price} disabled={unavailable} />
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex items-start gap-2.5">
                <CalendarDays size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-semibold">รายปี</h4>
                  <p className="mt-1 text-xs text-slate-500">ระยะเวลา 12 เดือน</p>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <PriceField name="annualPrice" label="ราคาขายรายปี" description="ราคาที่นักเรียนชำระจริง" value={offer?.annual_price} disabled={unavailable} />
                <PriceField name="annualRegularPrice" label="ราคาปกติรายปี" description="ราคาอ้างอิงสำหรับแสดงส่วนลด" value={offer?.annual_regular_price} disabled={unavailable} />
              </div>
            </div>
          </section>

          <section aria-labelledby="membership-availability" className="border-t border-slate-200 px-5 py-6 sm:px-6">
            <h3 id="membership-availability" className="mb-4 text-xs font-bold text-slate-600">การเปิดรับสมัคร</h3>
            <div className="flex items-start justify-between gap-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <label htmlFor="membership-enabled" className="cursor-pointer text-sm font-semibold">เปิดขายแพ็กเกจ</label>
                <p id="membership-enabled-help" className="mt-1.5 max-w-md text-xs leading-5 text-slate-500">เมื่อปิดขาย นักเรียนจะไม่สามารถเริ่มชำระค่าสมาชิกใหม่ได้</p>
              </div>
              <label className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center">
                <input id="membership-enabled" name="enabled" type="checkbox" role="switch" aria-label="เปิดขายแพ็กเกจ" aria-describedby="membership-enabled-help" disabled={unavailable} defaultChecked={offer?.enabled ?? false} className="peer sr-only" />
                <span aria-hidden="true" className="h-6 w-11 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#0F1B3D] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-[#3157D5] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-40" />
              </label>
            </div>
          </section>

          <footer className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs leading-5 text-slate-500">การเปลี่ยนแปลงจะมีผลเมื่อบันทึก</p>
            <button type="submit" disabled={unavailable} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0F1B3D] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1D3268] disabled:cursor-not-allowed disabled:opacity-50">
              <Save size={16} aria-hidden="true" /> บันทึกแพ็กเกจ
            </button>
          </footer>
        </form>

        <aside className="space-y-5" aria-label="ข้อมูลแพ็กเกจสมาชิก">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="membership-overview">
            <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
              <CirclePlus size={18} className="text-[#3157D5]" aria-hidden="true" />
              <h2 id="membership-overview" className="text-sm font-bold">Interact Edu Plus</h2>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs font-medium text-slate-500">สถานะปัจจุบัน</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${unavailable ? "border-amber-200 bg-amber-50 text-amber-800" : offer?.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                {unavailable ? "ไม่พร้อมใช้งาน" : offer?.enabled ? "เปิดขายอยู่" : "ปิดขาย"}
              </span>
              <dl className="mt-5 space-y-4 border-t border-slate-100 pt-5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">รูปแบบแพ็กเกจ</dt>
                  <dd className="font-semibold text-slate-700">รายเดือน / รายปี</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">กลุ่มผู้ใช้งาน</dt>
                  <dd className="font-semibold text-slate-700">นักเรียน</dd>
                </div>
                <div>
                  <dt className="text-slate-500">สิทธิ์การเข้าเรียน</dt>
                  <dd className="mt-1.5 font-medium leading-5 text-slate-700">ทุกคอร์สที่เผยแพร่ ตลอดอายุแพ็กเกจ</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5" aria-labelledby="membership-guidance">
            <h2 id="membership-guidance" className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Info size={16} aria-hidden="true" /> ข้อกำหนดการตั้งราคา</h2>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-5 text-slate-500">
              <li>ราคาทุกแพ็กเกจต้องมากกว่า 0 บาทเมื่อเปิดขาย</li>
              <li>ราคาปกติรายปีต้องไม่น้อยกว่าราคาขายรายปี</li>
              <li>กำหนดราคาได้ไม่เกิน 1,000,000 บาท</li>
            </ul>
          </section>
          <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />จัดการได้เฉพาะผู้ดูแลระบบ</p>
        </aside>
      </div>
    </div>
  );
}
