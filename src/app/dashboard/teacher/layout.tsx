// app/dashboard/teacher/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/teacher", label: "ภาพรวม", icon: "🏠", exact: true },
  { href: "/dashboard/teacher/courses", label: "คอร์สทั้งหมด", icon: "📚" },
  { href: "/dashboard/teacher/analytics", label: "วิเคราะห์ข้อมูล", icon: "📊" },
  { href: "/dashboard/teacher/students", label: "นักเรียน", icon: "👥" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

export default function TeacherLayout({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row">
        <aside className="lg:w-56 shrink-0 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-slate-100 bg-white px-4 py-5 lg:py-8">
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 flex items-center gap-2.5 text-[13.5px] font-semibold px-3.5 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
                    active
                      ? "bg-blue-950 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 px-5 py-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}