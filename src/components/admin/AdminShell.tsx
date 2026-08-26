"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactElement, type ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import AppBrand from "@/components/AppBrand";

type AdminShellProps = {
  children: ReactNode;
  displayName: string;
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

export default function AdminShell({ children, displayName, pendingCourses }: AdminShellProps): ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
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
      label: "ใบรับรอง",
      href: "/dashboard/admin/certificates",
      match: (path) => path.startsWith("/dashboard/admin/certificates"),
      icon: <CertificateIcon />,
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
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[12.5px] font-bold transition-all ${
              active
                ? "bg-[linear-gradient(135deg,#0F1B3D,#1D3268)] text-white shadow-[0_8px_20px_rgba(15,27,61,0.16)]"
                : "text-slate-500 hover:bg-slate-100 hover:text-[#0F1B3D]"
            }`}
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? "bg-white/10 text-[#FF8B73]" : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#3157D5]"}`}>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {typeof item.badge === "number" && item.badge > 0 && (
              <span className="min-w-6 rounded-full bg-amber-100 px-2 py-0.5 text-center text-[11px] font-bold text-amber-700">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="app-canvas min-h-screen text-[#0F1B3D]">
      <div className="fixed right-[4.5rem] top-3 z-50 lg:right-8 lg:top-6">
        <NotificationBell />
      </div>
      <header className="app-topbar sticky top-0 z-40 lg:hidden">
        <div className="flex h-16 items-center justify-between px-5">
          <AppBrand href="/dashboard/admin" compact />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm"
              aria-expanded={menuOpen}
              aria-label="เปิดเมนูผู้ดูแลระบบ"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && <div className="border-t border-slate-100 px-4 py-4">{nav}</div>}
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200/70 bg-white/90 px-5 py-6 shadow-[10px_0_40px_rgba(15,27,61,0.035)] backdrop-blur-xl lg:flex">
        <div className="mb-9 px-1">
          <AppBrand href="/dashboard/admin" subtitle="Admin workspace" />
        </div>

        <p className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">การจัดการ</p>
        {nav}

        <div className="mt-auto rounded-[20px] bg-[linear-gradient(145deg,#0F1B3D,#1B326B)] p-4 text-white shadow-[0_14px_30px_rgba(15,27,61,0.16)]">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[13px] font-extrabold text-white">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-white">{displayName}</p>
              <p className="text-[10.5px] text-white/50">ผู้ดูแลระบบ</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="admin-workspace min-w-0 lg:pl-72">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7 lg:px-9 lg:py-9">
          <div className="animate-fade-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
