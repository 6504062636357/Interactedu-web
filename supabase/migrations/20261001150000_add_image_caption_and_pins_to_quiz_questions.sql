-- เพิ่มคำบรรยายใต้ภาพ (caption) + หมุดตัวเลขชี้เป้าบนภาพประกอบคำถาม (quiz_questions เท่านั้น ณ ตอนนี้ —
-- เริ่มจากคำถามแทรกในวิดีโอแบบ static ใน Lesson Editor ก่อนเป็นตัวอย่าง ตามที่ตกลงกันไว้)
-- image_pins เก็บเป็น array ของ {id, x, y} โดย x/y เป็น % ของขนาดภาพ (0-100) ไม่เก็บเลขลำดับตรงๆ
-- (เลขที่โชว์ผู้ใช้คำนวณจาก index ในอาเรย์ ณ เวลา render กันเลขเพี้ยนเมื่อลบหมุดกลางๆออก)
ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS image_caption text,
  ADD COLUMN IF NOT EXISTS image_pins jsonb;
