"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { DragDropDisplay } from "@/types/interaction";
import { splitTemplate } from "@/lib/quiz/drag-drop-form";
import { clearBlank, isComplete, moveWord, tapWord, unusedWords, type Placements } from "@/lib/quiz/drag-drop-state";

/**
 * เติมคำโดยลากคำจากคลังไปวางในช่องว่าง — ใช้ @dnd-kit (ติดตั้งอยู่แล้ว) เหมือน sequencing ใน CourseFinalExam
 * ใช้งานได้ 3 แบบ: ลาก (เมาส์/ทัช) · แตะคำแล้วคำจะลงช่องที่เลือกไว้/ช่องว่างแรก · คีย์บอร์ด (Tab + Enter/Space บนปุ่มคำและช่อง)
 * ไม่ใช้ KeyboardSensor ของ dnd-kit เพราะ Enter/Space ชนกับการกดปุ่มปกติ — คีย์บอร์ดใช้เส้นทาง "แตะ" แทน
 * (state ทั้งหมดผ่านฟังก์ชันบริสุทธิ์ใน lib/quiz/drag-drop-state.ts ที่มีเทสแล้ว)
 */

function WordChip({
  wordId,
  text,
  dragId,
  onTap,
  disabled,
  placed = false,
}: {
  wordId: string;
  text: string;
  dragId: string;
  onTap: () => void;
  disabled?: boolean;
  placed?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { wordId }, disabled });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      disabled={disabled}
      onClick={onTap}
      style={{ touchAction: "manipulation" }}
      className={`rounded-lg border px-3.5 py-1.5 text-sm font-bold transition ${
        placed
          ? "border-transparent bg-transparent text-inherit"
          : "border-[#0F1B3D]/15 bg-white text-[#0F1B3D] shadow-sm hover:border-[#FF5A3C] active:scale-95"
      } ${isDragging ? "opacity-30" : ""} ${disabled ? "cursor-default opacity-60" : "cursor-grab"}`}
    >
      {text}
    </button>
  );
}

function Blank({
  blankId,
  index,
  wordId,
  wordText,
  active,
  disabled,
  onTap,
}: {
  blankId: string;
  index: number;
  wordId: string | null;
  wordText: string | null;
  active: boolean;
  disabled?: boolean;
  onTap: () => void;
}) {
  const drop = useDroppable({ id: `blank:${blankId}`, disabled });
  const filled = wordId !== null && wordText !== null;
  return (
    <span
      ref={drop.setNodeRef}
      className={`mx-0.5 inline-flex min-h-9 min-w-[5.5rem] items-center justify-center rounded-lg border-2 px-1 align-middle transition ${
        filled
          ? "border-[#FF5A3C] bg-[#FF5A3C]/10 text-[#0F1B3D]"
          : drop.isOver
            ? "border-solid border-[#FF5A3C] bg-[#FF5A3C]/15"
            : active
              ? "border-solid border-[#FF5A3C] bg-[#FF5A3C]/[0.06]"
              : "border-dashed border-[#0F1B3D]/30 bg-white"
      }`}
    >
      {filled ? (
        <WordChip wordId={wordId} text={wordText} dragId={`placed:${blankId}`} onTap={onTap} disabled={disabled} placed />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onTap}
          aria-label={`ช่องว่างที่ ${index + 1} ยังว่าง${active ? " (เลือกอยู่)" : ""}`}
          aria-pressed={active}
          className="h-8 w-full min-w-[5rem] rounded-md text-xs font-bold text-[#0F1B3D]/35"
        >
          {index + 1}
        </button>
      )}
    </span>
  );
}

function BankZone({ children }: { children: React.ReactNode }) {
  const drop = useDroppable({ id: "bank" });
  return (
    <div
      ref={drop.setNodeRef}
      className={`mt-4 flex min-h-[4.5rem] flex-wrap gap-2.5 rounded-xl p-3.5 transition ${
        drop.isOver ? "bg-[#FF5A3C]/10" : "bg-[#F7F8FA]"
      }`}
    >
      {children}
    </div>
  );
}

export default function DragDropQuestion({
  display,
  value,
  onChange,
  disabled = false,
}: {
  display: DragDropDisplay;
  value: Placements;
  onChange: (next: Placements) => void;
  disabled?: boolean;
}) {
  const [activeBlank, setActiveBlank] = useState<string | null>(null);
  const [draggingWordId, setDraggingWordId] = useState<string | null>(null);

  // ลากด้วยเมาส์ต้องขยับ ≥6px (กดเฉย ๆ = แตะ) / ทัชต้องกดค้างสั้น ๆ ก่อน เพื่อไม่ให้ชนกับการเลื่อนหน้าจอ
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const textById = new Map(display.words.map((w) => [w.id, w.text]));
  const segments = splitTemplate(display.template, display.blankIds);
  const bankWords = unusedWords(display.words, value);
  const filledCount = display.blankIds.filter((id) => Object.prototype.hasOwnProperty.call(value, id)).length;

  function handleDragStart(event: DragStartEvent) {
    setDraggingWordId((event.active.data.current as { wordId?: string } | undefined)?.wordId ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingWordId(null);
    if (disabled) return;
    const wordId = (event.active.data.current as { wordId?: string } | undefined)?.wordId;
    if (!wordId) return;
    const overId = event.over ? String(event.over.id) : null;
    const fromBlank = String(event.active.id).startsWith("placed:") ? String(event.active.id).slice("placed:".length) : null;
    if (overId && overId.startsWith("blank:")) {
      onChange(moveWord(value, wordId, overId.slice("blank:".length)));
    } else if (fromBlank) {
      onChange(clearBlank(value, fromBlank)); // ลากออกนอกช่อง/ลงคลัง = คืนคำกลับคลัง
    }
    setActiveBlank(null);
  }

  function handleTapWord(wordId: string) {
    if (disabled) return;
    onChange(tapWord(display.blankIds, value, wordId, activeBlank));
    setActiveBlank(null);
  }

  function handleTapBlank(blankId: string) {
    if (disabled) return;
    if (Object.prototype.hasOwnProperty.call(value, blankId)) {
      onChange(clearBlank(value, blankId)); // แตะช่องที่เติมแล้ว = เอาคำออก และเลือกช่องนี้ไว้รอเติมใหม่
      setActiveBlank(blankId);
    } else {
      setActiveBlank((current) => (current === blankId ? null : blankId));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingWordId(null)}
    >
      <div className="mt-4">
        <p className="whitespace-pre-wrap rounded-xl border border-[#0F1B3D]/[0.08] bg-white p-4 text-[14.5px] leading-[2.6rem] text-[#0F1B3D]">
          {segments.map((seg, i) => {
            if (seg.type === "text") return <span key={i}>{seg.text}</span>;
            const blankIndex = display.blankIds.indexOf(seg.id);
            const wordId = Object.prototype.hasOwnProperty.call(value, seg.id) ? value[seg.id] : null;
            return (
              <Blank
                key={i}
                blankId={seg.id}
                index={blankIndex}
                wordId={wordId}
                wordText={wordId ? textById.get(wordId) ?? null : null}
                active={activeBlank === seg.id}
                disabled={disabled}
                onTap={() => handleTapBlank(seg.id)}
              />
            );
          })}
        </p>

        <BankZone>
          {bankWords.length === 0 && (
            <span className="self-center text-[12.5px] text-[#0F1B3D]/40">
              {isComplete(display.blankIds, value) ? "เติมครบทุกช่องแล้ว — แตะที่คำในช่องเพื่อเอาออก" : "ไม่มีคำเหลือในคลัง"}
            </span>
          )}
          {bankWords.map((word) => (
            <WordChip key={word.id} wordId={word.id} text={word.text} dragId={`word:${word.id}`} onTap={() => handleTapWord(word.id)} disabled={disabled} />
          ))}
        </BankZone>

        <p className="mt-2 text-[12px] font-semibold text-[#0F1B3D]/40" aria-live="polite">
          เติมแล้ว {filledCount}/{display.blankIds.length} ช่อง
        </p>
      </div>

      <DragOverlay>
        {draggingWordId ? (
          <div className="rounded-lg border border-[#FF5A3C] bg-[#FF5A3C] px-3.5 py-1.5 text-sm font-bold text-white shadow-lg">
            {textById.get(draggingWordId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
