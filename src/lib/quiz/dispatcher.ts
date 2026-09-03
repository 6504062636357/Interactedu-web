import type {
  QuestionForValidation,
  StudentAnswer,
  ValidationResult,
} from '@/types/interaction';
import { validateMultipleChoice } from './validators/multiple-choice';
import { validateTrueFalse } from './validators/true-false';
import { validateSequencing } from './validators/sequencing';
import { validateMatching } from './validators/matching';
import { validateFillInBlank } from './validators/fill-in-blank';

export function validateAnswer(
  question: QuestionForValidation,
  studentAnswer: StudentAnswer
): ValidationResult {
  switch (question.interaction_type) {
    case 'multiple_choice':
      return validateMultipleChoice(question, studentAnswer as any);

    case 'true_false':
      return validateTrueFalse(question, studentAnswer as any);

    case 'sequencing':
      return validateSequencing(question, studentAnswer as any);

    case 'matching':
      return validateMatching(question, studentAnswer as any);

    case 'fill_in_blank':
      return validateFillInBlank(question, studentAnswer as any);

    case 'note_callout':
      throw new Error('note_callout ไม่มีคำตอบให้ตรวจ — ห้ามเรียก validateAnswer กับ type นี้');

    default: {
      const _exhaustive: never = question.interaction_type;
      throw new Error(`Unknown interaction_type: ${_exhaustive}`);
    }
  }
}