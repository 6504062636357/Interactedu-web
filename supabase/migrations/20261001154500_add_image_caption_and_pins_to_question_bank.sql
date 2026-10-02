-- เพิ่มคำบรรยายใต้ภาพ (caption) + หมุดตัวเลขชี้เป้าบนภาพประกอบคำถาม ให้ question_bank เหมือนที่ทำกับ
-- quiz_questions ไปก่อนแล้ว (ดู 20261001150000_add_image_caption_and_pins_to_quiz_questions.sql)
-- shape เดียวกัน: image_pins เป็น array ของ {id, x, y} (x/y เป็น % ของขนาดภาพ 0-100)
ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS image_caption text,
  ADD COLUMN IF NOT EXISTS image_pins jsonb;
