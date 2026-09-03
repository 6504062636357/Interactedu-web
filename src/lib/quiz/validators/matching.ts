import type {
  MatchingAnswerData,
  MatchingStudentAnswer,
  QuestionForValidation,
  ValidationResult,
} from '@/types/interaction';

export function validateMatching(
  question: QuestionForValidation,
  studentAnswer: MatchingStudentAnswer
): ValidationResult {
  const answerData = question.answer_data as MatchingAnswerData | null;

  if (!answerData || !answerData.pairs || answerData.pairs.length === 0) {
    return { is_correct: false, error: 'ไม่พบเฉลยคู่จับคู่ของคำถามนี้ (answer_data ผิดรูปแบบ)' };
  }

  if (!studentAnswer?.pairs || !Array.isArray(studentAnswer.pairs)) {
    return { is_correct: false, error: 'ไม่พบคำตอบการจับคู่ที่นักเรียนส่งมา' };
  }

  const correctPairs = answerData.pairs;
  const studentPairs = studentAnswer.pairs;

  if (studentPairs.length !== correctPairs.length) {
    return {
      is_correct: false,
      error: `จำนวนคู่ไม่ตรงกัน (ต้องมี ${correctPairs.length} คู่)`,
    };
  }

  // สร้าง lookup map จากเฉลย: left -> right ที่ถูกต้อง
  const correctMap = new Map(correctPairs.map((p) => [p.left, p.right]));

  // ทุกคู่ที่นักเรียนส่งมาต้อง match กับเฉลยเป๊ะ ไม่งั้นถือว่าผิดทั้งข้อ
  const isCorrect = studentPairs.every((p) => correctMap.get(p.left) === p.right);

  // เช็คด้วยว่านักเรียนจับคู่ left ครบทุกตัวไหม (กันกรณีส่งซ้ำ/ขาด)
  const studentLeftSet = new Set(studentPairs.map((p) => p.left));
  const hasMissingLeft = correctPairs.some((p) => !studentLeftSet.has(p.left));

  return { is_correct: isCorrect && !hasMissingLeft };
}