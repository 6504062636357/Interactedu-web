import LogoutButton from "@/components/LogoutButton";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import type { ReactElement } from "react";

type ProfileRole = "student" | "teacher" | "admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  created_at: string;
};

const sidebarLinks = [
  { label: "ภาพรวมระบบ", href: "/dashboard/admin", active: false },
  { label: "จัดการผู้ใช้", href: "/dashboard/admin/users", active: true },
  { label: "จัดการคอร์ส", href: "/dashboard/admin/courses", active: false },
  { label: "รายงาน", href: "/dashboard/admin/reports", active: false },
  { label: "ตั้งค่าระบบ", href: "/dashboard/admin/settings", active: false },
];

const roleFilters: { label: string; value: ProfileRole | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: "นักเรียน", value: "student" },
  { label: "ครูผู้สอน", value: "teacher" },
  { label: "แอดมิน", value: "admin" },
];

function formatDateThai(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function SidebarLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}): ReactElement {
  return (
    <Link
      href={href}
      className={`block px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
        active ? "bg-blue-950 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
}

function RoleBadge({ role }: { role: string }): ReactElement {
  const map: Record<string, string> = {
    student: "bg-blue-50 text-blue-700",
    teacher: "bg-violet-50 text-violet-700",
    admin: "bg-slate-100 text-slate-700",
  };
  const labelMap: Record<string, string> = {
    student: "นักเรียน",
    teacher: "ครูผู้สอน",
    admin: "แอดมิน",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full ${
        map[role] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {labelMap[role] ?? role}
    </span>
  );
}

function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className="py-16 text-center">
      <p className="text-[13px] text-slate-400">{message}</p>
    </div>
  );
}

export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<ReactElement> {
  const { role } = await searchParams;
  const activeRole: ProfileRole | "all" =
    role === "student" || role === "teacher" || role === "admin" ? role : "all";

  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (activeRole !== "all") {
    query = query.eq("role", activeRole);
  }

  const { data, error } = await query;
  const users = (data ?? []) as ProfileRow[];

  return (
    <div className="min-h-screen w-full bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-slate-100 px-4 py-6">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[15.5px] font-bold text-blue-950">Interact Edu</span>
        </div>
        <nav className="space-y-1">
          {sidebarLinks.map((l) => (
            <SidebarLink key={l.label} {...l} />
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-[13px] font-bold text-slate-700">
              A
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-slate-800 truncate">Admin</p>
              <p className="text-[12px] text-slate-400">Administrator</p>
            </div>
          </div>
          <div className="mt-3 px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10 max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard/admin"
              className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-600 mb-2 inline-block"
            >
              ← กลับภาพรวมระบบ
            </Link>
            <h1 className="text-[26px] font-bold text-blue-950 tracking-[-0.01em]">
              จัดการผู้ใช้
            </h1>
            <p className="mt-1.5 text-[14.5px] text-slate-500">
              ผู้ใช้ทั้งหมด {users.length} คน
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            โหลดข้อมูลผู้ใช้ไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง
          </div>
        )}

        {/* Role filter tabs */}
        <div className="flex items-center gap-2 mb-5">
          {roleFilters.map((f) => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/dashboard/admin/users" : `/dashboard/admin/users?role=${f.value}`}
              className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
                activeRole === f.value
                  ? "bg-blue-950 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          {users.length === 0 ? (
            <EmptyState message="ไม่พบผู้ใช้ในกลุ่มนี้" />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[12px] font-semibold text-slate-400 px-6 py-3">ผู้ใช้</th>
                  <th className="text-left text-[12px] font-semibold text-slate-400 px-6 py-3">บทบาท</th>
                  <th className="text-left text-[12px] font-semibold text-slate-400 px-6 py-3">เข้าร่วมเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-[12.5px] font-bold text-slate-600 shrink-0">
                          {initials(u.full_name)}
                        </div>
                        <p className="text-[13.5px] font-semibold text-slate-900">
                          {u.full_name ?? "ไม่ระบุชื่อ"}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-slate-500">
                      {formatDateThai(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}