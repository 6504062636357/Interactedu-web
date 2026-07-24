// app/dashboard/student/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface EnrolledCourse {
  id: string;
  title: string;
}

interface EnrollmentRow {
  id: string;
  course_id: string;
  courses: EnrolledCourse;
}

interface LessonRef {
  id: string;
  order_index: number;
  title: string;
}

interface ModuleWithLessons {
  id: string;
  order_index: number;
  lessons: LessonRef[];
}

interface TrackingRow {
  lesson_id: string;
  lesson_status: string | null;
}

interface CourseCardData {
  courseId: string;
  title: string;
  progress: number;
  nextLessonLabel: string;
  href: string;
}

export default async function StudentDashboardPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayFirstName =
    ((user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "ผู้ใช้").split(
      " "
    )[0];

  const { data: enrollmentData } = await supabase
    .from("enrollments")
    .select("id, course_id, courses(id, title)")
    .eq("student_id", user!.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const enrollments = (enrollmentData ?? []) as unknown as EnrollmentRow[];
  const courseIds = enrollments.map((e) => e.course_id);

  const cards: CourseCardData[] = [];
  let completedCourseCount = 0;

  if (courseIds.length > 0) {
    const { data: modulesData } = await supabase
      .from("modules")
      .select("id, course_id, order_index, lessons(id, order_index, title)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true });

    const { data: trackingData } = await supabase
      .from("scorm_tracking")
      .select("lesson_id, lesson_status, enrollment_id")
      .in(
        "enrollment_id",
        enrollments.map((e) => e.id)
      );

    const modulesByCourse = new Map<string, (ModuleWithLessons & { course_id: string })[]>();
    for (const m of (modulesData ?? []) as (ModuleWithLessons & { course_id: string })[]) {
      const list = modulesByCourse.get(m.course_id) ?? [];
      list.push(m);
      modulesByCourse.set(m.course_id, list);
    }

    const trackingByLesson = new Map<string, TrackingRow>();
    for (const t of (trackingData ?? []) as (TrackingRow & { enrollment_id: string })[]) {
      trackingByLesson.set(t.lesson_id, t);
    }

    for (const e of enrollments) {
      const modules = [...(modulesByCourse.get(e.course_id) ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      );

      const allLessons = modules.flatMap((m) =>
        [...(m.lessons ?? [])].sort((a, b) => a.order_index - b.order_index)
      );

      const totalLessons = allLessons.length;
      const completedLessons = allLessons.filter((l) => {
        const s = trackingByLesson.get(l.id)?.lesson_status;
        return s === "completed" || s === "passed";
      }).length;

      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      if (progress === 100 && totalLessons > 0) completedCourseCount += 1;

      const nextLesson = allLessons.find((l) => {
        const s = trackingByLesson.get(l.id)?.lesson_status;
        return s !== "completed" && s !== "passed";
      });

      const firstLessonId = allLessons[0]?.id ?? null;

      cards.push({
        courseId: e.course_id,
        title: e.courses.title,
        progress,
        nextLessonLabel:
          totalLessons === 0
            ? "ยังไม่มีบทเรียน"
            : nextLesson
              ? nextLesson.title
              : "เรียนจบแล้ว",
        href: firstLessonId
          ? `/play/${e.course_id}/${nextLesson?.id ?? firstLessonId}`
          : `/dashboard/student/courses/${e.course_id}`,
      });
    }
  }

  // TODO: ยังไม่ทราบว่าตาราง certificates ใช้ schema แบบไหน ใส่ 0 ไว้ก่อน — ถ้ามีตารางจริงบอกชื่อ column มาแก้ query ให้ได้
  const certificateCount = 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold text-blue-950 tracking-[-0.01em]">
          สวัสดี, {displayFirstName} 👋
        </h1>
        <p className="mt-1.5 text-[14.5px] text-slate-500">นี่คือภาพรวมการเรียนของคุณวันนี้</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="คอร์สที่ลงทะเบียน" value={enrollments.length} />
        <StatCard label="คอร์สที่เรียนจบ" value={completedCourseCount} />
        <StatCard label="ใบรับรองที่ได้รับ" value={certificateCount} />
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[16px] font-bold text-slate-900">คอร์สที่กำลังเรียน</h2>
          <Link href="/dashboard/student/courses" className="text-[13px] font-semibold text-blue-950 hover:underline">
            ดูทั้งหมด
          </Link>
        </div>

        {cards.length === 0 ? (
          <p className="text-[13.5px] text-slate-400 py-8 text-center">ยังไม่มีคอร์สที่ลงทะเบียน</p>
        ) : (
          <div>
            {cards.map((course) => (
              <CourseProgressRow key={course.courseId} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }): ReactElement {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-4">
      <p className="text-[13px] text-slate-500 mb-1">{label}</p>
      <p className="text-[24px] font-bold text-blue-950">{value}</p>
    </div>
  );
}

function CourseProgressRow({ course }: { course: CourseCardData }): ReactElement {
  const isDone = course.progress === 100;
  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-100 last:border-0">
      <div className="w-11 h-11 rounded-lg bg-white flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="#1e293b" strokeWidth="1.5" />
          <path d="M8 9H16M8 13H13" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-900 truncate">{course.title}</p>
        <div className="h-1.5 w-full bg-white rounded-full overflow-hidden mt-2">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${course.progress}%` }}
          />
        </div>
      </div>

      <div className="text-right shrink-0 flex items-center gap-4">
        <div>
          <p className={`text-[13px] font-semibold ${isDone ? "text-emerald-600" : "text-blue-600"}`}>
            {course.progress}%
          </p>
          <p className="text-[12px] text-slate-400 mt-0.5">{course.nextLessonLabel}</p>
        </div>

        <Link
          href={course.href}
          className="bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {isDone ? "ทบทวน" : "เข้าเรียน"}
        </Link>
      </div>
    </div>
  );
}