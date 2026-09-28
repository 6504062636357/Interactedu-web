import type { ReactElement } from "react";
import Link from "next/link";
import NotificationList from "@/components/notifications/NotificationList";
import AppBrand from "@/components/AppBrand";
import { createClient } from "@/utils/supabase/server";

function dashboardHome(role: string | null | undefined): string {
  if (role === "admin") return "/dashboard/admin";
  if (role === "teacher") return "/dashboard/teacher";
  if (role === "student") return "/dashboard/student";
  return "/";
}

export default async function NotificationsPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const homeHref = dashboardHome(profile?.role);

  return (
    <div className="app-canvas min-h-screen">
      <header className="app-topbar sticky top-0 z-40"><div className="mx-auto flex h-[74px] max-w-5xl items-center px-5 sm:px-7"><AppBrand compact /></div></header>
      <main className="px-5 py-7 sm:px-7 lg:py-10">
        <div className="mx-auto max-w-4xl">
          <Link
            href={homeHref}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#3157D5] shadow-sm transition-colors hover:bg-blue-50"
          >
            <span aria-hidden="true">←</span>
            กลับหน้าหลัก
          </Link>
          <div className="app-surface p-5 sm:p-7 lg:p-9"><NotificationList /></div>
        </div>
      </main>
    </div>
  );
}

