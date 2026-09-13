// app/dashboard/teacher/page.tsx
"use client";

import { useEffect, useState, useCallback, type ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { BarChart3, BookOpen, CheckCircle2, Clock3, Plus, Sparkles, UsersRound, type LucideIcon } from "lucide-react";

const supabase = createClient();

type LessonDraftStatus = "draft" | "pending_review" | "approved" | "rejected";
type CourseStatus = "draft" | "pending" | "published" | "rejected";

interface CourseRow {
  id: string;
  title: string;
  status: CourseStatus;
  price: number;
  category: string | null;
  lessonCount: number;
  studentCount: number;
  latestStatus: LessonDraftStatus | null;
  latestRejectionReason: string | null;
}

const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: "แบบร่าง",
  pending: "รอตรวจสอบ",
  published: "เผยแพร่แล้ว",
  rejected: "ถูกตีกลับ",
};

const STATUS_STYLE: Record<CourseStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending: "bg-amber-50 text-amber-700",
  published: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string | number; detail: string; icon: LucideIcon; tone: string }): ReactElement {
  return (
    <article className="flex min-h-[155px] flex-col justify-between rounded-[20px] border border-slate-200/80 bg-[#F8FAFD] p-4 transition-colors hover:border-slate-300 sm:p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}><Icon size={19} strokeWidth={1.9} aria-hidden="true" /></span>
      <div className="mt-4">
        <p className="text-[12px] font-semibold text-slate-500">{label}</p>
        <p className="mt-0.5 text-[28px] font-extrabold leading-tight tracking-[-0.04em] text-[#0F1B3D] tabular-nums sm:text-[31px]">{typeof value === "number" ? value.toLocaleString("th-TH") : value}</p>
        <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: CourseStatus }): ReactElement {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function CourseRowItem({ course }: { course: CourseRow }): ReactElement {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#3157D5]"><BookOpen size={19} strokeWidth={1.9} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 break-words text-[14px] font-bold leading-snug text-[#0F1B3D]">{course.title}</h3>
          <StatusBadge status={course.status} />
        </div>
        <p className="mt-1.5 text-[12px] text-slate-500">
          {course.lessonCount} บทเรียน · {course.studentCount} นักเรียน · ฿{course.price.toLocaleString("th-TH")}
          {course.category && <> · {course.category}</>}
        </p>
        {course.status === "rejected" && course.latestStatus === "rejected" && course.latestRejectionReason && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-red-700">เหตุผลที่ตีกลับ: {course.latestRejectionReason}</p>
        )}
      </div>
      <Link
        href={`/dashboard/teacher/courses/${course.id}`}
        className="inline-flex min-h-10 shrink-0 items-center justify-center self-start rounded-xl border border-slate-200 px-3.5 text-[12px] font-bold text-[#0F1B3D] transition-colors hover:border-[#3157D5]/30 hover:bg-blue-50 hover:text-[#3157D5] sm:self-auto"
      >
        จัดการคอร์ส
      </Link>
    </div>
  );
}

function EmptyState(): ReactElement {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#3157D5]"><BookOpen size={25} strokeWidth={1.8} aria-hidden="true" /></span>
      <p className="mb-1 text-[15px] font-bold text-[#0F1B3D]">ยังไม่มีคอร์สของคุณ</p>
      <p className="mb-5 max-w-xs text-[13px] leading-relaxed text-slate-500">
        เริ่มสร้างคอร์สแรกของคุณ แล้วส่งขออนุมัติจากแอดมินเพื่อเผยแพร่ลงเว็บ
      </p>
      <Link
        href="/dashboard/teacher/courses/new"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0F1B3D] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D3268]"
      >
        <Plus size={16} aria-hidden="true" /> สร้างคอร์สใหม่
      </Link>
    </div>
  );
}

export default function TeacherDashboardPage(): ReactElement {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoadError("ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      setIsLoading(false);
      return;
    }

    const { data: courseRows, error: courseError } = await supabase
      .from("courses")
      .select("id, title, price, status, category")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (courseError) {
      setLoadError(courseError.message);
      setIsLoading(false);
      return;
    }

    const baseCourses = courseRows ?? [];
    const courseIds = baseCourses.map((c) => c.id);

    if (courseIds.length === 0) {
      setCourses([]);
      setStudentCount(0);
      setIsLoading(false);
      return;
    }

    const [lessonsRes, enrollmentsRes] = await Promise.all([
      supabase
        .from("lessons")
        .select("id, course_id, lesson_drafts(status, rejection_reason, created_at)")
        .in("course_id", courseIds),
      supabase
        .from("enrollments")
        .select("course_id, status")
        .in("course_id", courseIds)
        .eq("status", "approved"),
    ]);
    if (lessonsRes.error || enrollmentsRes.error) {
      setLoadError("ข้อมูลบทเรียนหรือการลงทะเบียนบางส่วนโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
    const lessonRows = lessonsRes.data;
    const enrollmentData = enrollmentsRes.data;

    const approvedEnrollments = enrollmentData ?? [];

    const rows: CourseRow[] = baseCourses.map((course) => {
      const lessonsForCourse = (lessonRows ?? []).filter((l) => l.course_id === course.id);

      const allDrafts = lessonsForCourse.flatMap(
        (l) =>
          (l.lesson_drafts as unknown as {
            status: LessonDraftStatus;
            rejection_reason: string | null;
            created_at: string;
          }[]) ?? []
      );
      const latest = allDrafts.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

      return {
        id: course.id,
        title: course.title,
        status: course.status as CourseStatus,
        price: course.price,
        category: course.category,
        lessonCount: lessonsForCourse.length,
        studentCount: approvedEnrollments.filter((e) => e.course_id === course.id).length,
        latestStatus: latest?.status ?? null,
        latestRejectionReason: latest?.rejection_reason ?? null,
      };
    });

    setCourses(rows);
    setStudentCount(approvedEnrollments.length);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  const publishedCount = courses.filter((course) => course.status === "published").length;
  const pendingCount = courses.filter((course) => course.status === "pending").length;
  const rejectedCount = courses.filter((course) => course.status === "rejected").length;
  const publishedPercent = courses.length ? Math.round((publishedCount / courses.length) * 100) : 0;
  const recentCourses = courses.slice(0, 6);
  const showPlaceholders = isLoading || (loadError !== null && courses.length === 0);

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(115deg,#0F1B3D_0%,#1B326B_100%)] px-6 py-7 text-white shadow-[0_18px_42px_rgba(15,27,61,0.16)] sm:px-8 sm:py-8" aria-labelledby="teacher-dashboard-heading">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[42px] border-white/[0.05]" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-28 w-28 rounded-full bg-[#3157D5]/30 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFB299]">
            <Sparkles size={14} aria-hidden="true" /> Teacher workspace
          </p>
          <h1 id="teacher-dashboard-heading" className="mt-3 text-[29px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[34px]">ภาพรวมการสอน</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/75 sm:text-[14px]">ติดตามคอร์ส นักเรียน และงานที่ต้องจัดการได้จากที่เดียว</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/dashboard/teacher/courses/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[13px] font-bold text-[#0F1B3D] transition-colors hover:bg-blue-50">
              <Plus size={17} aria-hidden="true" /> สร้างคอร์สใหม่
            </Link>
            <Link href="/dashboard/teacher/courses" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 px-4 text-[13px] font-bold text-white transition-colors hover:bg-white/10">
              คอร์สทั้งหมด
            </Link>
          </div>
        </div>
      </section>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadDashboard()} className="shrink-0 rounded-lg px-2 py-1 font-bold hover:bg-red-100">ลองอีกครั้ง</button>
        </div>
      )}

      <section aria-labelledby="teacher-stats-heading">
        <div className="mb-4">
          <h2 id="teacher-stats-heading" className="text-[17px] font-extrabold text-[#0F1B3D]">ตัวเลขสำคัญ</h2>
          <p className="mt-1 text-[12px] text-slate-500">สถานะคอร์สและการลงทะเบียนของคุณ</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="คอร์สทั้งหมด" value={showPlaceholders ? "—" : courses.length} detail="คอร์สที่คุณสร้าง" icon={BookOpen} tone="bg-blue-50 text-[#3157D5]" />
          <StatCard label="การลงทะเบียน" value={showPlaceholders ? "—" : studentCount} detail="รายการที่อนุมัติแล้ว" icon={UsersRound} tone="bg-violet-50 text-violet-700" />
          <StatCard label="เผยแพร่แล้ว" value={showPlaceholders ? "—" : publishedCount} detail="พร้อมให้นักเรียนเรียน" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
          <StatCard label="รอตรวจสอบ" value={showPlaceholders ? "—" : pendingCount} detail="กำลังรอแอดมินพิจารณา" icon={Clock3} tone="bg-amber-50 text-amber-700" />
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(270px,0.7fr)]">
        <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.035)]" aria-labelledby="recent-courses-heading">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <h2 id="recent-courses-heading" className="text-[17px] font-extrabold text-[#0F1B3D]">คอร์สล่าสุดของฉัน</h2>
              <p className="mt-1 text-[12px] text-slate-500">เรียงตามวันที่สร้างคอร์สล่าสุด</p>
            </div>
            {courses.length > 0 && (
              <Link href="/dashboard/teacher/courses" className="inline-flex shrink-0 items-center rounded-lg px-2 py-1 text-[12px] font-bold text-[#3157D5] hover:bg-blue-50 hover:underline">
                ดูทั้งหมด
              </Link>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-4 px-5 py-6 sm:px-6" aria-label="กำลังโหลดคอร์ส">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-4">
                  <span className="h-11 w-11 rounded-2xl bg-slate-100" />
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3 w-2/3 rounded-full bg-slate-100" />
                    <span className="block h-2.5 w-1/2 rounded-full bg-slate-100" />
                  </span>
                </div>
              ))}
            </div>
          ) : loadError && recentCourses.length === 0 ? (
            <div className="px-5 py-12 text-center text-[13px] text-slate-500">ยังแสดงรายการคอร์สไม่ได้ กรุณาลองใหม่อีกครั้ง</div>
          ) : recentCourses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-slate-100 px-5 sm:px-6">
              {recentCourses.map((course) => <CourseRowItem key={course.id} course={course} />)}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-[22px] border border-blue-100 bg-[#F4F7FE] p-5 sm:p-6" aria-labelledby="follow-up-heading">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#3157D5] shadow-sm">
              <Clock3 size={19} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <h2 id="follow-up-heading" className="mt-4 text-[16px] font-extrabold text-[#0F1B3D]">สิ่งที่ต้องติดตาม</h2>
            {isLoading ? (
              <p className="mt-1.5 text-[12px] text-slate-500">กำลังตรวจสอบสถานะคอร์ส...</p>
            ) : loadError && courses.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-slate-500">ยังตรวจสอบสถานะไม่ได้ กรุณาลองโหลดข้อมูลใหม่</p>
            ) : (
              <>
                <p className="mt-1.5 text-[13px] font-bold text-[#0F1B3D]">
                  {rejectedCount > 0 ? "มีคอร์สที่ต้องแก้ไข" : pendingCount > 0 ? "กำลังรอผลตรวจ" : courses.length === 0 ? "เริ่มจากคอร์สแรกของคุณ" : "คอร์สของคุณพร้อมแล้ว"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                  {rejectedCount > 0
                    ? "ตรวจเหตุผลที่ถูกตีกลับ แล้วปรับเนื้อหาก่อนส่งตรวจอีกครั้ง"
                    : pendingCount > 0
                      ? "ติดตามสถานะคอร์สที่ส่งให้แอดมินตรวจสอบ"
                      : courses.length === 0
                        ? "สร้างเนื้อหาและบทเรียนเพื่อเริ่มสอนนักเรียน"
                        : "ดูความคืบหน้าของนักเรียนในคอร์สของคุณ"}
                </p>
                <Link href={rejectedCount > 0 || pendingCount > 0 ? "/dashboard/teacher/courses" : courses.length === 0 ? "/dashboard/teacher/courses/new" : "/dashboard/teacher/students"} className="mt-4 inline-flex items-center text-[12px] font-bold text-[#3157D5] hover:underline">
                  {rejectedCount > 0 ? "เปิดคอร์สที่ต้องแก้ไข" : pendingCount > 0 ? "ดูสถานะคอร์ส" : courses.length === 0 ? "สร้างคอร์สแรก" : "ดูข้อมูลนักเรียน"}
                </Link>
              </>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,27,61,0.035)] sm:p-6" aria-labelledby="publish-progress-heading">
            <div className="flex items-center gap-2 text-[#3157D5]">
              <BarChart3 size={18} aria-hidden="true" />
              <h2 id="publish-progress-heading" className="text-[14px] font-extrabold text-[#0F1B3D]">ภาพรวมการเผยแพร่</h2>
            </div>
            <p className="mt-4 text-[31px] font-extrabold leading-none tracking-[-0.04em] text-[#0F1B3D] tabular-nums">{showPlaceholders ? "—" : publishedPercent + "%"}</p>
            <p className="mt-2 text-[12px] text-slate-500">เผยแพร่แล้ว {showPlaceholders ? "—" : publishedCount} จาก {showPlaceholders ? "—" : courses.length} คอร์ส</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="สัดส่วนคอร์สที่เผยแพร่" aria-valuenow={showPlaceholders ? 0 : publishedPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#3157D5] transition-[width] duration-300" style={{ width: showPlaceholders ? "0%" : publishedPercent + "%" }} />
            </div>
            <Link href="/dashboard/teacher/analytics" className="mt-5 inline-flex items-center text-[12px] font-bold text-[#3157D5] hover:underline">
              ดูรายงานเต็ม
            </Link>
          </section>

          <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,27,61,0.035)] sm:p-6" aria-labelledby="teacher-shortcuts-heading">
            <h2 id="teacher-shortcuts-heading" className="text-[14px] font-extrabold text-[#0F1B3D]">ทางลัดจัดการงานสอน</h2>
            <div className="mt-3 divide-y divide-slate-100">
              <Link href="/dashboard/teacher/students" className="flex min-h-11 items-center text-[12px] font-semibold text-slate-600 hover:text-[#3157D5]">
                ดูนักเรียน
              </Link>
              <Link href="/dashboard/teacher/question-bank" className="flex min-h-11 items-center text-[12px] font-semibold text-slate-600 hover:text-[#3157D5]">
                จัดการคลังข้อสอบ
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
