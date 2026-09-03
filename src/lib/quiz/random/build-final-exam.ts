import type { SupabaseClient } from '@supabase/supabase-js';
import { ENABLED_INTERACTION_TYPES, PRESET_ALLOWED_TYPES } from '../config/enabled-types';
import type { InteractionType } from '@/types/interaction';

interface CourseExamConfig {
  course_id: string;
  build_mode: 'preset' | 'custom';
  total_questions: number;
  preset_type: 'quick_check' | 'standard_final' | 'challenging_final' | null;
  custom_constraints: {
    interaction_types?: InteractionType[];
    difficulty?: ('easy' | 'medium' | 'hard')[];
    count_per_type?: Record<string, number>;
  } | null;
}

/**
 * สร้างชุดคำถาม Final Exam ตาม config (preset หรือ custom)
 * - Final Exam บังคับ exclude note_callout เสมอ ไม่ว่า config จะระบุอะไรมา
 */
export async function buildFinalExamQuestionSet(
  supabase: SupabaseClient,
  config: CourseExamConfig
) {
  const allowedTypes = resolveAllowedTypes(config);

  let query = supabase
    .from('question_bank')
    .select('id, question_text, interaction_type, answer_data, difficulty')
    .eq('usage_type', 'final')
    .in('interaction_type', allowedTypes);

  // custom mode อาจกรอง difficulty เพิ่ม
  if (config.build_mode === 'custom' && config.custom_constraints?.difficulty?.length) {
    query = query.in('difficulty', config.custom_constraints.difficulty);
  }

  const { data: candidates, error } = await query;

  if (error) {
    throw new Error(`ดึงคำถามคลังไม่สำเร็จ: ${error.message}`);
  }

  if (!candidates || candidates.length < config.total_questions) {
    throw new Error(
      `คำถามในคลังไม่พอ (มี ${candidates?.length ?? 0} ข้อ ต้องการ ${config.total_questions} ข้อ) — กรุณาเพิ่มคำถามหรือลด total_questions`
    );
  }

  // สุ่มแบบ shuffle แล้วตัดตามจำนวนที่ต้องการ
  const shuffled = shuffleArray(candidates);
  return shuffled.slice(0, config.total_questions);
}

function resolveAllowedTypes(config: CourseExamConfig): InteractionType[] {
  let types: InteractionType[];

  if (config.build_mode === 'preset' && config.preset_type) {
    types = PRESET_ALLOWED_TYPES[config.preset_type] ?? ENABLED_INTERACTION_TYPES;
  } else if (config.build_mode === 'custom' && config.custom_constraints?.interaction_types?.length) {
    types = config.custom_constraints.interaction_types;
  } else {
    types = ENABLED_INTERACTION_TYPES;
  }

  // บังคับ exclude note_callout เสมอ ไม่ว่า config จะส่งอะไรมา (กัน bug ฝั่งครูตั้งค่าผิด)
  return types.filter((t) => t !== 'note_callout' && ENABLED_INTERACTION_TYPES.includes(t));
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}