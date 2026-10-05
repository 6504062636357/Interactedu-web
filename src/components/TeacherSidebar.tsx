"use client";

import {
  BarChart3,
  BookOpen,
  CircleHelp,
  Gauge,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import DashboardNavLink from "@/components/DashboardNavLink";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

const NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = [
  { href: "/dashboard/teacher", label: "ภาพรวม", icon: Gauge, exact: true },
  { href: "/dashboard/teacher/courses", label: "คอร์สทั้งหมด", icon: BookOpen },
  { href: "/dashboard/teacher/question-bank", label: "คลังข้อสอบ", icon: CircleHelp },
  { href: "/dashboard/teacher/analytics", label: "วิเคราะห์ข้อมูล", icon: BarChart3 },
  { href: "/dashboard/teacher/students", label: "นักเรียน", icon: Users },
  { href: "/dashboard/teacher/profile", label: "โปรไฟล์", icon: UserRound },
  { href: "/dashboard/teacher/settings", label: "การตั้งค่า", icon: Settings },
];

export default function TeacherSidebar(): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="space-y-1" aria-label="เมนูผู้สอน">
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <DashboardNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={active}
            icon={<Icon size={18} strokeWidth={1.8} aria-hidden="true" />}
            showChevron
          />
        );
      })}
    </nav>
  );
}
