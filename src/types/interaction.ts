// ===== Interaction Types =====
export type InteractionType =
  | 'multiple_choice'
  | 'true_false'
  | 'sequencing'
  | 'matching'
  | 'fill_in_blank'
  | 'multi_select' // เลือกได้หลายคำตอบ (checkbox) — ใช้ตาราง choices เดิม แต่มี is_correct ได้หลายแถว
  | 'drag_drop' // เติมคำโดยลากคำจากคลังไปวางในช่องว่าง
  | 'note_callout';

// type ที่ใช้ได้ในข้อสอบท้ายคอร์ส (Final Exam) — รวมไว้ที่เดียวแทนการพิมพ์ union ซ้ำหลายไฟล์
// (fill_in_blank/note_callout ยังไม่รองรับ)
export type ExamInteractionType =
  | 'multiple_choice'
  | 'true_false'
  | 'multi_select'
  | 'matching'
  | 'sequencing'
  | 'drag_drop';

// ===== answer_data shapes (เฉลยที่เก็บใน DB) =====
// MC, True/False และ multi_select ไม่ใช้ answer_data (ใช้ quiz_choices/question_bank_choices แทน)

export interface SequencingAnswerData {
  items: { id: string; text: string }[];
  correct_order: string[]; // array of item id เรียงตามลำดับที่ถูก
}

export interface MatchingAnswerData {
  pairs: { left: string; right: string }[];
}

export interface FillInBlankAnswerData {
  accepted_keywords: string[];
  case_sensitive: boolean;
}

// drag_drop: template คือข้อความที่มี placeholder รูปแบบ {{blank_id}} ตรงตำแหน่งช่องว่าง
// words = คลังคำทั้งหมด (รวมตัวหลอกที่ไม่อยู่ใน correct_map) / correct_map = blank_id -> word_id ที่ถูก
export interface DragDropAnswerData {
  template: string;
  blanks: { id: string }[];
  words: { id: string; text: string }[];
  correct_map: Record<string, string>;
}

// ข้อมูล "แสดงผล" ของ drag_drop ที่ส่งให้นักเรียน — สลับลำดับคำแล้ว และ **ไม่มี correct_map**
export interface DragDropDisplay {
  template: string; // มี {{blank_id}} ตรงช่องว่าง
  blankIds: string[]; // ลำดับช่องตามที่ปรากฏในโจทย์
  words: { id: string; text: string }[]; // คลังคำ (รวมคำหลอก) สลับลำดับแล้ว
}

export interface NoteCalloutAnswerData {
  note_text: string;
  display_style?: 'info' | 'warning' | 'tip';
}

export type AnswerData =
  | SequencingAnswerData
  | MatchingAnswerData
  | FillInBlankAnswerData
  | DragDropAnswerData
  | NoteCalloutAnswerData
  | null; // MC/True-False/multi_select = null

// ===== student_answer shapes (คำตอบที่นักเรียนส่งมา) =====

export interface ChoiceAnswer {
  // ใช้กับ MC และ True/False
  choice_id: string; // uuid ของ quiz_choices/question_bank_choices
}

export interface SequencingStudentAnswer {
  order: string[]; // array of item id ตามลำดับที่นักเรียนเรียง
}

export interface MatchingStudentAnswer {
  pairs: { left: string; right: string }[];
}

export interface FillInBlankStudentAnswer {
  text: string;
}

export interface MultiSelectStudentAnswer {
  choice_ids: string[]; // uuid ของทุกตัวเลือกที่นักเรียนติ๊ก (ลำดับไม่สำคัญ)
}

export interface DragDropStudentAnswer {
  placements: Record<string, string>; // blank_id -> word_id ที่นักเรียนวางลงช่องนั้น
}

export type StudentAnswer =
  | ChoiceAnswer
  | SequencingStudentAnswer
  | MatchingStudentAnswer
  | FillInBlankStudentAnswer
  | MultiSelectStudentAnswer
  | DragDropStudentAnswer;

// ===== ผลลัพธ์การตรวจ =====
export interface ValidationResult {
  is_correct: boolean;
  error?: string; // ถ้า input ผิดรูปแบบ
}

// ===== โครงคำถามที่ query มาจาก DB (รวม choices ถ้ามี) =====
export interface QuestionChoice {
  id: string;
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

export interface QuestionForValidation {
  id: string;
  interaction_type: InteractionType;
  answer_data: AnswerData;
  choices?: QuestionChoice[]; // สำหรับ MC/True-False/multi_select เท่านั้น
}
