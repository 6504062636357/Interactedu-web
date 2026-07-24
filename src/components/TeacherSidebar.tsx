// components/TeacherSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

const navItems = [
  { label: "ภาพรวม", href: "/dashboard/teacher", icon: "home" },
  { label: "คอร์สทั้งหมด", href: "/dashboard/teacher/courses", icon: "book" },
  { label: "วิเคราะห์ข้อมูล", href: "/dashboard/teacher/analytics", icon: "chart" },
  { label: "นักเรียน", href: "/dashboard/teacher/students", icon: "users" },
] as const;

function Icon({ name }: { name: string }): ReactElement {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5L12 4L20 10.5V19C20 19.5523 19.5523 20 19 20H15V14H9V20H5C4.44772 20 4 19.5523 4 19V10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 9H16M8 13H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V13M12 20V4M20 20V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 20C3 16.6863 5.68629 14 9 14C12.3137 14 15 16.6863 15 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 8C16.6569 8 18 9.34315 18 11M17 14C19.2091 14 21 16.2417 21 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return <svg {...common} />;
  }
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard/teacher") return pathname === href;
  return pathname.startsWith(href);
}

export default function TeacherSidebar(): ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="bg-white rounded-3xl border border-[#0F1B3D]/[0.06] p-3 lg:sticky lg:top-28 flex flex-col">
      <div className="flex-1">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-bold transition-colors mb-1 last:mb-0 ${
                active ? "bg-[#FF5A3C]/10 text-[#FF5A3C]" : "text-[#0F1B3D]/60 hover:bg-[#0F1B3D]/[0.04] hover:text-[#0F1B3D]"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={isLoggingOut}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-bold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 pt-3 border-t border-[#0F1B3D]/[0.06]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 16L20 12L15 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {isLoggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
      </button>
    </nav>
  );
}