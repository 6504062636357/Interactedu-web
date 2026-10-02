import type { InteractionType } from '@/types/interaction';

/**
 * Type ที่เปิดให้สุ่มใช้งานจริงแล้ว (backend validate + UI player พร้อม)
 * เริ่มจาก MC/True-False ก่อน ค่อยทยอยเปิดทีละตัวตามที่ UI/validator พร้อม
 * NOTE: note_callout ไม่ใส่ในนี้เด็ดขาด — มันไม่ใช่คำถามที่ "สุ่ม" มาตอบ
 */
export const ENABLED_INTERACTION_TYPES: InteractionType[] = [
  'multiple_choice',
  'true_false',
  // 'fill_in_blank',   // เปิดเมื่อ validator + UI พร้อม
  'sequencing', // เปิดแล้ว — เฉพาะ Final Exam (สุ่มจากคลังข้อสอบ) เท่านั้น ดู FINAL_EXAM_ENABLED_TYPES ใน question-bank-sampling.ts
  'multi_select', // เปิดแล้ว — Final Exam + Pop-up Quiz (คุมด้วยสวิตช์ใน rollout.ts)
  'drag_drop',    // เปิดแล้ว — Final Exam + Pop-up Quiz (คุมด้วยสวิตช์ใน rollout.ts)
  'matching',   // เปิดแล้ว — เฉพาะ Final Exam (สุ่มจากคลังข้อสอบ) เท่านั้น ดู FINAL_EXAM_ENABLED_TYPES ใน question-bank-sampling.ts
];

// Final Exam อาจอยากจำกัดกว่านี้อีกชั้น (เช่น preset "quick_check" เอาแค่ MC)
export const PRESET_ALLOWED_TYPES: Record<string, InteractionType[]> = {
  quick_check: ['multiple_choice', 'true_false'],
  standard_final: ENABLED_INTERACTION_TYPES,
  challenging_final: ENABLED_INTERACTION_TYPES,
};
