"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyAdmins } from "@/lib/notifications/service";
import type { DragDropAnswerData, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
import { validateDragDropAuthoring, validateMultiSelectAuthoring } from "@/lib/quiz/validators/authoring";
import { DRAG_DROP_ENABLED, MULTI_SELECT_ENABLED } from "@/lib/quiz/config/rollout";

export interface DraftChoiceInput {
  text: string;
  isCorrect: boolean;
}

export interface DraftQuestionInput {
  // ★ เพิ่มใหม่: id ของคำถามเดิมใน DB — null/undefined = คำถามที่เพิ่งเพิ่มใหม่ในฟอร์ม
  // มีค่า = คำถามเดิมที่ต้องอัปเดตทับ ไม่ใช่ลบทิ้งแล้วสร้างใหม่ (ดูเหตุผลที่ updateLessonDraft)
  questionId?: string | null;//ถ้ามีค่าเดิม หรือ คำถามใหม่
  questionText: string;
  choices: DraftChoiceInput[];
  timestampSeconds: number | null; // หน้านี้บันทึกเฉพาะควิซแทรกกลางวิดีโอ
  explanation: string | null;
  sourceType?: "custom" | "bank_manual"; // ไม่ระบุ = custom (ของเดิม)
  sourceQuestionId?: string | null; // ใช้เมื่อ sourceType = bank_manual
  // ★ เพิ่มใหม่: ประเภทคำถาม — เดิม hardcode เป็น multiple_choice เสมอทั้งที่ quiz_questions
  // มีคอลัมน์ interaction_type รองรับ true_false อยู่แล้ว ไม่ระบุ = multiple_choice (ของเดิม)
  // ตอนนี้เพิ่ม matching/sequencing สำหรับควิซแทรกกลางวิดีโอแบบ static (ไม่สุ่ม) ด้วย — เกรดฝั่ง
  // ผู้เรียนตรวจในเครื่องได้ทันที (baked ลง SCORM package เหมือน correctIndex ของ MC/True-False)
  interactionType?: "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing";
  // ===== เพิ่มใหม่: answer_data ของ matching/sequencing (MC/True-False ยังใช้ choices เหมือนเดิม
  // ไม่ใช้ฟิลด์นี้) shape เดียวกับ src/types/interaction.ts (MatchingAnswerData/SequencingAnswerData)
  answerData?: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  imageUrl?: string | null; // รูปภาพประกอบคำถาม (ไม่บังคับ)
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (ไม่บังคับ ใช้ได้เฉพาะเมื่อมี imageUrl) =====
  imageCaption?: string | null;
  imagePins?: ImagePinInput[] | null;
}

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพประกอบคำถาม — x/y เป็น % ของขนาดภาพ (0-100) ลำดับเลขอ้างจาก
// ตำแหน่งใน array (index + 1) ไม่ได้เก็บเลขไว้ตรงๆ กันเลขเพี้ยนเวลาลบหมุดกลางๆออก =====
export interface ImagePinInput {
  id: string;
  x: number;
  y: number;
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
  id: string;
  question_text: string;
  order_index: number;
  video_timestamp_seconds: number | null;
  explanation: string | null;
  source_type: "custom" | "bank_manual" | null;
  source_question_id: string | null;
  interaction_type: "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing" | null;
  answer_data: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  image_url: string | null;
  image_caption: string | null;
  image_pins: ImagePinInput[] | null;
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
  videoDurationSeconds?: number;
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
  if (input.length > 200) return { error: "แบ่งวิดีโอได้สูงสุด 200 หัวข้อย่อย" };

  const segments = [...input].sort((first, second) => first.start - second.start);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment.title.trim()) return { error: `กรุณาใส่ชื่อหัวข้อย่อยที่ ${index + 1}` };
    if (segment.title.trim().length > 200) return { error: `ชื่อหัวข้อย่อยที่ ${index + 1} ยาวเกิน 200 ตัวอักษร` };
    if ((segment.summary?.trim().length ?? 0) > 500) return { error: `คำอธิบายหัวข้อย่อยที่ ${index + 1} ยาวเกิน 500 ตัวอักษร` };
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) {
      return { error: `เวลาเริ่ม–จบของหัวข้อย่อยที่ ${index + 1} ไม่ถูกต้อง` };
    }
    if (!(["ai", "manual", "timed"] as const).includes(segment.source)) {
      return { error: `แหล่งที่มาของหัวข้อย่อยที่ ${index + 1} ไม่ถูกต้อง` };
    }
    if (index > 0 && segment.start < segments[index - 1].end) {
      return { error: `ช่วงเวลาของหัวข้อย่อยที่ ${index} และหัวข้อย่อยที่ ${index + 1} ซ้อนกัน` };
    }
    if (segment.confidence != null && (!Number.isFinite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1)) {
      return { error: `ค่าความมั่นใจของหัวข้อย่อยที่ ${index + 1} ไม่ถูกต้อง` };
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
// ใช้เป็น fallback กรณีไม่มีค่าความยาวจริงจาก client ส่งมา ช่วงย่อยๆ
function computeVideoDurationSeconds(segments: DraftVideoSegmentInput[]): number {
  if (segments.length === 0) return 0;
  const maxEnd = Math.max(...segments.map((segment) => segment.end));
  return Math.round(maxEnd);
}

// ★ แก้บั๊ก: บทเรียนส่วนใหญ่ไม่ได้แบ่ง video segment เลย computeVideoDurationSeconds
// จาก segment เพียงอย่างเดียวจึงได้ 0 เกือบทุกบท ทั้งที่ browser ฝั่ง client จับความยาว
// วิดีโอจริงได้อยู่แล้ว (onLoadedMetadata) ตอนนี้รับค่านั้นมาด้วย แล้วเลือกค่าที่มากกว่า
// ระหว่างสองแหล่ง (segment กับ client) เผื่อกรณี segment ถูกตัดไม่ถึงท้ายวิดีโอจริง
function resolveVideoDurationSeconds(
  segments: DraftVideoSegmentInput[],
  clientDurationSeconds: number | undefined
): number {
  const fromSegments = computeVideoDurationSeconds(segments);
  const fromClient = clientDurationSeconds && Number.isFinite(clientDurationSeconds) ? Math.round(clientDurationSeconds) : 0;
  return Math.max(fromSegments, fromClient);
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
// ★ แยกออกมาจาก batchInsertQuestions เพื่อให้ทางอัปเดตคำถามเดิม (updateExistingQuestions)
// ใช้ตัวตรวจและรูปแบบคอลัมน์ชุดเดียวกันเป๊ะ ไม่ต้องก๊อปโค้ดไปไว้สองที่แล้วหลุดไม่ตรงกันทีหลัง
// multi_select / drag_drop: ตรวจฝั่ง server ด้วยตัวตรวจกลางเดียวกับฟอร์ม (ข้อมูลจาก client ไม่น่าเชื่อถือ)
// และเคารพสวิตช์เปิดใช้ใน config/rollout.ts — ข้อมูลผิดรูปแบบจะทำให้ตัวเล่นใน SCORM สร้างไม่ได้
function validateQuestionAuthoring(q: DraftQuestionInput, orderIndex: number): string | null {
  if (q.interactionType === "multi_select") {
    if (!MULTI_SELECT_ENABLED) return "ยังไม่เปิดให้ใช้คำถามแบบ Multiple Select";
    const problems = validateMultiSelectAuthoring(q.choices.filter((c) => c.text.trim()));
    if (problems.length > 0) return `คำถามข้อ ${orderIndex + 1} (Multiple Select): ${problems.join(" / ")}`;
  } else if (q.interactionType === "drag_drop") {
    if (!DRAG_DROP_ENABLED) return "ยังไม่เปิดให้ใช้คำถามแบบเติมคำ (ลากวาง)";
    const problems = validateDragDropAuthoring(q.answerData);
    if (problems.length > 0) return `คำถามข้อ ${orderIndex + 1} (เติมคำ): ${problems.join(" / ")}`;
  }
  return null;
}

// คอลัมน์ของแถว quiz_questions (ไม่รวม lesson_draft_id ที่ใส่เฉพาะตอน insert)
function buildQuestionColumns(q: DraftQuestionInput, orderIndex: number) {
  return {
    question_text: q.questionText,
    order_index: orderIndex,
    video_timestamp_seconds: q.timestampSeconds,
    explanation: q.explanation,
    source_type: q.sourceType ?? "custom",
    source_question_id: q.sourceQuestionId ?? null,
    // ★ ไม่ระบุ = multiple_choice (พฤติกรรมเดิม) — รองรับ true_false/matching/sequencing
    interaction_type: q.interactionType ?? "multiple_choice",
    // answer_data ของ matching/sequencing/drag_drop (null สำหรับ MC/True-False เหมือนเดิม)
    answer_data:
      q.interactionType === "matching" || q.interactionType === "sequencing" || q.interactionType === "drag_drop"
        ? q.answerData ?? null
        : null,
    image_url: q.imageUrl ?? null,
    // คำบรรยายใต้ภาพ + หมุดตัวเลข — ไม่มีรูปก็ไม่มีความหมาย แต่บันทึกไว้เฉยๆไม่เป็นไร
    image_caption: q.imageCaption ?? null,
    image_pins: q.imagePins ?? null,
  };
}

// matching/sequencing/drag_drop ไม่มี quiz_choices เลย (เฉลยอยู่ใน answer_data) — กันไว้ชัดๆ
// ไม่ให้พึ่งพาแค่ว่า client ส่ง choices ว่างมาเท่านั้น
function buildChoiceRows(q: DraftQuestionInput, questionId: string) {
  if (q.interactionType === "matching" || q.interactionType === "sequencing" || q.interactionType === "drag_drop") {
    return [];
  }
  return q.choices
    .filter((c) => c.text.trim())
    .map((c, cIndex) => ({
      question_id: questionId,
      choice_text: c.text,
      is_correct: c.isCorrect,
      order_index: cIndex,
    }));
}

// ★ อัปเดตคำถามเดิมทับที่เดิม โดย id ของคำถามไม่เปลี่ยน
// เหตุผล: แพ็กเกจ SCORM ที่นักเรียนเรียนอยู่อ้าง id ของคำถาม และ video_quiz_attempts.question_id
// ก็ผูกกับ id นี้แบบ ON DELETE CASCADE ถ้าลบคำถามเก่าทิ้งทุกครั้งที่ครูกดบันทึก คำตอบที่นักเรียน
// เคยทำไว้จะหายตามไปด้วยทั้งหมด
// หมายเหตุ: quiz_choices ลบแล้วใส่ใหม่ได้ เพราะไม่มีตารางไหนอ้างถึง quiz_choices.id เลย
// (คำตอบนักเรียนเก็บเป็น selected_choice_index ซึ่งเป็นเลขลำดับ ไม่ใช่ id)
async function updateExistingQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  entries: { question: DraftQuestionInput; orderIndex: number; questionId: string }[]//entries คือรายการคำถามเดิมที่ต้องอัปเดต แต่ละอันมี 3 อย่าง: ตัวคำถามจากฟอร์ม (question), ลำดับข้อใหม่ (orderIndex), และ id เดิมใน DB (questionId)
): Promise<string | null> {
  // ตรวจให้ครบทุกข้อก่อน ค่อยเริ่มเขียน DB — จะได้ไม่เขียนไปครึ่งทางแล้วเจอข้อเสียทีหลัง
  for (const { question, orderIndex } of entries) {
    const invalid = validateQuestionAuthoring(question, orderIndex);
    if (invalid) return invalid;
  }

  for (const { question, orderIndex, questionId } of entries) { //วนfor จนครบทุดตัวใน entries
    const { error: updateError } = await supabase
      .from("quiz_questions")
      .update(buildQuestionColumns(question, orderIndex))//ทุกคอลัมน์ถูก เขียนทับด้วยค่าจากฟอร์มทุกครั้ง
      .eq("id", questionId)
      .eq("lesson_draft_id", draftId);//แก้เฉพาะแถวที่ id ตรง และอยู่ใน draft นี้ พร้อมกัน
    if (updateError) {
      console.error("updateExistingQuestions (question):", updateError.message);
      return "อัปเดตคำถามไม่สำเร็จ กรุณาลองใหม่";
    }

    const deleteChoicesError = await deleteWithRetry(() =>
      supabase.from("quiz_choices").delete().eq("question_id", questionId)
    );
    if (deleteChoicesError) return "อัปเดตตัวเลือกคำตอบไม่สำเร็จ กรุณาลองใหม่";

    const choiceRows = buildChoiceRows(question, questionId);//แก้โดยลบของเก่าหมดก่อนแล้ว insert ของใหม่ทั้งหมด (ไม่ต้องเช็คว่ามีตัวเลือกเดิมอยู่แล้วหรือไม่) — กันปัญหาลำดับข้อผิดเพี้ยน
    if (choiceRows.length > 0) {
      const { error: choicesError } = await supabase.from("quiz_choices").insert(choiceRows);//ตารางคือ quiz_choices
      if (choicesError) {
        console.error("updateExistingQuestions (choices):", choicesError.message);
        return "บันทึกตัวเลือกไม่สำเร็จ กรุณาลองใหม่";
      }
    }
  }
  return null;
}

async function batchInsertQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  // ★ เปลี่ยนจาก DraftQuestionInput[] เป็นคู่ของคำถามกับลำดับข้อจริง เพราะตอนนี้ฟังก์ชันนี้อาจได้รับ
  // เฉพาะ "ข้อที่เพิ่มใหม่" ซึ่งอยู่กระจายกลางๆ รายการ ลำดับข้อจึงต้องส่งมาตรงๆ ไม่ใช่นับจาก index
  // ของ array ที่ส่งเข้ามา (ไม่งั้น order_index จะชนกับข้อเดิมที่ยังอยู่)
  entries: { question: DraftQuestionInput; orderIndex: number }[]
): Promise<string | null> {
  const validQuestions = entries //validQuestions รายการคำถามที่ตรวจแ้วว่าใช้ได้จริง 
    .map(({ question, orderIndex }) => ({ q: question, originalIndex: orderIndex }))
    .filter(({ q }) => q.questionText.trim());

  if (validQuestions.length === 0) return null;

  for (const { q, originalIndex } of validQuestions) {
    const invalid = validateQuestionAuthoring(q, originalIndex);
    if (invalid) return invalid;
  }

  const questionRows = validQuestions.map(({ q, originalIndex }) => ({
    lesson_draft_id: draftId,
    ...buildQuestionColumns(q, originalIndex),
  }));
  const orderIndexes = questionRows.map((r) => r.order_index);

  let insertedQuestions: { id: string; order_index: number }[] | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { data, error } = await supabase
      .from("quiz_questions")
      .insert(questionRows)//insert คำถามทั้งหมดพร้อมกัน
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
    return buildChoiceRows(q, questionId);
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
  const [{ data: actor }, { data: course }, { data: courseModule }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("created_by").eq("id", input.courseId).maybeSingle(),
    supabase.from("modules").select("course_id").eq("id", input.moduleId).maybeSingle(),
  ]);
  if (!course || courseModule?.course_id !== input.courseId ||
    (actor?.role !== "admin" && !(actor?.role === "teacher" && course.created_by === user.id))) {
    return { error: "ไม่มีสิทธิ์เพิ่มบทเรียนในคอร์สนี้" };
  }
  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อบทเรียน" };
  const preparedSegments = prepareVideoSegments(input.videoSegments);
  if (!preparedSegments.segments) return { error: preparedSegments.error ?? "ข้อมูลช่วงวิดีโอไม่ถูกต้อง" };

  // ★ เพิ่มใหม่: หาความยาววิดีโอรวมของบทเรียนจาก segment ที่เพิ่งตรวจสอบผ่าน หรือจากค่าที่
  // client จับได้จริงตอนโหลดวิดีโอ (แล้วเลือกค่าที่มากกว่า) แล้วบันทึกลง lessons.video_duration_seconds
  // — คอลัมน์นี้มีอยู่แล้วในฐานข้อมูล (default 0) แต่ก่อนหน้านี้แทบไม่มีจุดไหนเซ็ตค่าให้จริงเลย
  const videoDurationSeconds = resolveVideoDurationSeconds(preparedSegments.segments, input.videoDurationSeconds);

  const { data: editingCourse, error: courseStatusError } = await supabase.from("courses")
    .update({ status: "draft" }).eq("id", input.courseId).select("id").maybeSingle();
  if (courseStatusError || !editingCourse) return { error: "เตรียมคอร์สสำหรับเพิ่มบทเรียนไม่สำเร็จ" };

  // 1. หา order_index ถัดไปใน module ขอลำดับของบทสุดท้ายในหมวดนี้
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
  // บทใหม่ = คำถามเป็นของใหม่ทั้งหมด ลำดับข้อจึงเท่ากับตำแหน่งใน array ตรงๆ
  const questionsError = await batchInsertQuestions(
    supabase,
    draft.id,
    input.questions.map((question, orderIndex) => ({ question, orderIndex }))
  );
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

  revalidatePath(`/dashboard/admin/courses/${input.courseId}`);
  revalidatePath(`/dashboard/teacher/courses/${input.courseId}`);
  revalidatePath("/courses");
  return { draftId: draft.id, lessonId: lesson.id };
}

export interface ExistingDraftData {
  lessonId: string;
  draftId: string;
  title: string;
  videoUrl: string | null;
  // ===== เพิ่มใหม่: ส่งค่าความยาววิดีโอที่บันทึกไว้แล้วกลับไปด้วย กัน videoDuration ฝั่ง client
  // (useState เริ่มที่ 0) ไปทับค่าที่ถูกต้องเดิมเป็น 0 ถ้าครูกดบันทึกเร็วกว่าที่ <video>
  // onLoadedMetadata จะทัน (ดูคอมเมนต์ยาวใน LessonDraftForm.tsx ตรง handleSave)
  videoDurationSeconds: number;
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
    // ★ เพิ่มใหม่: ส่ง id ของคำถามเดิมกลับไปให้ฟอร์มถือไว้ เพื่อให้ตอนบันทึกส่งกลับมาได้ว่าข้อนี้
    // คือข้อเดิม ไม่ใช่ข้อใหม่ (ดูเหตุผลที่ updateLessonDraft)
    questionId: string;
    questionText: string;
    timestampSeconds: number | null;
    explanation: string | null;
    choices: { text: string; isCorrect: boolean }[];
    sourceType?: "custom" | "bank_manual";
    sourceQuestionId?: string | null;
    interactionType?: "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing";
    answerData?: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
    imageUrl?: string | null;
    imageCaption?: string | null;
    imagePins?: ImagePinInput[] | null;
  }[];
  randomMarkers: {
    markerId: string;
    timestampSeconds: number;
    difficulty: "easy" | "medium" | "hard";
  }[];
}

export async function getLessonDraftForEdit(lessonId: string, courseId?: string): Promise<{ data?: ExistingDraftData; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, title, course_id, video_duration_seconds")
    .eq("id", lessonId)
    .single();

  if (lessonError || !lesson) return { error: "ไม่พบบทเรียนนี้" };
  if (courseId && lesson.course_id !== courseId) return { error: "บทเรียนไม่อยู่ในคอร์สที่ระบุ" };
  const [{ data: actor }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("created_by").eq("id", lesson.course_id).maybeSingle(),
  ]);
  if (!course || (actor?.role !== "admin" && !(actor?.role === "teacher" && course.created_by === user.id))) {
    return { error: "ไม่มีสิทธิ์แก้ไขบทเรียนนี้" };
  }

  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select(
      `id, video_url, content_html, status,
       quiz_questions ( id, question_text, order_index, video_timestamp_seconds, explanation, source_type, source_question_id, interaction_type, answer_data, image_url, image_caption, image_pins,
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
      questionId: q.id,
      questionText: q.question_text,
      timestampSeconds: q.video_timestamp_seconds,
      explanation: q.explanation,
      imageUrl: q.image_url ?? null,
      imageCaption: q.image_caption ?? null,
      imagePins: q.image_pins ?? null,
      choices: (q.quiz_choices ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
      sourceType: q.source_type ?? "custom",
      sourceQuestionId: q.source_question_id,
      interactionType: q.interaction_type ?? "multiple_choice",
      answerData: q.answer_data ?? null,
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
      videoDurationSeconds: lesson.video_duration_seconds ?? 0,
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
  videoDurationSeconds?: number;
  videoSegments: DraftVideoSegmentInput[];
  questions: DraftQuestionInput[];
  randomMarkers: DraftRandomMarkerInput[];
}): Promise<SaveLessonDraftResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };
  const [{ data: actor }, { data: course }, { data: lesson }, { data: draft }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("created_by").eq("id", input.courseId).maybeSingle(),
    supabase.from("lessons").select("course_id").eq("id", input.lessonId).maybeSingle(),
    supabase.from("lesson_drafts").select("lesson_id, teacher_id").eq("id", input.draftId).maybeSingle(),
  ]);
  if (!course || lesson?.course_id !== input.courseId || draft?.lesson_id !== input.lessonId ||
    (actor?.role !== "admin" && !(actor?.role === "teacher" && course.created_by === user.id && draft.teacher_id === user.id))) {
    return { error: "ไม่มีสิทธิ์แก้ไขบทเรียนนี้ หรือบทเรียนไม่อยู่ในคอร์สที่ระบุ" };
  }
  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อบทเรียน" };
  const preparedSegments = prepareVideoSegments(input.videoSegments);
  if (!preparedSegments.segments) return { error: preparedSegments.error ?? "ข้อมูลช่วงวิดีโอไม่ถูกต้อง" };

  const videoDurationSeconds = resolveVideoDurationSeconds(preparedSegments.segments, input.videoDurationSeconds);

  // Stop exposing a published course before changing its lesson content.
  const { data: editingCourse, error: courseStatusError } = await supabase.from("courses")
    .update({ status: "draft" }).eq("id", input.courseId).select("id").maybeSingle();
  if (courseStatusError || !editingCourse) return { error: "อัปเดตสถานะคอร์สเป็นฉบับร่างไม่สำเร็จ" };

  const [{ data: savedLesson, error: lessonError }, { data: savedDraft, error: draftError }] = await Promise.all([
    supabase
      .from("lessons")
      .update({
        title: input.title,
        video_url: input.videoUrl,
        video_duration_seconds: videoDurationSeconds,
      })
      .eq("id", input.lessonId).eq("course_id", input.courseId).select("id").maybeSingle(),
    supabase
      .from("lesson_drafts")
      .update({
        video_url: input.videoUrl,
        content_html: input.contentHtml,
        status: "draft",
      })
      .eq("id", input.draftId)
      .eq("lesson_id", input.lessonId).select("id").maybeSingle(),
  ]);

  if (lessonError || !savedLesson) return { error: "อัปเดตชื่อบทเรียนไม่สำเร็จ" };
  if (draftError || !savedDraft) return { error: "อัปเดตฉบับร่างไม่สำเร็จ" };

  const segmentError = await replaceVideoSegments(
    supabase,
    input.draftId,
    input.lessonId,
    preparedSegments.segments
  );
  if (segmentError) return { error: segmentError };

  // ★ คำถามควิซ: คง id ของคำถามเดิมไว้ แทนการลบทิ้งทั้งหมดแล้วสร้างใหม่ทุกครั้งแบบเดิม
  // เหตุผลเดียวกับหมุดควิซด้านล่าง: video_quiz_attempts.question_id ผูกกับ quiz_questions.id
  // แบบ ON DELETE CASCADE ถ้า id เปลี่ยนทุกครั้งที่ครูกดบันทึก (แม้แก้แค่ชื่อบท) คำตอบที่นักเรียน
  // เคยทำไว้จะถูกลบหายไปทั้งหมด และแพ็กเกจ SCORM เก่าที่อ้าง id เดิมก็บันทึกสถิติไม่ได้อีก
  // ฟอร์มส่ง questionId ของข้อเดิมกลับมาให้แล้ว (ดู DraftQuestionInput)
  const { data: oldQuestions, error: oldQuestionsFetchError } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("lesson_draft_id", input.draftId)
    .not("video_timestamp_seconds", "is", null);

  if (oldQuestionsFetchError) return { error: "ตรวจสอบคำถามเดิมไม่สำเร็จ กรุณาลองใหม่" };

  const oldQuestionIds: string[] = (oldQuestions ?? []).map((q) => q.id as string);
  const keptQuestionIds: string[] = [];
  const questionUpdates: { question: DraftQuestionInput; orderIndex: number; questionId: string }[] = [];
  const questionInserts: { question: DraftQuestionInput; orderIndex: number }[] = [];

  input.questions.forEach((question, orderIndex) => {
    // ข้อที่ข้อความว่าง = ถือว่าครูเอาออก (พฤติกรรมเดิมคือถูก filter ทิ้งตอน insert อยู่แล้ว)
    if (!question.questionText.trim()) return;
    // เช็กด้วยว่า questionId ที่ส่งมาเป็นของ draft นี้จริง กันค่าแปลกปลอมจากฝั่ง client
    if (question.questionId && oldQuestionIds.includes(question.questionId)) {
      keptQuestionIds.push(question.questionId);
      questionUpdates.push({ question, orderIndex, questionId: question.questionId });
    } else {
      questionInserts.push({ question, orderIndex });
    }
  });

  const updateQuestionsError = await updateExistingQuestions(supabase, input.draftId, questionUpdates);
  if (updateQuestionsError) return { error: updateQuestionsError };

  // insert ข้อใหม่ "ก่อน" ลบข้อที่เอาออก — ถ้า insert พังกลางทาง ของเก่ายังอยู่ครบ ไม่มีอะไรหาย
  // (อย่างแย่สุดคือเหลือข้อซ้ำซ้อนชั่วคราว ซึ่งกู้คืนง่ายกว่าคำถามหายไปเลย)
  const questionsError = await batchInsertQuestions(supabase, input.draftId, questionInserts);
  if (questionsError) return { error: questionsError };

  const removedQuestionIds = oldQuestionIds.filter((id) => !keptQuestionIds.includes(id));
  if (removedQuestionIds.length > 0) {
    const deleteErr = await deleteWithRetry(() =>
      supabase.from("quiz_questions").delete().in("id", removedQuestionIds)
    );
    if (deleteErr) {
      return { error: "บันทึกคำถามใหม่สำเร็จ แต่ลบคำถามที่เอาออกไม่สำเร็จ กรุณากดบันทึกอีกครั้งเพื่อล้างข้อมูลซ้ำ" };
    }
  }

  // ★ หมุดควิซแบบสุ่ม: คง id เดิมไว้ แทนการลบทิ้งแล้วสร้างใหม่ทุกครั้งแบบเดิม
  // เหตุผล: แพ็กเกจ SCORM ที่นักเรียนกำลังเรียนอยู่อ้างถึง id ของหมุดโดยตรง ถ้า id เปลี่ยนทุกครั้ง
  // ที่ครูกดบันทึก (แม้แก้แค่ชื่อบท) หมุดในแพ็กเกจเก่าจะหาไม่เจอ ขึ้น "โหลดคำถามไม่สำเร็จ" และ
  // คำตอบที่นักเรียนเคยทำไว้จะถูกลบตาม cascade ของ video_quiz_attempts.marker_id ไปด้วย
  // ฟอร์มส่ง markerId ของหมุดเดิมกลับมาอยู่แล้ว (ดู DraftRandomMarkerInput) จึงแยกได้ว่าอันไหน
  // อัปเดตของเดิม อันไหนปักใหม่ และลบเฉพาะอันที่ครูเอาออกจริงๆ
  const { data: oldMarkers, error: oldMarkersFetchError } = await supabase
    .from("video_quiz_markers")
    .select("id")
    .eq("lesson_draft_id", input.draftId);

  if (oldMarkersFetchError) return { error: "ตรวจสอบหมุดควิซเดิมไม่สำเร็จ กรุณาลองใหม่" };

  const oldMarkerIds: string[] = (oldMarkers ?? []).map((m) => m.id as string);
  const keptMarkerIds: string[] = [];
  const markerUpdates: { id: string; timestampSeconds: number; difficulty: string; orderIndex: number }[] = [];
  const markerInserts: {
    lesson_draft_id: string;
    lesson_id: string;
    timestamp_seconds: number;
    random_difficulty: string;
    order_index: number;
  }[] = [];

  input.randomMarkers.forEach((m, idx) => {
    // เช็กด้วยว่า markerId ที่ส่งมาเป็นของ draft นี้จริง กันกรณีค่าแปลกปลอมหลุดมาจากฝั่ง client
    if (m.markerId && oldMarkerIds.includes(m.markerId)) {
      keptMarkerIds.push(m.markerId);
      markerUpdates.push({
        id: m.markerId,
        timestampSeconds: m.timestampSeconds,
        difficulty: m.difficulty,
        orderIndex: idx,
      });
    } else {
      markerInserts.push({
        lesson_draft_id: input.draftId,
        lesson_id: input.lessonId,
        timestamp_seconds: m.timestampSeconds,
        random_difficulty: m.difficulty,
        order_index: idx,
      });
    }
  });

  // อัปเดตหมุดเดิมทีละตัว — หนึ่งบทมีหมุดไม่กี่ตัว และตาราง video_quiz_markers ไม่มี unique
  // constraint ใดๆ (มีแค่ PK กับ FK) จึงสลับลำดับ/เวลากันไปมาได้โดยไม่ชนกันเองระหว่างทาง
  for (const row of markerUpdates) {
    const { error: updateMarkerError } = await supabase
      .from("video_quiz_markers")
      .update({
        timestamp_seconds: row.timestampSeconds,
        random_difficulty: row.difficulty,
        order_index: row.orderIndex,
      })
      .eq("id", row.id)
      .eq("lesson_draft_id", input.draftId);
    if (updateMarkerError) {
      console.error("Failed to update marker:", updateMarkerError.message);
      return { error: "อัปเดตหมุดควิซแบบสุ่มไม่สำเร็จ" };
    }
  }

  if (markerInserts.length > 0) {
    const insertMarkersError = await insertMarkersWithRetry(supabase, input.draftId, markerInserts);
    if (insertMarkersError) return { error: insertMarkersError };
  }

  // ลบเฉพาะหมุดที่ครูเอาออกจริง (ไม่ได้ถูกส่งกลับมาในรอบนี้) — หมุดที่ยังอยู่ id จะไม่เปลี่ยน
  const removedMarkerIds = oldMarkerIds.filter((id) => !keptMarkerIds.includes(id));
  if (removedMarkerIds.length > 0) {
    const deleteMarkersError = await deleteWithRetry(() =>
      supabase.from("video_quiz_markers").delete().in("id", removedMarkerIds)
    );
    if (deleteMarkersError) {
      return { error: "บันทึกหมุดควิซใหม่สำเร็จ แต่ลบหมุดที่เอาออกไม่สำเร็จ กรุณากดบันทึกอีกครั้ง" };
    }
  }

  revalidatePath(`/dashboard/admin/courses/${input.courseId}`);
  revalidatePath(`/dashboard/teacher/courses/${input.courseId}`);
  revalidatePath("/courses");
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
    await supabase.from("courses").update({ status: "pending" }).eq("id", courseId);// ดึงคอร์สที่เคยถูก approved กลับเข้าคิว pending
  }

  revalidatePath(`/dashboard/teacher/courses/${courseId}`);
  revalidatePath("/dashboard/teacher/courses");
  return {};
}

export interface BankQuestionForLesson {
  id: string;
  questionText: string;
  imageUrl: string | null;
  // ===== เพิ่มใหม่: เดิม query ไม่ได้ select มาเลยทั้ง difficulty/interaction_type/answer_data/
  // image_caption/image_pins — ทำให้แท็บ "เลือกจากคลังข้อสอบ" แสดงได้แค่ question_text ล้วนๆ
  // ไม่มีป้ายระดับ/ประเภท และคำถามแบบจับคู่/เรียงลำดับก็หยิบไปใช้ไม่ได้ถูกต้อง (choices ว่างเปล่า) =====
  difficulty: "easy" | "medium" | "hard";
  interactionType: "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing";
  answerData: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  imageCaption: string | null;
  explanation: string | null;
  imagePins: ImagePinInput[] | null;
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
      "id, question_text, usage_type, explanation, image_url, image_caption, image_pins, difficulty, interaction_type, answer_data, question_bank_choices(choice_text, is_correct, order_index), question_bank_topic_tags(lesson_id)"
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
      imageUrl: q.image_url ?? null,
      imageCaption: q.image_caption ?? null,
      explanation: q.explanation ?? null,
      imagePins: q.image_pins ?? null,
      difficulty: (q.difficulty as "easy" | "medium" | "hard") ?? "medium",
      interactionType: (q.interaction_type as BankQuestionForLesson["interactionType"]) ?? "multiple_choice",
      answerData: (q.answer_data as MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null) ?? null,
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
