/**
 * สวิตช์เปิดใช้ interaction type ใหม่ (client-safe: ฟอร์มครูและ server ใช้ค่าเดียวกัน)
 *
 * MULTI_SELECT_ENABLED = false → ครูยังไม่เห็นตัวเลือก "Multiple Select" ในฟอร์ม, server ปฏิเสธการบันทึก,
 * และระบบสุ่มข้อสอบจะไม่หยิบข้อประเภทนี้ไปให้นักเรียน
 * เปิดเป็น true หลังจากหน้าสอบนักเรียน (CourseFinalExam.tsx) รองรับครบแล้วเท่านั้น และต้องรัน migration
 * 20261001160000_add_multi_select_and_drag_drop_interaction_types.sql ก่อน
 *
 * Pop-up Quiz (generate.ts / video-quiz-attempts / sample route) รองรับ multi_select แล้ว ใช้สวิตช์ตัวเดียวกันนี้
 */
export const MULTI_SELECT_ENABLED = true;

/**
 * DRAG_DROP_ENABLED (เติมคำแบบลากไปวางในช่องว่าง) — หลักการเดียวกับ MULTI_SELECT_ENABLED
 * เปิดหลังรัน migration และทดสอบหน้าสอบนักเรียนแล้ว / Pop-up Quiz รองรับแล้ว (ใช้สวิตช์เดียวกัน)
 */
export const DRAG_DROP_ENABLED = true;
