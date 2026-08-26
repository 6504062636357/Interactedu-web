// app/dashboard/student/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { Award, BookOpen, CheckCircle, GraduationCap, Play, type LucideIcon } from "lucide-react";

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
      // e.courses เป็น null ได้ถ้า RLS บล็อกคอร์สนี้ (เช่นสถานะไม่ใช่ published ชั่วคราว)
      if (!e.courses) continue;

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

  const { count: certificateCount } = await supabase
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .eq("status", "issued");

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#0F1B3D,#1A326B)] px-6 py-7 text-white shadow-[0_18px_42px_rgba(15,27,61,0.17)] sm:px-8">
        <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full border-[38px] border-white/[0.04]" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-blue-200">My learning space</p>
            <h1 className="mt-2 text-[27px] font-black tracking-[-0.035em] sm:text-[31px]">สวัสดี, {displayFirstName} 👋</h1>
            <p className="mt-2 text-[12.5px] text-white/60">เรียนต่อจากจุดเดิม และติดตามเป้าหมายของคุณได้ที่นี่</p>
          </div>
          <Link href="/courses" className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12px] font-extrabold text-[#0F1B3D] shadow-lg transition hover:-translate-y-0.5">
            <BookOpen size={15} /> ค้นหาคอร์สใหม่
          </Link>
        </div>
      </section>

      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="คอร์สที่ลงทะเบียน" value={enrollments.length} icon={GraduationCap} tone="bg-blue-50 text-[#3157D5]" />
        <StatCard label="คอร์สที่เรียนจบ" value={completedCourseCount} icon={CheckCircle} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="ใบรับรองที่ได้รับ" value={certificateCount ?? 0} icon={Award} tone="bg-orange-50 text-[#FF5A3C]" />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.045)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-[15px] font-extrabold text-[#0F1B3D]">คอร์สที่กำลังเรียน</h2>
            <p className="mt-1 text-[10.5px] text-slate-400">กลับมาเรียนต่อจากบทล่าสุด</p>
          </div>
          <Link href="/dashboard/student/courses" className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-[#0F1B3D] transition hover:bg-blue-50 hover:text-[#3157D5]">
            ดูทั้งหมด
          </Link>
        </div>

        {cards.length === 0 ? (
          <div className="px-5 py-14 text-center"><BookOpen className="mx-auto text-slate-300" size={25} /><p className="mt-3 text-[13px] text-slate-400">ยังไม่มีคอร์สที่ลงทะเบียน</p></div>
        ) : (
          <div className="divide-y divide-slate-100 px-5 sm:px-6">
            {cards.map((course) => (
              <CourseProgressRow key={course.courseId} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

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

function CourseProgressRow({ course }: { course: CourseCardData }): ReactElement {
  const isDone = course.progress === 100;
  return (
    <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#3157D5]"><Play size={17} fill="currentColor" /></div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px] font-extrabold text-[#0F1B3D]">{course.title}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${course.progress}%` }}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end sm:text-right">
        <div>
          <p className={`text-[13px] font-semibold ${isDone ? "text-emerald-600" : "text-blue-600"}`}>
            {course.progress}%
          </p>
          <p className="text-[12px] text-slate-400 mt-0.5">{course.nextLessonLabel}</p>
        </div>

        <Link
          href={course.href}
          className="whitespace-nowrap rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-[11.5px] font-bold text-white shadow-sm transition hover:bg-[#3157D5]"
        >
          {isDone ? "ทบทวน" : "เข้าเรียน"}
        </Link>
      </div>
    </div>
  );
}
