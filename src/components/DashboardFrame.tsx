"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import AppBrand from "@/components/AppBrand";

type DashboardRole = "student" | "teacher" | "admin";

interface DashboardFrameProps {
  children: ReactNode;
  sidebar: ReactNode;
  headerActions: ReactNode;
  role: DashboardRole;
  sidebarFooter?: ReactNode;
}

const ROLE_DETAILS: Record<DashboardRole, { label: string; menuLabel: string; heading: string; subtitle: string; brandHref: string }> = {
  student: { label: "พื้นที่การเรียนรู้", menuLabel: "เมนูผู้เรียน", heading: "Student menu", subtitle: "Student workspace", brandHref: "/" },
  teacher: { label: "พื้นที่ผู้สอน", menuLabel: "เมนูผู้สอน", heading: "Teacher workspace", subtitle: "Teacher workspace", brandHref: "/" },
  admin: { label: "พื้นที่ผู้ดูแลระบบ", menuLabel: "เมนูผู้ดูแลระบบ", heading: "การจัดการ", subtitle: "Admin workspace", brandHref: "/dashboard/admin" },
};

export default function DashboardFrame({ children, sidebar, headerActions, role, sidebarFooter }: DashboardFrameProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const details = ROLE_DETAILS[role];
  const mobileMenuId = `dashboard-${role}-mobile-menu`;

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent): void {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <div className="app-canvas min-h-screen w-full text-[#0F1B3D]" data-dashboard-role={role}>
      <header ref={headerRef} className="app-topbar sticky top-0 z-40 xl:ml-72">
        <div className="mx-auto flex h-[68px] w-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:h-[74px] sm:px-5 md:px-6 xl:px-8">
          <div className="min-w-0">
            <div className="w-9 overflow-hidden lg:w-auto xl:hidden">
              <AppBrand href={details.brandHref} compact />
            </div>
            <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-500 xl:inline-flex">
              {details.label}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-[#3157D5]/20 hover:text-[#3157D5] xl:hidden"
              aria-expanded={menuOpen}
              aria-controls={mobileMenuId}
              aria-label={`${menuOpen ? "ปิด" : "เปิด"}${details.menuLabel}`}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5" onClick={() => setMenuOpen(false)}>
              {headerActions}
            </div>
          </div>
        </div>
        {menuOpen && (
          <div
            id={mobileMenuId}
            className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-slate-100 bg-white px-3 py-4 sm:max-h-[calc(100dvh-74px)] sm:px-5 xl:hidden"
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest("a")) setMenuOpen(false);
            }}
          >
            {sidebar}
          </div>
        )}
      </header>

      <aside data-dashboard-sidebar className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col overflow-y-auto border-r border-slate-200/70 bg-white/90 px-5 py-6 shadow-[10px_0_40px_rgba(15,27,61,0.035)] backdrop-blur-xl xl:flex">
        <div className="mb-9 px-1">
          <AppBrand href={details.brandHref} subtitle={details.subtitle} />
        </div>
        <p className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">{details.heading}</p>
        {sidebar}
        {sidebarFooter && <div className="mt-auto pt-6">{sidebarFooter}</div>}
      </aside>

      <main className={`min-w-0 xl:pl-72 ${role === "admin" ? "admin-workspace" : ""}`}>
        <div className="mx-auto w-full max-w-[1600px] min-w-0 px-3 py-4 sm:px-5 sm:py-6 md:px-6 xl:px-8 xl:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
