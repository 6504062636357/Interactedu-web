-- เพิ่ม interaction type ใหม่ 2 แบบ:
--   multi_select = เลือกได้หลายคำตอบ (ใช้ quiz_choices / question_bank_choices เดิม มี is_correct ได้หลายแถว)
--   drag_drop    = เติมคำโดยลากคำไปวางช่องว่าง (เฉลยอยู่ใน answer_data jsonb ไม่ต้องเพิ่ม column)
-- หมายเหตุ: ค่า enum ที่เพิ่มใหม่ใช้ใน transaction เดียวกันกับที่เพิ่มไม่ได้ จึงไม่มี statement อื่นที่
-- อ้างค่าเหล่านี้ในไฟล์นี้ ให้ไปใช้ใน migration/โค้ดรอบถัดไป
ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'multi_select';
ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'drag_drop';
