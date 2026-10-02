-- เพิ่มรูปภาพประกอบคำถาม: ใช้ได้ทั้ง video quiz / final exam แบบเก่า (quiz_questions)
-- และ final exam config-driven ใหม่ + video quiz random bank (question_bank)
-- image_url เป็น public URL บน R2 เดียวกับที่ใช้กับวิดีโอ/ไฟล์ประกอบบทเรียนอยู่แล้ว

alter table public.quiz_questions
  add column if not exists image_url text;

alter table public.question_bank
  add column if not exists image_url text;
