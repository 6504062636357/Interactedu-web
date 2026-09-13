import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ClipboardCheck, GraduationCap, Plus, UsersRound, type LucideIcon } from "lucide-react";
import type { ReactElement } from "react";
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

function StatCard({ label, value, detail, href, icon: Icon, tone }: { label: string; value: number; detail: string; href: string; icon: LucideIcon; tone: string }): ReactElement {
  return (
    <Link href={href} className="group flex min-h-40 flex-col justify-between rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(15,27,61,0.035)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_16px_35px_rgba(15,27,61,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon size={21} strokeWidth={1.9} aria-hidden="true" /></span>
        <ArrowUpRight size={17} className="text-slate-300 transition-colors group-hover:text-[#3157D5]" aria-hidden="true" />
      </div>
      <div className="mt-4">
        <p className="text-[13px] font-semibold text-slate-500">{label}</p>
        <p className="mt-0.5 text-[28px] font-extrabold leading-tight tracking-[-0.04em] text-[#0F1B3D] tabular-nums sm:text-[32px]">{value.toLocaleString("th-TH")}</p>
        <p className="mt-1 text-[12px] text-slate-500">{detail}</p>
      </div>
    </Link>
  );
}

function RoleBadge({ role }: { role: ProfileRole }): ReactElement {
  const styles: Record<ProfileRole, string> = {
    student: "bg-blue-50 text-blue-700",
    teacher: "bg-violet-50 text-violet-700",
    admin: "bg-slate-100 text-slate-700",
  };
  const labels: Record<ProfileRole, string> = { student: "นักเรียน", teacher: "ครูผู้สอน", admin: "แอดมิน" };
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[role]}`}>{labels[role]}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-4 py-9 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={23} strokeWidth={1.8} aria-hidden="true" /></span>
      <p className="text-[14px] font-bold text-[#0F1B3D]">{title}</p>
      <p className="mt-1 text-[12px] text-slate-500">{description}</p>
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
        .limit(6),
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
  const publishedPercent = stats.courses ? Math.round((stats.published / stats.courses) * 100) : 0;

  return (
    <div className="space-y-7 lg:space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#3157D5]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B50]" /> Admin workspace
          </p>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.035em] text-[#0F1B3D] sm:text-[34px]">ภาพรวมระบบ</h1>
          <p className="mt-2 text-[14px] text-slate-600">ดูสิ่งที่ต้องจัดการและความเคลื่อนไหวล่าสุดได้ในหน้าเดียว</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/dashboard/admin/users" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-[#0F1B3D] transition-colors hover:border-slate-300 hover:bg-slate-50">
            จัดการผู้ใช้
          </Link>
          <Link href="/dashboard/admin/courses/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F1B3D] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1D3268]">
            <Plus size={17} aria-hidden="true" /> เพิ่มคอร์ส
          </Link>
        </div>
      </header>

      {errors.length > 0 && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
          ข้อมูลบางส่วนโหลดไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง หากยังพบปัญหาให้ตรวจสอบสิทธิ์ RLS ของบัญชีแอดมิน
        </div>
      )}

      <section className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(115deg,#0F1B3D_0%,#1B326B_100%)] text-white shadow-[0_18px_40px_rgba(15,27,61,0.14)]" aria-labelledby="review-queue-heading">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[44px] border-white/[0.04]" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[#3157D5]/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:p-8">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#FFB299]">
              <ClipboardCheck size={23} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFB299]">งานที่ต้องดูแล</p>
              <h2 id="review-queue-heading" className="mt-1.5 text-[22px] font-extrabold leading-snug tracking-[-0.025em] sm:text-[26px]">
                {stats.pending > 0 ? "มีคอร์สรอการตรวจสอบ" : "ไม่มีคอร์สรอตรวจสอบในตอนนี้"}
              </h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/70">
                {stats.pending > 0
                  ? "เปิดดูเนื้อหาและแบบทดสอบของคอร์สที่ส่งเข้ามา ก่อนอนุมัติให้เผยแพร่"
                  : "งานตรวจสอบเรียบร้อยแล้ว คุณสามารถดูคอร์สทั้งหมดหรือจัดการข้อมูลส่วนอื่นต่อได้"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-4 sm:gap-5">
            <div className="flex items-baseline gap-2">
              <span className="text-[52px] font-extrabold leading-none tracking-[-0.06em] tabular-nums sm:text-[60px]">{stats.pending.toLocaleString("th-TH")}</span>
              <span className="text-[13px] font-semibold text-white/65">คอร์ส</span>
            </div>
            <Link href={stats.pending > 0 ? "/dashboard/admin/courses?status=pending" : "/dashboard/admin/courses"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF7056] px-5 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(255,90,60,0.2)] transition-colors hover:bg-[#F15B40]">
              {stats.pending > 0 ? "เปิดคิวตรวจสอบ" : "ดูคอร์สทั้งหมด"} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="overview-stats-heading">
        <div className="mb-4">
          <h2 id="overview-stats-heading" className="text-[17px] font-extrabold text-[#0F1B3D]">สถานะโดยรวม</h2>
          <p className="mt-1 text-[12px] text-slate-500">ตัวเลขล่าสุดของผู้ใช้และคอร์สในระบบ</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="ผู้ใช้ทั้งหมด" value={stats.users} detail="รวมทุกบทบาทในระบบ" href="/dashboard/admin/users" icon={UsersRound} tone="bg-blue-50 text-[#3157D5]" />
          <StatCard label="นักเรียน" value={stats.students} detail="บัญชีผู้เรียน" href="/dashboard/admin/users?role=student" icon={GraduationCap} tone="bg-cyan-50 text-cyan-700" />
          <StatCard label="ครูผู้สอน" value={stats.teachers} detail="บัญชีผู้สอน" href="/dashboard/admin/users?role=teacher" icon={BookOpen} tone="bg-violet-50 text-violet-700" />
          <StatCard label="คอร์สที่เผยแพร่" value={stats.published} detail={"จาก " + stats.courses.toLocaleString("th-TH") + " คอร์สทั้งหมด · " + publishedPercent + "%"} href="/dashboard/admin/courses?status=published" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.035)]" aria-labelledby="pending-courses-heading">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="pending-courses-heading" className="text-[17px] font-extrabold text-[#0F1B3D]">คอร์สรอตรวจสอบ</h2>
                {stats.pending > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">{stats.pending.toLocaleString("th-TH")}</span>}
              </div>
              <p className="mt-1 text-[12px] text-slate-500">เรียงตามวันที่สร้างคอร์สจากเก่าไปใหม่</p>
            </div>
            <Link href="/dashboard/admin/courses?status=pending" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-[#3157D5] hover:bg-blue-50 hover:underline">
              ดูทั้งหมด <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="px-5 sm:px-6">
            {pendingCourses.length ? pendingCourses.map((course) => <CourseApprovalRow key={course.id} course={course} />) : <EmptyState title="ไม่มีคอร์สรอตรวจสอบ" description="คอร์สที่ส่งเข้ามาจะปรากฏในส่วนนี้" />}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.035)]" aria-labelledby="recent-users-heading">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <h2 id="recent-users-heading" className="text-[17px] font-extrabold text-[#0F1B3D]">ผู้ใช้ใหม่ล่าสุด</h2>
              <p className="mt-1 text-[12px] text-slate-500">บัญชีที่เพิ่งเข้าร่วมระบบ</p>
            </div>
            <Link href="/dashboard/admin/users" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-[#3157D5] hover:bg-blue-50 hover:underline">
              ดูทั้งหมด <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="px-5 sm:px-6">
            {recentUsers.length ? recentUsers.map((user) => (
              <Link key={user.id} href={"/dashboard/admin/users/" + user.id} className="group flex min-w-0 items-center gap-3 border-b border-slate-100 py-3.5 transition-colors last:border-0 hover:bg-slate-50 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[14px] font-bold text-slate-600">{initials(user.full_name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[#0F1B3D] group-hover:text-[#3157D5]">{user.full_name ?? "ไม่ระบุชื่อ"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">เข้าร่วม {relativeTimeThai(user.created_at)}</p>
                </div>
                <RoleBadge role={user.role} />
                <ArrowRight size={14} className="hidden shrink-0 text-slate-300 transition-colors group-hover:text-[#3157D5] sm:block" aria-hidden="true" />
              </Link>
            )) : <EmptyState title="ยังไม่มีผู้ใช้" description="บัญชีใหม่จะแสดงในส่วนนี้" />}
          </div>
        </section>
      </div>
    </div>
  );
}
