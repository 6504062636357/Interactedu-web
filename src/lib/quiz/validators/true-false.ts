import type { ChoiceAnswer, QuestionForValidation, ValidationResult } from '@/types/interaction';

// True/False ใช้ query โครงสร้างเดียวกับ MC เป๊ะ (2 choices ใน quiz_choices)
// แยกไฟล์ไว้เผื่ออนาคตอยาก validate เพิ่มเติมเฉพาะ True/False (เช่น บังคับว่าต้องมีแค่ 2 choices)
export function validateTrueFalse(
  question: QuestionForValidation,
  studentAnswer: ChoiceAnswer
): ValidationResult {
  if (!question.choices || question.choices.length !== 2) {
    return { is_correct: false, error: 'True/False ต้องมี choices เท่ากับ 2 ตัวเลือกเท่านั้น' };
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