import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinalExamReviewItem, FinalQuizAnswer, FinalQuizGrade } from "@/lib/scorm/grade-final-quiz";
import {
  loadSampledFinalExamQuestions,
  InsufficientQuestionBankError,
  buildMatchingSequencingDisplay,
  buildDragDropDisplay,
  type MatchingDisplay,
} from "@/lib/courses/question-bank-sampling";
import { seedFromString } from "@/lib/courses/seeded-random";
import { validateAnswer } from "@/lib/quiz/dispatcher";
import { validateMultiSelectByIndexes } from "@/lib/quiz/validators/multi-select";
import { parseDragDropAnswerData } from "@/lib/quiz/validators/drag-drop";
import { isSingleChoiceType } from "@/lib/quiz/config/interaction-groups";
import type { AnswerData, DragDropAnswerData, DragDropDisplay, ExamInteractionType, MatchingAnswerData, SequencingAnswerData, MatchingStudentAnswer, SequencingStudentAnswer } from "@/types/interaction";
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
  image_url?: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ — ทั้ง 2 ทาง (สุ่ม/พิมพ์เอง) ใส่มาเหมือนกัน
  image_caption?: string | null;
  image_pins?: { id: string; x: number; y: number }[] | null;
  order_index: number;
  // ===== เพิ่มใหม่: matching/sequencing — ทั้งทางสุ่มจาก question_bank และทางพิมพ์เอง (quiz_questions)
  // ใส่ field พวกนี้มาเหมือนกันแล้ว (undefined = ถือเป็น multiple_choice ตามพฤติกรรมเดิม เผื่อคอร์ส
  // เก่าที่ query แบบไม่ select field พวกนี้ผ่าน path อื่น)
  interactionType?: ExamInteractionType;
  answerData?: AnswerData;
  matchingDisplay?: MatchingDisplay | null;
  sequencingDisplay?: { id: string; text: string }[] | null;
  dragDropDisplay?: DragDropDisplay | null;
  quiz_choices: ChoiceRow[];
}

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
  // [งานข้อ 05] ต้องรู้ว่า SCO ของบทนี้เป็น SCORM 1.2 หรือ 2004 ก่อนเขียนคะแนนกลับเข้า cmi_data
  // เพราะ shape ของ CMI ต่างกัน (cmi.core.score.* สำหรับ 1.2 vs cmi.score.* สำหรับ 2004)
  scorm_version: string | null;
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
  imageUrl: string | null;
  imageCaption: string | null;
  imagePins: { id: string; x: number; y: number }[] | null;
  interactionType: ExamInteractionType;
  // choices ใช้กับ multiple_choice/true_false/multi_select เท่านั้น — matching/sequencing ใช้ matching/sequencing ด้านล่างแทน
  choices: string[];
  matching: MatchingDisplay | null;
  sequencing: { id: string; text: string }[] | null;
  // drag_drop: โจทย์ + คลังคำที่สลับลำดับแล้ว (ไม่มีเฉลย)
  dragDrop: DragDropDisplay | null;
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
    .select("id, title, order_index, scorm_version")
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
  // build_mode/total_questions/preset_type ยังอยู่ในคอลัมน์เดิม (ยุบโหมด preset ออกแล้ว ไม่ต้อง
  // migrate schema) แต่ตอนสุ่มจริงใช้แค่ custom_constraints เป็นแหล่งความจริงเดียวพอ
  const { data: examConfig, error: examConfigError } = await supabase
  .from("course_exam_configs")
  .select("custom_constraints")
  .eq("course_id", courseId)
  .maybeSingle();
if (examConfigError) throw new Error(examConfigError.message);

let questions: QuestionRow[];
// true = คำถามชุดนี้มาจาก question_bank (มี course_exam_configs ตั้งไว้) -> ตอนบันทึกคำตอบต้องลง
// quiz_attempts/quiz_attempt_questions (FK ผูกกับ question_bank) ไม่ใช่ video_quiz_attempts (FK ผูกกับ quiz_questions)
const usingQuestionBank = Boolean(examConfig);
if (examConfig) {
  // ทางใหม่: สุ่มจาก question_bank ตาม config, seed จาก enrollment_id (deterministic)
  try {
    questions = await loadSampledFinalExamQuestions(supabase, {
      courseId,
      seed: enrollment.id,
      customConstraints: examConfig.custom_constraints ?? [],
    });
  } catch (sampleError) {
    if (sampleError instanceof InsufficientQuestionBankError) {
      // log รายละเอียดเต็มไว้ฝั่ง server เท่านั้น ให้ครู/แอดมินไล่ดูใน server log ได้
      console.error(
        `[final-exam] insufficient question bank — course: ${courseId}, enrollment: ${enrollment.id}`,
        JSON.stringify(sampleError.detail, null, 2)
      );
      // นักเรียนเห็นแค่ข้อความสุภาพ ไม่เห็น logic/จำนวนข้อภายใน
      throw new Error("แบบทดสอบยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง หรือติดต่อผู้สอน");
    }
    throw sampleError;
  }
} else {
  // ทางเดิม: ไม่มี config = คำถามพิมพ์เอง (โหมด "กำหนดข้อสอบเอง" ของ CourseExamEditor)
  // ===== เพิ่มใหม่: ต้องดึง interaction_type/answer_data มาด้วย ไม่งั้น matching/sequencing ที่ครู
  // พิมพ์เองในโหมดนี้จะถูกมองเป็น multiple_choice เสมอ (ค่า default ตอน map ด้านล่าง) =====
  const questionSelect = includeCorrectAnswers
    ? "id, lesson_draft_id, question_text, explanation, image_url, image_caption, image_pins, order_index, interaction_type, answer_data, quiz_choices(choice_text, is_correct, order_index)"
    : "id, lesson_draft_id, question_text, explanation, image_url, image_caption, image_pins, order_index, interaction_type, answer_data, quiz_choices(choice_text, order_index)";
  const { data: questionsData, error: questionsError } = draftIds.length
    ? await supabase
        .from("quiz_questions")
        .select(questionSelect)
        .in("lesson_draft_id", draftIds)
        .is("video_timestamp_seconds", null)
        .order("order_index", { ascending: true })
    : { data: [], error: null };
  if (questionsError) throw new Error(questionsError.message);

  // ===== เพิ่มใหม่: seed จาก enrollment_id เหมือนทางสุ่มจาก question_bank (seed เดียวกัน คนละคน
  // ได้ลำดับสลับคนละแบบ แต่คนเดิมเข้าซ้ำได้ลำดับเดิมเสมอ) ใช้สลับลำดับฝั่งขวาของ matching และ
  // รายการของ sequencing ก่อนส่งให้นักเรียน ไม่ให้เดาคำตอบได้จากตำแหน่งที่ครูพิมพ์ไว้ตรงๆ
  const seedNumber = seedFromString(enrollment.id);
  const rawQuestions = (questionsData ?? []) as unknown as {
    id: string;
    lesson_draft_id: string;
    question_text: string;
    explanation: string | null;
    image_url: string | null;
    image_caption: string | null;
    image_pins: { id: string; x: number; y: number }[] | null;
    order_index: number;
    interaction_type: ExamInteractionType | null;
    answer_data: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
    quiz_choices: ChoiceRow[];
  }[];
  questions = rawQuestions.map((row) => {
    const interactionType = row.interaction_type ?? "multiple_choice";
    const { matchingDisplay, sequencingDisplay } = buildMatchingSequencingDisplay(
      interactionType,
      row.answer_data ?? null,
      seedNumber,
      row.id
    );
    return {
      id: row.id,
      lesson_draft_id: row.lesson_draft_id,
      question_text: row.question_text,
      explanation: row.explanation,
      image_url: row.image_url,
      image_caption: row.image_caption ?? null,
      image_pins: row.image_pins ?? null,
      order_index: row.order_index,
      interactionType,
      answerData: row.answer_data ?? null,
      matchingDisplay,
      sequencingDisplay,
      dragDropDisplay: buildDragDropDisplay(interactionType, row.answer_data ?? null, seedNumber, row.id),
      quiz_choices: row.quiz_choices,
    };
  });
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
    usingQuestionBank,
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
            imageUrl: question.image_url ?? null,
            imageCaption: question.image_caption ?? null,
            imagePins: question.image_pins ?? null,
            interactionType: question.interactionType ?? "multiple_choice",
            // เฉลย (is_correct/answerData) ห้ามหลุดไปกับ response นี้เด็ดขาด — ตัดออกตรงนี้จุดเดียว
            choices: [...(question.quiz_choices ?? [])]
              .sort((a, b) => a.order_index - b.order_index)
              .map((choice) => choice.choice_text),
            matching: question.matchingDisplay ?? null,
            sequencing: question.sequencingDisplay ?? null,
            dragDrop: question.dragDropDisplay ?? null,
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

  // ===== เพิ่มใหม่: เก็บ answer object ทั้งก้อนไว้ (เดิมเก็บแค่ selectedChoiceIndex เป็น number)
  // เพราะ matching/sequencing ไม่มี selectedChoiceIndex ให้ใช้ ต้องเก็บ matchingPairs/sequenceOrder ด้วย
  const answersByQuestion = new Map<string, FinalQuizAnswer>();
  for (const answer of answers) {
    if (typeof answer.questionId !== "string") throw new Error("Invalid exam answer");
    answersByQuestion.set(answer.questionId, answer);
  }
  if (answersByQuestion.size !== data.questions.length) throw new Error("Answer every question before submitting");

  const details = data.questions.map((question) => {
    const answer = answersByQuestion.get(question.id);
    if (!answer) throw new Error("Invalid exam answer");
    const interactionType = question.interactionType ?? "multiple_choice";

    // ===== เพิ่มใหม่: matching/sequencing ตรวจผ่าน validateAnswer() dispatcher (ใช้ answer_data
    // จริงที่เก็บไว้ตอนสุ่ม ไม่ใช่ตัวที่ส่งให้ client เพราะอันนั้นตัดเฉลยออกไปแล้ว) =====
    if (interactionType === "matching" || interactionType === "sequencing") {
      const studentAnswer: MatchingStudentAnswer | SequencingStudentAnswer =
        interactionType === "matching"
          ? { pairs: answer.matchingPairs ?? [] }
          : { order: answer.sequenceOrder ?? [] };
      const result = validateAnswer(
        { id: question.id, interaction_type: interactionType, answer_data: question.answerData ?? null },
        studentAnswer
      );
      if (result.error) throw new Error("Invalid exam answer");
      return {
        questionId: question.id,
        isCorrect: result.is_correct,
        correctChoiceIndex: -1, // ไม่มีความหมายสำหรับ matching/sequencing — ฝั่ง client ไม่ได้อ่านค่านี้
        explanation: question.explanation,
      };
    }

    // ===== drag_drop: ตรวจผ่าน validateAnswer() ด้วย answer_data จริงที่เก็บไว้ฝั่ง server (ไม่ใช่ display ที่ตัดเฉลยแล้ว)
    // input ผิดรูปแบบ (ยังเติมไม่ครบ/ใช้คำซ้ำ/ช่องแปลกปลอม) → "Invalid exam answer" (route ตอบ 400) + log เหตุผลไว้ฝั่ง server =====
    if (interactionType === "drag_drop") {
      const result = validateAnswer(
        { id: question.id, interaction_type: "drag_drop", answer_data: question.answerData ?? null },
        { placements: answer.dragDropPlacements ?? {} }
      );
      if (result.error) {
        console.warn(`[final-exam] invalid drag_drop answer — question: ${question.id}: ${result.error}`);
        throw new Error("Invalid exam answer");
      }
      return {
        questionId: question.id,
        isCorrect: result.is_correct,
        correctChoiceIndex: -1, // ไม่มีความหมายสำหรับ drag_drop
        explanation: question.explanation,
      };
    }

    // ===== multi_select: ตรวจด้วย index ของทุกตัวเลือกที่ติ๊ก (ชุดตัวเลือกต้องเรียงเหมือนที่ส่งให้นักเรียน)
    // input ผิดรูปแบบ → throw "Invalid exam answer" (route ตอบ 400) และ log เหตุผลจริงไว้ฝั่ง server =====
    if (interactionType === "multi_select") {
      const sortedChoices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
      const result = validateMultiSelectByIndexes(sortedChoices, answer.selectedChoiceIndexes);
      if (result.error) {
        console.warn(`[final-exam] invalid multi_select answer — question: ${question.id}: ${result.error}`);
        throw new Error("Invalid exam answer");
      }
      return {
        questionId: question.id,
        isCorrect: result.is_correct,
        correctChoiceIndex: -1, // ไม่มีความหมายสำหรับ multi_select (ดู correctChoiceIndexes ใน review)
        explanation: question.explanation,
      };
    }

    // ทางเดิม: multiple_choice / true_false ตรวจแบบ choice-index ตรงๆ เหมือนเดิมทุกอย่าง
    const selectedChoiceIndex = answer.selectedChoiceIndex;
    if (!Number.isInteger(selectedChoiceIndex) || (selectedChoiceIndex as number) < 0) {
      throw new Error("Invalid exam answer");
    }
    const choices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
    if (!choices[selectedChoiceIndex as number]) throw new Error("Invalid exam answer");
    return {
      questionId: question.id,
      isCorrect: Boolean(choices[selectedChoiceIndex as number].is_correct),
      correctChoiceIndex: choices.findIndex((choice) => choice.is_correct),
      explanation: question.explanation,
    };
  });

  // ===== เพิ่มใหม่: ประกอบข้อมูลเฉลยรายข้อ (คำตอบนักเรียน vs คำตอบที่ถูก + คำอธิบาย) สำหรับหน้า
  // Review Answers เรียงลำดับเดียวกับที่นักเรียนเห็นตอนสอบ (ตามลำดับบทเรียน แล้วตาม order_index)
  // route จะเป็นตัวตัดสินว่าส่งให้ client หรือไม่ (ส่งเฉพาะตอน passed)
  const review: FinalExamReviewItem[] = [...data.questions]
    .sort((a, b) => {
      const lessonA = data.lessonById.get(resolveLessonId(a, data.lessonIdByDraft))?.order_index ?? 0;
      const lessonB = data.lessonById.get(resolveLessonId(b, data.lessonIdByDraft))?.order_index ?? 0;
      return lessonA - lessonB || a.order_index - b.order_index;
    })
    .map((question) => {
      const answer = answersByQuestion.get(question.id);
      const detail = details.find((item) => item.questionId === question.id);
      const interactionType = question.interactionType ?? "multiple_choice";
      const base = {
        questionId: question.id,
        lessonTitle: data.lessonById.get(resolveLessonId(question, data.lessonIdByDraft))?.title ?? "บทเรียน",
        questionText: question.question_text,
        imageUrl: question.image_url ?? null,
        imageCaption: question.image_caption ?? null,
        imagePins: question.image_pins ?? null,
        interactionType,
        isCorrect: detail?.isCorrect ?? false,
        explanation: question.explanation ?? null,
        choices: null as string[] | null,
        selectedChoiceIndex: null as number | null,
        correctChoiceIndex: null as number | null,
        selectedChoiceIndexes: null as number[] | null,
        correctChoiceIndexes: null as number[] | null,
        matching: null as FinalExamReviewItem["matching"],
        sequencing: null as FinalExamReviewItem["sequencing"],
        dragDrop: null as FinalExamReviewItem["dragDrop"],
      };

      if (interactionType === "matching") {
        const correctPairs = (question.answerData as MatchingAnswerData | null)?.pairs ?? [];
        const studentPairs = answer?.matchingPairs ?? [];
        base.matching = correctPairs.map((pair) => {
          const studentRight = studentPairs.find((item) => item.left === pair.left)?.right ?? "";
          return { left: pair.left, studentRight, correctRight: pair.right, isCorrect: studentRight === pair.right };
        });
        return base;
      }

      if (interactionType === "sequencing") {
        const sequencingData = question.answerData as SequencingAnswerData | null;
        const textById = new Map((sequencingData?.items ?? []).map((item) => [item.id, item.text]));
        const toItems = (ids: string[]) => ids.map((id) => ({ id, text: textById.get(id) ?? id }));
        base.sequencing = {
          studentOrder: toItems(answer?.sequenceOrder ?? []),
          correctOrder: toItems(sequencingData?.correct_order ?? []),
        };
        return base;
      }

      if (interactionType === "drag_drop") {
        const parsed = parseDragDropAnswerData(question.answerData);
        if (parsed.ok) {
          const wordText = new Map(parsed.data.words.map((w) => [w.id, w.text]));
          const placements = answer?.dragDropPlacements ?? {};
          base.dragDrop = {
            template: parsed.data.template,
            blanks: parsed.data.blanks.map((blank) => {
              const correctId = parsed.data.correct_map[blank.id];
              const studentId = Object.prototype.hasOwnProperty.call(placements, blank.id) ? placements[blank.id] : "";
              return {
                id: blank.id,
                studentWord: wordText.get(studentId) ?? "",
                correctWord: wordText.get(correctId) ?? "",
                isCorrect: studentId === correctId,
              };
            }),
          };
        }
        return base;
      }

      if (interactionType === "multi_select") {
        const multiChoices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
        base.choices = multiChoices.map((choice) => choice.choice_text);
        // ผ่านการตรวจใน details ด้านบนแล้ว (เป็น integer ในช่วงที่ถูกต้องเสมอ) กรองซ้ำเพื่อความปลอดภัยของ type
        base.selectedChoiceIndexes = (answer?.selectedChoiceIndexes ?? []).filter((v) => Number.isInteger(v));
        base.correctChoiceIndexes = multiChoices.flatMap((choice, index) => (choice.is_correct ? [index] : []));
        return base;
      }

      const sortedChoices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
      base.choices = sortedChoices.map((choice) => choice.choice_text);
      base.selectedChoiceIndex = Number.isInteger(answer?.selectedChoiceIndex) ? (answer?.selectedChoiceIndex as number) : null;
      base.correctChoiceIndex = sortedChoices.findIndex((choice) => choice.is_correct);
      return base;
    });

  const attemptedAt = new Date().toISOString();
  const correctAnswers = details.filter((detail) => detail.isCorrect).length;
  const scorePercentage = Math.round((correctAnswers / data.questions.length) * 10000) / 100;
  const passPercentage = Number(data.course.certificate_pass_percentage ?? DEFAULT_PASS_PERCENTAGE);
  const passed = scorePercentage >= passPercentage;

  // [งานข้อ 03] เขียน quiz_attempts เสมอทั้งสอง path — นี่คือแหล่งความจริงเดียวของ
  // "ผลสอบปลายคอร์ส" ไม่ผูกกับบทเรียนไหนอีกต่อไป (ก่อนหน้านี้ยัดใส่ scorm_tracking ของ
  // "บทเรียนสุดท้ายตามลำดับอาเรย์" ซึ่งพังถ้าครูเพิ่มบทใหม่ทีหลัง หรือ throw ถ้า enrollment
  // ไม่เคยมีแถว scorm_tracking ของบทนั้นมาก่อน — ทั้งสองปัญหาหายไปเพราะ quiz_attempts
  // ผูกกับ enrollment_id ตรงๆ ไม่ต้องอิงบทเรียนใดบทเรียนหนึ่งเลย)
  const { data: quizAttempt, error: quizAttemptError } = await supabase
    .from("quiz_attempts")
    .insert({
      enrollment_id: data.enrollment.id,
      submitted_at: attemptedAt,
      score: scorePercentage,
      passed,
    })
    .select("id")
    .single();
  if (quizAttemptError) throw new Error(quizAttemptError.message);

  if (data.usingQuestionBank) {
    // คำถามชุดนี้มาจาก question_bank -> log คำตอบรายข้อลง quiz_attempt_questions
    // (question_id ในตารางนี้ FK ผูกกับ question_bank โดยตรง ไม่ชนกับ video_quiz_attempts ที่ผูกกับ quiz_questions)
    const attemptQuestionRows = data.questions.map((question) => ({
      attempt_id: quizAttempt.id,
      question_id: question.id,
      is_correct: details.find((detail) => detail.questionId === question.id)?.isCorrect ?? false,
      selected_choice_id: null,
      // ===== เพิ่มใหม่: เก็บ answer object ทั้งก้อน (เดิมเก็บแค่ selected_choice_index) เพื่อรองรับ
      // matching/sequencing ที่ไม่มี selectedChoiceIndex — คอลัมน์นี้เป็น jsonb เก็บ shape ไหนก็ได้
      student_answer: answersByQuestion.get(question.id) ?? null,
    }));
    const { error: answerSaveError } = await supabase
      .from("quiz_attempt_questions")
      .insert(attemptQuestionRows);
    if (answerSaveError) throw new Error(answerSaveError.message);
  } else {
    // ทางเดิม: ไม่มี examConfig = คำถามยังมาจาก quiz_questions (โหมด "กำหนดข้อสอบเอง")
    // quiz_attempt_questions.question_id มี FK ผูกกับ question_bank เท่านั้น จะยัด id จาก
    // quiz_questions ลงไปตรงๆ ไม่ได้ (FK จะพัง) รายละเอียดรายข้อของทางนี้เลยยังคงไปที่
    // video_quiz_attempts เหมือนเดิมทุกอย่าง เปลี่ยนแค่ตอนนี้มี quiz_attempts (header) คู่กันด้วย
    // ===== เพิ่มใหม่: ตอนนี้ครูพิมพ์ matching/sequencing เองในโหมดนี้ได้ด้วย (ไม่มี selectedChoiceIndex
    // ให้ใช้) — selected_choice_index เป็น NOT NULL ในตาราง จึงใส่ -1 เป็นค่า sentinel (ไม่มีความหมาย
    // ทางความหมาย เหมือนที่ gradeCourseFinalExam ใช้ correctChoiceIndex: -1 ด้านบน) คำตอบจริงของสอง
    // แบบนี้เก็บอยู่ใน student_answer (jsonb) ที่เพิ่ม insert เข้ามาแทน
    const attemptRows = data.questions.map((question) => {
      const interactionType = question.interactionType ?? "multiple_choice";
      const answer = answersByQuestion.get(question.id);
      // คอลัมน์ selected_choice_index เป็น NOT NULL — type ที่ไม่ใช่ "เลือกตัวเลือกเดียว" ใส่ -1 (คำตอบจริงอยู่ใน student_answer)
      const isMatchingOrSequencing = !isSingleChoiceType(interactionType);
      return {
        student_id: userId,
        lesson_id: resolveLessonId(question, data.lessonIdByDraft),
        question_id: question.id,
        selected_choice_index: isMatchingOrSequencing ? -1 : answer?.selectedChoiceIndex,
        student_answer: answer ?? null,
        is_correct: details.find((detail) => detail.questionId === question.id)?.isCorrect ?? false,
        attempted_at: attemptedAt,
      };
    });
    const { error: answerSaveError } = await supabase
      .from("video_quiz_attempts")
      .upsert(attemptRows, { onConflict: "student_id,question_id" });
    if (answerSaveError) throw new Error(answerSaveError.message);
  }

  // scorm_tracking ไม่ถูกแตะเรื่อง completion/lesson_status จากฟังก์ชันนี้ — field พวกนั้นยังคง
  // เป็นของ "จบบทเรียนหรือยัง" (video_completed) ที่มาจาก SCORM commit flow เท่านั้น
  // certificate service อ่าน completion จาก scorm_tracking และอ่านคะแนนจาก quiz_attempts
  // (แถวที่เพิ่งสร้างข้างบน) แยกกันเหมือนเดิม — สิ่งเดียวที่ฟังก์ชันนี้เขียนกลับเข้า scorm_tracking
  // คือ cmi_data.score [งานข้อ 05] ด้านล่าง เพื่อให้ผลสอบที่ตรวจแล้วมีอยู่จริงใน CMI data model
  // มาตรฐาน ไม่ใช่แค่เก็บใน quiz_attempts ซึ่งเป็นตาราง custom ของแอปเราเอง — พอผู้เรียนเปิด SCO
  // ของบทไหนก็ตามในคอร์สนี้อีกครั้ง LMSGetValue("cmi.core.score.raw") จะได้คะแนนสอบปลายคอร์สกลับ
  // มาจริง เหมือนตอนที่ LMS จริงผลักคะแนนที่ครูแก้ไขให้กลับเข้า SCO
  //
  // เขียนเข้าไปทุกบทเรียนของคอร์ส (ไม่ใช่บทใดบทหนึ่ง) เพราะข้อสอบนี้เป็นคะแนนระดับคอร์ส ไม่ผูกกับ
  // บทเรียนใดบทเรียนหนึ่งอยู่แล้ว (เหตุผลเดียวกับที่ #03 เลิกยัดมันใส่ "บทสุดท้าย") — เขียนแค่ฟิลด์
  // score เท่านั้น ไม่แตะ lesson_status/entry/suspend_data/location/interactions/objectives ที่มี
  // อยู่แล้วใน cmi_data ของแต่ละแถว (merge เฉพาะ score ไม่ overwrite ทั้งก้อน)
  //
  // เป็นการเสริม data model ให้ครบ ไม่ใช่ผลตัดสินสอบ (คะแนนจริงบันทึกลง quiz_attempts สำเร็จไปแล้ว
  // ก่อนหน้านี้) ถ้าขั้นตอนนี้พลาดจึงแค่ log ไว้ ไม่ทำให้การตรวจข้อสอบทั้งหมดกลายเป็น error
  try {
    const { data: trackingRows, error: trackingFetchError } = await supabase
      .from("scorm_tracking")
      .select("id, lesson_id, cmi_data")
      .eq("enrollment_id", data.enrollment.id)
      .in("lesson_id", data.lessons.map((lesson) => lesson.id));
    if (trackingFetchError) throw new Error(trackingFetchError.message);

    const scormVersionByLesson = new Map(data.lessons.map((lesson) => [lesson.id, lesson.scorm_version]));
    const scoreValue = { raw: scorePercentage, min: 0, max: 100 };

    for (const row of trackingRows ?? []) {
      const existingCmi = (
        row.cmi_data && typeof row.cmi_data === "object" ? row.cmi_data : {}
      ) as Record<string, unknown>;
      const is2004 = scormVersionByLesson.get(row.lesson_id) === "2004";

      const nextCmi: Record<string, unknown> = is2004
        ? {
            ...existingCmi,
            score: { ...(existingCmi.score as Record<string, unknown> | undefined), ...scoreValue },
          }
        : {
            ...existingCmi,
            core: {
              ...(existingCmi.core as Record<string, unknown> | undefined),
              score: {
                ...((existingCmi.core as Record<string, unknown> | undefined)?.score as
                  | Record<string, unknown>
                  | undefined),
                ...scoreValue,
              },
            },
          };

      const { error: cmiUpdateError } = await supabase
        .from("scorm_tracking")
        .update({ cmi_data: nextCmi })
        .eq("id", row.id);
      if (cmiUpdateError) throw new Error(cmiUpdateError.message);
    }
  } catch (cmiWriteError) {
    console.warn("[gradeCourseFinalExam] เขียนคะแนนกลับเข้า cmi_data ไม่สำเร็จ:", cmiWriteError);
  }

  return {
    courseId,
    attemptId: quizAttempt.id,
    totalQuestions: data.questions.length,
    correctAnswers,
    scorePercentage,
    passPercentage,
    passed,
    details,
    review,
  };
}

