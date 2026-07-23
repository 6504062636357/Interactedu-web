import LogoutButton from "@/components/LogoutButton";
import { createClient } from "@/utils/supabase/server";
import type { ReactElement } from "react";
import CourseApprovalRow from "@/app/dashboard/admin/CourseApprovalRow";

// ============================================================
// Types
// ============================================================
type ProfileRole = "student" | "teacher" | "admin";

type RecentUser = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  created_at: string;
};

type PendingCourseRow = {
  id: string;
  title: string;
  created_at: string;
  instructor: { full_name: string | null } | { full_name: string | null }[] | null;
};

const sidebarLinks = [
  { label: "ภาพรวมระบบ", active: true, href: "/dashboard/admin" },
  { label: "จัดการผู้ใช้", active: false, href: "/dashboard/admin/users" },
  { label: "จัดการคอร์ส", active: false, href: "/dashboard/admin/courses" },
  { label: "รายงาน", active: false, href: "/dashboard/admin/reports" },
  { label: "ตั้งค่าระบบ", active: false, href: "/dashboard/admin/settings" },
];

// ============================================================
// Helpers
// ============================================================
function relativeTimeThai(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  return `${months} เดือนที่แล้ว`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function extractInstructorName(
  instructor: PendingCourseRow["instructor"]
): string {
  if (!instructor) return "ไม่ทราบชื่อ";
  if (Array.isArray(instructor)) return instructor[0]?.full_name ?? "ไม่ทราบชื่อ";
  return instructor.full_name ?? "ไม่ทราบชื่อ";
}

// ============================================================
// UI atoms
// ============================================================
import Link from "next/link";

function SidebarLink({ label, active, href }: { label: string; active: boolean; href: string }): ReactElement {
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
function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: ReactElement;
}): ReactElement {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-[13px] text-slate-500 mb-1">{label}</p>
        <p className="text-[24px] font-bold text-blue-950 tabular-nums">{value}</p>
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
    </div>
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
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full ${map[role] ?? "bg-slate-100 text-slate-700"}`}>
      {labelMap[role] ?? role}
    </span>
  );
}

// AvatarDot component
function AvatarDot({ name, role }: { name: string | null; role: ProfileRole }): ReactElement {
  const ring: Record<ProfileRole, string> = {
    student: "bg-blue-100 text-blue-700",
    teacher: "bg-violet-100 text-violet-700",
    admin: "bg-slate-200 text-slate-700",
  };
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center text-[12.5px] font-bold shrink-0 ${ring[role]}`}
    >
      {initials(name)}
    </div>
  );
}

function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className="py-10 text-center">
      <p className="text-[13px] text-slate-400">{message}</p>
    </div>
  );
}

// ============================================================
// Page (Server Component — fetches live data from Supabase)
// ============================================================
export default async function AdminDashboardPage(): Promise<ReactElement> {
  const supabase = await createClient();

  const [
    totalUsersRes,
    totalStudentsRes,
    totalTeachersRes,
    totalCoursesRes,
    pendingCoursesCountRes,
    recentUsersRes,
    pendingCoursesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "teacher"),
    supabase.from("courses").select("*", { count: "exact", head: true }),
    supabase
      .from("courses")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("courses")
      .select("id, title, created_at, instructor:profiles!courses_instructor_id_fkey(full_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  const stats = {
    totalUsers: totalUsersRes.count ?? 0,
    totalStudents: totalStudentsRes.count ?? 0,
    totalTeachers: totalTeachersRes.count ?? 0,
    totalCourses: totalCoursesRes.count ?? 0,
    pendingCourses: pendingCoursesCountRes.count ?? 0,
  };

  const recentUsers = (recentUsersRes.data ?? []) as RecentUser[];
  const pendingCourses = ((pendingCoursesRes.data ?? []) as PendingCourseRow[]).map((c) => ({
    id: c.id,
    title: c.title,
    instructorName: extractInstructorName(c.instructor),
    createdAt: c.created_at,
  }));

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
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold text-blue-950 tracking-[-0.01em]">
              ภาพรวมระบบ
            </h1>
            <p className="mt-1.5 text-[14.5px] text-slate-500">
              สถานะผู้ใช้และคอร์สทั้งหมดบนแพลตฟอร์ม
            </p>
          </div>
          {stats.pendingCourses > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              มี {stats.pendingCourses} คอร์สรอตรวจสอบ
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="ผู้ใช้ทั้งหมด"
            value={stats.totalUsers}
            accent="bg-slate-100 text-slate-600"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M17 8a3 3 0 0 1 3.6 2.9c0 1.2-.7 2.1-1.6 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            }
          />
          <StatCard
            label="นักเรียน"
            value={stats.totalStudents}
            accent="bg-blue-50 text-blue-600"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 4L21 8.5L12 13L3 8.5L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M7 11v4.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            }
          />
          <StatCard
            label="ครูผู้สอน"
            value={stats.totalTeachers}
            accent="bg-violet-50 text-violet-600"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 19.5V6a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M6 17h12v3H7a2 2 0 0 1-2-2v-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9 8h6M9 11h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            }
          />
          <StatCard
            label="คอร์สทั้งหมด"
            value={stats.totalCourses}
            accent="bg-emerald-50 text-emerald-600"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 9.5h16M9 5v4.5" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            }
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent users */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-bold text-slate-900">ผู้ใช้ใหม่ล่าสุด</h2>
              <a href="#" className="text-[13px] font-semibold text-blue-950 hover:underline">
                ดูทั้งหมด
              </a>
            </div>
            <div>
              {recentUsers.length === 0 ? (
                <EmptyState message="ยังไม่มีผู้ใช้ใหม่" />
              ) : (
                recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-3.5 border-b border-slate-100 last:border-0">
                    <AvatarDot name={u.full_name} role={u.role} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-slate-900 truncate">
                        {u.full_name ?? "ไม่ระบุชื่อ"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <RoleBadge role={u.role} />
                      <p className="text-[11.5px] text-slate-400 mt-1">
                        {relativeTimeThai(u.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending course approvals */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-bold text-slate-900">คอร์สรออนุมัติ</h2>
              <span className="text-[11.5px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                {stats.pendingCourses} รายการ
              </span>
            </div>
            <div>
              {pendingCourses.length === 0 ? (
                <EmptyState message="ไม่มีคอร์สรอตรวจสอบตอนนี้" />
              ) : (
                pendingCourses.map((c) => <CourseApprovalRow key={c.id} course={c} />)
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}