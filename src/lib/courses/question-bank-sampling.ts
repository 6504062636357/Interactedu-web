import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { seedFromString, seededSample, seededShuffle } from "@/lib/courses/seeded-random";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
export type Difficulty = "easy" | "medium" | "hard";

export interface CustomConstraint {
  lessonId: string;
  difficulty: Difficulty;
  count: number;
}

export type PresetType = "quick_check" | "standard_final" | "challenging_final";

const PRESET_RATIOS: Record<PresetType, Record<Difficulty, number>> = {
  quick_check: { easy: 0.6, medium: 0.4, hard: 0 },
  standard_final: { easy: 0.3, medium: 0.5, hard: 0.2 },
  challenging_final: { easy: 0, medium: 0.5, hard: 0.5 },
};

interface BankQuestionRow {
  id: string;
  question_text: string;
  explanation: string | null;
  difficulty: Difficulty;
  question_bank_choices: { id: string; choice_text: string; is_correct: boolean; order_index: number }[];
  question_bank_topic_tags: { course_id: string | null; lesson_id: string | null }[];
}

// Shape เดียวกับ QuestionRow เดิมใน course-final-exam.ts เพื่อให้โค้ด grade/display ใช้ต่อได้โดยไม่แก้
export interface SampledQuestion {
  id: string;
  lessonId: string | null;
  question_text: string;
  explanation: string | null;
  order_index: number;
  quiz_choices: { choice_text: string; is_correct: boolean; order_index: number }[];
}

// Error สำหรับกรณีคลังข้อสอบไม่พอ — เก็บรายละเอียดดิบไว้ที่ .detail สำหรับ log ฝั่ง server เท่านั้น
// ส่วน .message เป็นข้อความ debug (ใช้ใน server log / dev เท่านั้น ห้ามส่งตรงไปหา client)
export class InsufficientQuestionBankError extends Error {
  constructor(
    public detail: {
      courseId: string;
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
  ) {
    super(
      `จำนวนข้อสอบในคลังไม่เพียงพอ: ต้องการ ${detail.needed} ข้อ (${detail.label}) ปัจจุบันมี ${detail.available} ข้อ`
    );
    this.name = "InsufficientQuestionBankError";
  }
}
function countsFromPreset(preset: PresetType, total: number): Record<Difficulty, number> {
  const ratio = PRESET_RATIOS[preset];
  const easy = Math.round(total * ratio.easy);
  const medium = Math.round(total * ratio.medium);
  const hard = total - easy - medium; // กันเศษไม่ให้รวมเกิน/ขาด
  return { easy, medium, hard: Math.max(0, hard) };
}

export async function loadSampledFinalExamQuestions(
  supabase: SupabaseClient,
  params: {
    courseId: string;
    seed: string; // ใช้ enrollment_id
    buildMode: "custom" | "preset";
    totalQuestions: number;
    presetType?: PresetType | null;
    customConstraints?: CustomConstraint[] | null;
  }
): Promise<SampledQuestion[]> {
  const serviceClient = createServiceRoleClient();
  const { data: bankData, error } = await serviceClient
    .from("question_bank")
    .select(
      "id, question_text, explanation, difficulty, question_bank_choices(id, choice_text, is_correct, order_index), question_bank_topic_tags(course_id, lesson_id)"
    )
    .eq("usage_type", "final");
  if (error) throw new Error(error.message);

  const pool = (bankData ?? []) as unknown as BankQuestionRow[];
  const seedNumber = seedFromString(params.seed);

  // โหลดชื่อบทเรียนไว้ทำ label ที่อ่านง่าย (เฉพาะตอน custom mode ที่อ้างอิง lessonId)
  let lessonLabelById = new Map<string, string>();
  if (params.buildMode === "custom" && (params.customConstraints ?? []).length > 0) {
    const { data: lessonsData, error: lessonsError } = await serviceClient
      .from("lessons")
      .select("id, order_index")
      .eq("course_id", params.courseId);
    if (lessonsError) throw new Error(lessonsError.message);
    lessonLabelById = new Map(
      (lessonsData ?? []).map((lesson) => [lesson.id as string, `บทที่ ${(lesson.order_index as number) + 1}`])
    );
  }

  // สร้าง bucket ตาม constraint ที่ต้องการ (lesson+difficulty สำหรับ custom, difficulty อย่างเดียวสำหรับ preset)
  const buckets: { filter: (q: BankQuestionRow) => boolean; count: number; label: string; constraintLessonId?: string; constraintDifficulty?: Difficulty }[] =
    params.buildMode === "custom"
      ? (params.customConstraints ?? []).map((constraint) => ({
          filter: (q) =>
            q.difficulty === constraint.difficulty &&
            q.question_bank_topic_tags.some((tag) => tag.lesson_id === constraint.lessonId),
          count: constraint.count,
          label: `${lessonLabelById.get(constraint.lessonId) ?? `บทเรียน ${constraint.lessonId}`} ระดับ ${constraint.difficulty}`,
          constraintLessonId: constraint.lessonId,
          constraintDifficulty: constraint.difficulty,
        }))
      : (() => {
          const counts = countsFromPreset(params.presetType ?? "standard_final", params.totalQuestions);
          return (Object.entries(counts) as [Difficulty, number][])
            .filter(([, count]) => count > 0)
            .map(([difficulty, count]) => ({
              filter: (q: BankQuestionRow) => q.difficulty === difficulty,
              count,
              label: `ระดับ ${difficulty}`,
              constraintDifficulty: difficulty,
            }));
        })();

  const selected: BankQuestionRow[] = [];
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
      }

      throw new InsufficientQuestionBankError({
        courseId: params.courseId,
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
    }
    // seed ต่อ bucket กันสุ่มชนกันเป๊ะระหว่าง bucket ที่ label ต่างกัน
    const bucketSeed = seedNumber + seedFromString(bucket.label);
    selected.push(...seededSample(candidates, bucket.count, bucketSeed));
  }

  const shuffled = seededShuffle(selected, seedNumber);

  return shuffled.map((question, index) => ({
    id: question.id,
    lessonId: question.question_bank_topic_tags[0]?.lesson_id ?? null,
    question_text: question.question_text,
    explanation: question.explanation,
    order_index: index,
    quiz_choices: seededShuffle(
      question.question_bank_choices.map((choice) => ({
        choice_text: choice.choice_text,
        is_correct: choice.is_correct,
        order_index: choice.order_index,
      })),
      seedNumber + seedFromString(question.id) // shuffle choices ต่อข้อ ด้วย sub-seed
    ),
  }));
}

// ============================================================
// Popup quiz — สุ่ม 1 ข้อ ต่อ marker ต่อผู้เรียน (deterministic ด้วย seed)
// ============================================================

export interface SampledPopupQuestion {
  id: string;
  question_text: string;
  explanation: string | null;
  quiz_choices: { choice_text: string; is_correct: boolean; order_index: number }[];
}

export async function loadSampledPopupQuestion(
  supabase: SupabaseClient,
  params: {
    lessonId: string;
    difficulty: Difficulty;
    seed: string; // ใช้ enrollmentId + markerId ต่อกัน เพื่อให้คนละคน/คนละหมุด ได้ seed คนละตัว
  }
): Promise<SampledPopupQuestion> {
  const { data: bankData, error } = await supabase
    .from("question_bank")
    .select(
      "id, question_text, explanation, difficulty, question_bank_choices(id, choice_text, is_correct, order_index), question_bank_topic_tags(lesson_id)"
    )
    .eq("usage_type", "popup")
    .eq("difficulty", params.difficulty);
  if (error) throw new Error(error.message);

  const pool = (bankData ?? []) as unknown as {
    id: string;
    question_text: string;
    explanation: string | null;
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

  return {
    id: picked.id,
    question_text: picked.question_text,
    explanation: picked.explanation,
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