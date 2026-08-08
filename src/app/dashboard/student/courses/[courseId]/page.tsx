import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
  video_url: string | null;
  video_duration_seconds: number;
  is_scorm: boolean | null;
}

interface ModuleRow {
  id: string;
  title: string;
  order_index: number;
  lessons: LessonRow[];
}

interface TrackingRow {
  lesson_id: string;
  lesson_status: string | null;
  score_raw: number | null;
  video_completed: boolean;
}

function StatusBadge({ status }: { status: string | null }): ReactElement {
  if (status === "completed" || status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
        เรียนจบแล้ว
      </span>
    );
  }
  if (status === "incomplete" || status === "browsed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2.5 py-1 rounded-full shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A3C]" />
        กำลังเรียน
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11.5px] font-semibold text-[#0F1B3D]/40 bg-[#0F1B3D]/[0.04] px-2.5 py-1 rounded-full shrink-0">
      ยังไม่เริ่ม
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} นาที`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} ชม. ${rem} นาที` : `${hrs} ชม.`;
}

export default async function CourseLessonsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<ReactElement> {
  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Confirm the student is enrolled + approved, and grab enrollment id for tracking lookups
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, courses(id, title, description, cover_image_url)")
    .eq("student_id", user.id)
    .eq("course_id", courseId)
    .eq("status", "approved")
    .single();

  if (!enrollment) {
    notFound();
  }

  const course = Array.isArray(enrollment.courses) ? enrollment.courses[0] : enrollment.courses;

  const { data: courseCertificateSettings } = await supabase
    .from("courses")
    .select("certificate_enabled, certificate_pass_percentage")
    .eq("id", courseId)
    .maybeSingle();

  const { data: certificate } = await supabase
    .from("certificates")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  const { data: modulesData } = await supabase
    .from("modules")
    .select("id, title, order_index, lessons(id, title, order_index, video_url, video_duration_seconds, is_scorm)")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  const modules = ((modulesData ?? []) as ModuleRow[]).map((m) => ({
    ...m,
    lessons: [...(m.lessons ?? [])].sort((a, b) => a.order_index - b.order_index),
  }));

  const { data: trackingData } = await supabase
    .from("scorm_tracking")
    .select("lesson_id, lesson_status, score_raw, video_completed")
    .eq("enrollment_id", enrollment.id);

  const trackingByLesson = new Map<string, TrackingRow>();
  for (const t of (trackingData ?? []) as TrackingRow[]) {
    if (t.lesson_id) trackingByLesson.set(t.lesson_id, t);
  }

  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const completedLessons = modules.reduce(
    (sum, m) =>
      sum +
      m.lessons.filter((l) => {
        return Boolean(trackingByLesson.get(l.id)?.video_completed);
      }).length,
    0
  );
  const allLessonsComplete = totalLessons > 0 && completedLessons === totalLessons;
  const passPercentage = Number(courseCertificateSettings?.certificate_pass_percentage ?? 70);

  return (
    <div>
      <Link
        href="/dashboard/student/courses"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-4 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        กลับไปคอร์สของฉัน
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">{course?.title}</h1>
          <p className="mt-1 text-[13.5px] text-[#0F1B3D]/50">
            {completedLessons} / {totalLessons} บทเรียนเรียนจบแล้ว
          </p>
          {certificate?.status === "issued" && (
            <a
              href={`/api/me/certificates/${certificate.id}/download`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11.5px] font-bold text-emerald-700"
            >
              <span>✓</span> ได้รับใบรับรองแล้ว · ดาวน์โหลด PDF
            </a>
          )}
        </div>
        {totalLessons > 0 && (
          <div className="w-14 h-14 rounded-full border-4 border-[#0F1B3D]/[0.06] relative shrink-0 flex items-center justify-center">
            <span className="text-[12px] font-extrabold text-[#0F1B3D]">
              {Math.round((completedLessons / totalLessons) * 100)}%
            </span>
          </div>
        )}
      </div>

      {modules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีบทเรียนในคอร์สนี้</p>
        </div>
      ) : (
        <div className="space-y-6">
          {modules.map((m) => (
            <div key={m.id}>
              <h2 className="text-[14.5px] font-bold text-[#0F1B3D] mb-3">{m.title}</h2>
              <div className="rounded-2xl border border-[#0F1B3D]/[0.06] overflow-hidden divide-y divide-[#0F1B3D]/[0.06]">
                {m.lessons.map((l) => {
                  const status = trackingByLesson.get(l.id)?.lesson_status ?? null;
                  return (
                    <Link
                      key={l.id}
                      href={`/play/${courseId}/${l.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-[#0F1B3D]/[0.02] transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#0F1B3D]/[0.04] flex items-center justify-center shrink-0 group-hover:bg-[#FF5A3C]/10 transition-colors">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-[#0F1B3D]/50 group-hover:text-[#FF5A3C] transition-colors"
                        >
                          <path d="M8 6.5v11l9-5.5-9-5.5z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-[#0F1B3D] truncate">{l.title}</p>
                        {l.video_duration_seconds > 0 && (
                          <p className="text-[12px] text-[#0F1B3D]/40 mt-0.5">{formatDuration(l.video_duration_seconds)}</p>
                        )}
                      </div>
                      <StatusBadge status={status} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalLessons > 0 && certificate?.status !== "issued" && (
        <section className={`mt-8 overflow-hidden rounded-3xl border p-6 sm:p-7 ${allLessonsComplete ? "border-[#FF5A3C]/20 bg-[#FFF7F4]" : "border-[#0F1B3D]/[0.08] bg-[#F7F8FA]"}`}>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A3C]">Course Final Exam</p>
              <h2 className="mt-1 text-[19px] font-extrabold text-[#0F1B3D]">บททดสอบท้ายคอร์ส</h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-[#0F1B3D]/50">
                รวมคำถามท้ายบทจากทุกบท คะแนนชุดนี้ใช้ตัดสินการออกใบรับรอง โดยต้องได้อย่างน้อย {passPercentage}%
              </p>
            </div>
            {allLessonsComplete ? (
              <Link href={`/dashboard/student/courses/${courseId}/final-exam`} className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#FF5A3C] px-6 py-3 text-[13px] font-extrabold text-white shadow-lg shadow-orange-200 transition hover:brightness-105">
                เริ่มทำข้อสอบ →
              </Link>
            ) : (
              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#0F1B3D]/[0.06] px-5 py-3 text-[12px] font-bold text-[#0F1B3D]/40">
                เรียนให้ครบทุกบทก่อน
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
