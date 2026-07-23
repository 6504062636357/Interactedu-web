// app/dashboard/teacher/page.tsx
"use client";

import { useEffect, useState, useCallback, type ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

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
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};

function StatCard({ label, value, icon, badge }: { label: string; value: string | number; icon: ReactElement; badge?: boolean }): ReactElement {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${badge ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-950"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] text-slate-500 mb-0.5">{label}</p>
        <p className="text-[22px] font-bold text-blue-950 leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LessonDraftStatus }): ReactElement {
  return (
    <span className={`inline-flex items-center text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
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

    // ใช้ courses.created_by ตรงๆ (ตรงกับ logic ที่ createCourse action ใช้จริง)
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
    void loadDashboard();
  }, [loadDashboard]);

  const publishedCount = courses.filter((c) => c.latestStatus === "approved").length;
  const pendingCount = courses.filter((c) => c.latestStatus === "pending_review").length;
  const recentCourses = courses.slice(0, 6);

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-blue-950 tracking-[-0.01em]">ภาพรวม</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500">ภาพรวมคอร์สและนักเรียนของคุณ</p>
        </div>
        <Link
          href="/dashboard/teacher/courses/new"
          className="inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-blue-950 hover:bg-blue-900 px-4 py-2.5 rounded-lg transition-colors"
        >
          + สร้างคอร์สใหม่
        </Link>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p className="text-[13px] font-medium text-red-600 leading-snug">{loadError}</p>
        </div>
      )}

      {/* B. Stat cards แถวเดียว 4 อัน */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="คอร์สทั้งหมด" value={isLoading ? "—" : courses.length} icon={<span>📚</span>} />
        <StatCard label="นักเรียนทั้งหมด" value={isLoading ? "—" : studentCount} icon={<span>👥</span>} />
        <StatCard label="เผยแพร่แล้ว" value={isLoading ? "—" : publishedCount} icon={<span>✅</span>} />
        <StatCard label="รอการตรวจสอบ" value={isLoading ? "—" : pendingCount} icon={<span>⏳</span>} badge={pendingCount > 0} />
      </div>

      {/* C. Grid 70/30 */}
      <div className="grid grid-cols-1 lg:grid-cols-[70%_1fr] gap-6">
        {/* ฝั่งซ้าย: คอร์สล่าสุด */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold text-slate-900">คอร์สล่าสุดของฉัน</h2>
            {courses.length > 0 && (
              <Link href="/dashboard/teacher/courses" className="text-[12.5px] font-semibold text-blue-950 hover:underline">
                ดูคอร์สทั้งหมด →
              </Link>
            )}
          </div>

          {isLoading ? (
            <p className="text-[13.5px] text-slate-400 py-6">กำลังโหลด...</p>
          ) : recentCourses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recentCourses.map((course) => (
                <div key={course.id} className="border border-slate-100 rounded-xl p-4 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-[14px] font-semibold text-slate-900 leading-snug truncate">{course.title}</p>
                    {course.latestStatus && <StatusBadge status={course.latestStatus} />}
                  </div>
                  <p className="text-[12.5px] text-slate-500 mb-1">
                    {course.lessonCount} บทเรียน · {course.studentCount} นักเรียน
                  </p>
                  <p className="text-[12.5px] text-slate-500 mb-4">฿{course.price.toLocaleString()}</p>
                  {course.latestStatus === "rejected" && course.latestRejectionReason && (
                    <p className="text-[12px] text-red-500 mb-3">เหตุผล: {course.latestRejectionReason}</p>
                  )}
                  <Link
                    href={`/dashboard/teacher/courses/${course.id}/lessons/new`}
                    className="mt-auto inline-flex items-center justify-center text-[12.5px] font-semibold text-blue-950 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    จัดการบทเรียน
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ฝั่งขวา: analytics preview + quick links */}
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-5">
            <h3 className="text-[14.5px] font-bold text-slate-900 mb-1">สรุปการวิเคราะห์</h3>
            <p className="text-[12.5px] text-slate-500 mb-4">
              คอร์สเผยแพร่แล้ว {isLoading ? "—" : publishedCount} จาก {isLoading ? "—" : courses.length} คอร์ส
            </p>
            <Link
              href="/dashboard/teacher/analytics"
              className="inline-flex items-center justify-center w-full text-[12.5px] font-semibold text-blue-950 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              ดูรายงานเต็ม
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-5">
            <h3 className="text-[14.5px] font-bold text-slate-900 mb-3">เมนูลัด</h3>
            <div className="flex flex-col gap-2">
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
    </div>
  );
}