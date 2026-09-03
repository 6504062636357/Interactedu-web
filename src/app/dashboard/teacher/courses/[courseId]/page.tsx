// app/dashboard/teacher/courses/[courseId]/page.tsx
import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import CertificateSettingsForm from "@/components/certificates/CertificateSettingsForm";
import SubmitCourseButton from "@/components/teacher/SubmitCourseButton";
import DeleteLessonButton from "@/components/teacher/DeleteLessonButton";
import { checkCourseReadiness } from "../actions";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

interface QuizChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestionRow {
  id: string;
  question_text: string;
  video_timestamp_seconds: number | null;
  explanation: string | null;
  order_index: number;
  quiz_choices: QuizChoiceRow[];
}

interface LessonDraftRow {
  id: string;
  status: string;
  created_at: string;
  video_url: string | null;
  content_html: string | null;
  quiz_questions: QuizQuestionRow[];
}

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
  lesson_drafts: LessonDraftRow[] | null;
}

interface CertificateSettings {
  certificate_enabled: boolean;
  certificate_pass_percentage: number;
  certificate_title: string | null;
  certificate_description: string | null;
  certificate_logo_path: string | null;
  certificate_issuer_name: string | null;
  certificate_signatory_name: string | null;
  certificate_signatory_title: string | null;
}

const statusLabel: Record<string, { text: string; color: string }> = {
  draft: { text: "ฉบับร่าง", color: "text-[#0F1B3D]/40" },
  pending_review: { text: "รอตรวจสอบ", color: "text-[#FF5A3C]" },
  approved: { text: "เผยแพร่แล้ว", color: "text-[#00B37E]" },
  rejected: { text: "ถูกตีกลับ", color: "text-[#EB4A2D]" },
};

export default async function CourseDetailPage({ params }: PageProps): Promise<ReactElement> {
  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/dashboard/teacher/courses/${courseId}`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  // ข้อมูลคอร์สหลักต้องเปิดได้ แม้ฐานข้อมูลยังไม่มีคอลัมน์ certificate
  const [courseRes, certificateRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, status, created_by")
      .eq("id", courseId)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("certificate_enabled, certificate_pass_percentage, certificate_title, certificate_description, certificate_logo_path, certificate_issuer_name, certificate_signatory_name, certificate_signatory_title")
      .eq("id", courseId)
      .maybeSingle(),
  ]);

  const course = courseRes.data;
  const certificateSettings = certificateRes.data as CertificateSettings | null;

  if (!course) notFound();
  if (profile.role === "teacher" && course.created_by !== user.id) redirect("/dashboard/teacher");

  // ดึงข้อมูล draft ล่าสุดมาใช้เป็นหน้ารายละเอียดแบบ read-only พร้อมปุ่มแก้ไข
  const { data: lessonsData, error: lessonsError } = await supabase
    .from("lessons")
    .select(
      `id, title, order_index,
       lesson_drafts (
         id, status, created_at, video_url, content_html,
         quiz_questions (
           id, question_text, video_timestamp_seconds, explanation, order_index,
           quiz_choices ( choice_text, is_correct, order_index )
         )
       )`
    )
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  const lessons = (lessonsData ?? []) as unknown as LessonRow[];

  const readiness = await checkCourseReadiness(courseId);
  const lessonIssueById = new Map(readiness.lessonIssues.map((issue) => [issue.lessonId, issue]));

  // หา draft ล่าสุดของแต่ละ lesson (เผื่อมีหลาย draft เก่าสะสมอยู่)
  const lessonsWithDetails = lessons.map((lesson) => {
    const drafts = lesson.lesson_drafts ?? [];
    const latestDraft = [...drafts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    return {
      id: lesson.id,
      title: lesson.title,
      status: latestDraft?.status ?? null,
      latestDraft: latestDraft ?? null,
    };
  });

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <main className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            href="/dashboard/teacher"
            className="text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-2 inline-block"
          >
            ← กลับไปหน้ารวมคอร์ส
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
              {course.title}
            </h1>
            <div className="flex flex-wrap items-start gap-2">
              <Link href={`/dashboard/teacher/courses/${course.id}/materials`} className="shrink-0 rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2.5 text-[13px] font-bold text-[#0F1B3D] transition-colors hover:bg-slate-50">เอกสารประกอบ</Link>
              <Link href={`/dashboard/teacher/courses/${course.id}/exam`} className="shrink-0 rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2.5 text-[13px] font-bold text-[#0F1B3D] transition-colors hover:bg-slate-50">
                บททดสอบท้ายคอร์ส
                {readiness.examIssue && <span className="ml-1.5 text-red-400">*</span>}
              </Link>
              <Link href={`/dashboard/teacher/courses/${course.id}/lessons/new`} className="shrink-0 rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#EB4A2D]">+ เพิ่มบทเรียนใหม่</Link>
              {course.status !== "published" && (
                <SubmitCourseButton courseId={course.id} ready={readiness.ready} />
              )}
            </div>
          </div>
        </div>

        {!readiness.ready && course.status !== "published" && (
          <div className="mb-8 rounded-2xl border border-red-100 bg-red-50/60 px-5 py-4">
            <p className="text-[12.5px] font-bold text-red-500">
              ยังกรอกข้อมูลไม่ครบ ต้องแก้ไขก่อนกดส่งคอร์สเข้าตรวจได้
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-red-600/90">
              {!readiness.hasLessons && <li>คอร์สนี้ยังไม่มีบทเรียน</li>}
              {readiness.lessonIssues.map((issue) => (
                <li key={issue.lessonId}>
                  บทเรียน &quot;{issue.title}&quot;:{" "}
                  {issue.missingVideo && "ยังไม่มีวิดีโอ "}
                  {issue.insufficientMarkers.map((m, i) => (
                    <span key={i}>
                      {i > 0 || issue.missingVideo ? "; " : ""}
                      คลังคำถามไม่พอสำหรับควิซสุ่มช่วง {Math.floor(m.timestampSeconds / 60)}:
                      {String(m.timestampSeconds % 60).padStart(2, "0")} (ระดับ {m.difficulty})
                    </span>
                  ))}
                </li>
              ))}
              {readiness.examIssue && <li>บททดสอบท้ายคอร์ส: {readiness.examIssue}</li>}
            </ul>
          </div>
        )}

        {certificateSettings ? (
          <div className="mb-8">
            <CertificateSettingsForm
              courseId={course.id}
              courseTitle={course.title}
              initialEnabled={certificateSettings.certificate_enabled}
              initialPassPercentage={Number(certificateSettings.certificate_pass_percentage)}
              initialTitle={certificateSettings.certificate_title}
              initialDescription={certificateSettings.certificate_description}
              initialLogoPath={certificateSettings.certificate_logo_path}
              initialIssuerName={certificateSettings.certificate_issuer_name}
              initialSignatoryName={certificateSettings.certificate_signatory_name}
              initialSignatoryTitle={certificateSettings.certificate_signatory_title}
            />
          </div>
        ) : (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-[13px] font-bold text-amber-800">การตั้งค่าใบประกาศยังไม่พร้อม</p>
            <p className="mt-1 text-[12px] text-amber-700">
              คุณยังจัดการบทเรียนและแบบทดสอบได้ตามปกติ ส่วนนี้จะพร้อมหลังอัปเดตฐานข้อมูล
            </p>
          </div>
        )}

        {lessonsError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[13px] font-medium text-red-700">
            โหลดรายละเอียดบทเรียนไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง
          </div>
        )}

        {lessonsWithDetails.length > 0 ? (
          <div className="space-y-3">
            {lessonsWithDetails.map((lesson, index) => {
              const draft = lesson.latestDraft;
              const questions = [...(draft?.quiz_questions ?? [])].sort((a, b) => a.order_index - b.order_index);
              const videoQuizzes = questions.filter((question) => question.video_timestamp_seconds != null);
              const issue = lessonIssueById.get(lesson.id);

              return (
                <article key={lesson.id} className="overflow-hidden rounded-2xl border border-[#0F1B3D]/[0.06] bg-white">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D]/[0.05] text-[12px] font-extrabold text-[#0F1B3D]/50">{index + 1}</span>
                      <div>
                        <h2 className="text-[15px] font-bold text-[#0F1B3D]">{lesson.title}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`text-[11.5px] font-bold ${lesson.status ? statusLabel[lesson.status]?.color ?? "text-[#0F1B3D]/40" : "text-[#0F1B3D]/30"}`}>
                            {lesson.status ? statusLabel[lesson.status]?.text ?? lesson.status : "ยังไม่มีฉบับร่าง"}
                          </span>
                          {draft && <span className="text-[11px] text-slate-400">ควิซในวิดีโอ {videoQuizzes.length} ข้อ</span>}
                        </div>
                        {issue && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {issue.missingVideo && (
                              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-400">
                                * ต้องอัปโหลดวิดีโอ
                              </span>
                            )}
                            {issue.insufficientMarkers.map((m, i) => (
                              <span key={i} className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-400">
                                * คลังคำถามไม่พอ ช่วง {Math.floor(m.timestampSeconds / 60)}:
                                {String(m.timestampSeconds % 60).padStart(2, "0")} ({m.difficulty})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link href={`/dashboard/teacher/courses/${course.id}/lessons/new?lessonId=${lesson.id}`} className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent bg-[#FF5A3C] px-5 py-2.5 text-[12.5px] font-bold leading-none text-white transition-colors hover:bg-[#EB4A2D]">
                        Edit บทเรียน
                      </Link>
                      <DeleteLessonButton lessonId={lesson.id} courseId={course.id} lessonTitle={lesson.title} />
                    </div>
                  </div>

                  {draft ? (
                    <details className="border-t border-[#0F1B3D]/[0.06] group">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-[12.5px] font-bold text-[#0F1B3D]/65 hover:bg-slate-50">
                        ดูข้อมูลที่บันทึกไว้
                        <span className="text-[16px] transition-transform group-open:rotate-180">⌄</span>
                      </summary>
                      <div className="space-y-6 border-t border-[#0F1B3D]/[0.05] bg-slate-50/60 p-5">
                        {draft.video_url && (
                          <section>
                            <h3 className="mb-2 text-[12px] font-bold text-[#0F1B3D]/50">วิดีโอบทเรียน</h3>
                            <video src={draft.video_url} controls preload="metadata" className="max-h-80 w-full rounded-xl bg-black" />
                          </section>
                        )}

                        <section>
                          <h3 className="mb-2 text-[12px] font-bold text-[#0F1B3D]/50">เนื้อหาบทเรียน</h3>
                          <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-6 text-slate-600">
                            {draft.content_html?.trim() || "ยังไม่มีเนื้อหาเพิ่มเติม"}
                          </div>
                        </section>

                        {videoQuizzes.length > 0 && (
                          <section>
                            <h3 className="mb-3 text-[12px] font-bold text-[#0F1B3D]/50">ควิซแทรกระหว่างวิดีโอ ({videoQuizzes.length} ข้อ)</h3>
                            <div className="space-y-2">
                              {videoQuizzes.map((question) => (
                                <div key={question.id} className="rounded-xl border border-violet-100 bg-white p-4">
                                  <p className="text-[12px] font-bold text-violet-600">เวลา {Math.floor((question.video_timestamp_seconds ?? 0) / 60)}:{String((question.video_timestamp_seconds ?? 0) % 60).padStart(2, "0")}</p>
                                  <p className="mt-1 text-[13px] font-semibold text-[#0F1B3D]">{question.question_text}</p>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                      </div>
                    </details>
                  ) : (
                    <p className="border-t border-[#0F1B3D]/[0.06] px-5 py-4 text-[12.5px] text-slate-400">กด Edit เพื่อเริ่มกรอกข้อมูลบทเรียน</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
            <p className="text-[14px] text-[#0F1B3D]/40 font-medium mb-4">คอร์สนี้ยังไม่มีบทเรียน</p>
            <Link
              href={`/dashboard/teacher/courses/${course.id}/lessons/new`}
              className="text-[13px] font-bold text-[#FF5A3C] hover:underline"
            >
              เริ่มเพิ่มบทเรียนแรก
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
