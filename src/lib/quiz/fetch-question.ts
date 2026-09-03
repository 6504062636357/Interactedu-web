import { createClient } from '@/utils/supabase/client';
import type { QuestionForValidation, QuestionChoice } from '@/types/interaction';

// ปรับ import ตามที่โปรเจกคุณสร้าง client จริง
// เช่น import { supabase } from '@/lib/supabase/client';
type SupabaseClient = ReturnType<typeof createClient>;

/**
 * ดึงคำถาม 1 ข้อจาก quiz_questions (ใช้กับ Video Quiz)
 * join quiz_choices มาด้วยถ้าเป็น MC/True-False
 */
export async function fetchQuizQuestionForValidation(
  supabase: SupabaseClient,
  questionId: string
): Promise<QuestionForValidation | null> {
  const { data: question, error } = await supabase
    .from('quiz_questions')
    .select('id, interaction_type, answer_data')
    .eq('id', questionId)
    .single();

  if (error || !question) {
    console.error('fetchQuizQuestionForValidation: question not found', error);
    return null;
  }

  const result: QuestionForValidation = {
    id: question.id,
    interaction_type: question.interaction_type,
    answer_data: question.answer_data,
  };

  // เฉพาะ MC/True-False ที่ต้องดึง choices เพิ่ม
  if (question.interaction_type === 'multiple_choice' || question.interaction_type === 'true_false') {
    const { data: choices, error: choicesError } = await supabase
      .from('quiz_choices')
      .select('id, choice_text, is_correct, order_index')
      .eq('question_id', questionId)
      .order('order_index', { ascending: true });

    if (choicesError) {
      console.error('fetchQuizQuestionForValidation: choices fetch failed', choicesError);
      return null;
    }

    result.choices = choices as QuestionChoice[];
  }

  return result;
}

/**
 * ดึงคำถาม 1 ข้อจาก question_bank (ใช้กับ Final Exam)
 * join question_bank_choices มาด้วยถ้าเป็น MC/True-False
 */
export async function fetchBankQuestionForValidation(
  supabase: SupabaseClient,
  questionId: string
): Promise<QuestionForValidation | null> {
  const { data: question, error } = await supabase
    .from('question_bank')
    .select('id, interaction_type, answer_data')
    .eq('id', questionId)
    .single();

  if (error || !question) {
    console.error('fetchBankQuestionForValidation: question not found', error);
    return null;
  }

  const result: QuestionForValidation = {
    id: question.id,
    interaction_type: question.interaction_type,
    answer_data: question.answer_data,
  };

  if (question.interaction_type === 'multiple_choice' || question.interaction_type === 'true_false') {
    const { data: choices, error: choicesError } = await supabase
      .from('question_bank_choices')
      .select('id, choice_text, is_correct, order_index')
      .eq('question_id', questionId)
      .order('order_index', { ascending: true });

    if (choicesError) {
      console.error('fetchBankQuestionForValidation: choices fetch failed', choicesError);
      return null;
    }

    result.choices = choices as QuestionChoice[];
  }

  return result;
}