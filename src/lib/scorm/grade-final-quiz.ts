// [งานข้อ 04] gradeFinalQuiz() (ตัวตรวจข้อสอบของ SCO ควิซแบบเก่า) ถูกลบออกแล้ว
//
// เดิมฟังก์ชันนี้เขียน score_raw / quiz_passed / lesson_status ลง scorm_tracking ของ
// "บทเรียนเดี่ยวๆ" ตรงๆ (หาแถวจาก scorm_packages.lesson_draft_id) ซึ่งเป็นคนละแหล่งความจริง
// กับผลสอบปลายคอร์สที่ใช้ตัดสินใบรับรองจริงตอนนี้ (quiz_attempts ผ่าน gradeCourseFinalExam
// — งานข้อ 03) ถ้าฟังก์ชันนี้ยังถูกเรียกได้อยู่ (ผ่าน endpoint api/lessons/[lessonId]/final-quiz
// ที่ยังเปิดอยู่ตอนนั้น) และไปตรงกับ "บทเรียนสุดท้าย" ที่ certificate เคยอ้างอิง จะเขียนทับคะแนน
// ใบรับรองที่ตรวจแล้วได้ทันที (นี่คือ "ระเบิดเวลา" ที่งานข้อ 04 ต้องการปิด)
//
// ที่มาของบั๊กนี้อีกชั้นหนึ่งคือ SCO ควิซที่ endpoint นี้ตรวจคำตอบให้ ไม่เคยถูกสร้างขึ้นมาอีกแล้ว
// ตั้งแต่ lib/scorm/generate.ts ตั้ง hasQuiz = false ถาวร (แก้พร้อมกันในงานข้อนี้เช่นกัน —
// buildQuizPlayerJs / QUIZ_HTML / postExamQuestions ถูกลบออกจากไฟล์นั้นแล้ว) endpoint จึงไม่มี
// SCO ควิซให้ผู้เรียนเข้าถึงในทางปกติอยู่แล้ว การลบฟังก์ชันนี้ทิ้งจึงไม่กระทบ flow ที่ใช้งานจริง
//
// TODO(ลบไฟล์): เซสชันนี้ลบไฟล์บนเครื่องคุณไม่ได้ (ไม่มีเครื่องมือรันคำสั่งบนเครื่องให้ใช้ใน
// เซสชันนี้) — ไฟล์นี้เหลือไว้แค่ type ที่ยังถูก import จริงจาก 2 ที่ (ดูด้านล่าง) ถ้าจะลบไฟล์นี้
// ทิ้งทั้งไฟล์ ต้องย้าย 3 type ข้างล่างไปไว้ที่อื่นก่อน (เช่นรวมเข้ากับ course-final-exam.ts)
// แล้วแก้ import ทั้งสองจุดให้ชี้ไปที่ใหม่:
//   - src/lib/courses/course-final-exam.ts
//   - src/app/api/courses/[courseId]/final-exam/route.ts

import type { ExamInteractionType } from "@/types/interaction";

export interface FinalQuizAnswer {
  questionId: string;
  // ===== เพิ่มใหม่: matching/sequencing ไม่มี selectedChoiceIndex ให้ใช้ ต้องมี field เฉพาะของตัวเอง
  // (optional ทั้งคู่ — คำถาม multiple_choice/true_false ยังส่งแค่ selectedChoiceIndex เหมือนเดิม)
  selectedChoiceIndex?: number;
  // multi_select: index (ตามลำดับที่ส่งให้นักเรียน) ของทุกตัวเลือกที่ติ๊ก — ใช้แทน selectedChoiceIndex
  selectedChoiceIndexes?: number[];
  matchingPairs?: { left: string; right: string }[];
  sequenceOrder?: string[];
  // drag_drop: blank_id -> word_id ที่นักเรียนวางลงช่องนั้น
  dragDropPlacements?: Record<string, string>;
}

export interface FinalQuizDetail {
  questionId: string;
  isCorrect: boolean;
  correctChoiceIndex: number;
  explanation: string | null;
}

// ===== เพิ่มใหม่: ข้อมูลเฉลยรายข้อสำหรับหน้า "ดูเฉลยและคำอธิบายละเอียด" (Review Answers)
// ประกอบฝั่ง server เสมอ แต่ route จะส่งให้ client "เฉพาะตอนสอบผ่านแล้วเท่านั้น" — ตอนยังไม่ผ่าน
// (ยังอยู่ในลูปสอบซ้ำ) ห้ามส่งเฉลยรายข้อออกไป ไม่งั้นนักเรียนจำเฉลยแล้วสอบซ้ำจนผ่านได้
export interface FinalExamReviewItem {
  questionId: string;
  lessonTitle: string;
  questionText: string;
  imageUrl: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (แสดงในหน้า Review Answers ด้วย) =====
  imageCaption: string | null;
  imagePins: { id: string; x: number; y: number }[] | null;
  interactionType: ExamInteractionType;
  isCorrect: boolean;
  explanation: string | null;
  // multiple_choice / true_false
  choices: string[] | null;
  selectedChoiceIndex: number | null;
  correctChoiceIndex: number | null;
  // multi_select — ตอบ/เฉลยได้หลาย index (ใช้ choices ชุดเดียวกับข้างบน)
  selectedChoiceIndexes?: number[] | null;
  correctChoiceIndexes?: number[] | null;
  // drag_drop — โจทย์ที่มี {{blank_id}} + คำตอบของนักเรียนเทียบเฉลยรายช่อง
  dragDrop?: {
    template: string;
    blanks: { id: string; studentWord: string; correctWord: string; isCorrect: boolean }[];
  } | null;
  // matching — แถวละ 1 คู่ (ซ้าย) พร้อมคำตอบที่นักเรียนเลือกเทียบกับคำตอบที่ถูก
  matching: { left: string; studentRight: string; correctRight: string; isCorrect: boolean }[] | null;
  // sequencing — ลำดับที่นักเรียนจัดเทียบกับลำดับที่ถูกต้อง
  sequencing: {
    studentOrder: { id: string; text: string }[];
    correctOrder: { id: string; text: string }[];
  } | null;
}

export interface FinalQuizGrade {
  courseId: string;
  attemptId: string;
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  passPercentage: number;
  passed: boolean;
  details: FinalQuizDetail[];
  review?: FinalExamReviewItem[];
}
