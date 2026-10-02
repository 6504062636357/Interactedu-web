import type {
  MultiSelectStudentAnswer,
  QuestionForValidation,
  ValidationResult,
} from '@/types/interaction';

/**
 * multi_select: ถูกต้องก็ต่อเมื่อชุดตัวเลือกที่นักเรียนติ๊ก "เท่ากับ" ชุดเฉลยเป๊ะ (ครบและไม่เกิน)
 * ผลลัพธ์: is_correct=false + error = input ผิดรูปแบบ / is_correct=false ไม่มี error = ตอบผิดปกติ
 * ข้อมูลจาก client ไม่น่าเชื่อถือ จึงเช็คชนิดข้อมูลทุกชั้นก่อนเทียบ
 */
export function validateMultiSelect(
  question: QuestionForValidation,
  studentAnswer: MultiSelectStudentAnswer
): ValidationResult {
  if (!question.choices || question.choices.length < 2) {
    return { is_correct: false, error: 'ไม่พบตัวเลือกของคำถามนี้ (ต้องมีอย่างน้อย 2 ตัวเลือก)' };
  }

  const correctIds = new Set(question.choices.filter((c) => c.is_correct).map((c) => c.id));
  if (correctIds.size === 0) {
    return { is_correct: false, error: 'คำถามนี้ยังไม่มีเฉลย (ไม่มีตัวเลือกที่ถูก)' };
  }

  const ids = studentAnswer?.choice_ids;
  if (!Array.isArray(ids)) {
    return { is_correct: false, error: 'รูปแบบคำตอบไม่ถูกต้อง (choice_ids ต้องเป็น array)' };
  }
  if (ids.length === 0) {
    return { is_correct: false, error: 'ยังไม่ได้เลือกคำตอบ' };
  }
  if (ids.some((id) => typeof id !== 'string' || id === '')) {
    return { is_correct: false, error: 'choice_ids ต้องเป็นข้อความที่ไม่ว่างทั้งหมด' };
  }

  const selected = new Set(ids);
  if (selected.size !== ids.length) {
    return { is_correct: false, error: 'มีตัวเลือกซ้ำในคำตอบ' };
  }

  const validIds = new Set(question.choices.map((c) => c.id));
  if (ids.some((id) => !validIds.has(id))) {
    return { is_correct: false, error: 'choice_id ไม่ตรงกับตัวเลือกของคำถามนี้' };
  }

  const isCorrect =
    selected.size === correctIds.size && [...selected].every((id) => correctIds.has(id));

  return { is_correct: isCorrect };
}

/**
 * ตรวจแบบ "ตามลำดับ index" — ใช้กับ Final Exam ที่ส่งตัวเลือกให้ client เป็นอาเรย์ข้อความเรียงลำดับ
 * (ไม่มี id) ฝั่ง client จึงตอบเป็น index ของตัวเลือกที่ติ๊ก
 * `choices` ต้องเรียงลำดับเดียวกับที่ส่งให้นักเรียน (order_index) / `selectedIndexes` เป็น unknown
 * เพราะมาจาก request body — ชนิดผิดทุกกรณีคืน error ไม่ throw
 */
export function validateMultiSelectByIndexes(
  choices: { is_correct: boolean }[],
  selectedIndexes: unknown
): ValidationResult {
  if (!Array.isArray(selectedIndexes)) {
    return { is_correct: false, error: 'รูปแบบคำตอบไม่ถูกต้อง (selectedChoiceIndexes ต้องเป็น array)' };
  }
  if (selectedIndexes.some((v) => typeof v !== 'number' || !Number.isInteger(v) || v < 0)) {
    return { is_correct: false, error: 'selectedChoiceIndexes ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไปทั้งหมด' };
  }
  return validateMultiSelect(
    {
      id: 'by-index',
      interaction_type: 'multi_select',
      answer_data: null,
      choices: choices.map((c, i) => ({
        id: String(i),
        choice_text: '',
        is_correct: c.is_correct,
        order_index: i,
      })),
    },
    { choice_ids: (selectedIndexes as number[]).map(String) }
  );
}
