// src/lib/quiz/submit-video-quiz-answer.ts
//
// [งานข้อ 16] submitVideoQuizAnswer() ถูกปิดการใช้งานแล้ว — เดิมฟังก์ชันนี้เขียนคำตอบลง
// video_quiz_attempts ด้วย .insert() ธรรมดา (ไม่มี onConflict) เป็นคนละเส้นทางกับ endpoint จริง
// (api/lessons/[lessonId]/video-quiz-attempts/route.ts) ที่ใช้ .upsert() พร้อม
// onConflict: 'student_id,question_id' (หรือ 'student_id,marker_id') — ถ้าฟังก์ชันนี้ยังถูกเรียก
// ใช้อยู่คู่กับ endpoint จริง ผู้เรียนที่ตอบคำถามเดิมซ้ำ (เช่นกดตอบซ้ำ, retry หลังตอบผิด) จะชน
// unique constraint ของตาราง video_quiz_attempts ทันที เพราะ .insert() ไม่รู้จักเคส "แถวนี้มีอยู่
// แล้ว ให้ update แทน" เหมือน .upsert()
//
// ตรวจแล้วว่าไม่มีที่ไหนใน src เรียก submitVideoQuizAnswer() อยู่จริง (endpoint จริงข้างต้นมี logic
// ตรวจคำตอบ + upsert ของตัวเองครบอยู่แล้ว ไม่ได้เรียกฟังก์ชันนี้เลย) — คงไว้แค่ signature เดิมแบบ
// throw ทันทีถ้ามีใครเผลอเรียกใช้ในอนาคต (ดีกว่าเงียบๆ แล้วพังตอน insert ชน constraint จริง)
// แทนที่จะลบฟังก์ชันทิ้งเฉยๆ เผื่อมีโค้ดที่ import ชื่อนี้อยู่ที่ผมมองไม่เห็นในเซสชันนี้
//
// dispatcher.ts (validateAnswer) และ fetch-question.ts ที่ไฟล์นี้เคย import ยังใช้งานจริงอยู่ที่
// lib/quiz/submit-final-exam-answer.ts (คนละ table: quiz_attempt_questions ไม่ใช่
// video_quiz_attempts จึงไม่มีปัญหา unique constraint แบบเดียวกัน) — อย่าลบสองไฟล์นั้น
//
// TODO(ลบไฟล์): เซสชันนี้ลบไฟล์บนเครื่องคุณไม่ได้ (ไม่มีเครื่องมือรันคำสั่งบนเครื่องให้ใช้ใน
// เซสชันนี้) — ถ้าเช็คแล้วมั่นใจว่าไม่มีที่ไหน import ชื่อ submitVideoQuizAnswer ลบไฟล์นี้ทิ้งได้
// เลยเมื่อสะดวก ไม่มีอะไรอ้างอิงถึงมันแล้ว
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudentAnswer } from '@/types/interaction';

interface SubmitVideoQuizAnswerParams {
  supabase: SupabaseClient;
  studentId: string;
  lessonId: string;
  questionId: string;
  markerId: string | null;
  studentAnswer: StudentAnswer;
}

export async function submitVideoQuizAnswer(
  _params: SubmitVideoQuizAnswerParams
): Promise<never> {
  throw new Error(
    '[งานข้อ 16] submitVideoQuizAnswer() ถูกปิดใช้งานแล้ว — เป็นเส้นทางซ้ำที่เขียน video_quiz_attempts ' +
      'ด้วย .insert() (ไม่มี onConflict) ชนกับ endpoint จริง (api/lessons/[lessonId]/video-quiz-attempts) ' +
      'ที่ใช้ .upsert() ให้เรียก endpoint นั้นแทน ไม่ต้องเรียกฟังก์ชันนี้'
  );
}
