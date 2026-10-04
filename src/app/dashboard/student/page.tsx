// app/dashboard/student/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeStudentProgress, type StudentProgressLesson } from "@/lib/courses/student-progress";
import { formatCourseVideoDuration, formatStudyTime } from "@/lib/courses/study-time";
import { DEFAULT_COURSE_COVER_URL } from "@/lib/constants/course-cover";
import { createClient } from "@/utils/supabase/server";
import { ArrowRight, Award, Banknote, BookOpen, CheckCircle, Clock3, GraduationCap, Play, type LucideIcon } from "lucide-react";

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

interface LessonRef extends StudentProgressLesson {
  order_index: number;
  title: string;
  is_published: boolean;
  video_duration_seconds: number | null;
}

interface ModuleWithLessons {
  id: string;
  order_index: number;
  lessons: LessonRef[];
}

interface TrackingRow {
  lesson_id: string;
  lesson_status: string | null;
  video_completed: boolean | null;
  enrollment_id: string;
  last_accessed: string | null;
  completed_scos: string[] | null;
}

interface CourseCardData {
  courseId: string;
  title: string;
  progress: number;
  nextLessonLabel: string;
  href: string;
  studySeconds: number | null;
  videoSeconds: number;
  coverImageUrl: string | null;
  started: boolean;
}

export default async function StudentDashboardPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/dashboard/student");

  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };
  const displayFirstName =
    (profile?.full_name?.trim() ||
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email?.split("@")[0] ||
      "ผู้ใช้").split(
      " "
    )[0];

  const { data: enrollmentData } = await supabase
    .from("enrollments")
    .select("id, course_id, courses(id, title, cover_image_url)")
    .eq("student_id", user.id)
    .eq("status", "approved")
    .or(`access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });

  const enrollments = (enrollmentData ?? []) as unknown as EnrollmentRow[];
  const courseIds = enrollments.map((e) => e.course_id);
  const studyTimeResult = enrollments.length
    ? await supabase.from("student_study_time").select("enrollment_id, total_seconds").in("enrollment_id", enrollments.map((e) => e.id))
    : { data: [], error: null };
  const studyTimeByEnrollment = new Map(
    (studyTimeResult.data ?? []).map((row) => [row.enrollment_id, Number(row.total_seconds) || 0]),
  );
  const totalStudySeconds = enrollments.reduce((sum, enrollment) => sum + (studyTimeByEnrollment.get(enrollment.id) ?? 0), 0);

  const cards: CourseCardData[] = [];
  let completedCourseCount = 0;

  if (courseIds.length > 0) {
    const { data: modulesData } = await supabase
      .from("modules")
      .select("id, course_id, order_index, lessons(id, order_index, title, is_published, video_duration_seconds, scorm_source, scorm_manifest)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true });

    const { data: trackingData } = await supabase
      .from("scorm_tracking")
      .select("lesson_id, lesson_status, video_completed, enrollment_id, last_accessed, completed_scos")
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

    for (const e of enrollments) {
      // e.courses เป็น null ได้ถ้า RLS บล็อกคอร์สนี้ (เช่นสถานะไม่ใช่ published ชั่วคราว)
      if (!e.courses) continue;

      const modules = [...(modulesByCourse.get(e.course_id) ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      );

      const allLessons = modules.flatMap((m) =>
        [...(m.lessons ?? [])].filter((lesson) => lesson.is_published).sort((a, b) => a.order_index - b.order_index)
      );

      const summary = summarizeStudentProgress(allLessons, ((trackingData ?? []) as TrackingRow[]).filter((row) => row.enrollment_id === e.id));
      const { total: totalLessons, percent: progress, resumeLesson: nextLesson } = summary;
      if (summary.allComplete) completedCourseCount += 1;

      cards.push({
        courseId: e.course_id,
        title: e.courses.title,
        progress,
        nextLessonLabel:
          totalLessons === 0
            ? "ยังไม่มีบทเรียน"
            : nextLesson && !summary.allComplete
              ? nextLesson.title
              : "เรียนจบแล้ว",
        href: `/dashboard/student/courses/${e.course_id}`,
        studySeconds: studyTimeResult.error ? null : studyTimeByEnrollment.get(e.id) ?? 0,
        videoSeconds: allLessons.reduce((sum, lesson) => sum + (lesson.video_duration_seconds ?? 0), 0),
        coverImageUrl: e.courses.cover_image_url,
        started: summary.started,
      });
    }
  }

  const [certificateResult, offerResult, membershipResult] = await Promise.all([
    supabase.from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "issued"),
    supabase.from("membership_settings")
      .select("monthly_price, enabled")
      .eq("id", true)
      .maybeSingle(),
    supabase.from("student_membership_orders")
      .select("expires_at")
      .eq("student_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const certificateCount = certificateResult.count;
  if (offerResult.error || membershipResult.error) {
    console.error("[student dashboard] Could not load membership", offerResult.error?.message, membershipResult.error?.message);
  }
  const offer = offerResult.data;
  const membershipExpiresAt = membershipResult.data?.expires_at ?? null;
  const membershipPrice = Number(offer?.monthly_price);
  const offerVisible = !offerResult.error && offer?.enabled && Number.isFinite(membershipPrice) && membershipPrice > 0;
  const paymentReady = Boolean(process.env.OMISE_SECRET_KEY && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY) && !membershipResult.error);
  const membershipActive = Boolean(membershipExpiresAt && !membershipResult.error);
  const canSubscribe = offerVisible && paymentReady;

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

      <section aria-labelledby="student-membership-title" className="mb-7 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.04)]">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${membershipActive ? "bg-emerald-100 text-emerald-700" : "bg-[#0F1B3D] text-[#FFCB47]"}`}><Banknote size={23} aria-hidden="true" /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#3157D5]">สมาชิก Interact Edu</p>
              <h2 id="student-membership-title" className="mt-1 text-[18px] font-extrabold text-[#0F1B3D] sm:text-[20px]">{membershipActive ? "สิทธิ์เรียนทุกคอร์สของคุณ" : "เรียนทุกคอร์สในแพ็กเกจเดียว"}</h2>
              {membershipActive ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">ใช้งานได้ถึง {new Date(membershipExpiresAt!).toLocaleDateString("th-TH", { dateStyle: "long" })}</p>
              ) : offerResult.error ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">ยังโหลดรายละเอียดแพ็กเกจไม่ได้</p>
              ) : offerVisible ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">฿{membershipPrice.toLocaleString("th-TH")} / เดือน · {canSubscribe ? "พร้อมสมัครด้วย PromptPay" : "ยังไม่เปิดรับชำระเงิน"}</p>
              ) : (
                <p className="mt-1 text-sm leading-6 text-slate-600">แพ็กเกจรายเดือนยังไม่เปิดรับสมัคร</p>
              )}
            </div>
          </div>
          <Link href={membershipActive ? "/dashboard/student/courses" : "/membership"} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2 ${membershipActive || canSubscribe ? "bg-[#0F1B3D] text-white hover:bg-[#3157D5]" : "border border-slate-200 text-[#0F1B3D] hover:border-[#3157D5] hover:text-[#3157D5]"}`}>
            {membershipActive ? "ไปคอร์สของฉัน" : "ดูรายละเอียดแพ็กเกจ"} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="คอร์สที่ลงทะเบียน" value={enrollments.length} icon={GraduationCap} tone="bg-blue-50 text-[#3157D5]" />
        <StatCard label="คอร์สที่เรียนจบ" value={completedCourseCount} icon={CheckCircle} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="ใบรับรองที่ได้รับ" value={certificateCount ?? 0} icon={Award} tone="bg-orange-50 text-[#FF5A3C]" />
        <StatCard label="เวลาเรียนสะสมทั้งหมด" value={studyTimeResult.error ? "—" : formatStudyTime(totalStudySeconds)} icon={Clock3} tone="bg-violet-50 text-violet-600" />
      </div>
      <p className="-mt-4 mb-7 text-[11px] text-slate-400">เวลาเรียนสะสมเริ่มนับจากการใช้งานบทเรียนหลังเปิดใช้ระบบบันทึกเวลา</p>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#3157D5]">Learning journey</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-[#0F1B3D]">คอร์สที่กำลังเรียนอยู่</h2>
          </div>
          <Link href="/dashboard/student/courses" className="shrink-0 text-[11px] font-bold text-[#3157D5] hover:underline">
            ดูคอร์สทั้งหมด ↗
          </Link>
        </div>

        {cards.length === 0 ? (
          <div className="rounded-[22px] border border-slate-200/70 bg-white px-5 py-14 text-center"><BookOpen className="mx-auto text-slate-300" size={25} /><p className="mt-3 text-[13px] text-slate-400">ยังไม่มีคอร์สที่ลงทะเบียน</p></div>
        ) : (
          <div className="space-y-3">
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
    <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200/70 bg-white p-3 shadow-[0_8px_30px_rgba(15,27,61,0.04)] sm:flex-row sm:items-center sm:p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={course.coverImageUrl || DEFAULT_COURSE_COVER_URL} alt="" className="h-32 w-full shrink-0 rounded-2xl object-cover sm:h-24 sm:w-36" />
      <div className="min-w-0 flex-1">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${isDone ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-[#3157D5]"}`}>
          {isDone ? "เรียนจบแล้ว" : course.started ? "กำลังเรียน" : "ยังไม่เริ่ม"}
        </span>
        <p className="mt-1.5 truncate text-[13px] font-extrabold text-[#0F1B3D]">{course.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{isDone ? "เรียนครบทุกบทแล้ว" : `เรียนต่อ: ${course.nextLessonLabel}`}</p>
        <div className="mt-2.5 flex items-center gap-2.5">
          <div role="progressbar" aria-label={`ความคืบหน้าคอร์ส ${course.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progress} className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-[#FF5A3C]"}`} style={{ width: `${course.progress}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-[11px] font-bold text-slate-500">{course.progress}%</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>เรียนแล้ว <strong className="font-bold text-[#0F1B3D]">{course.studySeconds === null ? "—" : formatStudyTime(course.studySeconds)}</strong></span>
          <span>ความยาวคลิปรวม <strong className="font-bold text-[#0F1B3D]">{formatCourseVideoDuration(course.videoSeconds) ?? "ยังไม่ระบุ"}</strong></span>
        </div>
      </div>
      <Link href={course.href} className="inline-flex shrink-0 items-center justify-center gap-1.5 self-end whitespace-nowrap rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-[11.5px] font-bold text-white transition hover:bg-[#3157D5] sm:self-center"><Play size={12} fill="currentColor" /> ดูคอร์ส</Link>
    </div>
  );
}
