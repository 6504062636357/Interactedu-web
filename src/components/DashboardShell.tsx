import type { ReactElement, ReactNode } from "react";
import AppBrand from "@/components/AppBrand";
import NotificationBell from "@/components/NotificationBell";
import ProfileDropdown from "@/components/ProfileDropdown";

type DashboardRole = "student" | "teacher";

interface DashboardShellProps {
  children: ReactNode;
  sidebar: ReactNode;
  displayName: string;
  role: DashboardRole;
}

const ROLE_LABEL: Record<DashboardRole, string> = {
  student: "พื้นที่การเรียนรู้",
  teacher: "พื้นที่ผู้สอน",
};

export default function DashboardShell({
  children,
  sidebar,
  displayName,
  role,
}: DashboardShellProps): ReactElement {
  return (
    <div className="app-canvas w-full text-[#0F1B3D]">
      <header className="app-topbar sticky top-0 z-50">
        <div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <AppBrand compact />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-[10.5px] font-bold text-slate-500 sm:inline-flex">
              {ROLE_LABEL[role]}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <p className="mr-1 hidden text-right lg:block">
              <span className="block text-[10px] font-medium text-slate-400">ยินดีต้อนรับ</span>
              <span className="block max-w-40 truncate text-[12px] font-bold text-[#0F1B3D]">{displayName}</span>
            </p>
            <NotificationBell />
            <ProfileDropdown displayName={displayName} role={role} />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9">
        <div className="grid items-start gap-5 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-7">
          {sidebar}
          <div className="app-surface min-h-[520px] min-w-0 p-5 sm:p-7 xl:p-9">
            <div className="animate-fade-up">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
