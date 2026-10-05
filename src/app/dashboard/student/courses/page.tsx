import { getLearningCourseStatus, isCourseInLibrary, loadLearningEnrollments, type LearningEnrollment, type LearningCourseStatus } from "@/lib/courses/learning-enrollment";
import { loadSavedCourseEnrollments } from "@/lib/courses/course-library";
// app/dashboard/student/courses/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeStudentProgress, type StudentProgressLesson } from "@/lib/courses/student-progress";
import { formatCourseVideoDuration, formatStudyTime } from "@/lib/courses/study-time";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_COURSE_COVER_URL } from "@/lib/constants/course-cover";
import { formatRemainingAccess } from "@/lib/courses/access-expiry";

interface EnrolledCourse {
  id: string;
  title: string;
  cover_image_url: string | null;
}

interface EnrollmentRow extends LearningEnrollment {
  id: string;
  course_id: string;
  access_expires_at: string | null;
  courses: EnrolledCourse;
}

interface LessonRef extends StudentProgressLesson {
  order_index: number;
  is_published: boolean;
  video_duration_seconds: number | null;
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
  completed_scos: string[] | null;
}

interface CourseCardData {
  enrollmentId: string;
  courseId: string;
  title: string;
  coverImageUrl: string | null;
  progress: number;
  certified: boolean;
  href: string;
  studySeconds: number | null;
  videoSeconds: number;
  accessExpiresAt: string | null;
  status: LearningCourseStatus;
}

function ProgressCard({ course }: { course: CourseCardData }): ReactElement {
  const isDone = course.status === "completed";
  const waiting = course.status === "not_started";
  return (
    <div
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#0F1B3D]/[0.06] bg-white transition-shadow hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)]"
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
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[14.5px] font-bold text-[#0F1B3D] group-hover:text-[#FF5A3C] transition-colors line-clamp-2 mb-3">
          {course.title}
        </p>
        <p className="text-[12.5px] text-[#0F1B3D]/50 font-medium mb-1.5">
          {waiting ? "ยังไม่เริ่มเรียน" : isDone ? "เรียนครบทุกบทแล้ว" : `เรียนไปแล้ว ${course.progress}%`}
        </p>
        {!waiting && <div className="h-1.5 w-full bg-[#0F1B3D]/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-[#FF5A3C]"}`}
            style={{ width: `${course.progress}%` }}
          />
        </div>}
        <div className="mt-3 space-y-1 text-[11.5px] text-slate-500">
          {!waiting && <p>เรียนแล้ว {course.studySeconds === null ? "—" : formatStudyTime(course.studySeconds)}</p>}
          <p>ความยาวคลิปรวม {formatCourseVideoDuration(course.videoSeconds) ?? "ยังไม่ระบุ"}</p>
        </div>
        {course.accessExpiresAt && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            {formatRemainingAccess(course.accessExpiresAt)} · สิทธิ์เรียนถึง {new Date(course.accessExpiresAt).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" })}
          </p>
        )}
        <Link href={course.href} className="mt-auto self-end pt-3 text-right text-xs font-bold text-[#3157D5]">
          ดูรายละเอียดและบทเรียน
        </Link>
        <Link href={`${course.href}?start=1`} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#3157D5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2">
          {waiting ? "เริ่มเรียน" : isDone ? "ทบทวนบทเรียน" : "เรียนต่อ"}
        </Link>
      </div>
    </div>
  );
}

export default async function MyCoursesPage({ searchParams }: { searchParams?: Promise<{ status?: string }> } = {}): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/dashboard/student/courses");

  const [{ data, error: enrollmentError }, library, filters] = await Promise.all([
    loadLearningEnrollments((includeStart) => supabase
    .from("enrollments")
    .select(`membership_order_id, ${includeStart ? "learning_started_at, " : ""}scorm_tracking(lesson_id, last_accessed, video_completed, lesson_status, completed_scos, cmi_data), student_study_time(total_seconds), id, course_id, access_expires_at, courses(id, title, cover_image_url)`)
    .eq("student_id", user.id)
    .eq("status", "approved")
    .or(`access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })),
    loadSavedCourseEnrollments(supabase, user.id),
    searchParams ?? Promise.resolve({ status: undefined }),
  ]);

  const enrollments = ((data ?? []) as unknown as EnrollmentRow[]).filter((row) => isCourseInLibrary(row, library.enrollmentIds));
  const courseIds = enrollments.map((e) => e.course_id);
  const studyTimeResult = enrollments.length
    ? await supabase.from("student_study_time").select("enrollment_id, total_seconds").in("enrollment_id", enrollments.map((e) => e.id))
    : { data: [], error: null };
  const studyTimeByEnrollment = new Map(
    (studyTimeResult.data ?? []).map((row) => [row.enrollment_id, Number(row.total_seconds) || 0]),
  );

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
      .select("id, course_id, order_index, lessons(id, order_index, is_published, video_duration_seconds, scorm_source, scorm_manifest)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true });

    const { data: trackingData } = await supabase
      .from("scorm_tracking")
      .select("lesson_id, lesson_status, video_completed, enrollment_id, completed_scos")
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

      const { percent: progress, allComplete } = summarizeStudentProgress(allLessons, ((trackingData ?? []) as TrackingRow[]).filter((row) => row.enrollment_id === e.id));

      cards.push({
        enrollmentId: e.id,
        courseId: e.course_id,
        title: e.courses.title,
        coverImageUrl: e.courses.cover_image_url,
        progress,
        certified: certifiedCourseIds.has(e.course_id),
        href: `/dashboard/student/courses/${e.course_id}`,
        studySeconds: studyTimeResult.error ? null : studyTimeByEnrollment.get(e.id) ?? 0,
        videoSeconds: allLessons.reduce((sum, lesson) => sum + (lesson.video_duration_seconds ?? 0), 0),
        accessExpiresAt: e.access_expires_at,
        status: getLearningCourseStatus(e, allComplete),
      });
    }
  }

  const tabs: { status: LearningCourseStatus; label: string }[] = [
    { status: "not_started", label: "ยังไม่เริ่ม" },
    { status: "in_progress", label: "กำลังเรียน" },
    { status: "completed", label: "เรียนจบแล้ว" },
  ];
  const defaultStatus = cards.some((course) => course.status === "in_progress") ? "in_progress"
    : cards.some((course) => course.status === "not_started") ? "not_started"
    : cards.length > 0 ? "completed" : "not_started";
  const activeStatus = tabs.find((tab) => tab.status === filters.status)?.status ?? defaultStatus;
  const visibleCards = cards.filter((course) => course.status === activeStatus);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M8 6.5v11l9-5.5-9-5.5z" stroke="#0F1B3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">คอร์สของฉัน</h1>
      </div>

      {(enrollmentError || library.error) && <p role="alert" className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{enrollmentError ? "โหลดคอร์สของฉันไม่สำเร็จ กรุณาลองใหม่ภายหลัง" : library.error}</p>}
      <nav aria-label="สถานะคอร์สของฉัน" className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {tabs.map((tab) => <Link key={tab.status} href={`/dashboard/student/courses?status=${tab.status}`} aria-current={activeStatus === tab.status ? "page" : undefined}
          className={`flex min-h-12 flex-wrap items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] sm:text-sm ${activeStatus === tab.status ? "bg-[#0F1B3D] text-white" : "text-slate-500 hover:bg-slate-50"}`}>
          {tab.label}<span className="rounded-full bg-current/10 px-2 py-0.5">{cards.filter((course) => course.status === tab.status).length}</span>
        </Link>)}
      </nav>
      {visibleCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleCards.map((course) => (
            <ProgressCard key={course.enrollmentId} course={course} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">{activeStatus === "not_started" ? "ยังไม่มีคอร์สที่เก็บไว้เพื่อเรียน" : activeStatus === "in_progress" ? "ยังไม่มีคอร์สที่กำลังเรียน" : "ยังไม่มีคอร์สที่เรียนจบแล้ว"}</p>
          <Link href="/courses" className="mt-4 inline-flex rounded-xl bg-[#3157D5] px-4 py-3 text-sm font-bold text-white">เลือกคอร์สเพื่อเริ่มเรียน</Link>
        </div>
      )}
    </div>
  );
}
