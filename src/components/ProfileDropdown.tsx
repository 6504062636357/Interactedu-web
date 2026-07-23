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
      { label: "โปรไฟล์", href: "/profile", icon: <IconUser /> },
      { label: "พื้นที่ครูผู้สอน", href: "/dashboard/teacher", icon: <IconPlay /> },
      { label: "การตั้งค่า", href: "/settings", icon: <IconSettings /> },
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
    { label: "โปรไฟล์", href: "/profile", icon: <IconUser /> },
    { label: "คอร์สของฉัน", href: "/dashboard/student", icon: <IconPlay /> },
    { label: "ใบประกาศฯ", href: "/certificates", icon: <IconAward /> },
    { label: "คอร์สโปรดของฉัน", href: "/favorites", icon: <IconHeart /> },
    { label: "การชำระเงิน", href: "/billing", icon: <IconCard /> },
    { label: "การตั้งค่า", href: "/settings", icon: <IconSettings /> },
  ];
}

export default function ProfileDropdown({ displayName, role }: ProfileDropdownProps): ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const menuItems = getMenuItems(role);

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
        className="inline-flex items-center gap-2 text-[14px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] pl-2 pr-3.5 py-2 rounded-full transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-[#FF5A3C] flex items-center justify-center text-[13px] font-extrabold">
          {displayName.charAt(0).toUpperCase()}
        </span>
        {displayName}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] shadow-[0_20px_45px_-15px_rgba(15,27,61,0.3)] py-2 z-50">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#0F1B3D]/80 hover:bg-[#0F1B3D]/[0.04] hover:text-[#0F1B3D] transition-colors"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <div className="my-1.5 border-t border-[#0F1B3D]/[0.06]" />
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#FF5A3C] hover:bg-[#FF5A3C]/[0.06] transition-colors"
          >
            <IconLogout />
            ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}