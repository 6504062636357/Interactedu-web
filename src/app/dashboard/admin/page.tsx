import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import CourseApprovalRow from "@/app/dashboard/admin/CourseApprovalRow";
import { createClient } from "@/utils/supabase/server";

type ProfileRole = "student" | "teacher" | "admin";

type RecentUser = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  created_at: string;
};

type PendingCourse = {
  id: string;
  title: string;
  created_at: string;
  created_by: string | null;
};

function relativeTimeThai(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string | null): string {
  return name?.trim().charAt(0).toUpperCase() || "?";
}

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: ReactNode }): ReactElement {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D] tabular-nums">{value.toLocaleString("th-TH")}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: ProfileRole }): ReactElement {
  const styles: Record<ProfileRole, string> = {
    student: "bg-blue-50 text-blue-700",
    teacher: "bg-violet-50 text-violet-700",
    admin: "bg-slate-100 text-slate-700",
  };
  const labels: Record<ProfileRole, string> = { student: "นักเรียน", teacher: "ครูผู้สอน", admin: "แอดมิน" };
  return <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${styles[role]}`}>{labels[role]}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">✓</div>
      <p className="text-[13.5px] font-bold text-slate-700">{title}</p>
      <p className="mt-1 text-[12px] text-slate-400">{description}</p>
    </div>
  );
}

export default async function AdminDashboardPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const [usersRes, studentsRes, teachersRes, coursesRes, publishedRes, pendingRes, recentUsersRes, pendingCoursesRes] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
      supabase.from("courses").select("id", { count: "exact", head: true }),
      supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("profiles").select("id, full_name, role, created_at").order("created_at", { ascending: false }).limit(6),
      supabase
        .from("courses")
        .select("id, title, created_at, created_by")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(8),
    ]);

  const pendingCourseRows = (pendingCoursesRes.data ?? []) as PendingCourse[];
  const creatorIds = [...new Set(pendingCourseRows.map((course) => course.created_by).filter((id): id is string => Boolean(id)))];
  const creatorsRes = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [], error: null };
  const creatorNames = new Map((creatorsRes.data ?? []).map((profile) => [profile.id, profile.full_name ?? "ไม่ระบุชื่อ"]));

  const pendingCourses = pendingCourseRows.map((course) => ({
    id: course.id,
    title: course.title,
    instructorName: course.created_by ? creatorNames.get(course.created_by) ?? "ไม่ระบุชื่อ" : "ไม่ระบุชื่อ",
    createdAt: course.created_at,
  }));
  const recentUsers = (recentUsersRes.data ?? []) as RecentUser[];
  const errors = [usersRes.error, studentsRes.error, teachersRes.error, coursesRes.error, publishedRes.error, pendingRes.error, recentUsersRes.error, pendingCoursesRes.error, creatorsRes.error].filter(Boolean);

  const stats = {
    users: usersRes.count ?? 0,
    students: studentsRes.count ?? 0,
    teachers: teachersRes.count ?? 0,
    courses: coursesRes.count ?? 0,
    published: publishedRes.count ?? 0,
    pending: pendingRes.count ?? 0,
  };

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Admin overview</p>
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D] sm:text-[32px]">ภาพรวมระบบ</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">ติดตามผู้ใช้ คอร์ส และงานที่กำลังรอการตรวจสอบ</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admin/users" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50">ดูผู้ใช้</Link>
          <Link href="/dashboard/admin/courses/new" className="rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#192A55]">+ เพิ่มคอร์ส</Link>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] font-medium text-red-700">
          ข้อมูลบางส่วนโหลดไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง หากยังพบปัญหาให้ตรวจสอบสิทธิ์ RLS ของบัญชีแอดมิน
        </div>
      )}

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="ผู้ใช้ทั้งหมด" value={stats.users} tone="bg-slate-100 text-slate-600" icon="◎" />
        <StatCard label="นักเรียน" value={stats.students} tone="bg-blue-50 text-blue-600" icon="◫" />
        <StatCard label="ครูผู้สอน" value={stats.teachers} tone="bg-violet-50 text-violet-600" icon="◇" />
        <StatCard label="คอร์สทั้งหมด" value={stats.courses} tone="bg-emerald-50 text-emerald-600" icon="▤" />
      </div>

      <section className="mb-7 overflow-hidden rounded-2xl bg-[#0F1B3D] text-white shadow-sm">
        <div className="grid gap-5 p-6 sm:grid-cols-[1fr_auto] sm:items-center lg:p-7">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-300">Review queue</p>
            </div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.02em]">มี {stats.pending} คอร์สรอการตรวจสอบ</h2>
            <p className="mt-1 text-[12.5px] text-white/60">ตรวจเนื้อหา แบบทดสอบ และตั้งค่าใบประกาศก่อนเผยแพร่</p>
          </div>
          <Link href="/dashboard/admin/courses?status=pending" className="inline-flex w-fit items-center rounded-xl bg-[#FF6B50] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#F15B40]">
            เปิดคิวตรวจสอบ <span className="ml-2">→</span>
          </Link>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0F1B3D]">คอร์สรอตรวจสอบ</h2>
              <p className="mt-0.5 text-[11.5px] text-slate-400">เรียงจากรายการที่ส่งเข้ามาก่อน</p>
            </div>
            <Link href="/dashboard/admin/courses?status=pending" className="text-[12px] font-bold text-[#3157D5] hover:underline">ดูทั้งหมด</Link>
          </div>
          {pendingCourses.length ? pendingCourses.map((course) => <CourseApprovalRow key={course.id} course={course} />) : <EmptyState title="ไม่มีคอร์สรอตรวจสอบ" description="คอร์สที่ครูส่งเข้ามาจะปรากฏที่นี่" />}
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0F1B3D]">ผู้ใช้ใหม่ล่าสุด</h2>
              <p className="mt-0.5 text-[11.5px] text-slate-400">สมาชิกที่เพิ่งเข้าร่วมระบบ</p>
            </div>
            <Link href="/dashboard/admin/users" className="text-[12px] font-bold text-[#3157D5] hover:underline">ดูทั้งหมด</Link>
          </div>
          {recentUsers.length ? recentUsers.map((user) => (
            <Link
              key={user.id}
              href={`/dashboard/admin/users/${user.id}`}
              className="group flex items-center gap-3 border-b border-slate-100 py-3.5 outline-none transition-colors last:border-0 hover:bg-slate-50 focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[#3157D5]/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">{initials(user.full_name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-slate-800 transition-colors group-hover:text-[#3157D5] group-hover:underline">{user.full_name ?? "ไม่ระบุชื่อ"}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{relativeTimeThai(user.created_at)}</p>
              </div>
              <RoleBadge role={user.role} />
              <span className="text-xs font-bold text-slate-300 transition-colors group-hover:text-[#3157D5]" aria-hidden="true">→</span>
            </Link>
          )) : <EmptyState title="ยังไม่มีผู้ใช้" description="บัญชีใหม่จะแสดงในส่วนนี้" />}
        </section>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4"><p className="text-[11.5px] text-slate-400">คอร์สเผยแพร่แล้ว</p><p className="mt-1 text-[20px] font-extrabold text-emerald-600">{stats.published}</p></div>
        <div className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4"><p className="text-[11.5px] text-slate-400">คอร์สรอตรวจสอบ</p><p className="mt-1 text-[20px] font-extrabold text-amber-600">{stats.pending}</p></div>
        <div className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4"><p className="text-[11.5px] text-slate-400">สัดส่วนคอร์สที่เผยแพร่</p><p className="mt-1 text-[20px] font-extrabold text-[#3157D5]">{stats.courses ? Math.round((stats.published / stats.courses) * 100) : 0}%</p></div>
      </div>
    </div>
  );
}
