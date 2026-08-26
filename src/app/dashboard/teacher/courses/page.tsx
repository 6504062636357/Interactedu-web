// app/dashboard/teacher/courses/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo, type ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

type LessonDraftStatus = "draft" | "pending_review" | "approved" | "rejected";
type StatusFilter = "all" | LessonDraftStatus;

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

function StatusBadge({ status }: { status: LessonDraftStatus }): ReactElement {
  return (
    <span className={`inline-flex items-center text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function TeacherCoursesPage(): ReactElement {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadCourses = useCallback(async (): Promise<void> => {
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
      setIsLoading(false);
      return;
    }

    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("id, course_id, lesson_drafts(status, rejection_reason, created_at)")
      .in("course_id", courseIds);

    const { data: enrollmentRows } = await supabase
      .from("enrollments")
      .select("course_id, status")
      .in("course_id", courseIds)
      .eq("status", "approved");

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

      const studentCount = (enrollmentRows ?? []).filter((e) => e.course_id === course.id).length;

      return {
        id: course.id,
        title: course.title,
        price: course.price,
        lessonCount: lessonsForCourse.length,
        studentCount,
        latestStatus: latest?.status ?? null,
        latestRejectionReason: latest?.rejection_reason ?? null,
      };
    });

    setCourses(rows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCourses();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadCourses]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesSearch = course.title.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || course.latestStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [courses, searchTerm, statusFilter]);

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "approved", label: "เผยแพร่แล้ว" },
    { value: "pending_review", label: "รอตรวจสอบ" },
    { value: "draft", label: "แบบร่าง" },
    { value: "rejected", label: "ถูกตีกลับ" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-blue-950 tracking-[-0.01em]">คอร์สทั้งหมด</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500">
            {isLoading ? "กำลังโหลด..." : `${filteredCourses.length} จาก ${courses.length} คอร์ส`}
          </p>
        </div>
        <Link
          href="/dashboard/teacher/courses/new"
          className="inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-blue-950 hover:bg-blue-900 px-4 py-2.5 rounded-lg transition-colors"
        >
          + สร้างคอร์สใหม่
        </Link>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="ค้นหาคอร์ส..."
          className="flex-1 text-[13.5px] px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-950/20"
        />
        <div className="flex gap-2 overflow-x-auto">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`shrink-0 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg border transition-colors ${
                statusFilter === opt.value
                  ? "bg-blue-950 text-white border-blue-950"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p className="text-[13px] font-medium text-red-600 leading-snug">{loadError}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-[13.5px] text-slate-400 py-10 text-center">กำลังโหลด...</p>
      ) : filteredCourses.length === 0 ? (
        <p className="text-[13.5px] text-slate-400 py-10 text-center">ไม่พบคอร์สที่ตรงกับเงื่อนไข</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-[14.5px] font-semibold text-slate-900 leading-snug">{course.title}</p>
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
                href={`/dashboard/teacher/courses/${course.id}`}
                className="mt-auto inline-flex items-center justify-center text-[12.5px] font-semibold text-blue-950 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                เปิดพื้นที่จัดการคอร์ส
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
