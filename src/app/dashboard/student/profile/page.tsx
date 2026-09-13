// app/dashboard/student/profile/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { ArrowUpRight, Award, BookOpenText, GraduationCap, Languages, Mail, Pencil, Play, UserRound } from "lucide-react";
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
  status: "issued" | "revoked";
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
    .select("full_name, avatar_url, language")
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
    .select("id, issued_at, status, courses(title)")
    .eq("user_id", user.id)
    .order("issued_at", { ascending: false })
    .limit(3);

  const certificates = (certsRaw ?? []) as unknown as CertificateRow[];

  const displayName = profile?.full_name || user.email?.split("@")[0] || "นักเรียน";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#3157D5]">Student profile</p>
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#0F1B3D] sm:text-[30px]">โปรไฟล์ของฉัน</h1>
        <p className="mt-1 text-[13px] text-slate-500">ข้อมูลส่วนตัวและภาพรวมการเรียนรู้ของคุณ</p>
      </div>

      <section className="relative mb-5 overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,#0F1B3D_0%,#1B3267_68%,#3157D5_100%)] p-6 text-white shadow-[0_18px_36px_-22px_rgba(15,27,61,0.7)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-20 h-60 w-60 rounded-full bg-white/[0.04]" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-end">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[25px] border-4 border-white/25 bg-white/15 shadow-xl sm:h-28 sm:w-28">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
              <GraduationCap size={14} /> ผู้เรียน
            </span>
            <h2 className="mt-3 break-words text-[25px] font-extrabold tracking-[-0.03em] sm:text-[30px]">{displayName}</h2>
            <p className="mt-1 break-all text-[13px] text-white/70">{user.email}</p>
          </div>
          <Link
            href="/dashboard/student/settings"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#0F1B3D] shadow-sm transition hover:bg-blue-50"
          >
            <Pencil size={15} /> แก้ไขโปรไฟล์
          </Link>
        </div>
      </section>

      <section className="mb-7 grid gap-3 sm:grid-cols-3" aria-label="ข้อมูลส่วนตัว">
        {[
          { label: "ชื่อ-นามสกุล", value: profile?.full_name || "ยังไม่ได้ระบุ", icon: UserRound },
          { label: "อีเมล", value: user.email || "ยังไม่ได้ระบุ", icon: Mail },
          { label: "ภาษาที่ใช้งาน", value: profile?.language === "en" ? "English" : "ไทย", icon: Languages },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)]">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3157D5]/10 text-[#3157D5]"><Icon size={18} /></div>
            <p className="mt-3 text-[11px] font-semibold text-slate-400">{label}</p>
            <p className="mt-1 break-words text-[13px] font-bold text-[#0F1B3D]">{value}</p>
          </div>
        ))}
      </section>

      <div className="mb-9 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-[20px] border border-blue-100 bg-blue-50/70 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#3157D5]/10 text-[#3157D5]"><BookOpenText size={21} /></span>
          <div><p className="text-[11px] font-semibold text-slate-500">คอร์สที่เรียนอยู่</p><p className="mt-0.5 text-[23px] font-extrabold text-[#0F1B3D]">{inProgress.length}</p></div>
        </div>
        <div className="flex items-center gap-4 rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><GraduationCap size={21} /></span>
          <div><p className="text-[11px] font-semibold text-slate-500">เรียนจบแล้ว</p><p className="mt-0.5 text-[23px] font-extrabold text-[#0F1B3D]">{completedCourses.length}</p></div>
        </div>
        <div className="flex items-center gap-4 rounded-[20px] border border-amber-100 bg-amber-50/70 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Award size={21} /></span>
          <div><p className="text-[11px] font-semibold text-slate-500">ใบประกาศฯ ล่าสุด</p><p className="mt-0.5 text-[23px] font-extrabold text-[#0F1B3D]">{certificates.length}</p></div>
        </div>
      </div>

      <section className="mb-9">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#3157D5]">Learning journey</p>
            <h2 className="mt-1 text-[18px] font-extrabold text-[#0F1B3D]">คอร์สที่กำลังเรียนอยู่</h2>
          </div>
          <Link href="/dashboard/student/courses" className="inline-flex items-center gap-1 text-[12px] font-bold text-[#3157D5] hover:text-[#0F1B3D]">
            ดูคอร์สทั้งหมด <ArrowUpRight size={15} />
          </Link>
        </div>

        {inProgress.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-[#3157D5]"><BookOpenText size={23} /></span>
            <p className="mt-3 text-[13.5px] font-semibold text-slate-600">ยังไม่มีคอร์สที่กำลังเรียน</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inProgress.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-4 rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)] sm:flex-row sm:items-center"
              >
                <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1B3D] to-[#3157D5] sm:h-24 sm:w-40">
                  {e.courses.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.courses.cover_image_url}
                      alt={e.courses.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  {!e.courses.cover_image_url && <BookOpenText className="absolute inset-0 m-auto text-white/70" size={30} />}
                </div>

                <div className="min-w-0 flex-1">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#3157D5]">กำลังเรียน</span>
                  <p className="mt-2 truncate text-[14px] font-extrabold text-[#0F1B3D]">{e.courses.title}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#FF5A3C] transition-all"
                        style={{ width: `${e.percent}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-slate-500">
                      {e.percent}%
                    </span>
                  </div>
                </div>

                <Link
                  href={
                    firstLessonByCourse.get(e.courses.id)
                      ? `/play/${e.courses.id}/${firstLessonByCourse.get(e.courses.id)}`
                      : `/play/${e.courses.id}`
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#3157D5]"
                >
                  <Play size={13} fill="currentColor" /> เรียนต่อ
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-amber-600">Achievements</p>
            <h2 className="mt-1 text-[18px] font-extrabold text-[#0F1B3D]">ใบประกาศนียบัตรล่าสุด</h2>
          </div>
          <Link href="/dashboard/student/certificates" className="inline-flex items-center gap-1 text-[12px] font-bold text-[#3157D5] hover:text-[#0F1B3D]">
            ดูทั้งหมด <ArrowUpRight size={15} />
          </Link>
        </div>

        {certificates.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Award size={23} /></span>
            <p className="mt-3 text-[13.5px] font-semibold text-slate-600">ยังไม่มีใบประกาศนียบัตร</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {certificates.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Award size={22} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[#0F1B3D]">
                    {c.courses?.title ?? "คอร์ส"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    ออกเมื่อ {new Date(c.issued_at).toLocaleDateString("th-TH")}
                  </p>
                </div>
                {c.status === "issued" ? (
                  <a
                    href={`/api/me/certificates/${c.id}/download`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-[#0F1B3D] transition-colors hover:bg-slate-50"
                  >
                    ดาวน์โหลด PDF
                  </a>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold text-red-500">Revoked</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
