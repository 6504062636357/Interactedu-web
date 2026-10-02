import type { DragDropAnswerData } from '@/types/interaction';
import { parseDragDropAnswerData } from './validators/drag-drop';

/**
 * แปลงระหว่าง "สถานะฟอร์มของครู" ↔ answer_data ของ drag_drop (client-safe, ไม่มี side effect)
 *
 * ครูพิมพ์โจทย์โดยใช้ ___ (ขีดล่าง 3 ตัวขึ้นไป) แทนตำแหน่งช่องว่าง, กรอกคำตอบที่ถูกของแต่ละช่องตามลำดับ
 * และคำหลอกเพิ่มได้ (ไม่บังคับ) — ระบบสร้าง id ให้เอง (b1.. / w1.. / d1..) ครูไม่ต้องรู้จัก {{id}}
 */

const BLANK_PATTERN = /_{3,}/g;

export interface DragDropFormState {
  template: string; // โจทย์ที่มี ___ ตรงช่องว่าง
  answers: string[]; // คำตอบที่ถูกของแต่ละช่อง ตามลำดับที่ ___ ปรากฏ
  distractors: string[]; // คำหลอก
}

export type BuildResult =
  | { ok: true; data: DragDropAnswerData }
  | { ok: false; errors: string[] };

export function countBlanks(template: string): number {
  return (template.match(BLANK_PATTERN) ?? []).length;
}

/** ปรับความยาวอาเรย์คำตอบให้เท่าจำนวนช่องว่าง (เก็บของเดิมไว้เท่าที่มี) — ใช้ตอนครูพิมพ์โจทย์เปลี่ยนไป */
export function resizeAnswers(answers: string[], blankCount: number): string[] {
  return Array.from({ length: blankCount }, (_, i) => answers[i] ?? '');
}

export function buildDragDropAnswerData(state: DragDropFormState): BuildResult {
  const errors: string[] = [];
  const template = state.template ?? '';

  if (template.trim() === '') errors.push('กรุณากรอกโจทย์');
  if (/\{\{|\}\}/.test(template)) errors.push('โจทย์ห้ามมีเครื่องหมาย {{ หรือ }}');

  const parts = template.split(BLANK_PATTERN);
  const blankCount = parts.length - 1;
  if (blankCount < 1) errors.push('ต้องมีช่องว่างอย่างน้อย 1 ช่อง (พิมพ์ ___ ตรงตำแหน่งที่จะให้เติมคำ)');

  const answers = resizeAnswers(state.answers ?? [], Math.max(blankCount, 0)).map((a) => a.trim());
  answers.forEach((a, i) => {
    if (a === '') errors.push(`ช่องว่างที่ ${i + 1} ยังไม่ได้ใส่คำตอบที่ถูก`);
  });
  const distractors = (state.distractors ?? []).map((d) => d.trim()).filter((d) => d !== '');

  if (errors.length > 0) return { ok: false, errors };

  const data: DragDropAnswerData = {
    template: parts.map((part, i) => (i < blankCount ? `${part}{{b${i + 1}}}` : part)).join(''),
    blanks: answers.map((_, i) => ({ id: `b${i + 1}` })),
    words: [
      ...answers.map((text, i) => ({ id: `w${i + 1}`, text })),
      ...distractors.map((text, i) => ({ id: `d${i + 1}`, text })),
    ],
    correct_map: Object.fromEntries(answers.map((_, i) => [`b${i + 1}`, `w${i + 1}`])),
  };

  // กฎที่เหลือ (คำซ้ำ ยาวเกิน จำนวนเกินลิมิต ฯลฯ) ใช้ตัวตรวจกลางตัวเดียวกับ server
  const parsed = parseDragDropAnswerData(data);
  return parsed.ok ? { ok: true, data } : { ok: false, errors: parsed.errors };
}

/** แปลง answer_data ที่บันทึกไว้กลับเป็นสถานะฟอร์ม (ตอนเปิดแก้ไข) — null ถ้าข้อมูลผิดรูปแบบ */
export function parseDragDropToForm(answerData: unknown): DragDropFormState | null {
  const parsed = parseDragDropAnswerData(answerData);
  if (!parsed.ok) return null;
  const { template, blanks, words, correct_map } = parsed.data;
  const textById = new Map(words.map((w) => [w.id, w.text]));
  const usedWordIds = new Set(Object.values(correct_map));
  let formTemplate = template;
  for (const b of blanks) formTemplate = formTemplate.replace(`{{${b.id}}}`, '___');
  return {
    template: formTemplate,
    answers: blanks.map((b) => textById.get(correct_map[b.id]) ?? ''),
    distractors: words.filter((w) => !usedWordIds.has(w.id)).map((w) => w.text),
  };
}

/** ข้อความโจทย์แบ่งเป็นท่อน ๆ (text / blank) เพื่อเรนเดอร์ — placeholder ที่ไม่รู้จักถือเป็นข้อความธรรมดา */
export type TemplateSegment = { type: 'text'; text: string } | { type: 'blank'; id: string };

export function splitTemplate(template: string, blankIds: string[]): TemplateSegment[] {
  const known = new Set(blankIds);
  const segments: TemplateSegment[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (!known.has(m[1])) continue;
    const start = m.index ?? 0;
    if (start > last) segments.push({ type: 'text', text: template.slice(last, start) });
    segments.push({ type: 'blank', id: m[1] });
    last = start + m[0].length;
  }
  if (last < template.length) segments.push({ type: 'text', text: template.slice(last) });
  return segments;
}

/** ประโยคเฉลย (แทนช่องว่างด้วยคำที่ถูก) + คำหลอก — ใช้แสดงในหน้าตรวจ/เฉลยของครูและแอดมิน; null ถ้าข้อมูลผิดรูปแบบ */
export type CorrectSegment = { type: 'text'; text: string } | { type: 'word'; text: string };

export function describeDragDropAnswer(
  answerData: unknown
): { segments: CorrectSegment[]; distractors: string[] } | null {
  const parsed = parseDragDropAnswerData(answerData);
  if (!parsed.ok) return null;
  const { template, blanks, words, correct_map } = parsed.data;
  const textById = new Map(words.map((w) => [w.id, w.text]));
  const used = new Set(Object.values(correct_map));
  const segments: CorrectSegment[] = splitTemplate(
    template,
    blanks.map((b) => b.id)
  ).map((seg) =>
    seg.type === 'text' ? seg : { type: 'word', text: textById.get(correct_map[seg.id]) ?? '' }
  );
  return { segments, distractors: words.filter((w) => !used.has(w.id)).map((w) => w.text) };
}
