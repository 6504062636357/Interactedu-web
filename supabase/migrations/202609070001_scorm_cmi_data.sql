-- งานข้อ 02: เก็บ CMI ทั้งก้อนเป็น JSONB ไม่ใช่แค่ 3 ฟิลด์
--
-- LMSCommit hook เดิมส่งขึ้นมาแค่ lesson_status, score.raw, suspend_data
-- ส่วน lesson_location, session_time, cmi.interactions.*, cmi.objectives.*
-- ที่แพ็กเกจ SCORM ภายนอก (หรือแม้แต่ของเราเองในอนาคต) เขียนไว้ หายหมดทุกครั้งที่ปิดหน้า
--
-- คอลัมน์เดิม (lesson_status, score_raw, suspend_data, completed_scos ฯลฯ) ยังคงไว้
-- เหมือนเดิมทุกอย่าง สำหรับ query เร็วในหน้า analytics/certificate — cmi_data เป็นแค่
-- snapshot เสริมสำหรับ resume แบบเต็มรูปแบบ (งานข้อ 01/05/11 ใช้ต่อ)

alter table public.scorm_tracking
  add column if not exists cmi_data jsonb not null default '{}'::jsonb;

comment on column public.scorm_tracking.cmi_data is
  'Full serialized CMI object from scorm-again (JSON.parse(JSON.stringify(cmi)) on LMSCommit). Used to restore lesson_location/session_time/interactions/objectives via loadFromJSON on resume. Narrow columns (lesson_status, score_raw, suspend_data, completed_scos) remain the fast-query source for dashboards/certificates.';
