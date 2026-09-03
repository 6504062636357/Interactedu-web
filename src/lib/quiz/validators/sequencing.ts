import type {
  SequencingAnswerData,
  SequencingStudentAnswer,
  QuestionForValidation,
  ValidationResult,
} from '@/types/interaction';

export function validateSequencing(
  question: QuestionForValidation,
  studentAnswer: SequencingStudentAnswer
): ValidationResult {
  const answerData = question.answer_data as SequencingAnswerData | null;

  if (!answerData || !answerData.correct_order || answerData.correct_order.length === 0) {
    return { is_correct: false, error: 'ไม่พบเฉลยลำดับของคำถามนี้ (answer_data ผิดรูปแบบ)' };
  }

  if (!studentAnswer?.order || !Array.isArray(studentAnswer.order)) {
    return { is_correct: false, error: 'ไม่พบคำตอบลำดับที่นักเรียนส่งมา' };
  }

  const correctOrder = answerData.correct_order;
  const studentOrder = studentAnswer.order;

  // ต้องมีจำนวน item เท่ากัน ไม่งั้นถือว่าตอบไม่ครบ
  if (studentOrder.length !== correctOrder.length) {
    return {
      is_correct: false,
      error: `จำนวนรายการไม่ตรงกัน (ต้องมี ${correctOrder.length} รายการ)`,
    };
  }

  // เช็คว่า item id ที่ส่งมาตรงกับ item id ทั้งหมดใน correct_order (ป้องกันส่ง id แปลกปลอมมา)
  const correctIdSet = new Set(correctOrder);
  const hasInvalidId = studentOrder.some((id) => !correctIdSet.has(id));
  if (hasInvalidId) {
    return { is_correct: false, error: 'มี item id ที่ไม่ตรงกับคำถามนี้' };
  }

  // เทียบลำดับตรงกันทุกตำแหน่งไหม
  const isCorrect = studentOrder.every((id, index) => id === correctOrder[index]);

  return { is_correct: isCorrect };
}