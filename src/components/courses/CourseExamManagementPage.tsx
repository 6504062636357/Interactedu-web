import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CourseExamEditor from "@/components/courses/CourseExamEditor";

import { createClient } from "@/utils/supabase/server";
import CourseExamReviewActions from "@/components/CourseExamReviewActions";

interface StoredChoice { choice_text: string; is_correct: boolean; order_index: number }
interface StoredQuestion { question_text: string; explanation: string | null; order_index: number; video_timestamp_seconds: number | null;interaction_type: "multiple_choice" | "true_false"; quiz_choices: StoredChoice[] }
interface StoredDraft { id: string; created_at: string; quiz_questions: StoredQuestion[] }
interface StoredLesson { id: string; order_index: number; lesson_drafts: StoredDraft[] }

interface StoredExamConfig {
  // build_mode/preset_type ยังอยู่ในคอลัมน์ฐานข้อมูลเดิม (ยุบโหมด preset ออกแล้ว ไม่ต้อง migrate
  // schema) แต่หน้านี้ไม่ต้องอ่านมาใช้อีกต่อไป เหลือแค่ custom_constraints ที่จำเป็นจริง
  custom_constraints: { lessonId: string | null; difficulty: "easy" | "medium" | "hard"; count: number }[] | null;
}

export default async function CourseExamManagementPage({ courseId, workspace }: { courseId: string; workspace: "teacher" | "admin" }): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/${workspace}/courses/${courseId}/exam`);

  const [
    { data: profile },
    { data: course, error: courseError },
    { data: certificateSettings },
    { data: lessonsData, error: lessonsError },
    { data: examConfigData },
  ] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    // Keep the existence/ownership query limited to the original course columns.
    // Optional feature columns may not exist yet while a migration is rolling out;
    // bundling them here used to turn that schema error into a misleading 404.
    supabase.from("courses").select("id, title, created_by").eq("id", courseId).maybeSingle(),
    supabase.from("courses").select("certificate_enabled, certificate_pass_percentage").eq("id", courseId).maybeSingle(),
    supabase.from("lessons").select(`id, order_index, lesson_drafts(id, created_at, quiz_questions(question_text, explanation, order_index, video_timestamp_seconds, interaction_type, quiz_choices(choice_text, is_correct, order_index)))`).eq("course_id", courseId).order("order_index", { ascending: true }),
    supabase.from("course_exam_configs").select("custom_constraints").eq("course_id", courseId).maybeSingle(),
  ]);

  if (courseError) {
    console.error("[course/exam] failed to load course:", courseId, courseError.message);
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="mb-2 text-[15px] font-bold text-red-500">โหลดข้อมูลคอร์สไม่สำเร็จ</p>
        <p className="mb-6 text-[13.5px] text-[#0F1B3D]/50">อาจเกิดจากปัญหาการเชื่อมต่อชั่วคราว กรุณาลองใหม่อีกครั้ง</p>
        <Link
          href={`/dashboard/${workspace}/courses/${courseId}/exam`}
          className="inline-block rounded-xl bg-[#0F1B3D] px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-[#0F1B3D]/90"
        >
          ลองใหม่
        </Link>
      </div>
    );
  }
  if (!course) notFound();
  const allowed = profile?.role === "admin" || (profile?.role === "teacher" && course.created_by === user.id);
  if (!allowed) redirect(`/dashboard/${workspace}`);

  // `exam_status` was introduced after the exam screen. It is only needed by
  // the admin review controls, so a missing column must not block teachers.
  const { data: examReview } = workspace === "admin"
    ? await supabase.from("courses").select("exam_status").eq("id", courseId).maybeSingle()
    : { data: null };

  const certificateEnabled = certificateSettings?.certificate_enabled ?? false;
  const certificatePassPercentage = Number(certificateSettings?.certificate_pass_percentage ?? 70);

  const lessons = (lessonsData ?? []) as unknown as StoredLesson[];
  const questions = lessons.flatMap((lesson) => {
    const latestDraft = [...(lesson.lesson_drafts ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return (latestDraft?.quiz_questions ?? [])
      .filter((question) => question.video_timestamp_seconds == null)
      .sort((a, b) => a.order_index - b.order_index);
  }).map((question) => ({
    questionText: question.question_text,
    explanation: question.explanation,
     interactionType: question.interaction_type ?? "multiple_choice",
    choices: [...question.quiz_choices].sort((a, b) => a.order_index - b.order_index).map((choice) => ({ text: choice.choice_text, isCorrect: choice.is_correct })),
  }));
  
  const examConfig = examConfigData as StoredExamConfig | null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/${workspace}/courses/${courseId}`} className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับไปจัดการคอร์ส</Link>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Final assessment</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">บททดสอบท้ายคอร์ส</h1>
      <p className="mt-1 text-sm font-semibold text-[#0F1B3D]/65">{course.title}</p>
      <div className="my-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[13px] leading-6 text-blue-800">
        ผู้เรียนจะทำบททดสอบนี้หลังเรียนครบทุกบท และต้องได้อย่างน้อย <strong>{certificatePassPercentage}%</strong> เพื่อรับใบรับรอง {certificateEnabled ? "(เปิดใช้งานใบรับรองแล้ว)" : "(ขณะนี้ปิดการออกใบรับรอง)"}
      </div>
      {lessonsError && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดคำถามเดิมไม่สำเร็จ: {lessonsError.message}</p>}
      <CourseExamEditor
        courseId={courseId}
        initialQuestions={questions}
        lessons={lessons.map((lesson) => ({ id: lesson.id, title: `บทที่ ${lesson.order_index + 1}` }))}
        initialExamConfig={
          examConfig ? { customConstraints: examConfig.custom_constraints } : null
        }
        workspace={workspace}
        readOnly={workspace === "admin"}
      />
      {workspace === "admin" && (
        <div className="mt-8">
          <CourseExamReviewActions
            courseId={courseId}
            examStatus={(examReview?.exam_status ?? "pending") as "pending" | "approved" | "rejected"}
          />
        </div>
        )}
      
    </div>
  );
}
