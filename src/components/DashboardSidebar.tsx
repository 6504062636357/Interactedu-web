"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

const navItems = [
  { label: "โปรไฟล์", href: "/dashboard/student/profile", icon: "user" },
  { label: "คอร์สของฉัน", href: "/dashboard/student/courses", icon: "play" },
  { label: "ใบประกาศฯ", href: "/dashboard/student/certificates", icon: "award" },
  { label: "คอร์สโปรดของฉัน", href: "/dashboard/student/favorites", icon: "heart" },
  { label: "การชำระเงิน", href: "/dashboard/student/billing", icon: "card" },
  { label: "การตั้งค่า", href: "/dashboard/student/settings", icon: "settings" },
] as const;

function Icon({ name }: { name: string }): ReactElement {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" };
  switch (name) {
    case "user":
      return (
        <svg {...common}>
          <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="M8 6.5v11l9-5.5-9-5.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "award":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path
            d="M12 20s-7-4.4-9.5-9C.9 7.6 3 4.5 6.2 4.5c2 0 3.3 1 5.8 3.5 2.5-2.5 3.8-3.5 5.8-3.5C21 4.5 23.1 7.6 21.5 11c-2.5 4.6-9.5 9-9.5 9z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1A2 2 0 117.2 3.2l.1.1a1.7 1.7 0 001.9.3H9.2a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export default function DashboardSidebar(): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="bg-white rounded-3xl border border-[#0F1B3D]/[0.06] p-3 lg:sticky lg:top-28">
      {navItems.map((item) => {
        const active = pathname === item.href;
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
    </nav>
  );
}