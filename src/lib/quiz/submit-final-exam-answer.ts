import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudentAnswer } from '@/types/interaction';
import { fetchBankQuestionForValidation } from './fetch-question';
import { validateAnswer } from './dispatcher';

interface SubmitFinalExamAnswerParams {
  supabase: SupabaseClient;
  attemptId: string; // อ้างอิง quiz_attempts.id (สอบ 1 ครั้ง)
  questionId: string; // อ้างอิง question_bank.id
  studentAnswer: StudentAnswer;
}

export async function submitFinalExamAnswer({
  supabase,
  attemptId,
  questionId,
  studentAnswer,
}: SubmitFinalExamAnswerParams) {
  const question = await fetchBankQuestionForValidation(supabase, questionId);

  if (!question) {
    throw new Error('ไม่พบคำถามนี้');
  }

  // Final Exam ไม่ควรมี note_callout อยู่แล้ว (ต้อง filter ออกตอนสุ่ม)
  // แต่ guard ไว้อีกชั้นกันหลุด
  if (question.interaction_type === 'note_callout') {
    throw new Error('note_callout ไม่ใช่คำถาม ห้ามอยู่ใน Final Exam');
  }

  const result = validateAnswer(question, studentAnswer);

  const isChoiceBased =
    question.interaction_type === 'multiple_choice' || question.interaction_type === 'true_false';

  const { data, error } = await supabase
    .from('quiz_attempt_questions')
    .insert({
      attempt_id: attemptId,
      question_id: questionId,
      is_correct: result.is_correct,
      selected_choice_id: isChoiceBased ? (studentAnswer as any).choice_id ?? null : null,
      student_answer: isChoiceBased ? null : studentAnswer,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`บันทึกคำตอบไม่สำเร็จ: ${error.message}`);
  }

  return { attempt_question: data, result };
}