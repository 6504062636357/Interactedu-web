import type { SupabaseClient } from '@supabase/supabase-js';
import { ENABLED_INTERACTION_TYPES } from '../config/enabled-types';

interface PickVideoQuizQuestionParams {
  supabase: SupabaseClient;
  difficulty: 'easy' | 'medium' | 'hard';
  courseId: string; // เผื่อ scope คำถามเฉพาะวิชา (ถ้ามี topic tag ผูกกับ course)
  excludeQuestionIds?: string[]; // กันสุ่มซ้ำในวิดีโอเดียวกัน
}

/**
 * สุ่มคำถาม 1 ข้อจาก question_bank สำหรับ Video Quiz Marker
 * - filter interaction_type ให้อยู่ใน allowlist เท่านั้น (กัน note_callout + type ที่ UI ยังไม่รองรับ)
 * - filter usage_type = 'popup' เพราะเป็นคำถามที่ตั้งใจให้แทรกกลางวิดีโอ (ไม่ใช่ final)
 */
export async function pickVideoQuizQuestion({
  supabase,
  difficulty,
  courseId,
  excludeQuestionIds = [],
}: PickVideoQuizQuestionParams) {
  let query = supabase
    .from('question_bank')
    .select('id, question_text, interaction_type, answer_data, difficulty, usage_type')
    .eq('difficulty', difficulty)
    .eq('usage_type', 'popup')
    .in('interaction_type', ENABLED_INTERACTION_TYPES);

  if (excludeQuestionIds.length > 0) {
    query = query.not('id', 'in', `(${excludeQuestionIds.join(',')})`);
  }

  const { data: candidates, error } = await query;

  if (error) {
    throw new Error(`สุ่มคำถามไม่สำเร็จ: ${error.message}`);
  }

  if (!candidates || candidates.length === 0) {
    return null; // ไม่มีคำถามที่ตรงเงื่อนไข — ฝั่งเรียกใช้ต้อง handle เคสนี้ (เช่น ข้าม marker นี้ไป)
  }

  // สุ่มเลือก 1 ข้อจาก candidates (สุ่มฝั่ง JS เพราะ Supabase client ไม่มี ORDER BY random() ตรงๆ ผ่าน query builder)
  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  return picked;
}