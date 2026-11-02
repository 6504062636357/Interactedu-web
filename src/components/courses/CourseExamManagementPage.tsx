import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CourseExamEditor from "@/components/courses/CourseExamEditor";
import CourseExamLoadError from "@/components/courses/CourseExamLoadError";

import { createClient } from "@/utils/supabase/server";
import CourseExamReviewActions from "@/components/CourseExamReviewActions";
import type { ExamInteractionType, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ =====
interface StoredImagePin { id: string; x: number; y: number }

interface StoredChoice { choice_text: string; is_correct: boolean; order_index: number }
interface StoredQuestion {
  lesson_draft_id: string;
  question_text: string;
  explanation: string | null;
  order_index: number;
  video_timestamp_seconds: number | null;
  interaction_type: ExamInteractionType;
  // ===== เพิ่มใหม่: เฉลย matching/sequencing (ไม่มีกับ multiple_choice/true_false)
  answer_data: MatchingAnswerData | SequencingAnswerData | null;
  image_url: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  image_caption: string | null;
  image_pins: StoredImagePin[] | null;
  quiz_choices: StoredChoice[];
}
interface StoredDraft { id: string; created_at: string }
interface StoredLesson { id: string; order_index: number; lesson_drafts: StoredDraft[] }

interface StoredExamConfig {
  // build_mode/preset_type ยังอยู่ในคอลัมน์ฐานข้อมูลเดิม (ยุบโหมด preset ออกแล้ว ไม่ต้อง migrate
  // schema) แต่หน้านี้ไม่ต้องอ่านมาใช้อีกต่อไป เหลือแค่ custom_constraints ที่จำเป็นจริง
  custom_constraints: { lessonId: string | null; difficulty: "easy" | "medium" | "hard"; count: number }[] | null;
}

export default async function CourseExamManagementPage({ courseId, workspace }: { courseId: string; workspace: "teacher" | "admin" }): Promise<ReactElement> {
  // Give this read-only screen room for slower database responses. Disable SDK
  // retries below so each read has one bounded attempt before offering retry.
  const supabase = await createClient({ timeoutMs: 30000 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/${workspace}/courses/${courseId}/exam`);

  const loadError = (message: string, error: { message: string }) => {
    console.warn("[course/exam] load failed:", courseId, error.message);
    return <CourseExamLoadError message={message} backHref={`/dashboard/${workspace}/courses/${courseId}`} />;
  };

  const [{ data: profile, error: profileError }, { data: course, error: courseError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle().retry(false),
    // Keep the existence/ownership query limited to the original course columns.
    // Optional feature columns may not exist yet while a migration is rolling out;
    // bundling them here used to turn that schema error into a misleading 404.
    supabase.from("courses").select("id, title, created_by").eq("id", courseId).maybeSingle().retry(false),
  ]);

  if (profileError) return loadError("โหลดข้อมูลสิทธิ์ผู้ใช้ไม่สำเร็จ", profileError);
  if (courseError) return loadError("โหลดข้อมูลคอร์สไม่สำเร็จ", courseError);
  if (!course) notFound();
  const allowed = profile?.role === "admin" || (profile?.role === "teacher" && course.created_by === user.id);
  if (!allowed) redirect(`/dashboard/${workspace}`);

  const [
    { data: certificateSettings, error: certificateError },
    { data: lessonsData, error: lessonsError },
    { data: examConfigData, error: examConfigError },
    { data: examReview, error: examReviewError },
  ] = await Promise.all([
    supabase.from("courses").select("certificate_enabled, certificate_pass_percentage").eq("id", courseId).maybeSingle().retry(false),
    // Only load the newest draft ID per lesson, not every draft and its quizzes.
    supabase.from("lessons").select("id, order_index, lesson_drafts(id, created_at)").eq("course_id", courseId)
      .order("order_index", { ascending: true })
      .order("created_at", { referencedTable: "lesson_drafts", ascending: false })
      .limit(1, { referencedTable: "lesson_drafts" }).retry(false),
    supabase.from("course_exam_configs").select("custom_constraints").eq("course_id", courseId).maybeSingle().retry(false),
    workspace === "admin"
      ? supabase.from("courses").select("exam_status, exam_rejection_reason").eq("id", courseId).maybeSingle().retry(false)
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Preserve compatibility with databases where optional course columns have
  // not been migrated yet, but never treat a failed read as an empty exam.
  const missingColumn = (error: { code: string }) => error.code === "42703" || error.code === "PGRST204";
  if (certificateError && !missingColumn(certificateError)) return loadError("โหลดการตั้งค่าใบรับรองไม่สำเร็จ", certificateError);
  if (lessonsError) return loadError("โหลดข้อมูลบทเรียนไม่สำเร็จ", lessonsError);
  if (examConfigError) return loadError("โหลดการตั้งค่าบททดสอบไม่สำเร็จ", examConfigError);
  if (examReviewError && !missingColumn(examReviewError)) return loadError("โหลดสถานะบททดสอบไม่สำเร็จ", examReviewError);

  const certificateEnabled = certificateSettings?.certificate_enabled ?? false;
  const certificatePassPercentage = Number(certificateSettings?.certificate_pass_percentage ?? 70);

  const lessons = (lessonsData ?? []) as unknown as StoredLesson[];
  const draftIds = lessons.flatMap((lesson) => (lesson.lesson_drafts ?? []).map((draft) => draft.id));
  const { data: questionsData, error: questionsError } = draftIds.length > 0
    ? await supabase.from("quiz_questions")
      .select("lesson_draft_id, question_text, explanation, order_index, video_timestamp_seconds, interaction_type, answer_data, image_url, image_caption, image_pins, quiz_choices(choice_text, is_correct, order_index)")
      .in("lesson_draft_id", draftIds).is("video_timestamp_seconds", null)
      .order("order_index", { ascending: true }).retry(false)
    : { data: [], error: null };
  if (questionsError) return loadError("โหลดคำถามบททดสอบไม่สำเร็จ", questionsError);

  const storedQuestions = (questionsData ?? []) as unknown as StoredQuestion[];
  const questions = draftIds.flatMap((draftId) => storedQuestions.filter((question) => question.lesson_draft_id === draftId))
    .map((question) => ({
      questionText: question.question_text,
      explanation: question.explanation,
      imageUrl: question.image_url ?? null,
      imageCaption: question.image_caption ?? null,
      imagePins: question.image_pins ?? null,
      interactionType: question.interaction_type ?? "multiple_choice",
      answerData: question.answer_data ?? null,
      choices: [...question.quiz_choices].sort((a, b) => a.order_index - b.order_index).map((choice) => ({ text: choice.choice_text, isCorrect: choice.is_correct })),
    }));
  
  const examConfig = examConfigData as StoredExamConfig | null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/${workspace}/courses/${courseId}`} className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับไปจัดการคอร์ส</Link>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Final assessment</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">บททดสอบท้ายคอร์ส</h1>
      <p className="mt-1 text-sm font-semibold text-[#0F1B3D]/65">{course.title}</p>
      {examReview?.exam_status && (
        <div className="mt-4 flex items-start gap-3.5 rounded-2xl border border-[#0F1B3D]/10 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,27,61,0.04)]">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              examReview.exam_status === "rejected"
                ? "bg-[#FF5A3C]/12 text-[#FF5A3C]"
                : examReview.exam_status === "approved"
                  ? "bg-[#00B37E]/12 text-[#00B37E]"
                  : "bg-amber-50 text-amber-600"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {examReview.exam_status === "rejected" ? (
                <>
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </>
              ) : examReview.exam_status === "approved" ? (
                <path d="M5 13l4 4L19 7" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </>
              )}
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-slate-500">สถานะบททดสอบ:</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  examReview.exam_status === "rejected"
                    ? "bg-[#FF5A3C]/10 text-[#EB4A2D]"
                    : examReview.exam_status === "approved"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {examReview.exam_status === "rejected" ? "ถูกตีกลับ" : examReview.exam_status === "approved" ? "อนุมัติแล้ว" : "รอตรวจสอบ"}
              </span>
            </div>
            {examReview.exam_status === "rejected" && (
              <>
                <p className="mt-1.5 text-[12.5px] leading-6 text-[#0F1B3D]/65">บททดสอบนี้ถูกตีกลับแล้ว รอครูแก้ไขและส่งตรวจใหม่</p>
                {examReview.exam_rejection_reason && (
                  <p className="mt-2 rounded-xl bg-[#FF5A3C]/[0.06] px-3 py-2 text-[12px] leading-5 text-[#0F1B3D]/70">
                    <span className="font-bold text-[#EB4A2D]">เหตุผล:</span> {examReview.exam_rejection_reason}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <div className="my-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[13px] leading-6 text-blue-800">
        ผู้เรียนจะทำบททดสอบนี้หลังเรียนครบทุกบท และต้องได้อย่างน้อย <strong>{certificatePassPercentage}%</strong> เพื่อรับใบรับรอง {certificateEnabled ? "(เปิดใช้งานใบรับรองแล้ว)" : "(ขณะนี้ปิดการออกใบรับรอง)"}
      </div>
      <CourseExamEditor
        courseId={courseId}
        initialQuestions={questions}
        lessons={lessons.map((lesson) => ({ id: lesson.id, title: `บทที่ ${lesson.order_index + 1}` }))}
        initialExamConfig={
          examConfig ? { customConstraints: examConfig.custom_constraints } : null
        }
        workspace={workspace}
        readOnly={workspace === "admin" && course.created_by !== user.id}
      />
      {workspace === "admin" && course.created_by !== user.id && (
        <div className="mt-8">
          <CourseExamReviewActions
            courseId={courseId}
            examStatus={(examReview?.exam_status ?? "pending") as "pending" | "approved" | "rejected"}
          />
        </div>
        )}
      
    </div>
  );
}//สำหรับ admin หน้าตรวจข้อสอบท้ายบท
