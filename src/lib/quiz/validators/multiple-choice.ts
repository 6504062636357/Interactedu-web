import type { ChoiceAnswer, QuestionForValidation, ValidationResult } from '@/types/interaction';

export function validateMultipleChoice(
  question: QuestionForValidation,
  studentAnswer: ChoiceAnswer
): ValidationResult {
  if (!question.choices || question.choices.length === 0) {
    return { is_correct: false, error: 'ไม่พบตัวเลือกของคำถามนี้' };
  }

  if (!studentAnswer?.choice_id) {
    return { is_correct: false, error: 'ไม่พบคำตอบที่นักเรียนเลือก' };
  }

  const selected = question.choices.find((c) => c.id === studentAnswer.choice_id);

  if (!selected) {
    return { is_correct: false, error: 'choice_id ไม่ตรงกับตัวเลือกของคำถามนี้' };
  }

  return { is_correct: selected.is_correct };
}