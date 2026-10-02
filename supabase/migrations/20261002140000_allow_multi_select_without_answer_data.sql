-- multi_select เก็บเฉลยใน choices (is_correct หลายแถว) ไม่ใช้ answer_data
-- constraint เดิมบังคับ answer_data ให้ทุกชนิดที่ไม่ใช่ multiple_choice/true_false/note_callout จึงปฏิเสธ multi_select
alter table public.question_bank drop constraint question_bank_answer_data_check;
alter table public.question_bank add constraint question_bank_answer_data_check
  check (interaction_type in ('multiple_choice','true_false','multi_select','note_callout') or answer_data is not null);
alter table public.quiz_questions drop constraint quiz_questions_answer_data_check;
alter table public.quiz_questions add constraint quiz_questions_answer_data_check
  check (interaction_type in ('multiple_choice','true_false','multi_select','note_callout') or answer_data is not null);
