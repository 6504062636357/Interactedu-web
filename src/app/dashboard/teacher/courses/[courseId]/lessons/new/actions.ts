"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyAdmins } from "@/lib/notifications/service";

export interface DraftChoiceInput {
  text: string;
  isCorrect: boolean;
}

export interface DraftQuestionInput {
  questionText: string;
  choices: DraftChoiceInput[];
  timestampSeconds: number | null; // หน้านี้บันทึกเฉพาะควิซแทรกกลางวิดีโอ
  explanation: string | null;
  sourceType?: "custom" | "bank_manual"; // ไม่ระบุ = custom (ของเดิม)
  sourceQuestionId?: string | null; // ใช้เมื่อ sourceType = bank_manual
}

export interface DraftRandomMarkerInput {
  markerId: string | null; // null = ปักหมุดใหม่, มีค่า = อัปเดตของเดิม
  timestampSeconds: number;
  difficulty: "easy" | "medium" | "hard";
}

export interface DraftVideoSegmentInput {
  title: string;
  summary: string | null;
  start: number;
  end: number;
  source: "ai" | "manual" | "timed";
  confidence: number | null;
}

interface StoredDraftChoice {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface StoredDraftQuestion {
  question_text: string;
  order_index: number;
  video_timestamp_seconds: number | null;
  explanation: string | null;
  source_type: "custom" | "bank_manual" | null;
  source_question_id: string | null;
  quiz_choices: StoredDraftChoice[];
}

interface StoredVideoSegment {
  id: string;
  title: string;
  summary: string | null;
  start_seconds: number;
  end_seconds: number;
  source: "ai" | "manual" | "timed";
  confidence: number | null;
  order_index: number;
}

interface SaveLessonDraftInput {
  courseId: string;
  moduleId: string | null;
  title: string;
  videoUrl: string | null;
  contentHtml: string;
  videoSegments: DraftVideoSegmentInput[];
  questions: DraftQuestionInput[];
  randomMarkers: DraftRandomMarkerInput[];
}

interface SaveLessonDraftResult {
  draftId?: string;
  lessonId?: string;
  error?: string;
}

function prepareVideoSegments(input: DraftVideoSegmentInput[]): {
  segments?: DraftVideoSegmentInput[];
  error?: string;
} {
  if (input.length > 200) return { error: "แบ่งวิดีโอได้สูงสุด 200 บท" };

  const segments = [...input].sort((first, second) => first.start - second.start);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment.title.trim()) return { error: `กรุณาใส่ชื่อบทที่ ${index + 1}` };
    if (segment.title.trim().length > 200) return { error: `ชื่อบทที่ ${index + 1} ยาวเกิน 200 ตัวอักษร` };
    if ((segment.summary?.trim().length ?? 0) > 500) return { error: `คำอธิบายบทที่ ${index + 1} ยาวเกิน 500 ตัวอักษร` };
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) {
      return { error: `เวลาเริ่ม–จบของบทที่ ${index + 1} ไม่ถูกต้อง` };
    }
    if (!(["ai", "manual", "timed"] as const).includes(segment.source)) {
      return { error: `แหล่งที่มาของบทที่ ${index + 1} ไม่ถูกต้อง` };
    }
    if (index > 0 && segment.start < segments[index - 1].end) {
      return { error: `ช่วงเวลาของบทที่ ${index} และบทที่ ${index + 1} ซ้อนกัน` };
    }
    if (segment.confidence != null && (!Number.isFinite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1)) {
      return { error: `ค่าความมั่นใจของบทที่ ${index + 1} ไม่ถูกต้อง` };
    }
  }

  return {
    segments: segments.map((segment) => ({
      ...segment,
      title: segment.title.trim(),
      summary: segment.summary?.trim() || null,
    })),
  };
}

async function replaceVideoSegments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  lessonId: string,
  segments: DraftVideoSegmentInput[]
): Promise<string | null> {
  const { error: deleteError } = await supabase
    .from("lesson_video_segments")
    .delete()
    .eq("lesson_draft_id", draftId);
  if (deleteError) return "ลบช่วงวิดีโอเดิมไม่สำเร็จ";
  if (segments.length === 0) return null;

  const rows = segments.map((segment, index) => ({
    lesson_draft_id: draftId,
    lesson_id: lessonId,
    title: segment.title,
    summary: segment.summary,
    start_seconds: segment.start,
    end_seconds: segment.end,
    source: segment.source,
    confidence: segment.confidence,
    order_index: index,
  }));
  const { error } = await supabase.from("lesson_video_segments").insert(rows);
  return error ? "บันทึกช่วงวิดีโอไม่สำเร็จ กรุณาตรวจว่าได้อัปเดตฐานข้อมูลแล้ว" : null;
}

// ★ เดิมโค้ดวนลูป insert คำถามทีละข้อ + insert choices ทีละข้อ (for...await) ทำให้ถ้ามี
// หลายคำถามต้องรอ network round-trip หลายรอบสะสมกัน (หลักวินาที) ตอนนี้รวมเป็น batch insert
// ครั้งเดียว: insert คำถามทั้งหมดพร้อมกันก่อน (ได้ id กลับมาตามลำดับที่ insert) แล้วค่อย insert
// choices ของทุกคำถามรวมเป็นก้อนเดียวอีกที — ลด round-trip จาก 2n เหลือ 2 ครั้งคงที่
async function batchInsertQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  questions: DraftQuestionInput[]
): Promise<string | null> {
  const validQuestions = questions
    .map((q, originalIndex) => ({ q, originalIndex }))
    .filter(({ q }) => q.questionText.trim());

  if (validQuestions.length === 0) return null;

  const questionRows = validQuestions.map(({ q, originalIndex }) => ({
    lesson_draft_id: draftId,
    question_text: q.questionText,
    order_index: originalIndex,
    video_timestamp_seconds: q.timestampSeconds,
    explanation: q.explanation,
    source_type: q.sourceType ?? "custom",
    source_question_id: q.sourceQuestionId ?? null,
  }));

  const { data: insertedQuestions, error: questionsError } = await supabase
    .from("quiz_questions")
    .insert(questionRows)
    .select("id");

  if (questionsError || !insertedQuestions || insertedQuestions.length !== questionRows.length) {
    console.error("Failed to batch save questions:", questionsError?.message);
    return "บันทึกคำถามไม่สำเร็จ กรุณาลองใหม่";
  }

  // Postgres คืนแถวตามลำดับที่ insert ให้ตอน insert หลายแถวในคำสั่งเดียว จับคู่ตามลำดับได้ปลอดภัย
  const choiceRows = validQuestions.flatMap(({ q }, i) => {
    const questionId = insertedQuestions[i].id;
    return q.choices
      .filter((c) => c.text.trim())
      .map((c, cIndex) => ({
        question_id: questionId,
        choice_text: c.text,
        is_correct: c.isCorrect,
        order_index: cIndex,
      }));
  });

  if (choiceRows.length > 0) {
    const { error: choicesError } = await supabase.from("quiz_choices").insert(choiceRows);
    if (choicesError) {
      console.error("Failed to batch save choices:", choicesError.message);
      return "บันทึกตัวเลือกไม่สำเร็จ กรุณาลองใหม่";
    }
  }

  return null;
}

export async function saveLessonDraft(input: SaveLessonDraftInput): Promise<SaveLessonDraftResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };
  if (!input.moduleId) return { error: "ไม่พบหมวดบทเรียนของคอร์สนี้" };
  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อบทเรียน" };
  const preparedSegments = prepareVideoSegments(input.videoSegments);
  if (!preparedSegments.segments) return { error: preparedSegments.error ?? "ข้อมูลช่วงวิดีโอไม่ถูกต้อง" };

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

  const segmentError = await replaceVideoSegments(supabase, draft.id, lesson.id, preparedSegments.segments);
  if (segmentError) return { error: segmentError };

  // 4. สร้างคำถาม + ตัวเลือก (batch insert ครั้งเดียว แทนการวนลูป)
  const questionsError = await batchInsertQuestions(supabase, draft.id, input.questions);
  if (questionsError) return { error: questionsError };

  // 5. สร้าง marker แบบสุ่มจากคลัง (bank_random) — ไม่มีเนื้อหาคำถาม ผูกแค่เงื่อนไข
  if (input.randomMarkers.length > 0) {
    const markerRows = input.randomMarkers.map((m, idx) => ({
      lesson_draft_id: draft.id,
      lesson_id: lesson.id,
      timestamp_seconds: m.timestampSeconds,
      random_difficulty: m.difficulty,
      order_index: idx,
    }));
    const { error: markersError } = await supabase.from("video_quiz_markers").insert(markerRows);
    if (markersError) {
      console.error("Failed to save random markers:", markersError.message);
      return { error: "บันทึกหมุดควิซแบบสุ่มไม่สำเร็จ" };
    }
  }

  return { draftId: draft.id, lessonId: lesson.id };
}

export interface ExistingDraftData {
  lessonId: string;
  draftId: string;
  title: string;
  videoUrl: string | null;
  contentHtml: string;
  status: string;
  videoSegments: Array<{
    id: string;
    title: string;
    summary: string | null;
    start: number;
    end: number;
    source: "ai" | "manual" | "timed";
    confidence: number | null;
  }>;
  questions: {
    questionText: string;
    timestampSeconds: number | null;
    explanation: string | null;
    choices: { text: string; isCorrect: boolean }[];
    sourceType?: "custom" | "bank_manual";
    sourceQuestionId?: string | null;
  }[];
  randomMarkers: {
    markerId: string;
    timestampSeconds: number;
    difficulty: "easy" | "medium" | "hard";
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
       quiz_questions ( question_text, order_index, video_timestamp_seconds, explanation, source_type, source_question_id,
         quiz_choices ( choice_text, is_correct, order_index ) )`
    )
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError) return { error: "โหลดฉบับร่างไม่สำเร็จ" };
  if (!draft) return { error: "ยังไม่มีฉบับร่างของบทเรียนนี้" };

  // ★ ยิงพร้อมกันแทนรอทีละอัน (ไม่ขึ้นต่อกัน)
  const [{ data: markersData }, { data: segmentData, error: segmentError }] = await Promise.all([
    supabase
      .from("video_quiz_markers")
      .select("id, timestamp_seconds, random_difficulty")
      .eq("lesson_draft_id", draft.id)
      .order("order_index", { ascending: true }),
    supabase
      .from("lesson_video_segments")
      .select("id, title, summary, start_seconds, end_seconds, source, confidence, order_index")
      .eq("lesson_draft_id", draft.id)
      .order("order_index", { ascending: true }),
  ]);
  if (segmentError) return { error: "โหลดข้อมูลช่วงวิดีโอไม่สำเร็จ กรุณาตรวจว่าได้อัปเดตฐานข้อมูลแล้ว" };

  const storedQuestions =
    (draft as unknown as { quiz_questions: StoredDraftQuestion[] }).quiz_questions ?? [];
  const questions = storedQuestions
    .sort((a, b) => a.order_index - b.order_index)
    .map((q) => ({
      questionText: q.question_text,
      timestampSeconds: q.video_timestamp_seconds,
      explanation: q.explanation,
      choices: (q.quiz_choices ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
      sourceType: q.source_type ?? "custom",
      sourceQuestionId: q.source_question_id,
    }));

  const randomMarkers = (markersData ?? []).map((m) => ({
    markerId: m.id,
    timestampSeconds: m.timestamp_seconds,
    difficulty: m.random_difficulty as "easy" | "medium" | "hard",
  }));

  const videoSegments = ((segmentData ?? []) as StoredVideoSegment[]).map((segment) => ({
    id: segment.id,
    title: segment.title,
    summary: segment.summary,
    start: segment.start_seconds,
    end: segment.end_seconds,
    source: segment.source,
    confidence: segment.confidence,
  }));

  return {
    data: {
      lessonId: lesson.id,
      draftId: draft.id,
      title: lesson.title,
      videoUrl: draft.video_url,
      contentHtml: draft.content_html ?? "",
      status: draft.status,
      videoSegments,
      questions,
      randomMarkers,
    },
  };
}

// ---- อัปเดต draft เดิม แทนที่จะ insert ใหม่ ----
export async function updateLessonDraft(input: {
  courseId: string;
  draftId: string;
  lessonId: string;
  title: string;
  videoUrl: string | null;
  contentHtml: string;
  videoSegments: DraftVideoSegmentInput[];
  questions: DraftQuestionInput[];
  randomMarkers: DraftRandomMarkerInput[];
}): Promise<SaveLessonDraftResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };
  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อบทเรียน" };
  const preparedSegments = prepareVideoSegments(input.videoSegments);
  if (!preparedSegments.segments) return { error: preparedSegments.error ?? "ข้อมูลช่วงวิดีโอไม่ถูกต้อง" };

  // 1-3. อัปเดต lesson / draft / สถานะคอร์ส พร้อมกัน — ไม่มีอันไหนต้องรอผลอันอื่นก่อน
  const [{ error: lessonError }, { error: draftError }, { error: courseStatusError }] = await Promise.all([
    supabase.from("lessons").update({ title: input.title, video_url: input.videoUrl }).eq("id", input.lessonId),
    supabase
      .from("lesson_drafts")
      .update({
        video_url: input.videoUrl,
        content_html: input.contentHtml,
        status: "draft",
      })
      .eq("id", input.draftId)
      .eq("teacher_id", user.id),
    // เมื่อเปิดรายการที่ส่งตรวจแล้วกลับมาแก้ ให้ถอนคอร์สออกจากคิวจนกว่าจะส่งใหม่
    supabase.from("courses").update({ status: "draft" }).eq("id", input.courseId),
  ]);

  if (lessonError) return { error: "อัปเดตชื่อบทเรียนไม่สำเร็จ" };
  if (draftError) return { error: "อัปเดตฉบับร่างไม่สำเร็จ" };
  if (courseStatusError) return { error: "อัปเดตสถานะคอร์สเป็นฉบับร่างไม่สำเร็จ" };

  const segmentError = await replaceVideoSegments(
    supabase,
    input.draftId,
    input.lessonId,
    preparedSegments.segments
  );
  if (segmentError) return { error: segmentError };

  // 3. ลบเฉพาะควิซในวิดีโอ ส่วนคำถามท้ายคอร์สจัดการจากหน้าบททดสอบโดยเฉพาะ
  const { error: deleteError } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("lesson_draft_id", input.draftId)
    .not("video_timestamp_seconds", "is", null);

  if (deleteError) return { error: "ลบคำถามเก่าไม่สำเร็จ" };

  // batch insert ครั้งเดียว แทนการวนลูป insert คำถาม/ตัวเลือกทีละข้อ
  const questionsError = await batchInsertQuestions(supabase, input.draftId, input.questions);
  if (questionsError) return { error: questionsError };

  const { error: deleteMarkersError } = await supabase
    .from("video_quiz_markers")
    .delete()
    .eq("lesson_draft_id", input.draftId);
  if (deleteMarkersError) return { error: "ลบหมุดควิซแบบสุ่มเก่าไม่สำเร็จ" };

  if (input.randomMarkers.length > 0) {
    const markerRows = input.randomMarkers.map((m, idx) => ({
      lesson_draft_id: input.draftId,
      lesson_id: input.lessonId,
      timestamp_seconds: m.timestampSeconds,
      random_difficulty: m.difficulty,
      order_index: idx,
    }));
    const { error: markersError } = await supabase.from("video_quiz_markers").insert(markerRows);
    if (markersError) return { error: "บันทึกหมุดควิซแบบสุ่มไม่สำเร็จ" };
  }

  return { draftId: input.draftId, lessonId: input.lessonId };
}

export async function submitDraftForReview(draftId: string, courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const submittedAt = new Date().toISOString();
  const { data: submittedDraft, error } = await supabase
    .from("lesson_drafts")
    .update({ status: "pending_review", submitted_at: submittedAt })
    .eq("id", draftId)
    .eq("teacher_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !submittedDraft) {
    console.error("Failed to submit draft:", error?.message ?? "no rows updated");
    return { error: error?.message ?? "ไม่พบฉบับร่าง หรือไม่มีสิทธิ์ส่งตรวจสอบ" };
  }

  // หมายเหตุ: ไม่อัปเดตสถานะคอร์สเป็น "pending" ที่นี่อีกต่อไป — การส่ง 1 บทเรียนไม่ควรทำให้
  // ทั้งคอร์สกลายเป็น "รอตรวจสอบ" ทั้งที่บทอื่นอาจยังไม่เสร็จ คอร์สจะถูกส่งตรวจจริงเมื่อครูกด
  // "ส่งคอร์สเข้าตรวจ" ที่หน้ารายละเอียดคอร์ส (ต้องครบทุกบทเรียน + บททดสอบท้ายคอร์สก่อน)
  // ดู submitCourseForReview ใน app/dashboard/teacher/courses/actions.ts

  revalidatePath(`/dashboard/teacher/courses/${courseId}`);
  revalidatePath("/dashboard/teacher/courses");
  return {};
}

export interface BankQuestionForLesson {
  id: string;
  questionText: string;
  choices: { text: string; isCorrect: boolean }[];
}

export async function getBankQuestionsForLesson(
  lessonId: string
): Promise<{ questions: BankQuestionForLesson[]; error?: string }> {
  if (!lessonId) return { questions: [] };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { questions: [], error: "กรุณาเข้าสู่ระบบก่อน" };

  // RLS ของ question_bank คุมสิทธิ์ owner/department/public อยู่แล้ว — ที่นี่แค่ filter usage_type + lesson tag
  const { data, error } = await supabase
    .from("question_bank")
    .select(
      "id, question_text, usage_type, question_bank_choices(choice_text, is_correct, order_index), question_bank_topic_tags(lesson_id)"
    )
    .eq("usage_type", "popup");

  if (error) return { questions: [], error: error.message };

  const filtered = (data ?? []).filter((q) =>
    (q.question_bank_topic_tags ?? []).some((tag: { lesson_id: string | null }) => tag.lesson_id === lessonId)
  );

  return {
    questions: filtered.map((q) => ({
      id: q.id,
      questionText: q.question_text,
      choices: [...(q.question_bank_choices ?? [])]
        .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
        .map((c: { choice_text: string; is_correct: boolean }) => ({ text: c.choice_text, isCorrect: c.is_correct })),
    })),
  };
}
