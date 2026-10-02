import { parseDragDropAnswerData } from './drag-drop';

/**
 * ตัวตรวจ "ตอนครูสร้าง/แก้คำถาม" — คืนรายการ error ภาษาไทยทุกข้อที่เจอ (array ว่าง = ผ่าน)
 * เรียกจาก server action ก่อนบันทึก (ฟอร์มฝั่ง client ใช้ตัวเดียวกันเพื่อโชว์ error ได้)
 */

export const MULTI_SELECT_LIMITS = { minChoices: 2, maxChoices: 10, maxChoiceLength: 300 } as const;

export function validateMultiSelectAuthoring(
  choices: { text: string; isCorrect: boolean }[] | null | undefined
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(choices)) return ['ต้องมีตัวเลือก'];

  if (choices.length < MULTI_SELECT_LIMITS.minChoices) {
    errors.push(`ต้องมีตัวเลือกอย่างน้อย ${MULTI_SELECT_LIMITS.minChoices} ข้อ`);
  }
  if (choices.length > MULTI_SELECT_LIMITS.maxChoices) {
    errors.push(`มีตัวเลือกได้ไม่เกิน ${MULTI_SELECT_LIMITS.maxChoices} ข้อ`);
  }

  const seen = new Set<string>();
  choices.forEach((c, i) => {
    const text = typeof c?.text === 'string' ? c.text.trim() : '';
    if (text === '') {
      errors.push(`ตัวเลือกที่ ${i + 1} ว่างอยู่`);
      return;
    }
    if (text.length > MULTI_SELECT_LIMITS.maxChoiceLength) {
      errors.push(`ตัวเลือกที่ ${i + 1} ยาวเกิน ${MULTI_SELECT_LIMITS.maxChoiceLength} ตัวอักษร`);
    }
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) errors.push(`ตัวเลือก "${text}" ซ้ำกัน`);
    seen.add(key);
  });

  const correct = choices.filter((c) => c?.isCorrect === true).length;
  if (correct === 0) errors.push('ต้องเลือกคำตอบที่ถูกอย่างน้อย 1 ข้อ');
  else if (correct === choices.length && choices.length > 0) {
    errors.push('ต้องมีตัวเลือกที่ผิดอย่างน้อย 1 ข้อ (ไม่ควรถูกทุกข้อ)');
  }

  return errors;
}

export function validateDragDropAuthoring(answerData: unknown): string[] {
  const parsed = parseDragDropAnswerData(answerData);
  return parsed.ok ? [] : parsed.errors;
}
