// ===== Interaction Types =====
export type InteractionType =
  | 'multiple_choice'
  | 'true_false'
  | 'sequencing'
  | 'matching'
  | 'fill_in_blank'
  | 'note_callout';

// ===== answer_data shapes (เฉลยที่เก็บใน DB) =====
// MC และ True/False ไม่ใช้ answer_data (ใช้ quiz_choices/question_bank_choices แทน)

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

export interface NoteCalloutAnswerData {
  note_text: string;
  display_style?: 'info' | 'warning' | 'tip';
}

export type AnswerData =
  | SequencingAnswerData
  | MatchingAnswerData
  | FillInBlankAnswerData
  | NoteCalloutAnswerData
  | null; // MC/True-False = null

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

export type StudentAnswer =
  | ChoiceAnswer
  | SequencingStudentAnswer
  | MatchingStudentAnswer
  | FillInBlankStudentAnswer;

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
  choices?: QuestionChoice[]; // สำหรับ MC/True-False เท่านั้น
}