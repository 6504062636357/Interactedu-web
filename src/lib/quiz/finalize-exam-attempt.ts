import type { SupabaseClient } from '@supabase/supabase-js';

export async function finalizeExamAttempt(
  supabase: SupabaseClient,
  attemptId: string,
  passPercentage: number
) {
  const { data: answers, error } = await supabase
    .from('quiz_attempt_questions')
    .select('is_correct')
    .eq('attempt_id', attemptId);

  if (error) {
    throw new Error(`ดึงผลคำตอบไม่สำเร็จ: ${error.message}`);
  }

  const totalQuestions = answers.length; // ทุก record ใน quiz_attempt_questions ควรเป็นคำถามที่ตรวจได้อยู่แล้ว (ไม่มี note_callout ปนมา เพราะ submitFinalExamAnswer กันไว้ตั้งแต่ต้น)
  const correctCount = answers.filter((a) => a.is_correct).length;
  const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
  const passed = score >= passPercentage;

  const { data, error: updateError } = await supabase
    .from('quiz_attempts')
    .update({
      score,
      passed,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`อัปเดตผลสอบไม่สำเร็จ: ${updateError.message}`);
  }

  return data;
}