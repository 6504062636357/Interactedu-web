// แยกไฟล์นี้ออกมาจาก review-actions.ts เพราะไฟล์ที่มี "use server" ด้านบน (server action file)
// Next.js บังคับว่า export ได้แค่ async function เท่านั้น — export ค่าคงที่ตรงๆ แบบ REVIEW_TAGS
// จากไฟล์ "use server" จะทำให้ตอน build/runtime ค่าที่ import ไปใช้ฝั่ง client ไม่ใช่ array จริง
// (กลายเป็น server reference แทน) เลยเกิด error "REVIEW_TAGS.map is not a function"
// ไฟล์นี้เป็นไฟล์ปกติ ไม่มี "use server" เลย import ไปใช้ได้ทั้งฝั่ง client และ server ตามปกติ

export const REVIEW_TAGS = [
  { key: "content", label: "เนื้อหา" },
  { key: "instructor", label: "ผู้สอน" },
  { key: "structure", label: "การจัดเรียงเนื้อหา" },
] as const;

export type ReviewTagKey = (typeof REVIEW_TAGS)[number]["key"];