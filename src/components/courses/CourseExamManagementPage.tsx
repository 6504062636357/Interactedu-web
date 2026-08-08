import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CourseExamEditor from "@/components/courses/CourseExamEditor";
import { createClient } from "@/utils/supabase/server";

interface StoredChoice { choice_text: string; is_correct: boolean; order_index: number }
interface StoredQuestion { question_text: string; explanation: string | null; order_index: number; video_timestamp_seconds: number | null; quiz_choices: StoredChoice[] }
interface StoredDraft { id: string; created_at: string; quiz_questions: StoredQuestion[] }
interface StoredLesson { id: string; order_index: number; lesson_drafts: StoredDraft[] }

export default async function CourseExamManagementPage({ courseId, workspace }: { courseId: string; workspace: "teacher" | "admin" }): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/${workspace}/courses/${courseId}/exam`);

  const [{ data: profile }, { data: course }, { data: lessonsData, error: lessonsError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("id, title, created_by, certificate_enabled, certificate_pass_percentage").eq("id", courseId).maybeSingle(),
    supabase.from("lessons").select(`id, order_index, lesson_drafts(id, created_at, quiz_questions(question_text, explanation, order_index, video_timestamp_seconds, quiz_choices(choice_text, is_correct, order_index)))`).eq("course_id", courseId).order("order_index", { ascending: true }),
  ]);

  if (!course) notFound();
  const allowed = profile?.role === "admin" || (profile?.role === "teacher" && course.created_by === user.id);
  if (!allowed) redirect(`/dashboard/${workspace}`);

  const lessons = (lessonsData ?? []) as unknown as StoredLesson[];
  const questions = lessons.flatMap((lesson) => {
    const latestDraft = [...(lesson.lesson_drafts ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return (latestDraft?.quiz_questions ?? [])
      .filter((question) => question.video_timestamp_seconds == null)
      .sort((a, b) => a.order_index - b.order_index);
  }).map((question) => ({
    questionText: question.question_text,
    explanation: question.explanation,
    choices: [...question.quiz_choices].sort((a, b) => a.order_index - b.order_index).map((choice) => ({ text: choice.choice_text, isCorrect: choice.is_correct })),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/${workspace}/courses/${courseId}`} className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับไปจัดการคอร์ส</Link>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Final assessment</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">บททดสอบท้ายคอร์ส</h1>
      <p className="mt-1 text-sm font-semibold text-[#0F1B3D]/65">{course.title}</p>
      <div className="my-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[13px] leading-6 text-blue-800">
        ผู้เรียนจะทำบททดสอบนี้หลังเรียนครบทุกบท และต้องได้อย่างน้อย <strong>{Number(course.certificate_pass_percentage)}%</strong> เพื่อรับใบรับรอง {course.certificate_enabled ? "(เปิดใช้งานใบรับรองแล้ว)" : "(ขณะนี้ปิดการออกใบรับรอง)"}
      </div>
      {lessonsError && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดคำถามเดิมไม่สำเร็จ: {lessonsError.message}</p>}
      <CourseExamEditor courseId={courseId} initialQuestions={questions} />
    </div>
  );
}
