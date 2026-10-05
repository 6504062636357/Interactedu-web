import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import DashboardFrame from "@/components/DashboardFrame";
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

export default function DashboardShell({
  children,
  sidebar,
  displayName,
  avatarUrl,
  role,
  plusExpiresAt = null,
}: DashboardShellProps): ReactElement {
  return (
    <DashboardFrame
      role={role}
      sidebar={sidebar}
      headerActions={
        <>
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
        </>
      }
    >
      <div className="app-surface min-h-[520px] min-w-0 p-4 sm:p-6 xl:p-8">
        <div className="animate-fade-up min-w-0">{children}</div>
      </div>
    </DashboardFrame>
  );
}
