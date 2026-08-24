import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import QuestionBankForm from "@/components/teacher/QuestionBankForm";

export default async function EditQuestionBankPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactElement> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/teacher/question-bank/${id}/edit`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  const [{ data: question }, { data: lessonsData }] = await Promise.all([
    supabase
      .from("question_bank")
      .select("*, question_bank_choices(choice_text, is_correct, order_index), question_bank_topic_tags(course_id, lesson_id)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id, order_index, course_id, courses!inner(title, created_by)")
      .eq("courses.created_by", user.id)
      .order("order_index", { ascending: true }),
  ]);

  if (!question) notFound();
  if (profile?.role !== "admin" && question.owner_teacher_id !== user.id) redirect("/dashboard/teacher/question-bank");

  const lessons = (lessonsData ?? []).map((lesson) => ({
    id: lesson.id,
    courseId: lesson.course_id,
    courseTitle: (lesson.courses as unknown as { title: string }).title,
    orderIndex: lesson.order_index,
    title: `บทที่ ${lesson.order_index + 1}`,
  }));

  const initialData = {
    questionText: question.question_text,
    explanation: question.explanation,
    category: question.category,
    difficulty: question.difficulty,
    format: question.format,
    usageType: question.usage_type,
    privacyScope: question.privacy_scope,
    topicTags: (question.question_bank_topic_tags ?? [])
      .filter((tag: { course_id: string | null }) => tag.course_id)
      .map((tag: { course_id: string | null; lesson_id: string | null }) => ({ courseId: tag.course_id as string, lessonId: tag.lesson_id })),
    choices: [...(question.question_bank_choices ?? [])]
      .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
      .map((choice: { choice_text: string; is_correct: boolean }) => ({ text: choice.choice_text, isCorrect: choice.is_correct })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/teacher/question-bank" className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับไปคลังข้อสอบ</Link>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Question Bank</p>
      <h1 className="mt-1 mb-6 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">แก้ไขคำถาม</h1>
      <QuestionBankForm questionId={id} lessons={lessons} initialData={initialData} />
    </div>
  );
}