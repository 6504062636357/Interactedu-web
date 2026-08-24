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

  // ลบกติกาสุ่มข้อสอบเดิมทิ้ง (ถ้ามี) เพราะครูเปลี่ยนมาใช้โหมดพิมพ์เอง
  // ไม่ต้องเช็ค error รุนแรง เพราะถ้าไม่มีแถวอยู่แล้วก็ไม่มีผลอะไร
  const { error: deleteConfigError } = await supabase
    .from("course_exam_configs")
    .delete()
    .eq("course_id", input.courseId);
  if (deleteConfigError) return { error: `ลบกติกาสุ่มข้อสอบเดิมไม่สำเร็จ: ${deleteConfigError.message}` };

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

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinalQuizAnswer, FinalQuizGrade } from "@/lib/scorm/grade-final-quiz";
import { loadSampledFinalExamQuestions } from "@/lib/courses/question-bank-sampling";
const DEFAULT_PASS_PERCENTAGE = 70;

interface ChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuestionRow {
  id: string;
  lesson_draft_id?: string;//เปลี่ยนเป็น optional โดยเพิ่ม ? จากเดิมเป็น แบบ required
  lessonId?: string | null;
  question_text: string;
  explanation: string | null;
  order_index: number;
  quiz_choices: ChoiceRow[];
}

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
}

interface DraftRow {
  id: string;
  lesson_id: string;
  created_at: string;
}

export interface CourseFinalExamQuestion {
  id: string;
  lessonId: string;
  lessonTitle: string;
  questionText: string;
  choices: string[];
}

export interface CourseFinalExamOverview {
  courseId: string;
  courseTitle: string;
  passPercentage: number;
  certificateEnabled: boolean;
  totalLessons: number;
  completedLessons: number;
  eligible: boolean;
  questions: CourseFinalExamQuestion[];
}

function isMissingSchemaField(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error && (error.code === "PGRST204" || /column .* does not exist|schema cache/i.test(error.message ?? ""))
  );
}

async function loadCourseExamData(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  includeCorrectAnswers: boolean
) {
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", userId)
    .eq("course_id", courseId)
    .eq("status", "approved")
    .maybeSingle();
  if (enrollmentError) throw new Error(enrollmentError.message);
  if (!enrollment) throw new Error("An approved enrollment is required");

  let { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title, certificate_enabled, certificate_pass_percentage")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError && isMissingSchemaField(courseError)) {
    const legacy = await supabase.from("courses").select("id, title").eq("id", courseId).maybeSingle();
    course = legacy.data
      ? { ...legacy.data, certificate_enabled: true, certificate_pass_percentage: DEFAULT_PASS_PERCENTAGE }
      : null;
    courseError = legacy.error;
  }
  if (courseError) throw new Error(courseError.message);
  if (!course) throw new Error("Course not found");

  const { data: lessonsData, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, title, order_index")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  if (lessonsError) throw new Error(lessonsError.message);
  const lessons = (lessonsData ?? []) as LessonRow[];
  if (lessons.length === 0) throw new Error("Course has no lessons");

  const lessonIds = lessons.map((lesson) => lesson.id);
  const [{ data: draftsData, error: draftsError }, { data: trackingData, error: trackingError }] =
    await Promise.all([
      supabase
        .from("lesson_drafts")
        .select("id, lesson_id, created_at")
        .in("lesson_id", lessonIds),
      supabase
        .from("scorm_tracking")
        .select("lesson_id, video_completed")
        .eq("enrollment_id", enrollment.id)
        .in("lesson_id", lessonIds),
    ]);
  if (draftsError) throw new Error(draftsError.message);
  if (trackingError) throw new Error(trackingError.message);

  const latestDraftByLesson = new Map<string, DraftRow>();
  for (const draft of (draftsData ?? []) as DraftRow[]) {
    const current = latestDraftByLesson.get(draft.lesson_id);
    if (!current || new Date(draft.created_at).getTime() > new Date(current.created_at).getTime()) {
      latestDraftByLesson.set(draft.lesson_id, draft);
    }
  }
  const activeDrafts = [...latestDraftByLesson.values()];
  const draftIds = activeDrafts.map((draft) => draft.id);
  // const questionSelect = includeCorrectAnswers
  //   ? "id, lesson_draft_id, question_text, explanation, order_index, quiz_choices(choice_text, is_correct, order_index)"
  //   : "id, lesson_draft_id, question_text, explanation, order_index, quiz_choices(choice_text, order_index)";
  // const { data: questionsData, error: questionsError } = draftIds.length
  //   ? await supabase
  //       .from("quiz_questions")
  //       .select(questionSelect)
  //       .in("lesson_draft_id", draftIds)
  //       .is("video_timestamp_seconds", null)
  //       .order("order_index", { ascending: true })
  //   : { data: [], error: null };
  // if (questionsError) throw new Error(questionsError.message);
  const { data: examConfig, error: examConfigError } = await supabase
  .from("course_exam_configs")
  .select("build_mode, total_questions, preset_type, custom_constraints")
  .eq("course_id", courseId)
  .maybeSingle();
if (examConfigError) throw new Error(examConfigError.message);

let questions: QuestionRow[];
if (examConfig) {
  // ทางใหม่: สุ่มจาก question_bank ตาม config, seed จาก enrollment_id (deterministic)
  questions = await loadSampledFinalExamQuestions(supabase, {
    courseId,
    seed: enrollment.id,
    buildMode: examConfig.build_mode,
    totalQuestions: examConfig.total_questions,
    presetType: examConfig.preset_type,
    customConstraints: examConfig.custom_constraints,
  });
} else {
  // ทางเดิม: ไม่มี config = fallback พฤติกรรมเดิมเป๊ะ (คอร์สเก่าที่ยังไม่ตั้งค่า)
  const questionSelect = includeCorrectAnswers
    ? "id, lesson_draft_id, question_text, explanation, order_index, quiz_choices(choice_text, is_correct, order_index)"
    : "id, lesson_draft_id, question_text, explanation, order_index, quiz_choices(choice_text, order_index)";
  const { data: questionsData, error: questionsError } = draftIds.length
    ? await supabase
        .from("quiz_questions")
        .select(questionSelect)
        .in("lesson_draft_id", draftIds)
        .is("video_timestamp_seconds", null)
        .order("order_index", { ascending: true })
    : { data: [], error: null };
  if (questionsError) throw new Error(questionsError.message);
  questions = (questionsData ?? []) as unknown as QuestionRow[];
}

  const completedLessonIds = new Set(
    (trackingData ?? [])
      .filter((row) => Boolean(row.video_completed))
      .map((row) => row.lesson_id as string)
  );
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const lessonIdByDraft = new Map(activeDrafts.map((draft) => [draft.id, draft.lesson_id]));

  return {
    enrollment,
    course,
    lessons,
    completedLessonIds,
    lessonById,
    lessonIdByDraft,
    questions,
  };
}

function resolveLessonId(question: QuestionRow, lessonIdByDraft: Map<string, string>): string {
  return question.lessonId ?? lessonIdByDraft.get(question.lesson_draft_id ?? "") ?? "";
}

export async function getCourseFinalExam(
  supabase: SupabaseClient,
  userId: string,
  courseId: string
): Promise<CourseFinalExamOverview> {
  const data = await loadCourseExamData(supabase, userId, courseId, false);
  const eligible = data.completedLessonIds.size === data.lessons.length;

  return {
    courseId,
    courseTitle: data.course.title,
    passPercentage: Number(data.course.certificate_pass_percentage ?? DEFAULT_PASS_PERCENTAGE),
    certificateEnabled: Boolean(data.course.certificate_enabled),
    totalLessons: data.lessons.length,
    completedLessons: data.completedLessonIds.size,
    eligible,
    questions: eligible
      ? [...data.questions]
        .sort((a, b) => {
  const lessonA = data.lessonById.get(resolveLessonId(a, data.lessonIdByDraft))?.order_index ?? 0;
  const lessonB = data.lessonById.get(resolveLessonId(b, data.lessonIdByDraft))?.order_index ?? 0;
  return lessonA - lessonB || a.order_index - b.order_index;
})
.map((question) => {
  const lessonId = resolveLessonId(question, data.lessonIdByDraft);
          return {
            id: question.id,
            lessonId,
            lessonTitle: data.lessonById.get(lessonId)?.title ?? "บทเรียน",
            questionText: question.question_text,
            choices: [...(question.quiz_choices ?? [])]
              .sort((a, b) => a.order_index - b.order_index)
              .map((choice) => choice.choice_text),
          };
        })
      : [],
  };
}

export async function gradeCourseFinalExam(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  answers: FinalQuizAnswer[]
): Promise<FinalQuizGrade> {
  const data = await loadCourseExamData(supabase, userId, courseId, true);
  if (data.completedLessonIds.size < data.lessons.length) {
    throw new Error("Complete every lesson before taking the final exam");
  }
  if (data.questions.length === 0) throw new Error("Course final exam has no questions");

  const answersByQuestion = new Map<string, number>();
  for (const answer of answers) {
    if (typeof answer.questionId !== "string" || !Number.isInteger(answer.selectedChoiceIndex) || answer.selectedChoiceIndex < 0) {
      throw new Error("Invalid exam answer");
    }
    answersByQuestion.set(answer.questionId, answer.selectedChoiceIndex);
  }
  if (answersByQuestion.size !== data.questions.length) throw new Error("Answer every question before submitting");

  const details = data.questions.map((question) => {
    const selectedChoiceIndex = answersByQuestion.get(question.id);
    const choices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
    if (selectedChoiceIndex === undefined || !choices[selectedChoiceIndex]) throw new Error("Invalid exam answer");
    return {
      questionId: question.id,
      isCorrect: Boolean(choices[selectedChoiceIndex].is_correct),
      correctChoiceIndex: choices.findIndex((choice) => choice.is_correct),
      explanation: question.explanation,
    };
  });

  const attemptedAt = new Date().toISOString();
  const attemptRows = data.questions.map((question) => ({
  student_id: userId,
  lesson_id: resolveLessonId(question, data.lessonIdByDraft),
    question_id: question.id,
    selected_choice_index: answersByQuestion.get(question.id),
    is_correct: details.find((detail) => detail.questionId === question.id)?.isCorrect ?? false,
    attempted_at: attemptedAt,
  }));
  const { error: answerSaveError } = await supabase
    .from("video_quiz_attempts")
    .upsert(attemptRows, { onConflict: "student_id,question_id" });
  if (answerSaveError) throw new Error(answerSaveError.message);

  const correctAnswers = details.filter((detail) => detail.isCorrect).length;
  const scorePercentage = Math.round((correctAnswers / data.questions.length) * 10000) / 100;
  const passPercentage = Number(data.course.certificate_pass_percentage ?? DEFAULT_PASS_PERCENTAGE);
  const passed = scorePercentage >= passPercentage;
  const attemptLesson = data.lessons[data.lessons.length - 1];
  const { data: tracking, error: trackingError } = await supabase
    .from("scorm_tracking")
    .update({
      lesson_status: passed ? "passed" : "completed",
      score_raw: scorePercentage,
      quiz_passed: passed,
      quiz_score_recorded: true,
      course_final_exam_recorded: true,
      quiz_attempted_at: attemptedAt,
      last_accessed: attemptedAt,
    })
    .eq("enrollment_id", data.enrollment.id)
    .eq("lesson_id", attemptLesson.id)
    .select("id")
    .single();
  if (trackingError) throw new Error(trackingError.message);

  return {
    courseId,
    attemptId: tracking.id,
    totalQuestions: data.questions.length,
    correctAnswers,
    scorePercentage,
    passPercentage,
    passed,
    details,
  };
}

export interface CustomConstraintInput {
  lessonId: string;
  difficulty: "easy" | "medium" | "hard";
  count: number;
}

export interface SaveCourseExamConfigInput {
  courseId: string;
  buildMode: "custom" | "preset";
  totalQuestions: number;
  presetType?: "quick_check" | "standard_final" | "challenging_final" | null;
  customConstraints?: CustomConstraintInput[] | null;
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

  if (!Number.isInteger(input.totalQuestions) || input.totalQuestions <= 0) {
    return { error: "จำนวนข้อสอบต้องเป็นจำนวนเต็มมากกว่า 0" };
  }

  if (input.buildMode === "preset") {
    if (!input.presetType) return { error: "กรุณาเลือกแม่แบบข้อสอบ" };
  } else {
    if (!input.customConstraints?.length) return { error: "กรุณาตั้งเงื่อนไขสุ่มข้อสอบอย่างน้อย 1 รายการ" };
    const sum = input.customConstraints.reduce((total, constraint) => total + constraint.count, 0);
    if (sum !== input.totalQuestions) {
      return { error: `ผลรวมจำนวนข้อในเงื่อนไข (${sum}) ไม่ตรงกับจำนวนข้อสอบทั้งหมด (${input.totalQuestions})` };
    }
  }

  const { error: upsertError } = await supabase.from("course_exam_configs").upsert(
    {
      course_id: input.courseId,
      build_mode: input.buildMode,
      total_questions: input.totalQuestions,
      preset_type: input.buildMode === "preset" ? input.presetType : null,
      custom_constraints: input.buildMode === "custom" ? input.customConstraints : null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id" }
  );
  if (upsertError) return { error: upsertError.message };

  revalidatePath(`/dashboard/teacher/courses/${input.courseId}/exam`);
  revalidatePath(`/dashboard/admin/courses/${input.courseId}/exam`);
  return {};
}

export interface PreviewQuestion {
  id: string;
  lessonId: string | null;
  questionText: string;
  choices: { text: string; isCorrect: boolean }[];
}

export async function previewCourseExamSample(courseId: string): Promise<{ error?: string; questions?: PreviewQuestion[] }> {
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

  const { data: examConfig, error: configError } = await supabase
    .from("course_exam_configs")
    .select("build_mode, total_questions, preset_type, custom_constraints")
    .eq("course_id", courseId)
    .maybeSingle();
  if (configError) return { error: configError.message };
  if (!examConfig) return { error: "ยังไม่ได้บันทึกกติกาสุ่มข้อสอบ กรุณาบันทึกก่อนดูตัวอย่าง" };

  try {
    // seed คงที่สำหรับ preview เท่านั้น ไม่ผูกกับ enrollment จริง ไม่กระทบชุดข้อสอบที่นักเรียนจะได้
    const sampled = await loadSampledFinalExamQuestions(supabase, {
      courseId,
      seed: `preview-${courseId}`,
      buildMode: examConfig.build_mode,
      totalQuestions: examConfig.total_questions,
      presetType: examConfig.preset_type,
      customConstraints: examConfig.custom_constraints,
    });
    return {
      questions: sampled.map((question) => ({
        id: question.id,
        lessonId: question.lessonId ?? null,
        questionText: question.question_text,
        choices: [...question.quiz_choices]
          .sort((a, b) => a.order_index - b.order_index)
          .map((choice) => ({ text: choice.choice_text, isCorrect: choice.is_correct })),
      })),
    };
  } catch (sampleError) {
    return { error: sampleError instanceof Error ? sampleError.message : "สุ่มตัวอย่างข้อสอบไม่สำเร็จ" };
  }
}