// src/app/api/lessons/[lessonId]/final-quiz/route.ts
//
// [งานข้อ 04] ปิดการใช้งานแล้ว — เดิม endpoint นี้ตรวจข้อสอบของ SCO ควิซแบบเก่า (แยกทีละ
// บทเรียน) แล้วเขียนคะแนน/สถานะลง scorm_tracking ของบทเรียนนั้นตรงๆ ผ่าน gradeFinalQuiz()
// ซึ่งชนกับแหล่งความจริงใหม่ของคะแนนสอบปลายคอร์ส (quiz_attempts ผ่าน gradeCourseFinalExam —
// งานข้อ 03) ถ้ายังปล่อยให้เรียกได้อยู่ มันเขียนทับคะแนนใบรับรองที่ตรวจแล้วได้ทันที
//
// SCO ควิซที่ endpoint นี้เคยตรวจให้ ก็ไม่เคยถูกสร้างขึ้นมาอีกแล้วเช่นกัน ตั้งแต่
// lib/scorm/generate.ts ตั้ง hasQuiz = false ถาวร (ลบ buildQuizPlayerJs/QUIZ_HTML/
// postExamQuestions ออกจากไฟล์นั้นพร้อมกันในงานข้อนี้) จึงไม่มีทางที่ผู้เรียนจะยิงมาโดนจากการ
// ใช้งานปกติอยู่แล้ว — คืน 410 ไว้เผื่อมีคนยิงตรงมาที่ endpoint นี้เอง (เช่นจาก request เก่าที่
// แคชไว้ หรือพยายามยิงตรงๆ) ไม่ให้มันมีผลอะไรกับข้อมูลอีก
//
// TODO(ลบไฟล์): เซสชันนี้ลบไฟล์บนเครื่องคุณไม่ได้ — ลบทั้งไฟล์นี้และโฟลเดอร์
// api/lessons/[lessonId]/final-quiz/ ทิ้งได้เลยเมื่อสะดวก ไม่มีอะไรอ้างอิงถึงมันแล้ว
// (ตรวจแล้วว่าไม่มีหน้าไหนในระบบเรียก POST /api/lessons/[lessonId]/final-quiz อยู่)

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint has been retired. Course completion is now graded through /api/courses/[courseId]/final-exam.",
    },
    { status: 410 }
  );
}
