"use client";

import { useRef } from "react";
import { countBlanks, resizeAnswers, splitTemplate, type DragDropFormState } from "@/lib/quiz/drag-drop-form";
import { DRAG_DROP_LIMITS } from "@/lib/quiz/validators/drag-drop";

/**
 * ตัวสร้างโจทย์ "เติมคำแบบลากไปวาง" — ใช้ร่วมกันทั้ง QuestionBankForm และ CourseExamEditor
 * ครูพิมพ์โจทย์แล้วใส่ ___ ตรงตำแหน่งช่องว่าง → ใส่คำตอบที่ถูกของแต่ละช่อง → เพิ่มคำหลอก (ไม่บังคับ)
 * การตรวจความถูกต้อง (คำซ้ำ/ว่าง/เกินลิมิต) ทำที่ buildDragDropAnswerData ตอนกดบันทึก ไม่ทำซ้ำที่นี่
 */
export default function DragDropAuthoring({
  value,
  onChange,
  disabled = false,
}: {
  value: DragDropFormState;
  onChange: (next: DragDropFormState) => void;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blankCount = countBlanks(value.template);
  const answers = resizeAnswers(value.answers, blankCount);
  const inputClass =
    "w-full rounded-lg border border-[#0F1B3D]/[0.08] bg-[#F7F8FA] px-3.5 py-2 text-[13.5px] outline-none focus:border-[#FF5A3C] focus:bg-white disabled:opacity-70";

  function setTemplate(template: string) {
    // จำนวนช่องเปลี่ยนตามที่พิมพ์ ___ — ปรับอาเรย์คำตอบให้เท่ากันเสมอ (เก็บของเดิมไว้เท่าที่มี)
    onChange({ ...value, template, answers: resizeAnswers(value.answers, countBlanks(template)) });
  }

  function insertBlank() {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.template.length;
    const end = el?.selectionEnd ?? value.template.length;
    const next = `${value.template.slice(0, start)} ___ ${value.template.slice(end)}`;
    setTemplate(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + 5;
      el?.setSelectionRange(pos, pos);
    });
  }

  // พรีวิวโจทย์: แปลง ___ เป็น placeholder เลขช่อง (ใช้ splitTemplate กับ id ชั่วคราว)
  let n = 0;
  const previewTemplate = value.template.replace(/_{3,}/g, () => `{{${++n}}}`);
  const previewSegments = splitTemplate(
    previewTemplate,
    Array.from({ length: blankCount }, (_, i) => String(i + 1))
  );

  return (
    <div className="mt-4 space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#0F1B3D]/70">
            โจทย์ — พิมพ์ <code className="rounded bg-[#0F1B3D]/[0.06] px-1">___</code> ตรงตำแหน่งที่จะให้เติมคำ
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={insertBlank}
            className="shrink-0 rounded-lg border border-[#0F1B3D]/10 px-2.5 py-1 text-xs font-bold text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:opacity-50"
          >
            + แทรกช่องว่าง
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={value.template}
          readOnly={disabled}
          onChange={(e) => setTemplate(e.target.value)}
          rows={4}
          maxLength={DRAG_DROP_LIMITS.maxTemplateLength}
          placeholder={"เช่น supabase.___('courses').___('id, title').___('published', true)"}
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-[12px] text-[#0F1B3D]/45">
          ตอนนี้มี {blankCount} ช่องว่าง (สูงสุด {DRAG_DROP_LIMITS.maxBlanks} ช่อง)
        </p>
      </div>

      {blankCount > 0 && (
        <div className="space-y-2">
          <span className="block text-[13px] font-semibold text-[#0F1B3D]/70">คำตอบที่ถูกของแต่ละช่อง</span>
          {answers.map((answer, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[12px] font-bold text-white">
                {index + 1}
              </span>
              <input
                value={answer}
                readOnly={disabled}
                maxLength={DRAG_DROP_LIMITS.maxWordLength}
                onChange={(e) => onChange({ ...value, answers: answers.map((a, i) => (i === index ? e.target.value : a)) })}
                placeholder={`คำตอบของช่องที่ ${index + 1}`}
                aria-label={`คำตอบที่ถูกของช่องที่ ${index + 1}`}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <span className="block text-[13px] font-semibold text-[#0F1B3D]/70">
          คำหลอก <span className="font-normal text-[#0F1B3D]/40">(ไม่บังคับ — คำที่ไม่ใช่เฉลยของช่องไหนเลย)</span>
        </span>
        {value.distractors.map((word, index) => (
          <div key={index} className="flex items-center gap-2.5">
            <input
              value={word}
              readOnly={disabled}
              maxLength={DRAG_DROP_LIMITS.maxWordLength}
              onChange={(e) => onChange({ ...value, distractors: value.distractors.map((d, i) => (i === index ? e.target.value : d)) })}
              placeholder={`คำหลอกที่ ${index + 1}`}
              aria-label={`คำหลอกที่ ${index + 1}`}
              className={inputClass}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange({ ...value, distractors: value.distractors.filter((_, i) => i !== index) })}
                className="text-xs font-bold text-slate-400 hover:text-red-500"
                aria-label={`ลบคำหลอกที่ ${index + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange({ ...value, distractors: [...value.distractors, ""] })}
            className="text-xs font-bold text-[#3157D5]"
          >
            + เพิ่มคำหลอก
          </button>
        )}
      </div>

      {blankCount > 0 && (
        <div className="rounded-xl border border-[#0F1B3D]/[0.08] bg-[#F7F8FA] p-3.5">
          <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">ตัวอย่างโจทย์ (เฉลย)</p>
          <p className="whitespace-pre-wrap text-[13.5px] leading-8 text-[#0F1B3D]">
            {previewSegments.map((seg, i) =>
              seg.type === "text" ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <span key={i} className="mx-0.5 inline-block rounded-md border border-emerald-300 bg-emerald-50 px-2 font-bold text-emerald-800">
                  {answers[Number(seg.id) - 1]?.trim() || `ช่อง ${seg.id}`}
                </span>
              )
            )}
          </p>
        </div>
      )}
    </div>
  );
}
