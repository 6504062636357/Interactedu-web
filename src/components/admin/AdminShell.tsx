"use client";

import { Banknote, Settings, UserRound } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import ProfileDropdown from "@/components/ProfileDropdown";
import DashboardFrame from "@/components/DashboardFrame";
import DashboardNavLink from "@/components/DashboardNavLink";

type AdminShellProps = {
  children: ReactNode;
  displayName: string;
  avatarUrl?: string | null;
  pendingCourses: number;
};

type NavItem = {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
  icon: ReactElement;
  badge?: number;
};

function OverviewIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CoursesIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ReviewIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8M9 3v3M15 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="5" width="14" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.5 13 2 2 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17 14c2.1.6 3.5 2.2 3.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CertificateIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.5 13-1 8 4.5-2.5L16.5 21l-1-8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileIcon(): ReactElement {
  return <UserRound size={18} strokeWidth={1.8} aria-hidden="true" />;
}

function SettingsIcon(): ReactElement {
  return <Settings size={18} strokeWidth={1.8} aria-hidden="true" />;
}

export default function AdminShell({ children, displayName, avatarUrl, pendingCourses }: AdminShellProps): ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pendingFilterActive =
    pathname === "/dashboard/admin/courses" && searchParams.get("status") === "pending";

  const navItems: NavItem[] = [
    {
      label: "ภาพรวมระบบ",
      href: "/dashboard/admin",
      match: (path) => path === "/dashboard/admin",
      icon: <OverviewIcon />,
    },
    {
      label: "คิวรอตรวจสอบ",
      href: "/dashboard/admin/courses?status=pending",
      match: () => false,
      icon: <ReviewIcon />,
      badge: pendingCourses,
    },
    {
      label: "จัดการคอร์ส",
      href: "/dashboard/admin/courses",
      match: (path) => path.startsWith("/dashboard/admin/courses"),
      icon: <CoursesIcon />,
    },
    {
      label: "จัดการผู้ใช้",
      href: "/dashboard/admin/users",
      match: (path) => path.startsWith("/dashboard/admin/users"),
      icon: <UsersIcon />,
    },
    {
      label: "แพ็กเกจรายเดือน",
      href: "/dashboard/admin/membership",
      match: (path) => path.startsWith("/dashboard/admin/membership"),
      icon: <Banknote size={18} strokeWidth={1.8} aria-hidden="true" />,
    },
    {
      label: "ใบรับรอง",
      href: "/dashboard/admin/certificates",
      match: (path) => path.startsWith("/dashboard/admin/certificates"),
      icon: <CertificateIcon />,
    },
    {
      label: "โปรไฟล์ของฉัน",
      href: "/dashboard/admin/profile",
      match: (path) => path === "/dashboard/admin/profile",
      icon: <ProfileIcon />,
    },
    {
      label: "การตั้งค่า",
      href: "/dashboard/admin/settings",
      match: (path) => path === "/dashboard/admin/settings",
      icon: <SettingsIcon />,
    },
  ];

  const nav = (
    <nav className="space-y-1" aria-label="เมนูผู้ดูแลระบบ">
      {navItems.map((item) => {
        const active =
          item.label === "คิวรอตรวจสอบ"
            ? pendingFilterActive
            : item.label === "จัดการคอร์ส"
              ? item.match(pathname) && !pendingFilterActive
              : item.match(pathname);
        return (
          <DashboardNavLink
            key={item.label}
            href={item.href}
            label={item.label}
            active={active}
            icon={item.icon}
            badge={item.badge}
          />
        );
      })}
    </nav>
  );

  const accountPanel = (
    <div className="rounded-[20px] bg-[linear-gradient(145deg,#0F1B3D,#1B326B)] p-4 text-white shadow-[0_14px_30px_rgba(15,27,61,0.16)]">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[13px] font-extrabold text-white">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-white">{displayName}</p>
          <p className="text-[11px] text-white/65">ผู้ดูแลระบบ</p>
        </div>
      </div>
      <div className="border-t border-white/10 pt-2">
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <DashboardFrame
      role="admin"
      sidebar={nav}
      sidebarFooter={accountPanel}
      headerActions={
        <>
          <p className="mr-1 hidden text-right xl:block">
            <span className="block text-[10px] font-medium text-slate-400">ยินดีต้อนรับ</span>
            <span className="block max-w-40 truncate text-[12px] font-bold text-[#0F1B3D]">{displayName}</span>
          </p>
          <NotificationBell />
          <ProfileDropdown displayName={displayName} avatarUrl={avatarUrl} role="admin" />
        </>
      }
    >
      <div className="animate-fade-up min-w-0">{children}</div>
    </DashboardFrame>
  );
}
