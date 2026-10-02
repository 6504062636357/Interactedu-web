"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { validateDragDropAuthoring, validateMultiSelectAuthoring } from "@/lib/quiz/validators/authoring";
import { DRAG_DROP_ENABLED, MULTI_SELECT_ENABLED } from "@/lib/quiz/config/rollout";

// แปลง error ดิบจากฐานข้อมูล (เช่น "violates check constraint ...") เป็นข้อความที่ครูอ่านรู้เรื่อง
// — ข้อความเทคนิคเต็มยังถูก log ฝั่งเซิร์ฟเวอร์ไว้ให้ผู้ดูแลตรวจสอบ ไม่ส่งไปให้ผู้ใช้เห็น
function toTeacherSaveError(error: { message?: string; code?: string } | null | undefined, action: "save" | "delete" = "save"): string {
  console.error("[question-bank]", action, error?.code, error?.message);
  if (error?.code === "42501") return "คุณไม่มีสิทธิ์ดำเนินการกับข้อสอบข้อนี้";
  return action === "delete"
    ? "ลบข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
    : "บันทึกข้อสอบไม่สำเร็จ กรุณาตรวจสอบข้อมูลคำตอบหรือลองใหม่อีกครั้ง";
}

export type Difficulty = "easy" | "medium" | "hard";
// ตัดตัวเลือก "code_practical" ออกแล้ว (ไม่เคยมีโค้ดจุดไหนใช้ branch ตามค่านี้เลยนอกจาก
// dropdown ในฟอร์ม) เหลือแค่ multiple_choice อย่างเดียว ยังคง field/column เดิมไว้เผื่ออนาคต
export type QuestionFormat = "multiple_choice";
export type UsageType = "popup" | "final";
export type PrivacyScope = "private" | "department" | "public";

export type InteractionType = "multiple_choice" | "true_false" | "multi_select" | "sequencing" | "matching" | "fill_in_blank" | "drag_drop" | "note_callout";

// type ที่รองรับ choices (question_bank_choices) — ต้อง sync กับ frontend ENABLED_INTERACTION_TYPES
const CHOICE_BASED_TYPES: InteractionType[] = ["multiple_choice", "true_false", "multi_select"];

export interface QuestionBankChoiceInput {
  text: string;
  isCorrect: boolean;
}

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพประกอบคำถาม x/y เป็น % ของขนาดภาพ (0-100) — shape เดียวกับ
// ImagePinInput ใน src/app/dashboard/teacher/courses/[courseId]/lessons/new/actions.ts =====
export interface ImagePinInput {
  id: string;
  x: number;
  y: number;
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
  interactionType: InteractionType;
  answerData: unknown | null;// ใช้เฉพาะ sequencing/matching/fill_in_blank/note_callout
  imageUrl: string | null; // รูปภาพประกอบคำถาม (ถ้ามี) — public URL บน R2
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (ไม่บังคับ ใช้ได้เมื่อมี imageUrl) =====
  imageCaption: string | null;
  imagePins: ImagePinInput[] | null;
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

  // multi_select: ตรวจแยกก่อน (ถูกได้หลายข้อ) — ใช้ได้ทั้ง Final Exam และ Pop-up Quiz (popup UI ใน generate.ts รองรับแล้ว)
  if (input.interactionType === "multi_select") {
    if (!MULTI_SELECT_ENABLED) return "ยังไม่เปิดให้ใช้คำถามแบบ Multiple Select";
    const problems = validateMultiSelectAuthoring(input.choices.filter((choice) => choice.text.trim()));
    return problems.length > 0 ? problems.join(" / ") : null;
  }

  // drag_drop (เติมคำแบบลากวาง): ใช้ได้ทั้ง Final Exam และ Pop-up Quiz
  if (input.interactionType === "drag_drop") {
    if (!DRAG_DROP_ENABLED) return "ยังไม่เปิดให้ใช้คำถามแบบเติมคำ (ลากวาง)";
    const problems = validateDragDropAuthoring(input.answerData);
    return problems.length > 0 ? problems.join(" / ") : null;
  }

  const isChoiceBased = CHOICE_BASED_TYPES.includes(input.interactionType);

  if (isChoiceBased) {
    const choices = input.choices.filter((choice) => choice.text.trim());
    if (choices.length < 2) return "กรุณากรอกตัวเลือกอย่างน้อย 2 ตัวเลือก";
    if (choices.filter((choice) => choice.isCorrect).length !== 1) return "กรุณาเลือกคำตอบที่ถูกต้องเพียง 1 ตัวเลือก";
  } else if (input.interactionType !== "note_callout") {
    // sequencing/matching/fill_in_blank ต้องมี answer_data เสมอ (note_callout ไม่บังคับ)
    if (!input.answerData) return "กรุณากำหนดเฉลยสำหรับคำถามประเภทนี้";
  }

  // const choices = input.choices.filter((choice) => choice.text.trim());
  // if (choices.length < 2) return "ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก";
  // if (choices.filter((choice) => choice.isCorrect).length !== 1) return "ต้องมีคำตอบที่ถูกเพียง 1 ตัวเลือก";
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

// ★ B7 fix: เดิม createQuestionBankItem/updateQuestionBankItem รับ topicTags.courseId/lessonId
// จาก client มาผูกเข้า question_bank_topic_tags ตรง ๆ โดยไม่เคยเช็คว่าครูคนนี้เป็นเจ้าของ/ผู้สอน
// คอร์สนั้นจริงไหม — RLS ของตาราง question_bank_topic_tags (qb_tags_owner_all) เช็คแค่ว่า
// "เจ้าของคำถาม" ตรงกับผู้ใช้ ไม่ได้เช็คว่า courseId ที่ถูกผูกเป็นคอร์สของครูคนนั้นด้วย ผลคือครูคน
// หนึ่งส่ง courseId ของอีกคนมาผูกคำถามตัวเองเข้าคลังคอร์สนั้นได้เลย — คำถามนั้นจะไปโผล่ในคลังสุ่ม
// final exam/popup quiz ของคอร์สคนอื่นทันทีโดยเจ้าของคอร์สไม่รู้ตัว ฟังก์ชันนี้เช็คสิทธิ์ก่อนบันทึกจริง
async function verifyTopicTagOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  topicTags: QuestionBankTopicTagInput[],
  teacherId: string,
  isAdmin: boolean
): Promise<string | null> {
  if (isAdmin || topicTags.length === 0) return null;

  const courseIds = [...new Set(topicTags.map((t) => t.courseId))];
  const [{ data: courses }, { data: coTeaching }] = await Promise.all([
    supabase.from("courses").select("id, created_by, title").in("id", courseIds),
    supabase.from("course_teachers").select("course_id").eq("teacher_id", teacherId).in("course_id", courseIds),
  ]);

  const foundIds = new Set((courses ?? []).map((c) => c.id));
  const missing = courseIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) return "พบคอร์สที่เลือกไม่มีอยู่จริงในระบบ กรุณาเลือกคอร์สใหม่";

  const coTeachingIds = new Set((coTeaching ?? []).map((r) => r.course_id));
  const unauthorized = (courses ?? []).filter((c) => c.created_by !== teacherId && !coTeachingIds.has(c.id));
  if (unauthorized.length > 0) {
    return `ไม่มีสิทธิ์ผูกคำถามกับคอร์สนี้: ${unauthorized.map((c) => c.title).join(", ")}`;
  }
  return null;
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

  const ownershipError = await verifyTopicTagOwnership(supabase, input.topicTags, auth.user.id, auth.isAdmin);
  if (ownershipError) return { error: ownershipError };

  const isChoiceBased = CHOICE_BASED_TYPES.includes(input.interactionType);

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
      interaction_type: input.interactionType,
      answer_data: isChoiceBased ? null : input.answerData,
      image_url: input.imageUrl || null,
      image_caption: input.imageCaption?.trim() || null,
      image_pins: input.imagePins ?? null,
    })
    .select("id")
    .single();
  if (questionError || !question) return { error: toTeacherSaveError(questionError) };

  if (isChoiceBased) {
    const choiceRows = input.choices
      .filter((choice) => choice.text.trim())
      .map((choice, index) => ({
        question_id: question.id,
        choice_text: choice.text.trim(),
        is_correct: choice.isCorrect,
        order_index: index,
      }));
    const { error: choicesError } = await supabase.from("question_bank_choices").insert(choiceRows);
    if (choicesError) return { error: toTeacherSaveError(choicesError) };
  }
  // const choiceRows = input.choices
  //   .filter((choice) => choice.text.trim())
  //   .map((choice, index) => ({
  //     question_id: question.id,
  //     choice_text: choice.text.trim(),
  //     is_correct: choice.isCorrect,
  //     order_index: index,
  //   }));
  // const { error: choicesError } = await supabase.from("question_bank_choices").insert(choiceRows);
  // if (choicesError) return { error: `บันทึกตัวเลือกไม่สำเร็จ: ${choicesError.message}` };

    if (input.topicTags.length) {
    const { courseMap, lessonMap } = await fetchTitleMaps(supabase, input.topicTags);
    const { error: tagsError } = await supabase
      .from("question_bank_topic_tags")
      .insert(buildTagRows(question.id, input.topicTags, courseMap, lessonMap));
    if (tagsError) return { error: toTeacherSaveError(tagsError) };
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

  const ownershipError = await verifyTopicTagOwnership(supabase, input.topicTags, auth.user.id, auth.isAdmin);
  if (ownershipError) return { error: ownershipError };

  const isChoiceBased = CHOICE_BASED_TYPES.includes(input.interactionType);

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
      interaction_type: input.interactionType,
      answer_data: isChoiceBased ? null : input.answerData,
      image_url: input.imageUrl || null,
      image_caption: input.imageCaption?.trim() || null,
      image_pins: input.imagePins ?? null,
    })
    .eq("id", id);
  if (updateError) return { error: toTeacherSaveError(updateError) };

  // แทนที่ choices/tags ทั้งชุด (ง่ายและปลอดภัยกว่า diff รายตัว)
  const { error: deleteChoicesError } = await supabase.from("question_bank_choices").delete().eq("question_id", id);
  if (deleteChoicesError) return { error: toTeacherSaveError(deleteChoicesError) };
  // const choiceRows = input.choices
  //   .filter((choice) => choice.text.trim())
  //   .map((choice, index) => ({ question_id: id, choice_text: choice.text.trim(), is_correct: choice.isCorrect, order_index: index }));
  // const { error: insertChoicesError } = await supabase.from("question_bank_choices").insert(choiceRows);
  // if (insertChoicesError) return { error: toTeacherSaveError(insertChoicesError) };
    if (isChoiceBased) {
    const choiceRows = input.choices
      .filter((choice) => choice.text.trim())
      .map((choice, index) => ({ question_id: id, choice_text: choice.text.trim(), is_correct: choice.isCorrect, order_index: index }));
    const { error: insertChoicesError } = await supabase.from("question_bank_choices").insert(choiceRows);
    if (insertChoicesError) return { error: toTeacherSaveError(insertChoicesError) };
  }

  const { error: deleteTagsError } = await supabase.from("question_bank_topic_tags").delete().eq("question_id", id);
  if (deleteTagsError) return { error: toTeacherSaveError(deleteTagsError) };
    if (input.topicTags.length) {
    const { courseMap, lessonMap } = await fetchTitleMaps(supabase, input.topicTags);
    const { error: insertTagsError } = await supabase
      .from("question_bank_topic_tags")
      .insert(buildTagRows(id, input.topicTags, courseMap, lessonMap));
    if (insertTagsError) return { error: toTeacherSaveError(insertTagsError) };
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
  if (error) return { error: toTeacherSaveError(error, "delete") };

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
      interaction_type: source.interaction_type,
      answer_data: source.answer_data,
      image_url: source.image_url,
      image_caption: source.image_caption,
      image_pins: source.image_pins,
    })
    .select("id")
    .single();
  if (copyError || !copied) return { error: toTeacherSaveError(copyError) };

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
