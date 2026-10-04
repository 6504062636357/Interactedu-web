import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";
import { updateMembershipOffer } from "./actions";
import { Banknote } from "lucide-react";
import { isMissingMembershipSchema } from "@/lib/payments/membership-errors";

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
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard/admin" className="inline-flex text-[13px] font-semibold text-slate-500 hover:text-[#3157D5]">
        ← กลับไปภาพรวมระบบ
      </Link>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3157D5]">Membership</p>
        <h1 className="mt-1 flex items-center gap-3 text-[30px] font-extrabold tracking-[-0.035em] text-[#0F1B3D]"><Banknote aria-hidden="true" />แพ็กเกจสมาชิก</h1>
        <p className="mt-1 text-[14px] text-slate-600">สมาชิกเข้าเรียนได้ทุกคอร์สที่เผยแพร่ตลอดอายุแพ็กเกจ</p>
      </header>

      <form action={updateMembershipOffer} className="space-y-6 rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,27,61,0.035)] sm:p-7">
        {missingPaymentSettings.length > 0 && (
          <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            เซิร์ฟเวอร์ที่กำลังรันเว็บยังไม่เห็นค่า {missingPaymentSettings.join(" และ ")} กรุณาตั้งค่าในสภาพแวดล้อมนี้แล้วรีสตาร์ตแอปก่อนเปิดรับชำระเงิน
          </p>
        )}
        {unavailable && (
          <div role="alert" className="rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-bold">{needsSetup ? "ระบบแพ็กเกจสมาชิกยังไม่พร้อมใช้งาน" : "โหลดแพ็กเกจสมาชิกไม่สำเร็จ"}</p>
            <p className="mt-1">{needsSetup ? "กรุณาติดตั้งฐานข้อมูลแพ็กเกจสมาชิกให้เรียบร้อย แล้วกลับมาตั้งราคาและเปิดขาย" : "กรุณาลองโหลดหน้านี้ใหม่อีกครั้ง ยังไม่มีการเปลี่ยนแปลงแพ็กเกจ"}</p>
            <Link href="/dashboard/admin/membership" className="mt-3 inline-flex font-bold underline">โหลดข้อมูลใหม่</Link>
          </div>
        )}
        {saved && !unavailable && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">บันทึกแพ็กเกจเรียบร้อยแล้ว</p>}
        {saveError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {saveError === "price" ? "กรุณากำหนดราคาทุกแพ็กเกจเป็น 0–1,000,000 บาท (มากกว่า 0 บาทเมื่อเปิดขาย) และราคาปกติรายปีต้องไม่น้อยกว่าราคาขาย" : "บันทึกไม่สำเร็จ กรุณาลองใหม่"}
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { name: "monthlyPrice", label: "รายเดือน (บาท)", value: offer?.monthly_price },
            { name: "annualPrice", label: "รายปี ราคาขาย (บาท)", value: offer?.annual_price },
            { name: "annualRegularPrice", label: "รายปี ราคาปกติ (บาท)", value: offer?.annual_regular_price },
          ].map((price) => (
            <label key={price.name} className="block">
              <span className="text-sm font-bold text-[#0F1B3D]">{price.label}</span>
              <input
                name={price.name}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                disabled={unavailable}
                defaultValue={price.value ?? ""}
                className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3157D5]"
              />
            </label>
          ))}
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
          <input
            name="enabled"
            type="checkbox"
            disabled={unavailable}
            defaultChecked={offer?.enabled ?? false}
            className="mt-1 h-4 w-4 accent-[#3157D5]"
          />
          <span>
            <span className="block text-sm font-bold text-[#0F1B3D]">เปิดขายแพ็กเกจ</span>
            <span className="mt-1 block text-xs text-slate-500">เมื่อนำเครื่องหมายออก นักเรียนจะไม่สามารถเริ่มชำระค่าสมาชิกใหม่ได้</span>
          </span>
        </label>
        <button type="submit" disabled={unavailable} className="rounded-xl bg-[#3157D5] px-5 py-3 text-sm font-bold text-white hover:bg-[#2446b8] disabled:cursor-not-allowed disabled:opacity-50">
          บันทึกแพ็กเกจ
        </button>
      </form>
    </div>
  );
}
