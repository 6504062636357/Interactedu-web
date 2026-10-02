import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { seedFromString, seededSample, seededShuffle } from "@/lib/courses/seeded-random";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { DragDropAnswerData, DragDropDisplay, ExamInteractionType, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
import { DRAG_DROP_ENABLED, MULTI_SELECT_ENABLED } from "@/lib/quiz/config/rollout";
import { parseDragDropAnswerData } from "@/lib/quiz/validators/drag-drop";
export type Difficulty = "easy" | "medium" | "hard";
// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (ตามแบบ actions.ts/CourseExamEditor.tsx ฝั่ง authoring) —
// ทางนี้เป็นฝั่ง "อ่าน/สุ่ม" ให้นักเรียนเห็น เลยแค่ pass-through ไม่มี logic แก้ไข =====
interface ImagePin { id: string; x: number; y: number }
// ===== เพิ่มใหม่: allowlist ต้อง sync กับ lib/quiz/config/enabled-types.ts =====
// Final Exam (สุ่มจากคลังข้อสอบ) เปิด matching/sequencing เพิ่ม — UI/validator พร้อมแล้ว
// export ไว้ให้ course-exam-actions.ts (โหมด "กำหนดข้อสอบเอง") reuse ลิสต์เดียวกันได้
// multi_select เปิดตามสวิตช์ MULTI_SELECT_ENABLED (config/rollout.ts) — ปิดอยู่ = ไม่ถูกสุ่มให้นักเรียนเลย
export const FINAL_EXAM_ENABLED_TYPES: readonly ExamInteractionType[] = [
  "multiple_choice",
  "true_false",
  "matching",
  "sequencing",
  ...(MULTI_SELECT_ENABLED ? (["multi_select"] as const) : []),
  ...(DRAG_DROP_ENABLED ? (["drag_drop"] as const) : []),
];
// Popup quiz (สุ่มระหว่างวิดีโอ) — เดิมรองรับแค่ MC/True-False เพราะ popup UI (generate.ts, vanilla
// JS ในแพ็กเกจ SCORM) ยังเป็น choices ล้วน ตอนนี้ popup UI มี matching (dropdown ปรับสไตล์ใหม่) และ
// sequencing (drag-and-drop ด้วย Pointer Events) แล้ว เลยเปิด allowlist ให้ตรงกับ Final Exam ทั้งชุด
// ★ แยกเป็นลิสต์ของตัวเอง (ไม่ผูกกับ Final Exam) — multi_select/drag_drop เปิดตามสวิตช์เดียวกับ Final Exam
// (config/rollout.ts) เพราะ popup UI ใน generate.ts รองรับทั้งสองชนิดแล้ว (เลือกหลายข้อ + เติมคำแบบแตะ/ลากวาง)
export const POPUP_ENABLED_TYPES: readonly ExamInteractionType[] = [
  "multiple_choice",
  "true_false",
  "matching",
  "sequencing",
  ...(MULTI_SELECT_ENABLED ? (["multi_select"] as const) : []),
  ...(DRAG_DROP_ENABLED ? (["drag_drop"] as const) : []),
];
type EnabledInteractionType = ExamInteractionType;
type FinalExamInteractionType = ExamInteractionType;
// ยุบโหมด Preset เข้ากับ Custom แล้ว (ของจริงไม่มีคอร์สไหนใช้ preset เลยสักคอร์ส) — lessonId เป็น
// null แปลว่า "ทั้งคอร์ส ไม่ระบุบท" ซึ่งเดิมคือพฤติกรรมของ preset ตอนนี้ทำได้ในเงื่อนไขเดียวกันหมด
export interface CustomConstraint {
  lessonId: string | null;
  difficulty: Difficulty;
  count: number;
}

interface BankQuestionRow {
  id: string;
  question_text: string;
  explanation: string | null;
  image_url: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  image_caption: string | null;
  image_pins: ImagePin[] | null;
  difficulty: Difficulty;
  interaction_type: FinalExamInteractionType;
  answer_data: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  question_bank_choices: { id: string; choice_text: string; is_correct: boolean; order_index: number }[];
  question_bank_topic_tags: { course_id: string | null; lesson_id: string | null }[];
}

// ===== เพิ่มใหม่: ข้อมูล "แสดงผล" ของ matching/sequencing ที่สลับลำดับแล้ว (ไม่มีเฉลยติดมา) =====
// left/rightOptions ของ matching และ items ของ sequencing ถูก seededShuffle ไว้แล้วตอนสุ่ม
// ฝั่งแสดงผล (getCourseFinalExam) แค่ส่งต่อ ไม่ต้อง shuffle ซ้ำ — เฉลยจริงอยู่ใน answerData เท่านั้น
// (เหมือน quiz_choices ที่มี is_correct ติดมาด้วย แต่ getCourseFinalExam จะกรองไม่ส่ง is_correct ออกไป)
export interface MatchingDisplay {
  left: string[];
  rightOptions: string[];
}

// ===== เพิ่มใหม่: ดึง logic สลับลำดับ matching/sequencing ออกมาเป็นฟังก์ชัน reuse ได้ =====
// เดิมโค้ดนี้อยู่ inline ใน .map() ของ loadSampledFinalExamQuestions ด้านล่างเท่านั้น (ใช้ได้แค่
// ทางสุ่มจาก question_bank) — ตอนนี้ course-final-exam.ts (ทางเดิม/quiz_questions ที่ครูพิมพ์เอง)
// ต้องใช้ logic เดียวกันด้วย เลย export ออกมาให้เรียกจากทั้ง 2 ที่ กันไม่ให้ logic เพี้ยนไปคนละทาง
// drag_drop: สลับลำดับคลังคำแบบ deterministic (seed ต่อคนต่อข้อ) และ "ไม่ส่ง correct_map" ออกไปเด็ดขาด
// ข้อมูลเฉลยผิดรูปแบบ (ไม่ควรเกิด เพราะตรวจตอนบันทึกแล้ว) = throw ข้อความสุภาพ + log รายละเอียดไว้ฝั่ง server
// ไม่ปล่อยให้นักเรียนเจอข้อที่เล่นไม่ได้
export function buildDragDropDisplay(
  interactionType: string,
  answerData: unknown,
  seedNumber: number,
  questionId: string
): DragDropDisplay | null {
  if (interactionType !== "drag_drop") return null;
  const parsed = parseDragDropAnswerData(answerData);
  if (!parsed.ok) {
    console.error(`[drag_drop] answer_data ผิดรูปแบบ — question: ${questionId}: ${parsed.errors.join(" | ")}`);
    throw new Error("แบบทดสอบยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง หรือติดต่อผู้สอน");
  }
  const { template, blanks, words } = parsed.data;
  return {
    template,
    blankIds: blanks.map((b) => b.id),
    words: seededShuffle(words, seedNumber + seedFromString(questionId + ":dd-words")).map((w: { id: string; text: string }) => ({ id: w.id, text: w.text })),
  };
}

export function buildMatchingSequencingDisplay(
  interactionType: string,
  answerData: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null,
  seedNumber: number,
  questionId: string
): { matchingDisplay: MatchingDisplay | null; sequencingDisplay: { id: string; text: string }[] | null } {
  let matchingDisplay: MatchingDisplay | null = null;
  let sequencingDisplay: { id: string; text: string }[] | null = null;
  if (interactionType === "matching" && answerData) {
    const pairs = (answerData as MatchingAnswerData).pairs ?? [];
    matchingDisplay = {
      left: seededShuffle(pairs.map((p) => p.left), seedNumber + seedFromString(questionId + ":left")),
      rightOptions: seededShuffle(pairs.map((p) => p.right), seedNumber + seedFromString(questionId + ":right")),
    };
  } else if (interactionType === "sequencing" && answerData) {
    const items = (answerData as SequencingAnswerData).items ?? [];
    sequencingDisplay = seededShuffle(items, seedNumber + seedFromString(questionId + ":items"));
  }
  return { matchingDisplay, sequencingDisplay };
}

// Shape เดียวกับ QuestionRow เดิมใน course-final-exam.ts เพื่อให้โค้ด grade/display ใช้ต่อได้โดยไม่แก้
export interface SampledQuestion {
  id: string;
  lessonId: string | null;
  question_text: string;
  explanation: string | null;
  image_url: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  image_caption: string | null;
  image_pins: ImagePin[] | null;
  order_index: number;
  interactionType: FinalExamInteractionType;
  // เฉลยจริง (ห้ามส่งให้ client เห็น) — ใช้ตรวจคำตอบฝั่ง server เท่านั้น (gradeCourseFinalExam)
  answerData: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  matchingDisplay: MatchingDisplay | null;
  sequencingDisplay: { id: string; text: string }[] | null;
  dragDropDisplay: DragDropDisplay | null;
  quiz_choices: { choice_text: string; is_correct: boolean; order_index: number }[];
}

// Error สำหรับกรณีคลังข้อสอบไม่พอ — เก็บรายละเอียดดิบไว้ที่ .shortages สำหรับ log ฝั่ง server เท่านั้น
// ส่วน .message เป็นข้อความ debug (ใช้ใน server log / dev เท่านั้น ห้ามส่งตรงไปหา client)
// ★ แก้ใหม่: เดิม throw ทันทีที่เจอ bucket แรกที่ขาด ทำให้เห็นแค่ระดับเดียวต่อครั้ง ต้องแก้ทีละรอบ-
// กดทดสอบทีละรอบ ตอนนี้เก็บรวบรวมทุก bucket ที่ขาดไว้ก่อน แล้ว throw รวดเดียวพร้อมรายละเอียดครบทุกระดับ
export interface QuestionBankShortage {
  label: string;
  needed: number;
  available: number;
  diagnostics: {
    totalInBankForCourse: number;
    matchingDifficultyOnly: number;
    matchingLessonTagOnly: number;
    matchingDifficultyAndLessonTag: number;
    note: string;
  };
}

export class InsufficientQuestionBankError extends Error {
  constructor(
    public detail: {
      courseId: string;
      shortages: QuestionBankShortage[];
    }
  ) {
    super(
      `จำนวนข้อสอบในคลังไม่เพียงพอ ${detail.shortages.length} ระดับ\n` +
        detail.shortages
          .map((s) => `ขาด ${s.label} (${s.needed - s.available} ข้อ)`)
          .join("\n")
    );
    this.name = "InsufficientQuestionBankError";
  }
}
export async function loadSampledFinalExamQuestions(
  supabase: SupabaseClient,
  params: {
    courseId: string;
    seed: string; // ใช้ enrollment_id
    customConstraints: CustomConstraint[];
  }
): Promise<SampledQuestion[]> {
  const serviceClient = createServiceRoleClient();
  const { data: bankData, error } = await serviceClient
    .from("question_bank")
    .select(
      "id, question_text, explanation, image_url, image_caption, image_pins, difficulty, interaction_type, answer_data, question_bank_choices(id, choice_text, is_correct, order_index), question_bank_topic_tags(course_id, lesson_id)"
    )
    .eq("usage_type", "final")
    // ===== เพิ่มใหม่: filter เฉพาะ type ที่ Final Exam รองรับตอนนี้ =====
    .in("interaction_type", FINAL_EXAM_ENABLED_TYPES)
    // ★ B4 fix: ไม่มี ORDER BY มาก่อน ทำให้ PostgreSQL ไม่รับประกันลำดับแถวที่คืนมา — seededSample/
    // seededShuffle ด้านล่างสุ่มจาก "ตำแหน่งในอาเรย์" ไม่ใช่ตัวข้อมูล ถ้าลำดับแถวที่ query คืนมาเปลี่ยน
    // (เช่นมีคนแก้ไขคำถามอื่นในคลังระหว่างนั้น) seed เดิม (enrollment_id) จะได้ชุดข้อสอบคนละชุด — เคย
    // ทำให้นักเรียนเปิดสอบได้ชุด A ทำจนครบ พอกดส่งคำนวณใหม่ได้ชุด B แล้วเช็คว่าตอบครบทุกข้อไม่ผ่าน
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const pool = (bankData ?? []) as unknown as BankQuestionRow[];
  const seedNumber = seedFromString(params.seed);

  // ★ เดิมมีแค่โหมด custom ต้องเช็คว่าคอร์สนี้มีบทเรียนอยู่หรือยัง (ไม่งั้นเลือกบทไม่ได้ตั้งแต่ต้น)
  // ตอนนี้ยุบโหมด preset เข้ามาแล้ว เงื่อนไขนี้ยังจำเป็นอยู่เหมือนเดิม เพราะยังมีคอนสเตรนต์ที่อ้างอิง
  // lessonId จริงได้ (แค่ไม่บังคับทุกแถวต้องมี lessonId แล้ว — แถวไหนเป็น "ทั้งคอร์ส" ก็ไม่ต้องพึ่งบทเรียน)
  const { count: lessonCount, error: lessonCountError } = await serviceClient
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("course_id", params.courseId);
  if (lessonCountError) throw new Error(lessonCountError.message);
  if (!lessonCount) {
    throw new Error("คอร์สนี้ยังไม่มีบทเรียนเลย จึงยังไม่สามารถสุ่มข้อสอบท้ายคอร์สได้ กรุณาเพิ่มบทเรียนก่อน");
  }

  // โหลดชื่อบทเรียนไว้ทำ label ที่อ่านง่าย (เฉพาะ constraint ที่อ้างอิง lessonId จริง)
  let lessonLabelById = new Map<string, string>();
  if (params.customConstraints.some((c) => c.lessonId)) {
    const { data: lessonsData, error: lessonsError } = await serviceClient
      .from("lessons")
      .select("id, order_index")
      .eq("course_id", params.courseId);
    if (lessonsError) throw new Error(lessonsError.message);
    lessonLabelById = new Map(
      (lessonsData ?? []).map((lesson) => [lesson.id as string, `บทที่ ${(lesson.order_index as number) + 1}`])
    );
  }

  // สร้าง bucket ตาม constraint แต่ละแถว — lessonId มีค่า = กรองเฉพาะบทนั้น, lessonId เป็น null =
  // "ทั้งคอร์ส" กรองแค่ว่าคำถามผูก tag กับคอร์สนี้ (บทไหนก็ได้) — เดิมนี่คือกฎแยกของโหมด preset
  const buckets: { filter: (q: BankQuestionRow) => boolean; count: number; label: string; constraintLessonId?: string; constraintDifficulty?: Difficulty }[] =
    params.customConstraints.map((constraint) => ({
      filter: (q) =>
        q.difficulty === constraint.difficulty &&
        (constraint.lessonId
          ? q.question_bank_topic_tags.some((tag) => tag.lesson_id === constraint.lessonId)
          : q.question_bank_topic_tags.some((tag) => tag.course_id === params.courseId)),
      count: constraint.count,
      label: constraint.lessonId
        ? `${lessonLabelById.get(constraint.lessonId) ?? `บทเรียน ${constraint.lessonId}`} ระดับ ${constraint.difficulty}`
        : `ทั้งคอร์ส ระดับ ${constraint.difficulty}`,
      constraintLessonId: constraint.lessonId ?? undefined,
      constraintDifficulty: constraint.difficulty,
    }));

  // ★ แก้ใหม่: เดิม throw ทันทีที่เจอ bucket แรกที่ขาด (เห็นแค่ระดับเดียวต่อครั้ง) ตอนนี้ไล่เช็คให้ครบ
  // ทุก bucket ก่อน เก็บ candidates ของแต่ละ bucket ที่ "พอ" ไว้ใช้สุ่มจริงทีหลัง ส่วน bucket ที่ขาด
  // เก็บรายละเอียดไว้ใน shortages แล้วค่อย throw รวดเดียวพร้อมสรุปครบทุกระดับที่ขาด
  const shortages: QuestionBankShortage[] = [];
  const sufficientBuckets: { candidates: BankQuestionRow[]; count: number; label: string; specific: boolean }[] = [];

  for (const bucket of buckets) {
    const candidates = pool.filter(bucket.filter);
    if (candidates.length < bucket.count) {
      // สร้าง diagnostics ละเอียด เฉพาะตอน error เท่านั้น (ไม่เปลืองถ้าไม่ error) เพื่อช่วยครู/แอดมินไล่หาสาเหตุ
      const totalInBankForCourse = pool.filter((q) =>
        q.question_bank_topic_tags.some((tag) => tag.course_id === params.courseId)
      ).length;
      const matchingDifficultyOnly = bucket.constraintDifficulty
        ? pool.filter((q) => q.difficulty === bucket.constraintDifficulty).length
        : 0;
      const matchingLessonTagOnly = bucket.constraintLessonId
        ? pool.filter((q) => q.question_bank_topic_tags.some((tag) => tag.lesson_id === bucket.constraintLessonId)).length
        : 0;

      let note = "ไม่พบสาเหตุที่ชัดเจน โปรดตรวจสอบคลังข้อสอบด้วยตนเอง";
      if (bucket.constraintLessonId) {
        if (matchingLessonTagOnly === 0 && matchingDifficultyOnly > 0) {
          note = `มีคำถามระดับ ${bucket.constraintDifficulty} อยู่ในคลัง (${matchingDifficultyOnly} ข้อ) แต่ไม่มีข้อไหนผูก tag กับบทเรียนนี้โดยตรง — อาจเพราะครูเลือก "ทั้งคอร์ส" แทนที่จะเลือกบทเรียนนี้เจาะจง หรือเลือกบทอื่นแทน`;
        } else if (matchingLessonTagOnly > 0 && matchingDifficultyOnly === 0) {
          note = `มีคำถามที่ผูกกับบทเรียนนี้อยู่ (${matchingLessonTagOnly} ข้อ) แต่ไม่มีข้อไหนตั้งระดับความยากเป็น ${bucket.constraintDifficulty} — อาจตั้งระดับความยากผิด (เช่น ตั้งเป็น medium แทน hard)`;
        } else if (matchingLessonTagOnly === 0 && matchingDifficultyOnly === 0) {
          note = `ไม่มีคำถามที่ตรงเงื่อนไขทั้งบทเรียนและระดับความยากเลย ต้องเพิ่มคำถามใหม่`;
        } else if (candidates.length === 0) {
          note = `มีคำถามที่ตรงบทเรียน (${matchingLessonTagOnly} ข้อ) และตรงระดับความยาก (${matchingDifficultyOnly} ข้อ) แยกกัน แต่ไม่มีข้อไหนตรงทั้งสองเงื่อนไขพร้อมกัน — ตรวจสอบว่าคำถามระดับ ${bucket.constraintDifficulty} ผูก tag ผิดบท หรือคำถามที่ผูกบทนี้ตั้ง usage_type ไม่ใช่ "final"`;
        }
      } else if (bucket.constraintDifficulty) {
        // เคสแถว "ทั้งคอร์ส" (ไม่มี lessonId เจาะจง กรองด้วย courseId แทน)
        note =
          matchingDifficultyOnly > 0
            ? `มีคำถามระดับ ${bucket.constraintDifficulty} อยู่ในคลังทั้งระบบ (${matchingDifficultyOnly} ข้อ) แต่ไม่มีข้อไหนผูก tag กับคอร์สนี้เลย — ต้องเพิ่มคำถามระดับนี้แล้วผูก tag กับคอร์สนี้ในคลังข้อสอบ`
            : `ไม่มีคำถามระดับ ${bucket.constraintDifficulty} ในคลังทั้งระบบเลย ต้องเพิ่มคำถามใหม่`;
      }

      shortages.push({
        label: bucket.label,
        needed: bucket.count,
        available: candidates.length,
        diagnostics: {
          totalInBankForCourse,
          matchingDifficultyOnly,
          matchingLessonTagOnly,
          matchingDifficultyAndLessonTag: candidates.length,
          note,
        },
      });
      continue;
    }
    sufficientBuckets.push({ candidates, count: bucket.count, label: bucket.label, specific: Boolean(bucket.constraintLessonId) });
  }

  if (shortages.length > 0) {
    throw new InsufficientQuestionBankError({ courseId: params.courseId, shortages });
  }

  // กติกาหลายแถวอาจทับกัน (เช่น "ทั้งคอร์ส ระดับง่าย" กับ "บทที่ 1 ระดับง่าย") — ต้องไม่หยิบข้อเดียวกันซ้ำ
  // ไม่งั้นนักเรียนจะได้ข้อซ้ำในชุดเดียว (และหน้าตัวอย่างขึ้น key ซ้ำ) จึงตัดข้อที่เลือกไปแล้วออกจากตัวเลือกของแถวถัดไป
  // เรียงแถวที่เจาะจงบท (แคบกว่า) ก่อน เพื่อให้แถว "ทั้งคอร์ส" ที่กว้างกว่าไปเลือกจากข้อที่เหลือ — ลำดับคงที่ต่อ seed เดิม
  const orderedBuckets = [...sufficientBuckets].sort((a, b) => Number(b.specific) - Number(a.specific));
  const selected: BankQuestionRow[] = [];
  const takenIds = new Set<string>();
  const dedupShortages: QuestionBankShortage[] = [];
  for (const bucket of orderedBuckets) {
    const available = bucket.candidates.filter((q) => !takenIds.has(q.id));
    if (available.length < bucket.count) {
      dedupShortages.push({
        label: bucket.label,
        needed: bucket.count,
        available: available.length,
        diagnostics: {
          totalInBankForCourse: pool.filter((q) => q.question_bank_topic_tags.some((tag) => tag.course_id === params.courseId)).length,
          matchingDifficultyOnly: 0,
          matchingLessonTagOnly: 0,
          matchingDifficultyAndLessonTag: bucket.candidates.length,
          note: `กติกาข้ออื่นเลือกข้อสอบที่ตรงเงื่อนไขนี้ไปแล้ว เหลือให้เลือกเพียง ${available.length} ข้อ (ข้อเดียวกันจะไม่ถูกสุ่มซ้ำในชุดเดียว) — เพิ่มข้อสอบในคลัง หรือลดจำนวน/รวมกติกาที่ทับกัน`,
        },
      });
      continue;
    }
    // seed ต่อ bucket กันสุ่มชนกันเป๊ะระหว่าง bucket ที่ label ต่างกัน
    const bucketSeed = seedNumber + seedFromString(bucket.label);
    const picked = seededSample(available, bucket.count, bucketSeed);
    picked.forEach((q) => takenIds.add(q.id));
    selected.push(...picked);
  }
  if (dedupShortages.length > 0) {
    throw new InsufficientQuestionBankError({ courseId: params.courseId, shortages: dedupShortages });
  }

  const shuffled = seededShuffle(selected, seedNumber);

  return shuffled.map((question, index) => {
    // ===== เพิ่มใหม่: เตรียมข้อมูล "แสดงผล" ของ matching/sequencing (สลับลำดับแล้ว ไม่มีเฉลย) =====
    // ใช้ sub-seed คนละตัวกับที่ shuffle choices ด้านล่าง กันสุ่มชนกันโดยไม่ตั้งใจ (logic ย้ายไป
    // buildMatchingSequencingDisplay() ด้านบนแล้ว เพื่อให้ course-final-exam.ts เรียกใช้ซ้ำได้)
    const { matchingDisplay, sequencingDisplay } = buildMatchingSequencingDisplay(
      question.interaction_type,
      question.answer_data,
      seedNumber,
      question.id
    );

    return {
      id: question.id,
      // ★ B9 fix: เดิมหยิบ tag ตัวแรกในอาเรย์ ([0]) มาใช้เป็น lessonId เฉยๆ — แต่คำถาม 1 ข้อผูก tag
      // ได้หลายอัน (เช่น ผูกกับคอร์สนี้บทที่ 3 และผูกกับอีกคอร์สหนึ่งแบบ "ทั้งคอร์ส" พร้อมกัน) ถ้า tag
      // ของคอร์สอื่นดันมาอยู่ตำแหน่ง [0] (ลำดับขึ้นกับตอน insert ไม่ได้การันตีว่าเรียงตามคอร์สไหนก่อน)
      // lessonId ที่ได้จะผิดคอร์ส ทำให้ UI จัดกลุ่ม "ข้อสอบแยกตามบทเรียน" ของหน้าแอดมิน/ครูโชว์ผิดบท
      // ทั้งที่ตัวข้อสอบจริงถูกสุ่มมาถูกคอร์สแล้ว ต้องหา tag ที่ course_id ตรงกับคอร์สที่กำลังสุ่มอยู่นี้
      // เท่านั้น (การันตีว่ามีอยู่แน่นอน เพราะ bucket.filter ด้านบนกรองผ่านมาได้ก็ต่อเมื่อมี tag แบบนี้)
      lessonId:
        question.question_bank_topic_tags.find((tag) => tag.course_id === params.courseId)?.lesson_id ?? null,
      question_text: question.question_text,
      explanation: question.explanation,
      image_url: question.image_url ?? null,
      // ===== เพิ่มใหม่: ส่งคำบรรยายใต้ภาพ + หมุดต่อให้ course-final-exam.ts/generate.ts ไปแสดงผล
      image_caption: question.image_caption ?? null,
      image_pins: question.image_pins ?? null,
      order_index: index,
      interactionType: question.interaction_type,
      answerData: question.answer_data ?? null,
      matchingDisplay,
      sequencingDisplay,
      dragDropDisplay: buildDragDropDisplay(question.interaction_type, question.answer_data, seedNumber, question.id),
      // ★ B8 fix: เดิม shuffle แล้วยังคง order_index ตัวเก่าติดไปกับแต่ละ choice — แต่ทั้ง
      // getCourseFinalExam (แสดงผล) และ gradeCourseFinalExam (ตรวจคำตอบ) ใน course-final-exam.ts
      // สั่ง .sort((a, b) => a.order_index - b.order_index) ก่อนใช้งานเสมอ ผลคือพอ sort กลับ
      // ด้วย order_index เดิม ลำดับที่ seededShuffle สลับมาให้ถูกเรียงกลับเป็นลำดับเดิมในฐานข้อมูล
      // ทันที — นักเรียนทุกคนเห็นตัวเลือกเรียงลำดับเดิมเป๊ะเหมือนกันหมด ฟีเจอร์สุ่มลำดับตัวเลือกจึง
      // ไม่มีผลอะไรเลยในทางปฏิบัติ ต้อง re-index order_index ใหม่ตามลำดับที่ shuffle ได้จริง (เหมือนที่
      // loadSampledPopupQuestion ทำอยู่แล้วด้านล่าง) เพื่อให้ sort ทีหลังคงลำดับที่สุ่มมาไว้
      quiz_choices: seededShuffle(
        question.question_bank_choices.map((choice) => ({
          choice_text: choice.choice_text,
          is_correct: choice.is_correct,
          order_index: choice.order_index,
        })),
        seedNumber + seedFromString(question.id) // shuffle choices ต่อข้อ ด้วย sub-seed
      ).map((choice, index) => ({ ...choice, order_index: index })),
    };
  });
}

// ============================================================
// Popup quiz — สุ่ม 1 ข้อ ต่อ marker ต่อผู้เรียน (deterministic ด้วย seed)
// ============================================================

export interface SampledPopupQuestion {
  id: string;
  question_text: string;
  explanation: string | null;
  image_url: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  image_caption: string | null;
  image_pins: ImagePin[] | null;
  interactionType: FinalExamInteractionType;
  // เฉลยจริงของ matching/sequencing (ห้ามส่งให้ client เห็น) — ใช้ตรวจคำตอบฝั่ง server เท่านั้น
  // (ดูเหตุผลเดียวกับ SampledQuestion.answerData ด้านบน) MC/True-False ไม่ใช้ฟิลด์นี้ (เป็น null)
  answerData: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  matchingDisplay: MatchingDisplay | null;
  sequencingDisplay: { id: string; text: string }[] | null;
  dragDropDisplay: DragDropDisplay | null; // ไม่มี correct_map — เฉลยอยู่ใน answerData (server-only)
  quiz_choices: { choice_text: string; is_correct: boolean; order_index: number }[];
}

export async function loadSampledPopupQuestion(
  // ★ B1 fix: เดิมใช้ `supabase` (client ของนักเรียนเอง ยึด RLS ปกติ) แต่ question_bank_topic_tags
  // และ question_bank_choices ไม่มี RLS policy ให้นักเรียนอ่านเลยสักตาราง — ผลคือ tag/choices ที่คืน
  // มาว่างเปล่าเสมอ ตัวกรอง lesson_id ไม่เจออะไร แล้วโยน error "คลังข้อสอบมีไม่พอ" ทั้งที่มีข้อสอบจริง
  // เปลี่ยนมาใช้ service-role client เหมือนฝั่ง final exam ที่ทำถูกอยู่แล้ว — ปลอดภัยพอเพราะทั้ง 2 endpoint
  // ที่เรียกฟังก์ชันนี้ (video-quiz-attempts POST, video-quiz-markers/[id]/sample GET) ตรวจ enrollment
  // และความเป็นเจ้าของหมุดไว้ก่อนหน้าแล้วทุกครั้ง — เก็บ param `supabase` ไว้เพื่อไม่ต้องแก้ signature
  // ที่ผู้เรียกใช้อยู่ 2 จุด แต่ไม่ใช้งานจริงข้างในอีกต่อไป
  supabase: SupabaseClient,
  params: {
    lessonId: string;
    difficulty: Difficulty;
    seed: string; // ใช้ enrollmentId + markerId ต่อกัน เพื่อให้คนละคน/คนละหมุด ได้ seed คนละตัว
  }
): Promise<SampledPopupQuestion> {
  void supabase;
  const db = createServiceRoleClient();
  const { data: bankData, error } = await db
    .from("question_bank")
    .select(
      // ===== เพิ่มใหม่: ต้องดึง answer_data มาด้วย ไม่งั้น matching/sequencing ที่เพิ่งเปิดใช้กับ
      // popup จะไม่มีเฉลยให้ตรวจคำตอบ/สร้าง display เลย (เหมือนทางฝั่ง final exam ที่ทำอยู่แล้ว) —
      // image_caption/image_pins เพิ่มใหม่ เพื่อให้ Pop-up Quiz แสดงคำบรรยาย/หมุดได้เหมือน Final Exam =====
      "id, question_text, explanation, image_url, image_caption, image_pins, difficulty, interaction_type, answer_data, question_bank_choices(id, choice_text, is_correct, order_index), question_bank_topic_tags(lesson_id)"
    )
    .eq("usage_type", "popup")
    .eq("difficulty", params.difficulty)
    // ★ B6 fix: เดิมไม่ filter interaction_type เลย ต่างจากฝั่ง final exam ที่กรองด้วย
    // ENABLED_INTERACTION_TYPES อยู่แล้ว — enum ของ question_bank.interaction_type มีถึง 6 ค่า
    // (multiple_choice, true_false, sequencing, matching, fill_in_blank, note_callout) กรองไว้กัน
    // fill_in_blank/note_callout ที่ validator/UI ยังไม่รองรับ (matching/sequencing เปิดใช้กับ
    // popup แล้วตอนนี้ — UI ฝั่ง generate.ts มี dropdown/drag-and-drop รองรับแล้ว)
    .in("interaction_type", [...POPUP_ENABLED_TYPES])
    // ★ B4 fix: ไม่มี ORDER BY มาก่อน ทำให้ PostgreSQL ไม่รับประกันลำดับแถวที่คืนมา — seededSample
    // ด้านล่างสุ่มจาก "ตำแหน่งในอาเรย์" ไม่ใช่ตัวข้อมูล ถ้าลำดับแถวเปลี่ยน (เช่นมีคนแก้ไขคำถามอื่น
    // ในคลัง) seed เดิมจะได้ข้อสอบคนละข้อ ทำให้คำถามที่โชว์กับที่ตรวจคำตอบไม่ตรงกัน
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const pool = (bankData ?? []) as unknown as {
    id: string;
    question_text: string;
    explanation: string | null;
    image_url: string | null;
    image_caption: string | null;
    image_pins: ImagePin[] | null;
    interaction_type: EnabledInteractionType;
    answer_data: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
    question_bank_choices: { choice_text: string; is_correct: boolean; order_index: number }[];
    question_bank_topic_tags: { lesson_id: string | null }[];
  }[];

  // ต้องมี tag ผูกกับบทเรียนนี้จริง ๆ เท่านั้น (คำถาม popup ที่ไม่ผูกบทจะไม่ถูกสุ่มมาใช้ที่นี่)
  const candidates = pool.filter((q) => q.question_bank_topic_tags.some((tag) => tag.lesson_id === params.lessonId));

  if (candidates.length === 0) {
    throw new Error(
      `คลังข้อสอบมีไม่พอ: ไม่พบคำถาม Pop-up Quiz ระดับ ${params.difficulty} ที่ผูกกับบทเรียนนี้`
    );
  }

  const seedNumber = seedFromString(params.seed);
  const [picked] = seededSample(candidates, 1, seedNumber);

  // ===== เพิ่มใหม่: เตรียมข้อมูล "แสดงผล" ของ matching/sequencing (สลับลำดับแล้ว ไม่มีเฉลย) เหมือน
  // ทางฝั่ง final exam — MC/True-False จะได้ matchingDisplay/sequencingDisplay เป็น null ทั้งคู่
  const { matchingDisplay, sequencingDisplay } = buildMatchingSequencingDisplay(
    picked.interaction_type,
    picked.answer_data,
    seedNumber,
    picked.id
  );

  return {
    id: picked.id,
    question_text: picked.question_text,
    explanation: picked.explanation,
    image_url: picked.image_url ?? null,
    image_caption: picked.image_caption ?? null,
    image_pins: picked.image_pins ?? null,
    interactionType: picked.interaction_type,
    answerData: picked.answer_data ?? null,
    matchingDisplay,
    sequencingDisplay,
    dragDropDisplay: buildDragDropDisplay(picked.interaction_type, picked.answer_data ?? null, seedNumber, picked.id),
    quiz_choices: seededShuffle(
      picked.question_bank_choices.map((choice) => ({
        choice_text: choice.choice_text,
        is_correct: choice.is_correct,
        order_index: choice.order_index,
      })),
      seedNumber + seedFromString(picked.id)
    ).map((choice, index) => ({ ...choice, order_index: index })), // re-index หลัง shuffle ให้ order_index สอดคล้องลำดับที่ส่งออกจริง
  };
}
