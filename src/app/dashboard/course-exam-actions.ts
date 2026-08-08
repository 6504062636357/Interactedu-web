"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export interface CourseExamQuestionInput {
  questionText: string;
  explanation: string | null;
  choices: { text: string; isCorrect: boolean }[];
}

export async function saveCourseFinalExam(input: {
  courseId: string;
  questions: CourseExamQuestionInput[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const [{ data: profile }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("id, created_by").eq("id", input.courseId).maybeSingle(),
  ]);
  if (!course) return { error: "ไม่พบคอร์สนี้" };
  const isAdmin = profile?.role === "admin";
  if (!isAdmin && (profile?.role !== "teacher" || course.created_by !== user.id)) {
    return { error: "ไม่มีสิทธิ์แก้ไขบททดสอบของคอร์สนี้" };
  }

  if (input.questions.length === 0) return { error: "กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ" };
  for (let index = 0; index < input.questions.length; index += 1) {
    const question = input.questions[index];
    if (!question.questionText.trim()) return { error: `กรุณากรอกคำถามข้อ ${index + 1}` };
    const choices = question.choices.filter((choice) => choice.text.trim());
    if (choices.length < 2) return { error: `คำถามข้อ ${index + 1} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก` };
    if (choices.filter((choice) => choice.isCorrect).length !== 1) {
      return { error: `คำถามข้อ ${index + 1} ต้องมีคำตอบที่ถูกเพียง 1 ตัวเลือก` };
    }
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, order_index")
    .eq("course_id", input.courseId)
    .order("order_index", { ascending: true });
  if (lessonsError) return { error: lessonsError.message };
  if (!lessons?.length) return { error: "กรุณาสร้างบทเรียนอย่างน้อย 1 บทก่อนสร้างบททดสอบท้ายคอร์ส" };

  const lessonIds = lessons.map((lesson) => lesson.id);
  const { data: drafts, error: draftsError } = await supabase
    .from("lesson_drafts")
    .select("id, lesson_id, created_at")
    .in("lesson_id", lessonIds)
    .order("created_at", { ascending: false });
  if (draftsError) return { error: draftsError.message };
  if (!drafts?.length) return { error: "กรุณาบันทึกเนื้อหาบทเรียนอย่างน้อย 1 บทก่อนสร้างบททดสอบ" };

  const lastLessonWithDraft = [...lessons].reverse().find((lesson) => drafts.some((draft) => draft.lesson_id === lesson.id));
  const targetDraft = drafts.find((draft) => draft.lesson_id === lastLessonWithDraft?.id);
  if (!targetDraft) return { error: "ไม่พบฉบับร่างสำหรับจัดเก็บบททดสอบ" };

  const draftIds = drafts.map((draft) => draft.id);
  const { error: deleteError } = await supabase
    .from("quiz_questions")
    .delete()
    .in("lesson_draft_id", draftIds)
    .is("video_timestamp_seconds", null);
  if (deleteError) return { error: `ลบบททดสอบเดิมไม่สำเร็จ: ${deleteError.message}` };

  for (let questionIndex = 0; questionIndex < input.questions.length; questionIndex += 1) {
    const question = input.questions[questionIndex];
    const { data: createdQuestion, error: questionError } = await supabase
      .from("quiz_questions")
      .insert({
        lesson_draft_id: targetDraft.id,
        question_text: question.questionText.trim(),
        explanation: question.explanation?.trim() || null,
        video_timestamp_seconds: null,
        order_index: questionIndex,
      })
      .select("id")
      .single();
    if (questionError || !createdQuestion) return { error: questionError?.message ?? "บันทึกคำถามไม่สำเร็จ" };

    const choiceRows = question.choices
      .filter((choice) => choice.text.trim())
      .map((choice, choiceIndex) => ({
        question_id: createdQuestion.id,
        choice_text: choice.text.trim(),
        is_correct: choice.isCorrect,
        order_index: choiceIndex,
      }));
    const { error: choicesError } = await supabase.from("quiz_choices").insert(choiceRows);
    if (choicesError) return { error: `บันทึกตัวเลือกไม่สำเร็จ: ${choicesError.message}` };
  }

  if (!isAdmin) await supabase.from("courses").update({ status: "draft" }).eq("id", input.courseId);

  revalidatePath(`/dashboard/teacher/courses/${input.courseId}`);
  revalidatePath(`/dashboard/teacher/courses/${input.courseId}/exam`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}/exam`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}/review`);
  return {};
}
