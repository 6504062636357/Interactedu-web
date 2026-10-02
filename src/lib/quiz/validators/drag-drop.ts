import type {
  DragDropAnswerData,
  DragDropStudentAnswer,
  QuestionForValidation,
  ValidationResult,
} from '@/types/interaction';

// ขีดจำกัด — ใช้ทั้งตอนครูสร้าง (authoring) และตอน validate ฝั่ง server กัน payload ใหญ่ผิดปกติ
export const DRAG_DROP_LIMITS = {
  maxBlanks: 10,
  maxWords: 16,
  maxTemplateLength: 2000,
  maxWordLength: 60,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// id เหล่านี้ชนกับ property ของ Object — ห้ามใช้เป็น key ของ correct_map/placements
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const normalizeWord = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function idProblem(id: unknown, label: string): string | null {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return `${label} ต้องเป็นตัวอักษร/ตัวเลข/_/- ยาว 1-64 ตัว`;
  }
  if (RESERVED_IDS.has(id)) return `${label} "${id}" เป็นชื่อที่ระบบสงวนไว้`;
  return null;
}

export type ParseResult =
  | { ok: true; data: DragDropAnswerData }
  | { ok: false; errors: string[] };

/**
 * ตรวจ answer_data (unknown จาก jsonb / จากฟอร์ม) ว่าเป็น DragDropAnswerData ที่ใช้งานได้จริง
 * คืน errors ทุกข้อที่เจอ (ภาษาไทย) เพื่อโชว์ครูทีเดียวครบ ไม่ต้องแก้ทีละข้อ
 */
export function parseDragDropAnswerData(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['answer_data ต้องเป็น object'] };

  const { template, blanks, words, correct_map } = raw;

  // --- template ---
  if (typeof template !== 'string' || template.trim() === '') {
    errors.push('ต้องมีข้อความโจทย์ (template)');
  } else if (template.length > DRAG_DROP_LIMITS.maxTemplateLength) {
    errors.push(`ข้อความโจทย์ยาวเกิน ${DRAG_DROP_LIMITS.maxTemplateLength} ตัวอักษร`);
  }

  // --- blanks ---
  const blankIds: string[] = [];
  if (!Array.isArray(blanks) || blanks.length === 0) {
    errors.push('ต้องมีช่องว่างอย่างน้อย 1 ช่อง');
  } else {
    if (blanks.length > DRAG_DROP_LIMITS.maxBlanks) {
      errors.push(`มีช่องว่างได้ไม่เกิน ${DRAG_DROP_LIMITS.maxBlanks} ช่อง`);
    }
    blanks.forEach((b, i) => {
      const p = idProblem(isPlainObject(b) ? b.id : undefined, `id ช่องว่างที่ ${i + 1}`);
      if (p) errors.push(p);
      else blankIds.push((b as { id: string }).id);
    });
    if (new Set(blankIds).size !== blankIds.length) errors.push('id ช่องว่างซ้ำกัน');
  }

  // --- words ---
  const wordIds: string[] = [];
  if (!Array.isArray(words) || words.length === 0) {
    errors.push('ต้องมีคำในคลังอย่างน้อย 1 คำ');
  } else {
    if (words.length > DRAG_DROP_LIMITS.maxWords) {
      errors.push(`มีคำในคลังได้ไม่เกิน ${DRAG_DROP_LIMITS.maxWords} คำ`);
    }
    const seenText = new Set<string>();
    words.forEach((w, i) => {
      const o = isPlainObject(w) ? w : {};
      const p = idProblem(o.id, `id คำที่ ${i + 1}`);
      if (p) errors.push(p);
      else wordIds.push(o.id as string);

      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (text === '') {
        errors.push(`คำที่ ${i + 1} ว่างอยู่`);
      } else if (text.length > DRAG_DROP_LIMITS.maxWordLength) {
        errors.push(`คำที่ ${i + 1} ยาวเกิน ${DRAG_DROP_LIMITS.maxWordLength} ตัวอักษร`);
      } else {
        const key = normalizeWord(text);
        // คำซ้ำกันทำให้นักเรียนสลับสองคำแล้วถูกมองว่าผิดทั้งที่หน้าตาเหมือนกัน
        if (seenText.has(key)) errors.push(`คำ "${text}" ซ้ำกันในคลัง`);
        seenText.add(key);
      }
    });
    if (new Set(wordIds).size !== wordIds.length) errors.push('id คำซ้ำกัน');
    if (blankIds.length > 0 && words.length < blankIds.length) {
      errors.push('จำนวนคำในคลังต้องไม่น้อยกว่าจำนวนช่องว่าง');
    }
  }

  // --- correct_map ---
  if (!isPlainObject(correct_map)) {
    errors.push('ต้องกำหนดเฉลยของแต่ละช่อง (correct_map)');
  } else {
    const keys = Object.keys(correct_map);
    const blankSet = new Set(blankIds);
    const wordSet = new Set(wordIds);

    blankSet.forEach((id) => {
      if (!hasOwn(correct_map, id)) errors.push(`ช่อง "${id}" ยังไม่ได้กำหนดเฉลย`);
    });
    keys.forEach((k) => {
      if (!blankSet.has(k)) errors.push(`เฉลยอ้างถึงช่อง "${k}" ที่ไม่มีอยู่`);
    });

    const used: string[] = [];
    keys.forEach((k) => {
      const v = correct_map[k];
      if (typeof v !== 'string' || !wordSet.has(v)) {
        errors.push(`เฉลยของช่อง "${k}" อ้างถึงคำที่ไม่มีในคลัง`);
      } else {
        used.push(v);
      }
    });
    if (new Set(used).size !== used.length) {
      errors.push('คำหนึ่งคำถูกกำหนดเป็นเฉลยของหลายช่อง (ผู้เรียนใช้ได้ช่องเดียว)');
    }
  }

  // --- template <-> blanks ---
  if (typeof template === 'string' && blankIds.length > 0) {
    const found: string[] = [];
    for (const m of template.matchAll(PLACEHOLDER_PATTERN)) found.push(m[1]);
    const blankSet = new Set(blankIds);
    found.forEach((id) => {
      if (!blankSet.has(id)) errors.push(`โจทย์มีช่อง {{${id}}} ที่ไม่ได้ประกาศใน blanks`);
    });
    blankSet.forEach((id) => {
      const count = found.filter((f) => f === id).length;
      if (count === 0) errors.push(`โจทย์ไม่มีตำแหน่งของช่อง {{${id}}}`);
      else if (count > 1) errors.push(`ช่อง {{${id}}} ปรากฏในโจทย์มากกว่า 1 ครั้ง`);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: raw as unknown as DragDropAnswerData };
}

export function validateDragDrop(
  question: QuestionForValidation,
  studentAnswer: DragDropStudentAnswer
): ValidationResult {
  const parsed = parseDragDropAnswerData(question.answer_data);
  if (!parsed.ok) {
    return { is_correct: false, error: `เฉลยของคำถามนี้ผิดรูปแบบ: ${parsed.errors[0]}` };
  }
  const { blanks, words, correct_map } = parsed.data;

  const placements = studentAnswer?.placements;
  if (!isPlainObject(placements)) {
    return { is_correct: false, error: 'รูปแบบคำตอบไม่ถูกต้อง (placements ต้องเป็น object)' };
  }

  const blankSet = new Set(blanks.map((b) => b.id));
  const wordSet = new Set(words.map((w) => w.id));

  const keys = Object.keys(placements);
  if (keys.some((k) => !blankSet.has(k))) {
    return { is_correct: false, error: 'มีช่องว่างที่ไม่ตรงกับคำถามนี้' };
  }

  const placedWords: string[] = [];
  for (const b of blanks) {
    const w = hasOwn(placements, b.id) ? placements[b.id] : undefined;
    if (w === undefined || w === null || w === '') {
      return { is_correct: false, error: 'ยังเติมคำไม่ครบทุกช่อง' };
    }
    if (typeof w !== 'string' || !wordSet.has(w)) {
      return { is_correct: false, error: 'มีคำที่ไม่ตรงกับคลังคำของคำถามนี้' };
    }
    placedWords.push(w);
  }
  if (new Set(placedWords).size !== placedWords.length) {
    return { is_correct: false, error: 'ใช้คำเดียวกันซ้ำในหลายช่อง' };
  }

  const isCorrect = blanks.every((b) => placements[b.id] === correct_map[b.id]);
  return { is_correct: isCorrect };
}
