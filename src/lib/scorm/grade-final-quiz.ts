import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FinalQuizAnswer {
  questionId: string;
  selectedChoiceIndex: number;
}

interface ChoiceRow {
  is_correct: boolean;
  order_index: number;
}

interface QuestionRow {
  id: string;
  explanation: string | null;
  quiz_choices: ChoiceRow[];
}

const DEFAULT_PASS_PERCENTAGE = 70;

function isMissingSchemaField(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || /column .* does not exist|schema cache/i.test(error.message ?? "");
}

export interface FinalQuizDetail {
  questionId: string;
  isCorrect: boolean;
  correctChoiceIndex: number;
  explanation: string | null;
}

export interface FinalQuizGrade {
  courseId: string;
  attemptId: string;
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  passPercentage: number;
  passed: boolean;
  details: FinalQuizDetail[];
}

export async function gradeFinalQuiz(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  answers: FinalQuizAnswer[]
): Promise<FinalQuizGrade> {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, course_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) throw new Error(lessonError.message);
  if (!lesson) throw new Error("Lesson not found");

  const [{ data: enrollment, error: enrollmentError }, { data: scormPackage, error: packageError }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", userId)
        .eq("course_id", lesson.course_id)
        .eq("status", "approved")
        .maybeSingle(),
      supabase
        .from("scorm_packages")
        .select("lesson_draft_id")
        .eq("lesson_id", lessonId)
        .maybeSingle(),
    ]);
  if (enrollmentError) throw new Error(enrollmentError.message);
  if (!enrollment) throw new Error("An approved enrollment is required");
  if (packageError) throw new Error(packageError.message);
  if (!scormPackage?.lesson_draft_id) throw new Error("Published quiz package not found");

  const { data: questionsData, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, explanation, quiz_choices(is_correct, order_index)")
    .eq("lesson_draft_id", scormPackage.lesson_draft_id)
    .is("video_timestamp_seconds", null)
    .order("order_index", { ascending: true });
  if (questionsError) throw new Error(questionsError.message);

  const questions = (questionsData ?? []) as QuestionRow[];
  if (questions.length === 0) throw new Error("Post-test has no questions");

  const answersByQuestion = new Map<string, number>();
  for (const answer of answers) {
    if (
      typeof answer.questionId !== "string" ||
      !Number.isInteger(answer.selectedChoiceIndex) ||
      answer.selectedChoiceIndex < 0
    ) {
      throw new Error("Invalid quiz answer");
    }
    answersByQuestion.set(answer.questionId, answer.selectedChoiceIndex);
  }
  if (answersByQuestion.size !== questions.length) throw new Error("Answer every question before submitting");

  const details: FinalQuizDetail[] = questions.map((question) => {
    const selectedChoiceIndex = answersByQuestion.get(question.id);
    if (selectedChoiceIndex === undefined) throw new Error("Answer every question before submitting");
    const choices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
    if (!choices[selectedChoiceIndex]) throw new Error("Invalid quiz answer");
    const correctChoiceIndex = choices.findIndex((choice) => choice.is_correct);
    return {
      questionId: question.id,
      isCorrect: Boolean(choices[selectedChoiceIndex].is_correct),
      correctChoiceIndex,
      explanation: question.explanation,
    };
  });

  const attemptedAt = new Date().toISOString();
  const attemptRows = questions.map((question) => ({
    student_id: userId,
    lesson_id: lessonId,
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
  const scorePercentage = Math.round((correctAnswers / questions.length) * 10000) / 100;
  const { data: courseSettings, error: courseError } = await supabase
    .from("courses")
    .select("certificate_pass_percentage")
    .eq("id", lesson.course_id)
    .maybeSingle();
  if (courseError && !isMissingSchemaField(courseError)) throw new Error(courseError.message);

  const configuredPassPercentage = Number(courseSettings?.certificate_pass_percentage);
  const passPercentage = Number.isFinite(configuredPassPercentage)
    ? configuredPassPercentage
    : DEFAULT_PASS_PERCENTAGE;
  const passed = scorePercentage >= passPercentage;
  const trackingValues = {
    lesson_status: passed ? "passed" : "failed",
    score_raw: scorePercentage,
    quiz_passed: passed,
    quiz_score_recorded: true,
    quiz_attempted_at: attemptedAt,
    last_accessed: attemptedAt,
  };

  const { data: existingTracking, error: trackingLookupError } = await supabase
    .from("scorm_tracking")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (trackingLookupError) throw new Error(trackingLookupError.message);

  let trackingMutation = existingTracking
    ? supabase.from("scorm_tracking").update(trackingValues).eq("id", existingTracking.id).select("id").single()
    : supabase
        .from("scorm_tracking")
        .insert({
          enrollment_id: enrollment.id,
          lesson_id: lessonId,
          video_completed: false,
          completed_scos: [],
          suspend_data: "",
          ...trackingValues,
        })
        .select("id")
        .single();
  let { data: tracking, error: trackingError } = await trackingMutation;

  // รองรับฐานข้อมูลเดิมที่ยังไม่มี quiz_score_recorded / quiz_attempted_at
  if (trackingError && isMissingSchemaField(trackingError)) {
    const legacyTrackingValues = {
      lesson_status: passed ? "passed" : "failed",
      score_raw: scorePercentage,
      quiz_passed: passed,
      last_accessed: attemptedAt,
    };
    trackingMutation = existingTracking
      ? supabase
          .from("scorm_tracking")
          .update(legacyTrackingValues)
          .eq("id", existingTracking.id)
          .select("id")
          .single()
      : supabase
          .from("scorm_tracking")
          .insert({
            enrollment_id: enrollment.id,
            lesson_id: lessonId,
            video_completed: false,
            completed_scos: [],
            suspend_data: "",
            ...legacyTrackingValues,
          })
          .select("id")
          .single();
    ({ data: tracking, error: trackingError } = await trackingMutation);
  }

  if (trackingError) throw new Error(trackingError.message);
  if (!tracking) throw new Error("Quiz tracking was not saved");

  return {
    courseId: lesson.course_id,
    attemptId: tracking.id,
    totalQuestions: questions.length,
    correctAnswers,
    scorePercentage,
    passPercentage,
    passed,
    details,
  };
}
