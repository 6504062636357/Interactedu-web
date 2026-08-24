export const CATEGORIES = [
  // หมวดไอที & ดิจิทัล
  "เทคโนโลยี",
  "การเขียนโปรแกรมและการพัฒนาซอฟต์แวร์",
  "ปัญญาประดิษฐ์และวิทยาศาสตร์ข้อมูล", // AI & Data Science
  "การออกแบบและสื่อสร้างสรรค์",        // Design & Creative Media

  // หมวดธุรกิจ & การทำงาน
  "ธุรกิจและการเป็นผู้ประกอบการ",
  "การตลาดและการขาย",
  "การเงินและการลงทุน",
  "พัฒนาตนเองและภาวะผู้นำ",

  // หมวดภาษา (แยกยอดนิยม + อื่นๆ)
  "ภาษาอังกฤษ",
  "ภาษาจีน",
  "ภาษาญี่ปุ่น",
  "ภาษาเกาหลี",
  "ภาษาต่างประเทศอื่นๆ",

  // หมวดวิชาการ & ไลฟ์สไตล์
  "วิชาการและเตรียมสอบ",
  "สุขภาพและไลฟ์สไตล์",
  "อื่นๆ"
] as const;

export type Category = (typeof CATEGORIES)[number];

// วนใช้โทนสีของแบรนด์ (จาก tagColors บนหน้าแรก) ให้ครบทุกหมวดหมู่
// เผื่อกรณีที่ยังไม่ได้ map สีเฉพาะเจาะจงให้แต่ละหมวด
const PALETTE = [
  "bg-[#FF5A3C] text-white",   // ส้ม (แบรนด์หลัก)
  "bg-[#7C5CFF] text-white",   // ม่วง
  "bg-[#00B37E] text-white",   // เขียว
  "bg-[#FFCB47] text-[#0F1B3D]", // เหลือง
  "bg-[#0F1B3D] text-white",   // กรมท่า
] as const;

export const CATEGORY_COLORS: Record<Category, string> = CATEGORIES.reduce(
  (acc, category, i) => {
    acc[category] = PALETTE[i % PALETTE.length];
    return acc;
  },
  {} as Record<Category, string>
);