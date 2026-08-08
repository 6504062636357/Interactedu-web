import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinalQuizAnswer, FinalQuizGrade } from "@/lib/scorm/grade-final-quiz";

const DEFAULT_PASS_PERCENTAGE = 70;

interface ChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuestionRow {
  id: string;
  lesson_draft_id: string;
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
    questions: (questionsData ?? []) as unknown as QuestionRow[],
  };
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
          const lessonA = data.lessonById.get(data.lessonIdByDraft.get(a.lesson_draft_id) ?? "")?.order_index ?? 0;
          const lessonB = data.lessonById.get(data.lessonIdByDraft.get(b.lesson_draft_id) ?? "")?.order_index ?? 0;
          return lessonA - lessonB || a.order_index - b.order_index;
        })
        .map((question) => {
          const lessonId = data.lessonIdByDraft.get(question.lesson_draft_id) ?? "";
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
    lesson_id: data.lessonIdByDraft.get(question.lesson_draft_id),
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
