"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionFormat = "multiple_choice" | "code_practical";
export type UsageType = "popup" | "final";
export type PrivacyScope = "private" | "department" | "public";

export interface QuestionBankChoiceInput {
  text: string;
  isCorrect: boolean;
}

// เป้าหมายการผูกเนื้อหา 1 รายการ: เลือกคอร์ส+บทเรียน (lessonId มีค่า) หรือเลือกทั้งคอร์ส (lessonId เป็น null)
export interface QuestionBankTopicTagInput {
  courseId: string;
  lessonId: string | null;
}

export interface QuestionBankInput {
  questionText: string;
  explanation: string | null;
  category: string | null;
  difficulty: Difficulty;
  format: QuestionFormat;
  usageType: UsageType;
  privacyScope: PrivacyScope;
  topicTags: QuestionBankTopicTagInput[]; // เว้นว่าง [] = ข้อสอบภาพรวม ไม่ผูกกับคอร์ส/บทเรียนใดเลย
  choices: QuestionBankChoiceInput[];
}

async function requireTeacher(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") return { error: "ไม่มีสิทธิ์เข้าถึงคลังข้อสอบ" as const };
  return { user, isAdmin: profile.role === "admin" };
}

function validateQuestion(input: QuestionBankInput): string | null {
  if (!input.questionText.trim()) return "กรุณากรอกคำถาม";
  const choices = input.choices.filter((choice) => choice.text.trim());
  if (choices.length < 2) return "ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก";
  if (choices.filter((choice) => choice.isCorrect).length !== 1) return "ต้องมีคำตอบที่ถูกเพียง 1 ตัวเลือก";
  return null;
}

function buildTagRows(
  questionId: string,
  topicTags: QuestionBankTopicTagInput[],
  courseMap: Map<string, string>,
  lessonMap: Map<string, string>
) {
  return topicTags.map((tag) => {
    const courseTitle = courseMap.get(tag.courseId) ?? "";
    const lessonTitle = tag.lessonId ? lessonMap.get(tag.lessonId) ?? "" : null;
    return {
      question_id: questionId,
      course_id: tag.courseId,
      lesson_id: tag.lessonId,
      topic_label: lessonTitle ? `${courseTitle} / ${lessonTitle}` : courseTitle,
    };
  });
}

async function fetchTitleMaps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  topicTags: QuestionBankTopicTagInput[]
) {
  const courseIds = [...new Set(topicTags.map((t) => t.courseId))];
  const lessonIds = [...new Set(topicTags.map((t) => t.lessonId).filter((id): id is string => !!id))];

  const [{ data: courses }, { data: lessons }] = await Promise.all([
    courseIds.length
      ? supabase.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    lessonIds.length
      ? supabase.from("lessons").select("id, title").in("id", lessonIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  return {
    courseMap: new Map((courses ?? []).map((c) => [c.id, c.title])),
    lessonMap: new Map((lessons ?? []).map((l) => [l.id, l.title])),
  };
}

export async function createQuestionBankItem(input: QuestionBankInput): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const auth = await requireTeacher(supabase);
  if ("error" in auth) return { error: auth.error };

  const validationError = validateQuestion(input);
  if (validationError) return { error: validationError };

  const { data: question, error: questionError } = await supabase
    .from("question_bank")
    .insert({
      owner_teacher_id: auth.user.id,
      question_text: input.questionText.trim(),
      explanation: input.explanation?.trim() || null,
      category: input.category?.trim() || null,
      difficulty: input.difficulty,
      format: input.format,
      usage_type: input.usageType,
      privacy_scope: input.privacyScope,
    })
    .select("id")
    .single();
  if (questionError || !question) return { error: questionError?.message ?? "สร้างคำถามไม่สำเร็จ" };

  const choiceRows = input.choices
    .filter((choice) => choice.text.trim())
    .map((choice, index) => ({
      question_id: question.id,
      choice_text: choice.text.trim(),
      is_correct: choice.isCorrect,
      order_index: index,
    }));
  const { error: choicesError } = await supabase.from("question_bank_choices").insert(choiceRows);
  if (choicesError) return { error: `บันทึกตัวเลือกไม่สำเร็จ: ${choicesError.message}` };

    if (input.topicTags.length) {
    const { courseMap, lessonMap } = await fetchTitleMaps(supabase, input.topicTags);
    const { error: tagsError } = await supabase
      .from("question_bank_topic_tags")
      .insert(buildTagRows(question.id, input.topicTags, courseMap, lessonMap));
    if (tagsError) return { error: `บันทึกแท็กคอร์ส/บทเรียนไม่สำเร็จ: ${tagsError.message}` };
  }

  revalidatePath("/dashboard/teacher/question-bank");
  return { id: question.id };
}

export async function updateQuestionBankItem(id: string, input: QuestionBankInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  const auth = await requireTeacher(supabase);
  if ("error" in auth) return { error: auth.error };

  const validationError = validateQuestion(input);
  if (validationError) return { error: validationError };

  // owner-only check ทำที่ RLS อยู่แล้ว (qb_owner_all) แต่เช็คซ้ำฝั่ง action เพื่อ error message ที่ชัดเจน
  const { data: existing } = await supabase.from("question_bank").select("owner_teacher_id").eq("id", id).maybeSingle();
  if (!existing) return { error: "ไม่พบคำถามนี้" };
  if (!auth.isAdmin && existing.owner_teacher_id !== auth.user.id) return { error: "ไม่มีสิทธิ์แก้ไขคำถามนี้" };

  const { error: updateError } = await supabase
    .from("question_bank")
    .update({
      question_text: input.questionText.trim(),
      explanation: input.explanation?.trim() || null,
      category: input.category?.trim() || null,
      difficulty: input.difficulty,
      format: input.format,
      usage_type: input.usageType,
      privacy_scope: input.privacyScope,
    })
    .eq("id", id);
  if (updateError) return { error: updateError.message };

  // แทนที่ choices/tags ทั้งชุด (ง่ายและปลอดภัยกว่า diff รายตัว)
  const { error: deleteChoicesError } = await supabase.from("question_bank_choices").delete().eq("question_id", id);
  if (deleteChoicesError) return { error: deleteChoicesError.message };
  const choiceRows = input.choices
    .filter((choice) => choice.text.trim())
    .map((choice, index) => ({ question_id: id, choice_text: choice.text.trim(), is_correct: choice.isCorrect, order_index: index }));
  const { error: insertChoicesError } = await supabase.from("question_bank_choices").insert(choiceRows);
  if (insertChoicesError) return { error: insertChoicesError.message };

  const { error: deleteTagsError } = await supabase.from("question_bank_topic_tags").delete().eq("question_id", id);
  if (deleteTagsError) return { error: deleteTagsError.message };
    if (input.topicTags.length) {
    const { courseMap, lessonMap } = await fetchTitleMaps(supabase, input.topicTags);
    const { error: insertTagsError } = await supabase
      .from("question_bank_topic_tags")
      .insert(buildTagRows(id, input.topicTags, courseMap, lessonMap));
    if (insertTagsError) return { error: insertTagsError.message };
  }

  revalidatePath("/dashboard/teacher/question-bank");
  revalidatePath(`/dashboard/teacher/question-bank/${id}/edit`);
  return {};
}

export async function deleteQuestionBankItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const auth = await requireTeacher(supabase);
  if ("error" in auth) return { error: auth.error };

  const { data: existing } = await supabase.from("question_bank").select("owner_teacher_id").eq("id", id).maybeSingle();
  if (!existing) return { error: "ไม่พบคำถามนี้" };
  if (!auth.isAdmin && existing.owner_teacher_id !== auth.user.id) return { error: "ไม่มีสิทธิ์ลบคำถามนี้" };

  const { error } = await supabase.from("question_bank").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/teacher/question-bank");
  return {};
}

// copy-on-use: ครู B ดึงคำถาม department/public ของครู A มาเป็นของตัวเอง
export async function copyQuestionBankItem(sourceId: string): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const auth = await requireTeacher(supabase);
  if ("error" in auth) return { error: auth.error };

  const { data: source, error: sourceError } = await supabase
    .from("question_bank")
    .select("*, question_bank_choices(*), question_bank_topic_tags(*)")
    .eq("id", sourceId)
    .maybeSingle();
  if (sourceError || !source) return { error: "ไม่พบคำถามต้นฉบับ หรือไม่มีสิทธิ์เข้าถึง" };

  const { data: copied, error: copyError } = await supabase
    .from("question_bank")
    .insert({
      owner_teacher_id: auth.user.id,
      question_text: source.question_text,
      explanation: source.explanation,
      category: source.category,
      difficulty: source.difficulty,
      format: source.format,
      usage_type: source.usage_type,
      privacy_scope: "private", // สำเนาเริ่มเป็น private เสมอ ครู B ปรับเองทีหลังได้
      source_question_id: source.id,
    })
    .select("id")
    .single();
  if (copyError || !copied) return { error: copyError?.message ?? "คัดลอกคำถามไม่สำเร็จ" };

  const choiceRows = (source.question_bank_choices ?? []).map((choice: { choice_text: string; is_correct: boolean; order_index: number }) => ({
    question_id: copied.id,
    choice_text: choice.choice_text,
    is_correct: choice.is_correct,
    order_index: choice.order_index,
  }));
  if (choiceRows.length) await supabase.from("question_bank_choices").insert(choiceRows);

  const tagRows = (source.question_bank_topic_tags ?? []).map((tag: { course_id: string | null; lesson_id: string | null; topic_label: string }) => ({
    question_id: copied.id,
    course_id: tag.course_id,
    lesson_id: tag.lesson_id,
    topic_label: tag.topic_label,
  }));
  if (tagRows.length) await supabase.from("question_bank_topic_tags").insert(tagRows);

  revalidatePath("/dashboard/teacher/question-bank");
  return { id: copied.id };
}