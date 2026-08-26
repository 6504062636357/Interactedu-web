// components/ProfileDropdown.tsx
"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type UserRole = "student" | "teacher" | "admin";

interface ProfileDropdownProps {
  displayName: string;
  role: UserRole;
}

interface MenuItem {
  label: string;
  href: string;
  icon: ReactElement;
}

function IconUser(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C">
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlay(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C">
      <path d="M8 6.5v11l9-5.5-9-5.5zM3 5h2M3 19h2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAward(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C">
      <circle cx="12" cy="8" r="5" strokeWidth="1.8" />
      <path d="M8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHeart(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C">
      <path
        d="M12 20s-7-4.4-9.5-9C.9 7.6 3 4.5 6.2 4.5c2 0 3.3 1 5.8 3.5 2.5-2.5 3.8-3.5 5.8-3.5C21 4.5 23.1 7.6 21.5 11c-2.5 4.6-9.5 9-9.5 9z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCard(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C">
      <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="1.8" />
      <path d="M3 10h18" strokeWidth="1.8" />
    </svg>
  );
}

function IconSettings(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C">
      <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1A2 2 0 117.2 3.2l.1.1a1.7 1.7 0 001.9.3H9.2a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLogout(): ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M15 17l5-5-5-5M20 12H9M13 5H6a2 2 0 00-2 2v10a2 2 0 002 2h7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getMenuItems(role: UserRole): MenuItem[] {
  if (role === "teacher") {
    return [
      { label: "โปรไฟล์", href: "/dashboard/teacher/profile", icon: <IconUser /> },
      { label: "การตั้งค่า", href: "/dashboard/teacher/settings", icon: <IconSettings /> },
    ];
  }

  if (role === "admin") {
    return [
      { label: "โปรไฟล์", href: "/profile", icon: <IconUser /> },
      { label: "แดชบอร์ดแอดมิน", href: "/dashboard/admin", icon: <IconPlay /> },
      { label: "บทเรียนรอตรวจสอบ", href: "/admin/review", icon: <IconAward /> },
      { label: "การตั้งค่า", href: "/settings", icon: <IconSettings /> },
    ];
  }

  // student (default)
  return [
    { label: "โปรไฟล์", href: "/dashboard/student/profile", icon: <IconUser /> },
    { label: "คอร์สของฉัน", href: "/dashboard/student/courses", icon: <IconPlay /> },
    { label: "ใบประกาศฯ", href: "/dashboard/student/certificates", icon: <IconAward /> },
    { label: "คอร์สโปรดของฉัน", href: "/dashboard/student/favorites", icon: <IconHeart /> },
    { label: "การชำระเงิน", href: "/dashboard/student/billing", icon: <IconCard /> },
    { label: "การตั้งค่า", href: "/dashboard/student/settings", icon: <IconSettings /> },
  ];
}

export default function ProfileDropdown({ displayName, role }: ProfileDropdownProps): ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const menuItems = getMenuItems(role);
  const roleLabel = role === "teacher" ? "ผู้สอน" : role === "admin" ? "ผู้ดูแลระบบ" : "ผู้เรียน";

  useEffect(() => {
    const onClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleLogout = async (): Promise<void> => {
    await supabase.auth.signOut();
    setOpen(false);
    router.refresh();
    router.push("/");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 py-1.5 pl-1.5 pr-2 text-[13px] font-bold text-[#0F1B3D] shadow-[0_5px_18px_rgba(15,27,61,0.06)] transition-all hover:border-[#3157D5]/20 hover:shadow-[0_8px_24px_rgba(15,27,61,0.1)] sm:pr-3.5"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#FF5A3C,#FF826B)] text-[13px] font-extrabold text-white shadow-sm">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-36 truncate sm:inline">{displayName}</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          className={`hidden text-slate-400 transition-transform duration-150 sm:block ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2.5 w-64 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-16px_rgba(15,27,61,0.28)] backdrop-blur-xl">
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3.5">
            <p className="truncate text-[13px] font-extrabold text-[#0F1B3D]">{displayName}</p>
            <p className="mt-0.5 text-[10.5px] font-medium text-slate-400">บัญชี{roleLabel}</p>
          </div>
          <div className="p-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#0F1B3D]"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <div className="my-1.5 border-t border-slate-100" />
          <button
            type="button"
            onClick={handleLogout}
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold text-[#FF5A3C] transition-colors hover:bg-[#FF5A3C]/[0.07]"
          >
            <IconLogout />
            ออกจากระบบ
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
