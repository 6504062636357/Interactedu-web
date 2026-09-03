import type {
  FillInBlankAnswerData,
  FillInBlankStudentAnswer,
  QuestionForValidation,
  ValidationResult,
} from '@/types/interaction';

export function validateFillInBlank(
  question: QuestionForValidation,
  studentAnswer: FillInBlankStudentAnswer
): ValidationResult {
  const answerData = question.answer_data as FillInBlankAnswerData | null;

  if (!answerData || !answerData.accepted_keywords || answerData.accepted_keywords.length === 0) {
    return { is_correct: false, error: 'ไม่พบ keyword เฉลยของคำถามนี้ (answer_data ผิดรูปแบบ)' };
  }

  if (!studentAnswer?.text || typeof studentAnswer.text !== 'string') {
    return { is_correct: false, error: 'ไม่พบคำตอบที่นักเรียนพิมพ์' };
  }

  const caseSensitive = answerData.case_sensitive ?? false;

  const normalize = (s: string) => {
    const trimmed = s.trim().replace(/\s+/g, ' '); // ตัด space หัวท้าย + ยุบ space ซ้ำ
    return caseSensitive ? trimmed : trimmed.toLowerCase();
  };

  const studentNormalized = normalize(studentAnswer.text);
  const isCorrect = answerData.accepted_keywords.some(
    (keyword) => normalize(keyword) === studentNormalized
  );

  return { is_correct: isCorrect };
}