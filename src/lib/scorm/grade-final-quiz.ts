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

export interface FinalQuizAnswer {
  questionId: string;
  selectedChoiceIndex: number;
}

export interface FinalQuizDetail {
  questionId: string;
  isCorrect: boolean;
  correctChoiceIndex: number;
  explanation: string | null;
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
}
