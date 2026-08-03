// app/dashboard/student/profile/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface CourseInfo {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  category: string | null;
}

interface EnrollmentWithCourse {
  id: string;
  created_at: string;
  course_id: string;
  courses: CourseInfo;
}

interface ScormTrackingRow {
  enrollment_id: string;
  lesson_id: string;
  lesson_status: string | null;
  video_completed: boolean | null;
}

interface CertificateRow {
  id: string;
  issued_at: string;
  pdf_url: string | null;
  courses: { title: string } | null;
}

export default async function StudentProfilePage(): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <p className="text-[13.5px] text-slate-400 py-8 text-center">กรุณาเข้าสู่ระบบ</p>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: enrollmentsRaw } = await supabase
    .from("enrollments")
    .select("id, created_at, course_id, courses(id, title, slug, cover_image_url, category)")
    .eq("student_id", user.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const enrollments = (enrollmentsRaw ?? []) as unknown as EnrollmentWithCourse[];
  const enrollmentIds = enrollments.map((e) => e.id);
  const courseIds = enrollments.map((e) => e.course_id);

  const { data: trackingRaw } = enrollmentIds.length
    ? await supabase
        .from("scorm_tracking")
        .select("enrollment_id, lesson_id, lesson_status, video_completed")
        .in("enrollment_id", enrollmentIds)
    : { data: [] };

  const tracking = (trackingRaw ?? []) as ScormTrackingRow[];

  // // นับจำนวนบทเรียนจริงต่อคอร์ส จากตาราง lessons แทนการพึ่ง courses.total_lessons (ค้างเป็น 0 ไม่ถูกอัปเดต)
  // const { data: lessonsRaw } = courseIds.length
  //   ? await supabase.from("lessons").select("id, course_id").in("course_id", courseIds)
  //   : { data: [] };

  // const totalLessonsByCourse = new Map<string, number>();
  // for (const l of lessonsRaw ?? []) {
  //   totalLessonsByCourse.set(l.course_id, (totalLessonsByCourse.get(l.course_id) ?? 0) + 1);
  // }
  // นับจำนวนบทเรียนจริงต่อคอร์ส จากตาราง lessons แทนการพึ่ง courses.total_lessons (ค้างเป็น 0 ไม่ถูกอัปเดต)
  const { data: lessonsRaw } = courseIds.length
    ? await supabase.from("lessons").select("id, course_id, order_index").in("course_id", courseIds)
    : { data: [] };

  const totalLessonsByCourse = new Map<string, number>();
  const lessonsByCourse = new Map<string, { id: string; order_index: number }[]>();
  for (const l of lessonsRaw ?? []) {
    totalLessonsByCourse.set(l.course_id, (totalLessonsByCourse.get(l.course_id) ?? 0) + 1);
    if (!lessonsByCourse.has(l.course_id)) lessonsByCourse.set(l.course_id, []);
    lessonsByCourse.get(l.course_id)!.push(l);
  }

  const firstLessonByCourse = new Map<string, string>();
  for (const [courseId, lessons] of lessonsByCourse) {
    const sorted = [...lessons].sort((a, b) => a.order_index - b.order_index);
    if (sorted[0]) firstLessonByCourse.set(courseId, sorted[0].id);
  }
  // นับจำนวนบทเรียนที่ "จบแล้ว" ต่อ enrollment (ไม่นับซ้ำ lesson เดียวกัน)
  const completedLessonsByEnrollment = new Map<string, Set<string>>();
  for (const t of tracking) {
    const isDone = t.lesson_status === "completed" || t.lesson_status === "passed" || t.video_completed === true;
    if (!isDone) continue;
    if (!completedLessonsByEnrollment.has(t.enrollment_id)) {
      completedLessonsByEnrollment.set(t.enrollment_id, new Set());
    }
    completedLessonsByEnrollment.get(t.enrollment_id)!.add(t.lesson_id);
  }

  const coursesWithProgress = enrollments.map((e) => {
    const completed = completedLessonsByEnrollment.get(e.id)?.size ?? 0;
    const total = totalLessonsByCourse.get(e.course_id) ?? 0;
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return { ...e, completed, total, percent };
  });

  const inProgress = coursesWithProgress.filter((c) => c.percent < 100);
  const completedCourses = coursesWithProgress.filter((c) => c.percent >= 100 && c.total > 0);

  const { data: certsRaw } = await supabase
    .from("certificates")
    .select("id, issued_at, pdf_url, courses(title)")
    .eq("student_id", user.id)
    .order("issued_at", { ascending: false })
    .limit(3);

  const certificates = (certsRaw ?? []) as unknown as CertificateRow[];

  const displayName = profile?.full_name || user.email?.split("@")[0] || "นักเรียน";

  return (
    <div>
      {/* User Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden shrink-0">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#0F1B3D] text-white text-[20px] font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="text-[19px] font-bold text-[#0F1B3D]">{displayName}</p>
            <span className="inline-flex items-center text-[11.5px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full mt-1">
              นักเรียน
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/student/settings"
          className="inline-flex items-center justify-center text-[13px] font-semibold text-[#0F1B3D] border border-[#0F1B3D]/15 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          แก้ไขโปรไฟล์
        </Link>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="bg-white rounded-xl border border-slate-100 px-5 py-4">
          <p className="text-[12.5px] text-slate-500 mb-1">คอร์สที่เรียนอยู่</p>
          <p className="text-[24px] font-bold text-[#0F1B3D]">{inProgress.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 px-5 py-4">
          <p className="text-[12.5px] text-slate-500 mb-1">เรียนจบแล้ว</p>
          <p className="text-[24px] font-bold text-[#0F1B3D]">{completedCourses.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 px-5 py-4">
          <p className="text-[12.5px] text-slate-500 mb-1">ใบประกาศฯ</p>
          <p className="text-[24px] font-bold text-[#0F1B3D]">{certificates.length}</p>
        </div>
      </div>

      {/* Continue Learning */}
      <div className="mb-10">
        <h2 className="text-[16px] font-bold text-[#0F1B3D] mb-4">คอร์สที่กำลังเรียนอยู่</h2>

        {inProgress.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
            <p className="text-[13.5px] text-slate-400 font-medium">ยังไม่มีคอร์สที่กำลังเรียน</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inProgress.map((e) => (
              <div
                key={e.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-slate-100 p-4"
              >
                <div className="relative w-full sm:w-40 h-24 rounded-xl overflow-hidden bg-gradient-to-br from-[#0F1B3D] to-[#182852] shrink-0">
                  {e.courses.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.courses.cover_image_url}
                      alt={e.courses.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-bold text-[#0F1B3D] truncate mb-2">{e.courses.title}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#FF5A3C] rounded-full transition-all"
                        style={{ width: `${e.percent}%` }}
                      />
                    </div>
                    <span className="text-[11.5px] font-semibold text-slate-500 shrink-0">
                      เรียนไปแล้ว {e.percent}%
                    </span>
                  </div>
                </div>

                <Link
                  href={
                    firstLessonByCourse.get(e.courses.id)
                      ? `/play/${e.courses.id}/${firstLessonByCourse.get(e.courses.id)}`
                      : `/play/${e.courses.id}`
                  }
                  className="shrink-0 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  เรียนต่อ
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Certificates */}
      <div>
        <h2 className="text-[16px] font-bold text-[#0F1B3D] mb-4">ใบประกาศนียบัตรล่าสุด</h2>

        {certificates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
            <p className="text-[13.5px] text-slate-400 font-medium">ยังไม่มีใบประกาศนียบัตร</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {certificates.map((c) => (
              <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-slate-100 p-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="5" stroke="#D97706" strokeWidth="1.6" />
                    <path d="M8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5" stroke="#D97706" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#0F1B3D] truncate">
                    {c.courses?.title ?? "คอร์ส"}
                  </p>
                  <p className="text-[11.5px] text-slate-400 mt-0.5">
                    ออกเมื่อ {new Date(c.issued_at).toLocaleDateString("th-TH")}
                  </p>
                </div>
                <button
                  disabled={!c.pdf_url}
                  title={!c.pdf_url ? "ไฟล์ PDF กำลังจัดเตรียม" : undefined}
                  className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0F1B3D] border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ดาวน์โหลด PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}