import type { InteractionType } from '@/types/interaction';

/**
 * จัดกลุ่ม interaction type ไว้ที่เดียว — กันการเขียน `=== 'multiple_choice' || === 'true_false'`
 * ซ้ำกระจายหลายไฟล์ (ซึ่งเคยทำให้ type ใหม่หลุดตอนเพิ่ม)
 */

/** type ที่เฉลยอยู่ในตาราง choices (quiz_choices / question_bank_choices) */
const CHOICE_TABLE_TYPES: readonly InteractionType[] = ['multiple_choice', 'true_false', 'multi_select'];

/** type ที่ตอบด้วยการเลือก "ตัวเลือกเดียว" (เก็บ selected_choice_id ได้) */
const SINGLE_CHOICE_TYPES: readonly InteractionType[] = ['multiple_choice', 'true_false'];

/** type ที่เฉลยอยู่ใน answer_data (jsonb) */
const ANSWER_DATA_TYPES: readonly InteractionType[] = [
  'sequencing',
  'matching',
  'fill_in_blank',
  'drag_drop',
  'note_callout',
];

export function usesChoiceTable(type: InteractionType | null | undefined): boolean {
  return !!type && CHOICE_TABLE_TYPES.includes(type);
}

export function isSingleChoiceType(type: InteractionType | null | undefined): boolean {
  return !!type && SINGLE_CHOICE_TYPES.includes(type);
}

export function usesAnswerData(type: InteractionType | null | undefined): boolean {
  return !!type && ANSWER_DATA_TYPES.includes(type);
}
