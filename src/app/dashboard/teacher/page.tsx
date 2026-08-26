// app/dashboard/teacher/page.tsx
"use client";

import { useEffect, useState, useCallback, type ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { BarChart3, BookOpen, CheckCircle, Clock, Plus, Users, type LucideIcon } from "lucide-react";

const supabase = createClient();

type LessonDraftStatus = "draft" | "pending_review" | "approved" | "rejected";

interface CourseRow {
  id: string;
  title: string;
  price: number;
  lessonCount: number;
  studentCount: number;
  latestStatus: LessonDraftStatus | null;
  latestRejectionReason: string | null;
}

const STATUS_LABEL: Record<LessonDraftStatus, string> = {
  draft: "แบบร่าง",
  pending_review: "รอตรวจสอบ",
  approved: "เผยแพร่แล้ว",
  rejected: "ถูกตีกลับ",
};

const STATUS_STYLE: Record<LessonDraftStatus, string> = {
  draft: "bg-slate-100 text-slate-500",
  pending_review: "bg-amber-50 text-amber-600",
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-500",
};

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: LucideIcon; tone: string }): ReactElement {
  return (
    <article className="rounded-[20px] border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(15,27,61,0.045)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10.5px] font-semibold text-slate-400">{label}</p><p className="mt-2 text-[25px] font-black tracking-[-0.04em] text-[#0F1B3D]">{value}</p></div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></span>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: LessonDraftStatus }): ReactElement {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function CourseRowItem({ course }: { course: CourseRow }): ReactElement {
  return (
    <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#3157D5]"><BookOpen size={18} /></div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-extrabold text-[#0F1B3D]">{course.title}</p>
          {course.latestStatus && <StatusBadge status={course.latestStatus} />}
        </div>
        <p className="text-[12px] text-slate-400 mt-1">
          {course.lessonCount} บทเรียน · {course.studentCount} นักเรียน · ฿{course.price.toLocaleString()}
        </p>
        {course.latestStatus === "rejected" && course.latestRejectionReason && (
          <p className="text-[12px] text-red-500 mt-1">เหตุผล: {course.latestRejectionReason}</p>
        )}
      </div>

      <Link
        href={`/dashboard/teacher/courses/${course.id}`}
        className="shrink-0 whitespace-nowrap rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-center text-[11.5px] font-bold text-white shadow-sm transition hover:bg-[#3157D5]"
      >
        จัดการบทเรียน
      </Link>
    </div>
  );
}

function EmptyState(): ReactElement {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="#172554" strokeWidth="1.5" />
          <path d="M12 9V15M9 12H15" stroke="#172554" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[15px] font-semibold text-slate-800 mb-1">ยังไม่มีคอร์สของคุณ</p>
      <p className="text-[13.5px] text-slate-500 mb-6 max-w-xs">
        เริ่มสร้างคอร์สแรกของคุณ แล้วส่งขออนุมัติจากแอดมินเพื่อเผยแพร่ลงเว็บ
      </p>
      <Link
        href="/dashboard/teacher/courses/new"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-white bg-blue-950 hover:bg-blue-900 px-5 py-2.5 rounded-lg transition-colors"
      >
        + สร้างคอร์สใหม่
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
      .select("id, title, price, status")
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

    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("id, course_id, lesson_drafts(status, rejection_reason, created_at)")
      .in("course_id", courseIds);

    const { data: enrollmentData } = await supabase
      .from("enrollments")
      .select("course_id, status")
      .in("course_id", courseIds)
      .eq("status", "approved");

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
        price: course.price,
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

  const publishedCount = courses.filter((c) => c.latestStatus === "approved").length;
  const pendingCount = courses.filter((c) => c.latestStatus === "pending_review").length;
  const recentCourses = courses.slice(0, 6);

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#0F1B3D,#1A326B)] px-6 py-7 text-white shadow-[0_18px_42px_rgba(15,27,61,0.17)] sm:px-8">
        <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full border-[38px] border-white/[0.04]" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-blue-200">Teacher workspace</p>
            <h1 className="mt-2 text-[27px] font-black tracking-[-0.035em] sm:text-[31px]">ภาพรวมการสอน</h1>
            <p className="mt-2 text-[12.5px] text-white/60">จัดการเนื้อหา ติดตามนักเรียน และดูผลลัพธ์ของคอร์สคุณ</p>
          </div>
        <Link
          href="/dashboard/teacher/courses/new"
          className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12px] font-extrabold text-[#0F1B3D] shadow-lg transition hover:-translate-y-0.5"
        >
          <Plus size={15} /> สร้างคอร์สใหม่
        </Link>
        </div>
      </section>

      {loadError && (
        <div role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p className="text-[13px] font-medium text-red-600 leading-snug">{loadError}</p>
        </div>
      )}

      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="คอร์สทั้งหมด" value={isLoading ? "—" : courses.length} icon={BookOpen} tone="bg-blue-50 text-[#3157D5]" />
        <StatCard label="นักเรียนทั้งหมด" value={isLoading ? "—" : studentCount} icon={Users} tone="bg-violet-50 text-violet-600" />
        <StatCard label="เผยแพร่แล้ว" value={isLoading ? "—" : publishedCount} icon={CheckCircle} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="รอตรวจสอบ" value={isLoading ? "—" : pendingCount} icon={Clock} tone="bg-amber-50 text-amber-600" />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.045)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div><h2 className="text-[15px] font-extrabold text-[#0F1B3D]">คอร์สล่าสุดของฉัน</h2><p className="mt-1 text-[10.5px] text-slate-400">รายการที่แก้ไขและเผยแพร่ล่าสุด</p></div>
          {courses.length > 0 && (
            <Link href="/dashboard/teacher/courses" className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-[#0F1B3D] transition hover:bg-blue-50 hover:text-[#3157D5]">
              ดูทั้งหมด
            </Link>
          )}
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-[13px] text-slate-400">กำลังโหลด...</p>
        ) : recentCourses.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-100 px-5 sm:px-6">
            {recentCourses.map((course) => (
              <CourseRowItem key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <div className="rounded-[20px] border border-slate-200/70 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(15,27,61,0.04)]">
          <h3 className="text-[14.5px] font-bold text-slate-900 mb-1">สรุปการวิเคราะห์</h3>
          <p className="text-[12.5px] text-slate-500 mb-4">
            คอร์สเผยแพร่แล้ว {isLoading ? "—" : publishedCount} จาก {isLoading ? "—" : courses.length} คอร์ส
          </p>
          <Link
            href="/dashboard/teacher/analytics"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[11.5px] font-bold text-[#0F1B3D] transition-colors hover:border-[#3157D5]/20 hover:bg-blue-50 hover:text-[#3157D5]"
          >
            <BarChart3 size={14} /> ดูรายงานเต็ม
          </Link>
        </div>

        <div className="rounded-[20px] border border-slate-200/70 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(15,27,61,0.04)]">
          <h3 className="text-[14.5px] font-bold text-slate-900 mb-3">เมนูลัด</h3>
          <div className="flex flex-col gap-1">
            <Link
              href="/dashboard/teacher/students"
              className="text-[13px] font-medium text-slate-700 hover:text-blue-950 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              จัดการนักเรียน
            </Link>
            <Link
              href="/dashboard/teacher/courses"
              className="text-[13px] font-medium text-slate-700 hover:text-blue-950 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              คอร์สทั้งหมด
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
