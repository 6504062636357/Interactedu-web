// components/TeacherSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

const NAV_ITEMS = [
  { href: "/dashboard/teacher", label: "ภาพรวม", icon: "home" },
  { href: "/dashboard/teacher/courses", label: "คอร์สทั้งหมด", icon: "book" },
  { href: "/dashboard/teacher/analytics", label: "วิเคราะห์ข้อมูล", icon: "chart" },
  { href: "/dashboard/teacher/students", label: "นักเรียน", icon: "users" },
] as const;

function Icon({ name }: { name: string }): ReactElement {
  const paths: Record<string, ReactElement> = {
    home: (
      <path d="M4 11L12 4L20 11V19C20 19.6 19.6 20 19 20H5C4.4 20 4 19.6 4 19V11Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    ),
    book: (
      <path d="M4 5H10C11.1 5 12 5.9 12 7V20C12 19 11 18.5 10 18.5H4V5Z M20 5H14C12.9 5 12 5.9 12 7V20C12 19 13 18.5 14 18.5H20V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    ),
    chart: (
      <path d="M5 20V10 M12 20V4 M19 20V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    ),
    users: (
      <path d="M9 12C10.7 12 12 10.7 12 9C12 7.3 10.7 6 9 6C7.3 6 6 7.3 6 9C6 10.7 7.3 12 9 12ZM3 20C3 16.7 5.7 15 9 15C12.3 15 15 16.7 15 20 M15 8C16.3 8 17.5 9 17.5 10.5 M17 15C19.3 15.3 21 16.8 21 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    ),
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {paths[name]}
    </svg>
  );
}

export default function TeacherSidebar(): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="bg-white rounded-3xl border border-[#0F1B3D]/[0.06] p-3 flex flex-col gap-1 sticky top-28">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[13.5px] font-medium transition-colors ${
              active ? "bg-[#FF5A3C]/10 text-[#FF5A3C]" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}