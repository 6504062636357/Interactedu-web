"use client";

import {
  Award,
  ChevronRight,
  CreditCard,
  Gauge,
  GraduationCap,
  Heart,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

const NAV_ITEMS: Array<{ label: string; href: string; icon: LucideIcon; exact?: boolean }> = [
  { label: "ภาพรวม", href: "/dashboard/student", icon: Gauge, exact: true },
  { label: "โปรไฟล์", href: "/dashboard/student/profile", icon: UserRound },
  { label: "คอร์สของฉัน", href: "/dashboard/student/courses", icon: GraduationCap },
  { label: "ใบประกาศฯ", href: "/dashboard/student/certificates", icon: Award },
  { label: "คอร์สโปรด", href: "/dashboard/student/favorites", icon: Heart },
  { label: "การชำระเงิน", href: "/dashboard/student/billing", icon: CreditCard },
  { label: "การตั้งค่า", href: "/dashboard/student/settings", icon: Settings },
];

export default function DashboardSidebar(): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="app-nav-surface flex gap-1.5 overflow-x-auto p-2 lg:sticky lg:top-[102px] lg:flex-col lg:overflow-visible lg:p-3" aria-label="เมนูผู้เรียน">
      <div className="hidden px-3 pb-2 pt-1 lg:block">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Student menu</p>
      </div>
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-[12px] font-bold transition-all duration-200 lg:w-full lg:py-3 ${
              active
                ? "bg-[linear-gradient(135deg,#0F1B3D,#1D3268)] text-white shadow-[0_8px_20px_rgba(15,27,61,0.16)]"
                : "text-slate-500 hover:bg-slate-100/80 hover:text-[#0F1B3D]"
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${active ? "bg-white/10 text-[#FF8B73]" : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#3157D5]"}`}>
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="whitespace-nowrap lg:flex-1">{item.label}</span>
            <ChevronRight className={`hidden transition lg:block ${active ? "text-white/50" : "text-slate-300 opacity-0 group-hover:opacity-100"}`} size={14} />
          </Link>
        );
      })}
    </nav>
  );
}
