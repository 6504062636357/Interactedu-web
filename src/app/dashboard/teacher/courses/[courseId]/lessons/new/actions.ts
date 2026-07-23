// app/teacher/courses/[courseId]/lessons/new/actions.ts
"use server";

import { createClient } from "@/utils/supabase/server";

export interface DraftChoiceInput {
  text: string;
  isCorrect: boolean;
}

export interface DraftQuestionInput {
  questionText: string;
  choices: DraftChoiceInput[];
}

interface SaveLessonDraftInput {
  courseId: string;
  moduleId: string | null;
  title: string;
  videoUrl: string | null;
  contentHtml: string;
  questions: DraftQuestionInput[];
}

interface SaveLessonDraftResult {
  draftId?: string;
  error?: string;
}

export async function saveLessonDraft(input: SaveLessonDraftInput): Promise<SaveLessonDraftResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };
  if (!input.moduleId) return { error: "ไม่พบหมวดบทเรียนของคอร์สนี้" };
  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อบทเรียน" };

  // 1. หา order_index ถัดไปใน module
  const { data: lastLesson } = await supabase
    .from("lessons")
    .select("order_index")
    .eq("module_id", input.moduleId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrderIndex = (lastLesson?.order_index ?? -1) + 1;

  // 2. สร้าง lesson จริง
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .insert({
      module_id: input.moduleId,
      course_id: input.courseId,
      title: input.title,
      video_url: input.videoUrl,
      order_index: nextOrderIndex,
    })
    .select("id")
    .single();

  if (lessonError || !lesson) {
    console.error("Failed to create lesson:", lessonError?.message);
    return { error: "สร้างบทเรียนไม่สำเร็จ กรุณาลองใหม่" };
  }

  // 3. สร้าง draft ผูกกับ lesson นั้น
  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .insert({
      lesson_id: lesson.id,
      teacher_id: user.id,
      video_url: input.videoUrl,
      content_html: input.contentHtml,
      status: "draft",
    })
    .select("id")
    .single();

  if (draftError || !draft) {
    console.error("Failed to save lesson draft:", draftError?.message);
    return { error: "บันทึกฉบับร่างไม่สำเร็จ กรุณาลองใหม่" };
  }

  // 4. สร้างคำถาม + ตัวเลือก
  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i];
    if (!q.questionText.trim()) continue;

    const { data: question, error: questionError } = await supabase
      .from("quiz_questions")
      .insert({ lesson_draft_id: draft.id, question_text: q.questionText, order_index: i })
      .select("id")
      .single();

    if (questionError || !question) {
      console.error("Failed to save question:", questionError?.message);
      return { error: "บันทึกคำถามไม่สำเร็จ กรุณาลองใหม่" };
    }

    const choiceRows = q.choices
      .filter((c) => c.text.trim())
      .map((c, cIndex) => ({
        question_id: question.id,
        choice_text: c.text,
        is_correct: c.isCorrect,
        order_index: cIndex,
      }));

    if (choiceRows.length > 0) {
      const { error: choicesError } = await supabase.from("quiz_choices").insert(choiceRows);
      if (choicesError) {
        console.error("Failed to save choices:", choicesError.message);
        return { error: "บันทึกตัวเลือกไม่สำเร็จ กรุณาลองใหม่" };
      }
    }
  }

  return { draftId: draft.id };
}

export interface ExistingDraftData {
  lessonId: string;
  draftId: string;
  title: string;
  videoUrl: string | null;
  contentHtml: string;
  status: string;
  questions: {
    questionText: string;
    choices: { text: string; isCorrect: boolean }[];
  }[];
}

export async function getLessonDraftForEdit(lessonId: string): Promise<{ data?: ExistingDraftData; error?: string }> {
  const supabase = await createClient();

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, title")
    .eq("id", lessonId)
    .single();

  if (lessonError || !lesson) return { error: "ไม่พบบทเรียนนี้" };

  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select(
      `id, video_url, content_html, status,
       quiz_questions ( question_text, order_index,
         quiz_choices ( choice_text, is_correct, order_index ) )`
    )
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError) return { error: "โหลดฉบับร่างไม่สำเร็จ" };
  if (!draft) return { error: "ยังไม่มีฉบับร่างของบทเรียนนี้" };

  const questions = ((draft as any).quiz_questions ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((q: any) => ({
      questionText: q.question_text,
      choices: (q.quiz_choices ?? [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((c: any) => ({ text: c.choice_text, isCorrect: c.is_correct })),
    }));

  return {
    data: {
      lessonId: lesson.id,
      draftId: draft.id,
      title: lesson.title,
      videoUrl: draft.video_url,
      contentHtml: draft.content_html ?? "",
      status: draft.status,
      questions,
    },
  };
}

// ---- เพิ่มใหม่: อัปเดต draft เดิม แทนที่จะ insert ใหม่ ----
export async function updateLessonDraft(input: {
  draftId: string;
  lessonId: string;
  title: string;
  videoUrl: string | null;
  contentHtml: string;
  questions: DraftQuestionInput[];
}): Promise<SaveLessonDraftResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };
  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อบทเรียน" };

  // 1. อัปเดตชื่อ lesson
  const { error: lessonError } = await supabase
    .from("lessons")
    .update({ title: input.title, video_url: input.videoUrl })
    .eq("id", input.lessonId);

  if (lessonError) return { error: "อัปเดตชื่อบทเรียนไม่สำเร็จ" };

  // 2. อัปเดต draft (กลับเป็นสถานะ draft ทุกครั้งที่แก้ หลังโดนตีกลับ/แก้เพิ่ม)
  const { error: draftError } = await supabase
    .from("lesson_drafts")
    .update({
      video_url: input.videoUrl,
      content_html: input.contentHtml,
      status: "draft",
    })
    .eq("id", input.draftId)
    .eq("teacher_id", user.id);

  if (draftError) return { error: "อัปเดตฉบับร่างไม่สำเร็จ" };

  // 3. ลบคำถาม/ตัวเลือกเก่าทิ้งแล้วสร้างใหม่ (ง่ายและชัวร์สุดสำหรับกรณีนี้)
  const { error: deleteError } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("lesson_draft_id", input.draftId);

  if (deleteError) return { error: "ลบคำถามเก่าไม่สำเร็จ" };

  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i];
    if (!q.questionText.trim()) continue;

    const { data: question, error: questionError } = await supabase
      .from("quiz_questions")
      .insert({ lesson_draft_id: input.draftId, question_text: q.questionText, order_index: i })
      .select("id")
      .single();

    if (questionError || !question) return { error: "บันทึกคำถามไม่สำเร็จ" };

    const choiceRows = q.choices
      .filter((c) => c.text.trim())
      .map((c, cIndex) => ({
        question_id: question.id,
        choice_text: c.text,
        is_correct: c.isCorrect,
        order_index: cIndex,
      }));

    if (choiceRows.length > 0) {
      const { error: choicesError } = await supabase.from("quiz_choices").insert(choiceRows);
      if (choicesError) return { error: "บันทึกตัวเลือกไม่สำเร็จ" };
    }
  }

  return { draftId: input.draftId };
}

export async function submitDraftForReview(draftId: string, courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { error } = await supabase
    .from("lesson_drafts")
    .update({ status: "pending_review", submitted_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("teacher_id", user.id);

  if (error) {
    console.error("Failed to submit draft:", error.message);
    return { error: "ส่งตรวจสอบไม่สำเร็จ กรุณาลองใหม่" };
  }

  // เพิ่มใหม่: อัปเดตสถานะคอร์สเป็นรออนุมัติ
  const { error: courseError } = await supabase
    .from("courses")
    .update({ status: "pending" })
    .eq("id", courseId);

  if (courseError) {
    console.error("Failed to update course status:", courseError.message);
    return { error: "อัปเดตสถานะคอร์สไม่สำเร็จ กรุณาลองใหม่" };
  }

  return {};
}

