"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { loadSampledFinalExamQuestions } from "@/lib/courses/question-bank-sampling";
import type { DragDropAnswerData, DragDropDisplay, ExamInteractionType, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
import { validateDragDropAuthoring, validateMultiSelectAuthoring } from "@/lib/quiz/validators/authoring";
import { DRAG_DROP_ENABLED, MULTI_SELECT_ENABLED } from "@/lib/quiz/config/rollout";

// type ที่รองรับ choices (quiz_choices) — matching/sequencing ใช้ answerData แทน (ไม่มี choices)
const CHOICE_BASED_TYPES = ["multiple_choice", "true_false", "multi_select"] as const;

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (ตามแบบ actions.ts ของ question-bank/lessons อื่นๆ) =====
interface ImagePinInput { id: string; x: number; y: number }

export interface CourseExamQuestionInput {
  questionText: string;
  explanation: string | null;
  choices: { text: string; isCorrect: boolean }[];
  interactionType: ExamInteractionType;
  imageUrl?: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  imageCaption?: string | null;
  imagePins?: ImagePinInput[] | null;
  // ===== เพิ่มใหม่: เฉลยของ matching/sequencing (ไม่ใช้กับ multiple_choice/true_false) =====
  answerData?: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
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
    const isChoiceBased = (CHOICE_BASED_TYPES as readonly string[]).includes(question.interactionType);

    // ===== เพิ่มใหม่: แยก validate ตาม interactionType — matching/sequencing ไม่มี choices เลย
    // จะใช้เงื่อนไข "ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก" แบบเดิมไม่ได้ =====
    if (question.interactionType === "multi_select") {
      // multi_select ถูกได้หลายข้อ — ใช้ตัวตรวจกลางตัวเดียวกับฟอร์ม (รายงานทุกปัญหาที่เจอ)
      if (!MULTI_SELECT_ENABLED) return { error: `คำถามข้อ ${index + 1}: ยังไม่เปิดให้ใช้คำถามแบบ Multiple Select` };
      const problems = validateMultiSelectAuthoring(question.choices.filter((choice) => choice.text.trim()));
      if (problems.length > 0) return { error: `คำถามข้อ ${index + 1} (Multiple Select): ${problems.join(" / ")}` };
    } else if (isChoiceBased) {
      const choices = question.choices.filter((choice) => choice.text.trim());
      if (choices.length < 2) return { error: `คำถามข้อ ${index + 1} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก` };
      if (choices.filter((choice) => choice.isCorrect).length !== 1) {
        return { error: `คำถามข้อ ${index + 1} ต้องมีคำตอบที่ถูกเพียง 1 ตัวเลือก` };
      }
      if (question.interactionType === "true_false" && choices.length !== 2) {
        return { error: `คำถามข้อ ${index + 1} เป็น True/False ต้องมี 2 ตัวเลือกเท่านั้น` };
      }
    } else if (question.interactionType === "matching") {
      const pairs = (question.answerData as MatchingAnswerData | null | undefined)?.pairs ?? [];
      const filled = pairs.filter((pair) => pair.left?.trim() && pair.right?.trim());
      if (filled.length < 2) return { error: `คำถามข้อ ${index + 1} (Matching) ต้องกรอกคู่จับคู่ให้ครบทั้งฝั่งซ้ายและขวา อย่างน้อย 2 คู่` };
      const leftValues = filled.map((pair) => pair.left.trim());
      if (new Set(leftValues).size !== leftValues.length) {
        return { error: `คำถามข้อ ${index + 1} (Matching) รายการฝั่งซ้ายห้ามซ้ำกัน` };
      }
    } else if (question.interactionType === "drag_drop") {
      // เติมคำแบบลากวาง — ใช้ตัวตรวจกลางตัวเดียวกับฟอร์มและ server (รายงานทุกปัญหาที่เจอ)
      if (!DRAG_DROP_ENABLED) return { error: `คำถามข้อ ${index + 1}: ยังไม่เปิดให้ใช้คำถามแบบเติมคำ (ลากวาง)` };
      const problems = validateDragDropAuthoring(question.answerData);
      if (problems.length > 0) return { error: `คำถามข้อ ${index + 1} (เติมคำ): ${problems.join(" / ")}` };
    } else if (question.interactionType === "sequencing") {
      const items = (question.answerData as SequencingAnswerData | null | undefined)?.items ?? [];
      if (items.filter((item) => item.text?.trim()).length < 2) {
        return { error: `คำถามข้อ ${index + 1} (Sequencing) ต้องกรอกรายการที่จะให้เรียงลำดับ อย่างน้อย 2 รายการ` };
      }
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

  const { data: editingCourse, error: stateError } = await supabase.from("courses")
    .update({ status: isAdmin ? "draft" : "pending", exam_status: "pending", exam_reviewed_by: null, exam_reviewed_at: null, exam_rejection_reason: null })
    .eq("id", input.courseId).select("id").maybeSingle();
  if (stateError || !editingCourse) return { error: "เตรียมคอร์สสำหรับแก้ไขบททดสอบไม่สำเร็จ" };

    const draftIds = drafts.map((draft) => draft.id);
  const { error: deleteError } = await supabase
    .from("quiz_questions")
    .delete()
    .in("lesson_draft_id", draftIds)
    .is("video_timestamp_seconds", null);
  if (deleteError) return { error: `ลบบททดสอบเดิมไม่สำเร็จ: ${deleteError.message}` };

  // ลบกติกาสุ่มข้อสอบเดิมทิ้ง (ถ้ามี) เพราะครูเปลี่ยนมาใช้โหมดพิมพ์เอง
  // ไม่ต้องเช็ค error รุนแรง เพราะถ้าไม่มีแถวอยู่แล้วก็ไม่มีผลอะไร
  const { error: deleteConfigError } = await supabase
    .from("course_exam_configs")
    .delete()
    .eq("course_id", input.courseId);
  if (deleteConfigError) return { error: `ลบกติกาสุ่มข้อสอบเดิมไม่สำเร็จ: ${deleteConfigError.message}` };

  for (let questionIndex = 0; questionIndex < input.questions.length; questionIndex += 1) {
    const question = input.questions[questionIndex];
    const isChoiceBased = (CHOICE_BASED_TYPES as readonly string[]).includes(question.interactionType);
    const { data: createdQuestion, error: questionError } = await supabase
      .from("quiz_questions")
      .insert({
        lesson_draft_id: targetDraft.id,
        question_text: question.questionText.trim(),
        explanation: question.explanation?.trim() || null,
        video_timestamp_seconds: null,
        order_index: questionIndex,
        interaction_type: question.interactionType,
        // ===== เพิ่มใหม่: เฉลย matching/sequencing เก็บใน answer_data (jsonb) — choice-based ไม่ใช้ ให้เป็น null
        answer_data: isChoiceBased ? null : question.answerData ?? null,
        image_url: question.imageUrl ?? null,
        image_caption: question.imageCaption?.trim() || null,
        image_pins: question.imagePins ?? null,
      })
      .select("id")
      .single();
    if (questionError || !createdQuestion) return { error: questionError?.message ?? "บันทึกคำถามไม่สำเร็จ" };

    // matching/sequencing ไม่มี choices เลย (เฉลยอยู่ใน answer_data ด้านบนแล้ว) — insert แค่ตอน choice-based เท่านั้น
    if (isChoiceBased) {
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
  }

  // if (!isAdmin) {
  //   await supabase.from("courses").update({ status: "draft" }).eq("id", input.courseId);

  //   const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
  //   if (admins?.length) {
  //     await supabase.from("notifications").insert(
  //       admins.map((admin) => ({
  //         user_id: admin.id,
  //         type: "course_exam_updated",
  //         course_id: input.courseId,
  //         message: `มีการอัปเดตบททดสอบท้ายคอร์สใหม่ รอตรวจสอบ`,
  //       }))
  //     );
  //   }
  // }
  // revalidatePath(`/dashboard/teacher/courses/${input.courseId}`);
  // revalidatePath(`/dashboard/teacher/courses/${input.courseId}/exam`);
  // revalidatePath(`/dashboard/admin/courses/${input.courseId}`);
  // revalidatePath(`/dashboard/admin/courses/${input.courseId}/exam`);
  // revalidatePath(`/dashboard/admin/courses/${input.courseId}/review`);
  // return {};
  revalidatePath(`/dashboard/teacher/courses/${input.courseId}`);
  revalidatePath(`/dashboard/teacher/courses/${input.courseId}/exam`);
  revalidatePath(`/dashboard/admin/courses`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}/exam`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}/review`);
  revalidatePath("/courses");
  return {};
}


// หมายเหตุ (ทำความสะอาด): เดิมไฟล์นี้มีสำเนาซ้ำของ loadCourseExamData/getCourseFinalExam/
// gradeCourseFinalExam ทั้งชุดอยู่ตรงนี้ (คนละเวอร์ชันกับที่ src/lib/courses/course-final-exam.ts
// ใช้จริง — ไม่มี fix ของ B1/usingQuestionBank/InsufficientQuestionBankError เลย) แต่ตรวจแล้วว่า
// ไม่มีที่ไหนใน route/หน้าเว็บ import สองฟังก์ชันนี้จากไฟล์นี้เลยสักที่ (ตัวจริงที่ทุกอย่างใช้อยู่คือ
// จาก course-final-exam.ts ผ่าน src/app/api/courses/[courseId]/final-exam/route.ts) — เป็นโค้ดตาย
// 100% จึงลบทิ้งไปเลย ไม่ต้องแก้ 2 ที่ให้ตรงกันทุกครั้งที่มีการเปลี่ยนแปลงอีกต่อไป


export interface CustomConstraintInput {
  lessonId: string | null; // null = ทั้งคอร์ส ไม่ระบุบท (เดิมคือพฤติกรรมของโหมด preset ที่ยุบเข้ามาแล้ว)
  difficulty: "easy" | "medium" | "hard";
  count: number;
}

// ยุบโหมด Preset/Custom เข้าเป็นกลไกเดียว (ของจริงไม่มีคอร์สไหนใช้ preset เลยสักคอร์ส — เช็คจาก
// course_exam_configs แล้วทั้ง 3 แถวเป็น custom หมด) totalQuestions ไม่ต้องกรอกเองอีกต่อไป คำนวณ
// จากผลรวมของ customConstraints ให้เลย ตัดเคส "ผลรวมไม่ตรงกับจำนวนข้อสอบทั้งหมด" ทิ้งไปด้วยในตัว
export interface SaveCourseExamConfigInput {
  courseId: string;
  customConstraints: CustomConstraintInput[];
}

export async function saveCourseExamConfig(input: SaveCourseExamConfigInput): Promise<{ error?: string }> {
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

  // เช็คก่อนว่าคอร์สนี้มีบทเรียนอยู่หรือยัง (เงื่อนไขที่อ้าง lessonId จริงต้องมีบทให้เลือกก่อน —
  // แถวที่เป็น "ทั้งคอร์ส" ไม่ต้องพึ่งอันนี้ก็จริง แต่หน้าจอยังต้องมีบทเรียนอย่างน้อย 1 บทถึงจะเปิด
  // ให้ตั้งค่าข้อสอบท้ายคอร์สได้ตั้งแต่ต้นอยู่ดี)
  const { count: lessonCount, error: lessonCountError } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("course_id", input.courseId);
  if (lessonCountError) return { error: lessonCountError.message };
  if (!lessonCount) {
    return { error: "คอร์สนี้ยังไม่มีบทเรียนเลย จึงยังไม่สามารถสุ่มข้อสอบท้ายคอร์สได้ กรุณาเพิ่มบทเรียนก่อน" };
  }

  if (!input.customConstraints?.length) return { error: "กรุณาตั้งเงื่อนไขสุ่มข้อสอบอย่างน้อย 1 รายการ" };
  const invalidRow = input.customConstraints.find((c) => !Number.isInteger(c.count) || c.count <= 0);
  if (invalidRow) return { error: "จำนวนข้อในแต่ละเงื่อนไขต้องเป็นจำนวนเต็มมากกว่า 0" };
  // เดิมต้องกรอก "จำนวนข้อสอบทั้งหมด" แยกแล้วเช็คว่าผลรวม constraint ตรงกันไหม (คลาสบั๊กที่ผู้ใช้
  // งงบ่อยว่าทำไมกรอกครบแล้วยังเซฟไม่ผ่าน) ตอนนี้คำนวณจากผลรวมให้เลย ไม่ต้องมีช่องให้กรอกซ้ำอีกแล้ว
  const totalQuestions = input.customConstraints.reduce((total, constraint) => total + constraint.count, 0);

  const { data: editingCourse, error: stateError } = await supabase.from("courses")
    .update({ status: isAdmin ? "draft" : "pending", exam_status: "pending", exam_reviewed_by: null, exam_reviewed_at: null, exam_rejection_reason: null })
    .eq("id", input.courseId).select("id").maybeSingle();
  if (stateError || !editingCourse) return { error: "เตรียมคอร์สสำหรับแก้ไขบททดสอบไม่สำเร็จ" };

  const { error: upsertError } = await supabase.from("course_exam_configs").upsert(
    {
      course_id: input.courseId,
      build_mode: "custom", // เหลือโหมดเดียวแล้ว เก็บคอลัมน์นี้ไว้เพื่อไม่ต้อง migrate schema
      total_questions: totalQuestions,
      preset_type: null,
      custom_constraints: input.customConstraints,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id" }
  );
  if (upsertError) return { error: upsertError.message };

  revalidatePath(`/dashboard/teacher/courses/${input.courseId}`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}`);
  revalidatePath("/dashboard/admin/courses");
  revalidatePath("/courses");
  revalidatePath(`/dashboard/teacher/courses/${input.courseId}/exam`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}/exam`);
  return {};
}

export interface PreviewQuestion {
  id: string;
  lessonId: string | null;
  questionText: string;
  imageUrl: string | null;
  // ===== เพิ่มใหม่: คำบรรยาย/หมุดบนรูป — พรีวิวหน้าตั้งค่าสุ่มข้อสอบขาดไปเหมือนกับ imageUrl เดิม =====
  imageCaption: string | null;
  imagePins: { id: string; x: number; y: number }[] | null;
  choices: { text: string; isCorrect: boolean }[];
  interactionType: ExamInteractionType;
  // ===== เพิ่มใหม่: preview ของ matching/sequencing (สลับลำดับแล้ว ไม่มีเฉลย เหมือนที่ส่งให้นักเรียนจริง)
  matching: { left: string[]; rightOptions: string[] } | null;
  sequencing: { id: string; text: string }[] | null;
  dragDrop: DragDropDisplay | null;
}

// ★ แก้ใหม่: เดิมฟังก์ชันนี้รับแค่ courseId แล้วไปอ่านกติกาที่ "บันทึกไว้ล่าสุด" จาก DB มาพรีวิว
// ทำให้ถ้าผู้ใช้เพิ่งสลับโหมด/แก้ค่าบนหน้าจอแต่ยังไม่กดบันทึก กดดูตัวอย่างจะไปสุ่มตามกติกาเก่า
// (คนละโหมดกับที่กำลังดูอยู่บนจอ) สร้างความสับสน เปลี่ยนมารับค่ากติกาปัจจุบันบนหน้าจอ (ที่ยังไม่ได้
// บันทึก) เข้ามาโดยตรงแทน จะได้พรีวิวตรงกับสิ่งที่กำลังตั้งค่าอยู่จริงๆ เสมอ
export async function previewCourseExamSample(input: {
  courseId: string;
  customConstraints: CustomConstraintInput[];
}): Promise<{ error?: string; questions?: PreviewQuestion[] }> {
  const { courseId } = input;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const [{ data: profile }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("id, created_by").eq("id", courseId).maybeSingle(),
  ]);
  if (!course) return { error: "ไม่พบคอร์สนี้" };
  const isAdmin = profile?.role === "admin";
  if (!isAdmin && (profile?.role !== "teacher" || course.created_by !== user.id)) {
    return { error: "ไม่มีสิทธิ์เข้าถึงบททดสอบของคอร์สนี้" };
  }

  if (!input.customConstraints?.length) {
    return { error: "กรุณาตั้งเงื่อนไขสุ่มข้อสอบอย่างน้อย 1 รายการ" };
  }

  try {
    // seed คงที่สำหรับ preview เท่านั้น ไม่ผูกกับ enrollment จริง ไม่กระทบชุดข้อสอบที่นักเรียนจะได้
    const sampled = await loadSampledFinalExamQuestions(supabase, {
      courseId,
      seed: `preview-${courseId}`,
      customConstraints: input.customConstraints,
    });
    return {
      questions: sampled.map((question) => ({
        id: question.id,
        lessonId: question.lessonId ?? null,
        questionText: question.question_text,
        imageUrl: question.image_url ?? null,
        imageCaption: question.image_caption ?? null,
        imagePins: question.image_pins ?? null,
        interactionType: question.interactionType,
        choices: [...question.quiz_choices]
          .sort((a, b) => a.order_index - b.order_index)
          .map((choice) => ({ text: choice.choice_text, isCorrect: choice.is_correct })),
        matching: question.matchingDisplay ?? null,
        sequencing: question.sequencingDisplay ?? null,
        dragDrop: question.dragDropDisplay ?? null,
      })),
    };
  } catch (sampleError) {
    return { error: sampleError instanceof Error ? sampleError.message : "สุ่มตัวอย่างข้อสอบไม่สำเร็จ" };
  }
}
