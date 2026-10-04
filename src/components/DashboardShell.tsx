import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import AppBrand from "@/components/AppBrand";
import NotificationBell from "@/components/NotificationBell";
import ProfileDropdown from "@/components/ProfileDropdown";

type DashboardRole = "student" | "teacher";

interface DashboardShellProps {
  children: ReactNode;
  sidebar: ReactNode;
  displayName: string;
  avatarUrl?: string | null;
  role: DashboardRole;
  plusExpiresAt?: string | null;
}

const ROLE_LABEL: Record<DashboardRole, string> = {
  student: "พื้นที่การเรียนรู้",
  teacher: "พื้นที่ผู้สอน",
};

export default function DashboardShell({
  children,
  sidebar,
  displayName,
  avatarUrl,
  role,
  plusExpiresAt = null,
}: DashboardShellProps): ReactElement {
  return (
    <div className="app-canvas w-full text-[#0F1B3D]">
      <header className="app-topbar sticky top-0 z-50">
        <div className="mx-auto flex h-[68px] w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:h-[74px] sm:px-5 md:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <AppBrand compact />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-[10.5px] font-bold text-slate-500 sm:inline-flex">
              {ROLE_LABEL[role]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {role === "student" && (
              <Link
                href="/courses"
                aria-label="ดูคอร์สทั้งหมด"
                title="ดูคอร์สทั้งหมด"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-[13px] font-bold text-[#0F1B3D] shadow-sm transition-colors hover:border-[#3157D5]/30 hover:bg-blue-50 hover:text-[#3157D5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2 sm:px-3.5"
              >
                <BookOpen size={18} aria-hidden="true" />
                <span className="hidden sm:inline">ดูคอร์สทั้งหมด</span>
              </Link>
            )}
            <NotificationBell />
            <ProfileDropdown displayName={displayName} avatarUrl={avatarUrl} role={role} plusExpiresAt={plusExpiresAt} />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1600px] min-w-0 px-3 py-4 sm:px-5 sm:py-6 md:px-6 xl:px-8 xl:py-9">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[clamp(220px,19vw,264px)_minmax(0,1fr)] xl:gap-7">
          {sidebar}
          <div className="app-surface min-h-[520px] min-w-0 p-4 sm:p-6 xl:p-8">
            <div className="animate-fade-up min-w-0">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
