import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudentAnswer } from '@/types/interaction';
import { fetchQuizQuestionForValidation } from './fetch-question';
import { validateAnswer } from './dispatcher';

interface SubmitVideoQuizAnswerParams {
  supabase: SupabaseClient;
  studentId: string;
  lessonId: string;
  questionId: string;
  markerId: string | null;
  studentAnswer: StudentAnswer;
}

export async function submitVideoQuizAnswer({
  supabase,
  studentId,
  lessonId,
  questionId,
  markerId,
  studentAnswer,
}: SubmitVideoQuizAnswerParams) {
  const question = await fetchQuizQuestionForValidation(supabase, questionId);

  if (!question) {
    throw new Error('ไม่พบคำถามนี้');
  }

  // กันไม่ให้ note_callout หลุดเข้ามาถึงจุดนี้
  if (question.interaction_type === 'note_callout') {
    throw new Error('note_callout ไม่ใช่คำถาม ไม่ควรถูกส่งมาที่ endpoint นี้');
  }

  const result = validateAnswer(question, studentAnswer);

  // เตรียมข้อมูล insert — แยกเก็บ choice_id แบบเดิม (backward compatible) กับ jsonb แบบใหม่
  const isChoiceBased =
    question.interaction_type === 'multiple_choice' || question.interaction_type === 'true_false';

  const { data, error } = await supabase
    .from('video_quiz_attempts')
    .insert({
      student_id: studentId,
      lesson_id: lessonId,
      question_id: questionId,
      marker_id: markerId,
      is_correct: result.is_correct,
      selected_choice_index: isChoiceBased
        ? question.choices?.findIndex((c) => c.id === (studentAnswer as any).choice_id) ?? null
        : null,
      student_answer: isChoiceBased ? null : studentAnswer,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`บันทึกคำตอบไม่สำเร็จ: ${error.message}`);
  }

  return { attempt: data, result };
}