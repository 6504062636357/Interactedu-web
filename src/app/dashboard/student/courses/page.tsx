// app/dashboard/student/courses/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface EnrolledCourse {
  id: string;
  title: string;
  cover_image_url: string | null;
}

interface EnrollmentRow {
  id: string;
  course_id: string;
  courses: EnrolledCourse;
}

interface LessonRef {
  id: string;
  order_index: number;
}

interface ModuleWithLessons {
  id: string;
  course_id: string;
  order_index: number;
  lessons: LessonRef[];
}

interface TrackingRow {
  lesson_id: string;
  lesson_status: string | null;
  enrollment_id: string;
}

interface CourseCardData {
  enrollmentId: string;
  courseId: string;
  title: string;
  coverImageUrl: string | null;
  progress: number;
  href: string;
}

function ProgressCard({ course }: { course: CourseCardData }): ReactElement {
  const isDone = course.progress === 100;
  return (
    <Link
      href={course.href}
      className="group rounded-2xl border border-[#0F1B3D]/[0.06] overflow-hidden hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)] transition-shadow bg-white"
    >
      <div className="relative h-36 bg-gradient-to-br from-[#0F1B3D] to-[#182852]">
        {course.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.coverImageUrl}
            alt={course.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <div className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M8 6.5v11l9-5.5-9-5.5z" fill="#0F1B3D" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-4">
        <p className="text-[14.5px] font-bold text-[#0F1B3D] group-hover:text-[#FF5A3C] transition-colors line-clamp-2 mb-3">
          {course.title}
        </p>
        <p className="text-[12.5px] text-[#0F1B3D]/50 font-medium mb-1.5">
          {isDone ? "เรียนจบแล้ว" : `เรียนไปแล้ว ${course.progress}%`}
        </p>
        <div className="h-1.5 w-full bg-[#0F1B3D]/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-[#FF5A3C]"}`}
            style={{ width: `${course.progress}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

export default async function MyCoursesPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("enrollments")
    .select("id, course_id, courses(id, title, cover_image_url)")
    .eq("student_id", user!.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const enrollments = (data ?? []) as unknown as EnrollmentRow[];
  const courseIds = enrollments.map((e) => e.course_id);

  const cards: CourseCardData[] = [];

  if (courseIds.length > 0) {
    const { data: modulesData } = await supabase
      .from("modules")
      .select("id, course_id, order_index, lessons(id, order_index)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true });

    const { data: trackingData } = await supabase
      .from("scorm_tracking")
      .select("lesson_id, lesson_status, enrollment_id")
      .in(
        "enrollment_id",
        enrollments.map((e) => e.id)
      );

    const modulesByCourse = new Map<string, ModuleWithLessons[]>();
    for (const m of (modulesData ?? []) as ModuleWithLessons[]) {
      const list = modulesByCourse.get(m.course_id) ?? [];
      list.push(m);
      modulesByCourse.set(m.course_id, list);
    }

    const trackingByLesson = new Map<string, TrackingRow>();
    for (const t of (trackingData ?? []) as TrackingRow[]) {
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

      // บทเรียนถัดไปที่ยังไม่จบ -> ถ้าจบหมดแล้วกลับไปบทแรก, ถ้ายังไม่มีบทเรียนเลยไปหน้ารายละเอียดคอร์สแทน
      const nextLesson = allLessons.find((l) => {
        const s = trackingByLesson.get(l.id)?.lesson_status;
        return s !== "completed" && s !== "passed";
      });
      const targetLessonId = nextLesson?.id ?? allLessons[0]?.id ?? null;

      cards.push({
        enrollmentId: e.id,
        courseId: e.course_id,
        title: e.courses.title,
        coverImageUrl: e.courses.cover_image_url,
        progress,
        href: targetLessonId
          ? `/play/${e.course_id}/${targetLessonId}`
          : `/dashboard/student/courses/${e.course_id}`,
      });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M8 6.5v11l9-5.5-9-5.5z" stroke="#0F1B3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">คอร์สของฉัน</h1>
      </div>

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((course) => (
            <ProgressCard key={course.enrollmentId} course={course} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีคอร์สที่ลงทะเบียน</p>
        </div>
      )}
    </div>
  );
}