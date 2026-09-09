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

export interface BankQuestionCounts {
  easy: number;
  medium: number;
  hard: number;
}

const MAX_RETRIES = 1; // รวมความพยายามครั้งแรกเป็นสูงสุด 3 ครั้ง
const RETRY_DELAYS_MS = [500];

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

// 57014 = statement timeout, 08xxx = connection failure ตระกูลต่างๆ
// 42501 = RLS reject — ปกติไม่ควร retry เพราะแปลว่าไม่มีสิทธิ์จริง แต่ในระบบนี้พิสูจน์แล้วว่า
// เกิดจาก auth.uid() resolve พลาดชั่วคราวตอน Supabase โหลดสูง (ดูบทวิเคราะห์ log ช่วง 10:01-10:02)
// ไม่ใช่สิทธิ์ผิดจริง จึงใส่ไว้ในรายการที่ retry ได้ด้วย
function isRetryableError(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) return false;
  const retryableCodes = new Set(["57014", "08000", "08003", "08006", "42501"]);
  if (error.code && retryableCodes.has(error.code)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out") || msg.includes("fetch failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ลบแบบ retry ได้ — ลบซ้ำไม่มีผลข้างเคียง (ลบของที่ไม่มีอยู่แล้ว = no-op)
// จึงไม่ต้องเช็ค idempotency แบบ insert
async function deleteWithRetry(
  run: () => PromiseLike<{ error: { code?: string; message?: string } | null }>
): Promise<string | null> {
  let lastError: PostgrestLikeError | null | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { error } = await run();
    if (!error) return null;
    lastError = error;
    console.error(`deleteWithRetry: attempt ${attempt + 1} failed:`, error.message);
    if (attempt === MAX_RETRIES || !isRetryableError(error)) break;
    await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
  }
  return lastError?.message ?? "ลบข้อมูลไม่สำเร็จ";
}

async function insertMarkersWithRetry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  markerRows: { lesson_draft_id: string; lesson_id: string; timestamp_seconds: number; random_difficulty: string; order_index: number }[]
): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { error } = await supabase.from("video_quiz_markers").insert(markerRows);
    if (!error) return null;

    console.error(`insertMarkersWithRetry: attempt ${attempt + 1} failed:`, error.message);

    const { count } = await supabase
      .from("video_quiz_markers")
      .select("id", { count: "exact", head: true })
      .eq("lesson_draft_id", draftId)
      .in("order_index", markerRows.map((r) => r.order_index));

    if ((count ?? 0) === markerRows.length) return null;

    if (attempt === MAX_RETRIES || !isRetryableError(error)) {
      return "บันทึกหมุดควิซแบบสุ่มไม่สำเร็จ";
    }
    await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
  }
  return "บันทึกหมุดควิซแบบสุ่มไม่สำเร็จ";
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

// ความยาววิดีโอทั้งบทเรียนหาได้จาก end เวลาที่มากที่สุดในบรรดา segment ที่ส่งมา
// เพราะ segment สุดท้ายมักจะจบที่ความยาวเต็มของวิดีโอเสมอ (ทั้งจากโหมด AI/manual/timed)
// ใช้ค่านี้แทนการรับ duration จาก client ตรงๆ เพื่อไม่ต้องแก้ schema หรือฟอร์มฝั่ง client
function computeVideoDurationSeconds(segments: DraftVideoSegmentInput[]): number {
  if (segments.length === 0) return 0;
  const maxEnd = Math.max(...segments.map((segment) => segment.end));
  return Math.round(maxEnd);
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

//เดิมโค้ดวนลูป insert คำถามทีละข้อ + insert choices ทีละข้อ (for...await) ทำให้ถ้ามี
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
  const orderIndexes = questionRows.map((r) => r.order_index);

  let insertedQuestions: { id: string; order_index: number }[] | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { data, error } = await supabase
      .from("quiz_questions")
      .insert(questionRows)
      .select("id, order_index");

    if (!error && data && data.length === questionRows.length) {
      insertedQuestions = data;
      break;
    }

    console.error(`batchInsertQuestions (questions): attempt ${attempt + 1} failed:`, error?.message);

    // ★ กัน insert ซ้ำ: เช็คว่ารอบก่อนแอบสำเร็จจริงไหม (insert commit แล้วแต่ response หาย)
    const { data: existing } = await supabase
      .from("quiz_questions")
      .select("id, order_index")
      .eq("lesson_draft_id", draftId)
      .in("order_index", orderIndexes);

    if (existing && existing.length === questionRows.length) {
      insertedQuestions = existing;
      break;
    }

    if (attempt === MAX_RETRIES || !isRetryableError(error)) {
      return "บันทึกคำถามไม่สำเร็จ กรุณาลองใหม่";
    }
    await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
  }

  if (!insertedQuestions) return "บันทึกคำถามไม่สำเร็จ กรุณาลองใหม่";

  const idByOrderIndex = new Map(insertedQuestions.map((row) => [row.order_index, row.id]));

  const choiceRows = validQuestions.flatMap(({ q, originalIndex }) => {
    const questionId = idByOrderIndex.get(originalIndex);
    if (!questionId) return [];
    return q.choices
      .filter((c) => c.text.trim())
      .map((c, cIndex) => ({
        question_id: questionId,
        choice_text: c.text,
        is_correct: c.isCorrect,
        order_index: cIndex,
      }));
  });

  if (choiceRows.length === 0) return null;

  const questionIds = [...new Set(choiceRows.map((r) => r.question_id))];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { error } = await supabase.from("quiz_choices").insert(choiceRows);
    if (!error) return null;

    console.error(`batchInsertQuestions (choices): attempt ${attempt + 1} failed:`, error.message);

    const { count } = await supabase
      .from("quiz_choices")
      .select("id", { count: "exact", head: true })
      .in("question_id", questionIds);

    if ((count ?? 0) >= choiceRows.length) return null;

    if (attempt === MAX_RETRIES || !isRetryableError(error)) {
      return "บันทึกตัวเลือกไม่สำเร็จ กรุณาลองใหม่";
    }
    await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
  }
  return "บันทึกตัวเลือกไม่สำเร็จ กรุณาลองใหม่";
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

  // ★ เพิ่มใหม่: หาความยาววิดีโอรวมของบทเรียนจาก segment ที่เพิ่งตรวจสอบผ่าน
  // แล้วบันทึกลง lessons.video_duration_seconds — คอลัมน์นี้มีอยู่แล้วในฐานข้อมูล (default 0)
  // แต่ก่อนหน้านี้ไม่มีจุดไหนเซ็ตค่าให้เลย หน้าคอร์ส (/courses/[slug]) เลยคำนวณรวมได้ 0 เสมอ
  const videoDurationSeconds = computeVideoDurationSeconds(preparedSegments.segments);

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
      video_duration_seconds: videoDurationSeconds,
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

  const videoDurationSeconds = computeVideoDurationSeconds(preparedSegments.segments);

  // 1-3. อัปเดต lesson / draft / สถานะคอร์ส พร้อมกัน — ไม่มีอันไหนต้องรอผลอันอื่นก่อน
  const [{ error: lessonError }, { error: draftError }, { error: courseStatusError }] = await Promise.all([
    supabase
      .from("lessons")
      .update({
        title: input.title,
        video_url: input.videoUrl,
        video_duration_seconds: videoDurationSeconds,
      })
      .eq("id", input.lessonId),
    supabase
      .from("lesson_drafts")
      .update({
        video_url: input.videoUrl,
        content_html: input.contentHtml,
        status: "draft",
      })
      .eq("id", input.draftId)
      .eq("teacher_id", user.id),
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

  // ★ แก้ตามแผน A: จำ id คำถามเก่าไว้ก่อน แล้วค่อย insert คำถามใหม่ "ก่อน" ลบของเก่า
  // เดิมลบก่อนแล้วค่อย insert — ถ้า insert พังกลางทาง (timeout/RLS ชั่วคราว) draft จะเหลือ
  // คำถาม 0 ข้อ ตอนนี้สลับลำดับ: ถ้า insert ใหม่พัง ของเก่ายังอยู่ครบ ไม่มีอะไรหาย
  // (อย่างแย่สุดถ้าลบของเก่าไม่สำเร็จหลัง insert ใหม่แล้ว จะเหลือคำถามซ้ำซ้อนชั่วคราว
  // ซึ่งกู้คืนได้ง่ายกว่าคำถามหายไปเลย)
  const { data: oldQuestions, error: oldQuestionsFetchError } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("lesson_draft_id", input.draftId)
    .not("video_timestamp_seconds", "is", null);

  if (oldQuestionsFetchError) return { error: "ตรวจสอบคำถามเดิมไม่สำเร็จ กรุณาลองใหม่" };

  const oldQuestionIds = (oldQuestions ?? []).map((q) => q.id);

  const questionsError = await batchInsertQuestions(supabase, input.draftId, input.questions);
  if (questionsError) return { error: questionsError };

  if (oldQuestionIds.length > 0) {
  const deleteErr = await deleteWithRetry(() =>
    supabase.from("quiz_questions").delete().in("id", oldQuestionIds)
  );
  if (deleteErr) {
    return { error: "บันทึกคำถามใหม่สำเร็จ แต่ลบคำถามเก่าไม่สำเร็จ กรุณากดบันทึกอีกครั้งเพื่อล้างข้อมูลซ้ำ" };
  }
}

  // ★ เดียวกับด้านบน: insert หมุดควิซแบบสุ่มใหม่ก่อน ค่อยลบของเก่าทีหลัง
  const { data: oldMarkers, error: oldMarkersFetchError } = await supabase
    .from("video_quiz_markers")
    .select("id")
    .eq("lesson_draft_id", input.draftId);

  if (oldMarkersFetchError) return { error: "ตรวจสอบหมุดควิซเดิมไม่สำเร็จ กรุณาลองใหม่" };

  const oldMarkerIds = (oldMarkers ?? []).map((m) => m.id);

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

  if (oldMarkerIds.length > 0) {
    const { error: deleteMarkersError } = await supabase.from("video_quiz_markers").delete().in("id", oldMarkerIds);
    if (deleteMarkersError) {
      console.error("Failed to delete old markers:", deleteMarkersError.message);
      return { error: "บันทึกหมุดควิซใหม่สำเร็จ แต่ลบหมุดเก่าไม่สำเร็จ กรุณากดบันทึกอีกครั้งเพื่อล้างข้อมูลซ้ำ" };
    }
  }

  return { draftId: input.draftId, lessonId: input.lessonId };
}

export async function submitDraftForReview(draftId: string, courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
    return { error: error?.message ?? "ไม่พบฉบับร่าง หรือไม่มีสิทธิ์ส่งตรวจสอบ" };
  }

  // ★ สมมาตรกับ rejectLesson: ถ้าคอร์สนี้ published อยู่แล้ว (เคยผ่านตรวจมาก่อน)
  // การส่งบทเรียนที่แก้ใหม่เข้าตรวจต้องดึงคอร์สกลับเข้าคิว pending ด้วย
  // ไม่งั้นจะไม่โผล่ที่หน้าแอดมิน ?status=pending เลย (courseId มีอยู่แล้วจาก parameter)
  const { data: course } = await supabase
    .from("courses")
    .select("status")
    .eq("id", courseId)
    .maybeSingle();

  if (course?.status === "published") {
    await supabase.from("courses").update({ status: "pending" }).eq("id", courseId);
  }

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

export async function getBankQuestionCountsForLesson(
  lessonId: string
): Promise<{ counts: BankQuestionCounts; error?: string }> {
  const emptyCounts: BankQuestionCounts = { easy: 0, medium: 0, hard: 0 };
  if (!lessonId) return { counts: emptyCounts };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { counts: emptyCounts, error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data, error } = await supabase
    .from("question_bank")
    .select("difficulty, question_bank_topic_tags(lesson_id)")
    .eq("usage_type", "popup");

  if (error) return { counts: emptyCounts, error: error.message };

  const counts = { ...emptyCounts };
  for (const q of data ?? []) {
    const tags = (q as { question_bank_topic_tags?: { lesson_id: string | null }[] }).question_bank_topic_tags ?? [];
    if (!tags.some((tag) => tag.lesson_id === lessonId)) continue;
    const difficulty = (q as { difficulty: "easy" | "medium" | "hard" }).difficulty;
    if (difficulty in counts) counts[difficulty] += 1;
  }

  return { counts };
}