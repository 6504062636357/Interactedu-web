import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Mail, ShieldAlert } from "lucide-react";
import AppBrand from "@/components/AppBrand";
import LogoutButton from "@/components/LogoutButton";
import { createClient } from "@/utils/supabase/server";

export default async function AccountInactivePage({ searchParams }: { searchParams?: Promise<{ reason?: string }> } = {}) {
  const reason = searchParams ? (await searchParams).reason : undefined;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let archived = !user && reason === "archived";
  if (user) {
    const { data: profile, error } = await supabase.from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (!error && profile?.is_active === true) redirect("/dashboard");
    if (profile?.is_active === false) {
      const { data: archiveState } = await supabase.from("profiles").select("archived_at").eq("id", user.id).maybeSingle();
      archived = Boolean(archiveState?.archived_at);
    }
  }

  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  const contactHref = supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)
    ? `mailto:${supportEmail}?subject=${encodeURIComponent("ขอตรวจสอบสถานะบัญชี Interact Edu")}`
    : null;

  return (
    <main className="app-canvas relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#3157D5]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-[#FFCB47]/15 blur-3xl" />
      <div className="relative w-full max-w-lg">
        <div className="mb-7 flex justify-center"><AppBrand /></div>
        <section className="app-surface rounded-[28px] border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_26px_65px_-28px_rgba(15,27,61,0.28)] sm:px-10 sm:py-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <ShieldAlert size={28} aria-hidden="true" />
          </span>
          <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#3157D5]">สถานะบัญชี</p>
          <h1 className="mt-2 text-balance text-2xl font-extrabold tracking-[-0.03em] text-[#0F1B3D] sm:text-[29px]">{archived ? "บัญชีของคุณถูกปิดการใช้งาน" : "บัญชีของคุณถูกพักการใช้งาน"}</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-slate-600">
            {archived ? "บัญชีนี้ถูกลบออกจากรายชื่อและไม่สามารถเข้าใช้งานระบบได้ หากต้องการตรวจสอบประวัติ กรุณาติดต่อเจ้าหน้าที่" : "ขณะนี้ยังไม่สามารถเข้าแดชบอร์ดหรือใช้สิทธิ์เรียนได้ กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบสถานะบัญชี"}
          </p>
          <div className="mt-6 rounded-2xl border border-blue-100 bg-[#F4F7FF] px-4 py-4 text-left text-sm leading-6 text-slate-600">
            <p className="font-bold text-[#0F1B3D]">เมื่อติดต่อเจ้าหน้าที่</p>
            <p className="mt-1">แจ้งอีเมลที่ใช้สมัคร Interact Edu เพื่อให้ทีมงานตรวจสอบบัญชีได้ถูกต้อง ไม่ต้องส่งรหัสผ่าน</p>
          </div>
          {contactHref ? (
            <a href={contactHref} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1B3D] px-5 text-sm font-bold text-white transition hover:bg-[#3157D5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2">
              <Mail size={17} aria-hidden="true" /> ติดต่อเจ้าหน้าที่
            </a>
          ) : (
            <p className="mt-5 text-xs leading-5 text-slate-500">โปรดติดต่อเจ้าหน้าที่ผ่านช่องทางที่หน่วยงานของคุณแจ้งไว้</p>
          )}
          <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
            {user ? (
              <div className="rounded-xl bg-[#0F1B3D] px-2"><LogoutButton /></div>
            ) : (
              <Link href="/login" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-[#3157D5] hover:bg-blue-50">
                <ArrowLeft size={16} aria-hidden="true" /> กลับหน้าเข้าสู่ระบบ
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
