// app/dashboard/student/courses/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeStudentProgress } from "@/lib/courses/student-progress";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_COURSE_COVER_URL } from "@/lib/constants/course-cover";

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
  is_published: boolean;
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
  video_completed: boolean | null;
  enrollment_id: string;
}

interface CourseCardData {
  enrollmentId: string;
  courseId: string;
  title: string;
  coverImageUrl: string | null;
  progress: number;
  certified: boolean;
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={course.coverImageUrl ?? DEFAULT_COURSE_COVER_URL}
          alt={course.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {course.certified && (
          <span className="absolute left-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[10.5px] font-bold text-white shadow-sm">
            ✓ Certified
          </span>
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
          {isDone ? "เรียนครบทุกบทแล้ว" : `เรียนไปแล้ว ${course.progress}%`}
        </p>
        <div className="h-1.5 w-full bg-[#0F1B3D]/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-[#FF5A3C]"}`}
            style={{ width: `${course.progress}%` }}
          />
        </div>
        <p className="mt-3 text-xs font-bold text-[#3157D5]">ดูรายละเอียดและบทเรียน →</p>
      </div>
    </Link>
  );
}

export default async function MyCoursesPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/dashboard/student/courses");

  const { data } = await supabase
    .from("enrollments")
    .select("id, course_id, courses(id, title, cover_image_url)")
    .eq("student_id", user.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const enrollments = (data ?? []) as unknown as EnrollmentRow[];
  const courseIds = enrollments.map((e) => e.course_id);

  const { data: certificateRows } = courseIds.length
    ? await supabase
        .from("certificates")
        .select("course_id")
        .eq("user_id", user.id)
        .eq("status", "issued")
        .in("course_id", courseIds)
    : { data: [] };
  const certifiedCourseIds = new Set((certificateRows ?? []).map((row) => row.course_id as string));

  const cards: CourseCardData[] = [];

  if (courseIds.length > 0) {
    const { data: modulesData } = await supabase
      .from("modules")
      .select("id, course_id, order_index, lessons(id, order_index, is_published)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true });

    const { data: trackingData } = await supabase
      .from("scorm_tracking")
      .select("lesson_id, lesson_status, video_completed, enrollment_id")
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

    for (const e of enrollments) {
      // e.courses เป็น null ได้ถ้า RLS ของตาราง courses บล็อกแถวนี้
      // (เช่น คอร์สถูกแก้ไขจน status ไม่ใช่ published ชั่วคราว) ข้ามไปเพื่อไม่ให้หน้าพัง
      if (!e.courses) continue;

      const modules = [...(modulesByCourse.get(e.course_id) ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      );
      const allLessons = modules.flatMap((m) =>
        [...(m.lessons ?? [])].filter((lesson) => lesson.is_published).sort((a, b) => a.order_index - b.order_index)
      );

      const { percent: progress } = summarizeStudentProgress(allLessons, ((trackingData ?? []) as TrackingRow[]).filter((row) => row.enrollment_id === e.id));

      cards.push({
        enrollmentId: e.id,
        courseId: e.course_id,
        title: e.courses.title,
        coverImageUrl: e.courses.cover_image_url,
        progress,
        certified: certifiedCourseIds.has(e.course_id),
        href: `/dashboard/student/courses/${e.course_id}`,
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
