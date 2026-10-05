"use client";

import {
  Award,
  Banknote,
  Gauge,
  GraduationCap,
  Heart,
  Settings,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import DashboardNavLink from "@/components/DashboardNavLink";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

const NAV_ITEMS: Array<{ label: string; href: string; icon: LucideIcon; exact?: boolean }> = [
  { label: "ภาพรวม", href: "/dashboard/student", icon: Gauge, exact: true },
  { label: "โปรไฟล์", href: "/dashboard/student/profile", icon: UserRound },
  { label: "คอร์สของฉัน", href: "/dashboard/student/courses", icon: GraduationCap },
  { label: "Interact Edu Plus", href: "/membership", icon: Sparkles },
  { label: "ใบประกาศฯ", href: "/dashboard/student/certificates", icon: Award },
  { label: "คอร์สโปรด", href: "/dashboard/student/favorites", icon: Heart },
  { label: "การชำระเงิน", href: "/dashboard/student/billing", icon: Banknote },
  { label: "การตั้งค่า", href: "/dashboard/student/settings", icon: Settings },
];

export default function DashboardSidebar(): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="space-y-1" aria-label="เมนูผู้เรียน">
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
