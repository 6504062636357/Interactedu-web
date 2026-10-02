"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
// ===== เพิ่มใหม่: drag & drop สำหรับ sequencing (แทนปุ่มลูกศรขึ้น/ลงเดิม — ตาม feedback ว่า
// hit target เล็ก กดยากบนมือถือ/แท็บเล็ต) ใช้ @dnd-kit ที่มีอยู่ใน dependencies แล้ว รองรับทั้ง
// pointer (เมาส์/ทัช) และ keyboard (accessibility) ในตัว ไม่ต้องเขียน drag logic เอง
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FinalExamReviewItem } from "@/lib/scorm/grade-final-quiz";
import type { DragDropDisplay, ExamInteractionType } from "@/types/interaction";
import DragDropQuestion from "@/components/courses/DragDropQuestion";
import { isComplete, sanitizePlacements } from "@/lib/quiz/drag-drop-state";
import { splitTemplate } from "@/lib/quiz/drag-drop-form";

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (อ่านอย่างเดียวฝั่งนักเรียน ไม่มี logic แก้ไข) =====
interface ImagePin { id: string; x: number; y: number }

interface Question {
  id: string;
  lessonTitle: string;
  questionText: string;
  imageUrl: string | null;
  imageCaption: string | null;
  imagePins: ImagePin[] | null;
  interactionType: ExamInteractionType;
  choices: string[];
  matching: { left: string[]; rightOptions: string[] } | null;
  sequencing: { id: string; text: string }[] | null;
  dragDrop?: DragDropDisplay | null;
}

// ===== เพิ่มใหม่: คำตอบของนักเรียน 1 ข้อ เปลี่ยนจาก number (choiceIndex เดิม) เป็น union type
// เพราะ matching/sequencing ไม่มี choiceIndex ให้ใช้ =====
type AnswerValue =
  | { type: "choice"; choiceIndex: number }
  | { type: "multi"; choiceIndexes: number[] } // multi_select: index ของทุกตัวเลือกที่ติ๊ก
  | { type: "matching"; pairs: Record<string, string> } // left text -> right text ที่นักเรียนเลือก
  | { type: "dragdrop"; placements: Record<string, string> } // blank id -> word id ที่วางไว้
  | { type: "sequencing"; order: string[] }; // ลำดับ item id ตามที่นักเรียนจัด

interface ExamData {
  courseTitle: string;
  passPercentage: number;
  totalLessons: number;
  completedLessons: number;
  eligible: boolean;
  questions: Question[];
}

interface Result {
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  pass_percentage: number;
  passed: boolean;
  certificate_issued: boolean;
  certificate_download_url: string | null;
  message: string;
  // ===== เพิ่มใหม่: เฉลยรายข้อ — server ส่งมา "เฉพาะตอนสอบผ่านแล้ว" เท่านั้น (ตอนไม่ผ่านเป็น undefined)
  review?: FinalExamReviewItem[];
}

// ===== เพิ่มใหม่: ขาดอีกกี่ข้อถึงจะผ่าน — หาจำนวนข้อถูกที่น้อยที่สุดที่ทำให้คะแนน >= เกณฑ์ผ่าน
// (ใช้สูตรปัดเศษเดียวกับ server: round(correct/total*10000)/100) แล้วลบด้วยจำนวนที่ตอบถูกแล้ว =====
function questionsMissingToPass(correct: number, total: number, passPercentage: number): number {
  for (let needed = correct; needed <= total; needed += 1) {
    if (Math.round((needed / total) * 10000) / 100 >= passPercentage) return needed - correct;
  }
  return Math.max(total - correct, 0);
}

// ===== เพิ่มใหม่: ไอคอนจุด 6 จุด (drag handle) — visual cue มาตรฐานสากลว่า "ลากได้" ตาม feedback UX =====
function DragHandleIcon() {
  return (
    <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="2.5" r="1.6" />
      <circle cx="9.5" cy="2.5" r="1.6" />
      <circle cx="2.5" cy="9" r="1.6" />
      <circle cx="9.5" cy="9" r="1.6" />
      <circle cx="2.5" cy="15.5" r="1.6" />
      <circle cx="9.5" cy="15.5" r="1.6" />
    </svg>
  );
}

// ===== เพิ่มใหม่: แถวเดียวของรายการ sequencing ที่ลากสลับตำแหน่งได้ — drag handle แยกจากตัวรายการ
// (attributes/listeners ผูกกับปุ่ม handle เท่านั้น) กันไม่ให้แค่แตะตัวข้อความก็ลากหลุดมือโดยไม่ตั้งใจ
function SequencingRow({ id, index, text }: { id: string; index: number; text: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  // เลย์เอาต์เดียวกับ Pop-up Quiz: วงกลมเลขขอบส้ม → ข้อความ → ปุ่มลาก (handle) สีเทาอยู่ขวาสุด
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 rounded-[10px] border-[1.5px] bg-white px-3 py-2.5 transition ${
        isDragging ? "z-10 border-[#FF5A3C] shadow-[0_6px_16px_rgba(15,27,61,0.14)]" : "border-slate-200"
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#FF5A3C] text-[12px] font-extrabold text-[#FF5A3C]">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] text-[#0F1B3D]">{text}</span>
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-[34px] w-[34px] shrink-0 touch-none items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:shadow-[0_0_0_3px_rgba(15,27,61,0.18)] active:cursor-grabbing"
        style={{ cursor: "grab" }}
        aria-label={`ลาก "${text}" เพื่อสลับลำดับ`}
      >
        <DragHandleIcon />
      </button>
    </div>
  );
}

// ===== เพิ่มใหม่: DndContext ต่อคำถาม 1 ข้อ — scope sensor/context แยกกันแต่ละข้อ ป้องกันลากข้าม
// คำถามกันได้เอง (SortableContext items เป็น order ของข้อนั้นๆ เท่านั้น)
function SequencingList({
  items,
  order,
  onReorder,
}: {
  items: { id: string; text: string }[];
  order: string[];
  onReorder: (nextOrder: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const itemById = new Map(items.map((item) => [item.id, item.text]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {order.map((itemId, index) => (
            <SequencingRow key={itemId} id={itemId} index={index} text={itemById.get(itemId) ?? itemId} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// เลขหมุดบนภาพที่ผูกกับรายการฝั่งซ้าย: ถ้าข้อความฝั่งซ้ายลงท้ายด้วยตัวเลข (เช่น "ตำแหน่ง 3") ถือว่าหมายถึงหมุดเลขนั้น
// (ตรรกะเดียวกับ Pop-up Quiz ใน generate.ts) ไม่มีเลข = ใช้ลำดับแถวเป็นเลข badge และไม่ผูกกับหมุด
function pinNumberOf(leftText: string): number | null {
  const match = /(\d+)\s*$/.exec(leftText.trim());
  return match ? parseInt(match[1], 10) : null;
}

export default function CourseFinalExam({ courseId }: { courseId: string }) {
  const router = useRouter();
  // แถวจับคู่ที่กำลัง hover/โฟกัส (ไฮไลต์หมุดบนภาพที่คู่กัน) — เก็บแยกต่อคำถาม
  const [activeMatchRow, setActiveMatchRow] = useState<{ questionId: string; left: string } | null>(null);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [result, setResult] = useState<Result | null>(null);
  // ===== เพิ่มใหม่: หน้าสรุปผล (summary) หรือหน้าเฉลยละเอียด (review) — review เปิดได้เฉพาะตอนสอบผ่าน =====
  const [view, setView] = useState<"summary" | "review">("summary");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/final-exam`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "โหลดข้อสอบไม่สำเร็จ");
        return data as ExamData;
      })
      .then(setExam)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "โหลดข้อสอบไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [courseId]);

  // ===== เพิ่มใหม่: เช็คว่าข้อนี้ "ตอบแล้ว" หรือยัง ตามชนิดคำถาม =====
  // sequencing ถือว่าตอบแล้วเสมอ เพราะมีลำดับตั้งต้นให้อยู่แล้ว (นักเรียนแค่จัดใหม่ถ้าคิดว่าลำดับผิด)
  function isAnswered(question: Question, answer: AnswerValue | undefined): boolean {
    if (question.interactionType === "sequencing") return true;
    if (question.interactionType === "drag_drop") {
      return !!question.dragDrop && answer?.type === "dragdrop" && isComplete(question.dragDrop.blankIds, answer.placements);
    }
    if (question.interactionType === "multi_select") return answer?.type === "multi" && answer.choiceIndexes.length > 0;
    if (question.interactionType === "matching") {
      const leftItems = question.matching?.left ?? [];
      if (leftItems.length === 0) return false;
      return leftItems.every((left) => Boolean(answer?.type === "matching" && answer.pairs[left]));
    }
    return answer?.type === "choice";
  }

  async function submitExam() {
    const answeredCount = exam?.questions.filter((question) => isAnswered(question, answers[question.id])).length ?? 0;
    if (!exam || answeredCount !== exam.questions.length) {
      setError("กรุณาตอบคำถามให้ครบทุกข้อ");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/final-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: exam.questions.map((question) => {
            const answer = answers[question.id];
            if (question.interactionType === "matching") {
              const leftItems = question.matching?.left ?? [];
              return {
                questionId: question.id,
                matchingPairs: leftItems.map((left) => ({
                  left,
                  right: (answer?.type === "matching" ? answer.pairs[left] : undefined) ?? "",
                })),
              };
            }
            if (question.interactionType === "sequencing") {
              return {
                questionId: question.id,
                sequenceOrder:
                  answer?.type === "sequencing" ? answer.order : (question.sequencing ?? []).map((item) => item.id),
              };
            }
            if (question.interactionType === "drag_drop") {
              return {
                questionId: question.id,
                dragDropPlacements: sanitizePlacements(
                  question.dragDrop?.blankIds ?? [],
                  (question.dragDrop?.words ?? []).map((w) => w.id),
                  answer?.type === "dragdrop" ? answer.placements : {}
                ),
              };
            }
            if (question.interactionType === "multi_select") {
              return {
                questionId: question.id,
                selectedChoiceIndexes: answer?.type === "multi" ? [...answer.choiceIndexes].sort((a, b) => a - b) : [],
              };
            }
            return {
              questionId: question.id,
              selectedChoiceIndex: answer?.type === "choice" ? answer.choiceIndex : undefined,
            };
          }),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ส่งข้อสอบไม่สำเร็จ");
      setResult(data as Result);
      setView("summary");
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ส่งข้อสอบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-24 text-center text-sm text-[#0F1B3D]/50">กำลังเตรียมข้อสอบ...</div>;
  if (error && !exam) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if (!exam) return null;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link href={`/dashboard/student/courses/${courseId}`} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[#0F1B3D]/55 hover:text-[#0F1B3D]">
        <span aria-hidden="true">←</span> กลับหน้าคอร์ส
      </Link>

      <section className="overflow-hidden rounded-3xl bg-[#0F1B3D] p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#FF8066]">Course Final Exam</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">บททดสอบท้ายคอร์ส</h1>
        <p className="mt-2 text-sm text-white/65">{exam.courseTitle}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat value={`${exam.questions.length}`} label="ข้อ" />
          <Stat value={`${exam.passPercentage}%`} label="เกณฑ์ผ่าน" />
          <Stat value={`${exam.completedLessons}/${exam.totalLessons}`} label="เรียนจบ" />
        </div>
      </section>

      {!exam.eligible ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-extrabold text-amber-900">ยังเริ่มทำข้อสอบไม่ได้</h2>
          <p className="mt-1 text-sm text-amber-800">กรุณาเรียนให้ครบทุกบทก่อน ปัจจุบันเรียนจบ {exam.completedLessons} จาก {exam.totalLessons} บท</p>
        </section>
      ) : exam.questions.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-dashed border-[#0F1B3D]/15 p-10 text-center text-sm text-[#0F1B3D]/50">
          คอร์สนี้ยังไม่มีบททดสอบท้ายคอร์ส กรุณาแจ้งผู้ดูแลคอร์สให้เพิ่มคำถามอย่างน้อย 1 ข้อ
        </section>
      ) : result && result.passed && view === "review" ? (
        // ===== เพิ่มใหม่: หน้าเฉลยและคำอธิบายละเอียด — แสดงเฉพาะตอนสอบผ่านแล้ว =====
        <ReviewAnswers
          review={result.review ?? []}
          onBack={() => {
            setView("summary");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : result && result.passed ? (
        // ===== เพิ่มใหม่: หน้ายินดี (สอบผ่าน) — ปุ่มดูใบประกาศนียบัตร + ปุ่มดูเฉลยและคำอธิบายละเอียด =====
        <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-center">
          <h2 className="mt-3 text-2xl font-black text-emerald-700">ยินดีด้วย! คุณสอบผ่านแล้ว</h2>
          <div className="mt-4 text-5xl font-black text-[#0F1B3D]">{result.correct_answers}/{result.total_questions}</div>
          <p className="mt-1 text-sm font-bold text-[#0F1B3D]/60">
            ได้ {result.correct_answers}/{result.total_questions} ข้อ ({result.score_percentage}%) เกณฑ์ผ่าน {result.pass_percentage}%
          </p>
          {result.message && result.message !== "สอบผ่านแล้ว" && (
            <p className="mt-3 text-sm text-[#0F1B3D]/60">{result.message}</p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href={result.certificate_download_url ?? "/dashboard/student/certificates"}
              className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white"
            >
              ดูใบประกาศนียบัตร (Certificate)
            </a>
            <button
              type="button"
              onClick={() => {
                setView("review");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-full bg-[#0F1B3D] px-6 py-3 text-sm font-extrabold text-white"
            >
              ดูเฉลยและคำอธิบายละเอียด (Review Answers)
            </button>
            <Link href={`/dashboard/student/courses/${courseId}`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-6 py-3 text-sm font-extrabold text-[#0F1B3D]">กลับหน้าคอร์ส</Link>
          </div>
        </section>
      ) : result ? (
        // ===== แก้: สอบไม่ผ่าน (ยังอยู่ในลูปสอบซ้ำ) — แสดงคะแนนเป็นจำนวนข้อ + เปอร์เซ็นต์ + ขาดอีกกี่ข้อ
        // และ "ไม่แสดงเฉลย" ใดๆ (server ก็ไม่ส่งเฉลยมาให้ด้วย) =====
        <section className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-7 text-center">
          <div className="text-5xl font-black text-[#0F1B3D]">{result.correct_answers}/{result.total_questions}</div>
          <h2 className="mt-2 text-xl font-black text-orange-700">คะแนนยังไม่ถึงเกณฑ์</h2>
          <p className="mt-2 text-sm font-bold text-[#0F1B3D]/70">
            ได้ {result.correct_answers}/{result.total_questions} ข้อ ({result.score_percentage}%) เกณฑ์ผ่าน {result.pass_percentage}%
          </p>
          <p className="mt-1 text-sm font-semibold text-orange-700">
            ขาดอีก {questionsMissingToPass(result.correct_answers, result.total_questions, result.pass_percentage)} ข้อถึงจะผ่าน
          </p>
          <p className="mt-3 text-[13px] text-[#0F1B3D]/50">ทบทวนบทเรียนแล้วลองทำใหม่ได้ เฉลยและคำอธิบายจะเปิดให้ดูเมื่อสอบผ่านแล้ว</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => { setResult(null); setAnswers({}); setView("summary"); }} className="rounded-full bg-[#0F1B3D] px-6 py-3 text-sm font-extrabold text-white">ทำข้อสอบใหม่</button>
            <Link href={`/dashboard/student/courses/${courseId}`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-6 py-3 text-sm font-extrabold text-[#0F1B3D]">กลับหน้าคอร์ส</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="mt-6 space-y-5">
            {exam.questions.map((question, index) => (
              <section key={question.id} className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FF5A3C]/10 text-sm font-black text-[#FF5A3C]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">{question.lessonTitle}</p>
                    <h2 className="mt-1.5 text-[16.5px] font-extrabold leading-6 text-[#0F1B3D]">{question.questionText}</h2>
                    {/* ===== เพิ่มใหม่: sub-text อธิบายวิธีตอบ ตาม interactionType (ตาม feedback UX) ===== */}
                    {question.interactionType === "matching" && (
                      <p className="mt-1 text-[12.5px] text-[#0F1B3D]/45">เลือกคำตอบฝั่งขวาที่จับคู่กับฝั่งซ้ายให้ถูกต้อง</p>
                    )}
                    {question.interactionType === "multi_select" && (
                      <p className="mt-1 text-[12.5px] text-[#0F1B3D]/45">เลือกได้หลายคำตอบ — ติ๊กทุกข้อที่ถูก (ต้องเลือกให้ครบจึงจะได้คะแนน)</p>
                    )}
                    {question.interactionType === "drag_drop" && (
                      <p className="mt-1 text-[12.5px] text-[#0F1B3D]/45">ลากคำจากคลังไปวางในช่องว่าง (หรือแตะคำ แล้วคำจะลงช่องว่างช่องแรกที่ว่าง) — แตะคำในช่องเพื่อเอาออก</p>
                    )}
                    {question.interactionType === "sequencing" && (
                      <p className="mt-1 text-[12.5px] text-[#0F1B3D]/45">ลากรายการด้านล่างเพื่อจัดเรียงลำดับจากบนลงล่างให้ถูกต้อง</p>
                    )}
                    {question.imageUrl && (
                      /* ===== แก้เพิ่ม: คำบรรยายอยู่ด้านล่างภาพ ชิดภาพไม่เว้นช่องว่าง (mt-0) จัดกึ่งกลาง
                          เทียบกับความกว้างของรูป (กล่องนอกเป็น inline-block) ไม่ใช่กึ่งกลางการ์ด ===== */
                      <div className="mt-3 mb-1 inline-block max-w-full">
                        {/* ===== แก้: เอา w-full ออก — object-contain + w-full ทำให้กรอบรูปใหญ่กว่าเนื้อรูปจริง หมุด % เลยคลาดเคลื่อน เปลี่ยนเป็น max-w-full + ครอบด้วย inline-block ให้กรอบเท่าเนื้อรูปจริง ===== */}
                        <div className="relative">
                          <img
                            src={question.imageUrl}
                            alt=""
                            className="max-h-64 max-w-full rounded-xl border border-[#0F1B3D]/[0.08] object-contain bg-[#F1F5F9]"
                          />
                          {/* ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (อ่านอย่างเดียว) ===== */}
                          {(question.imagePins ?? []).map((pin, pinIndex) => {
                            // ข้อจับคู่: หมุดคู่กับแถวที่ข้อความลงท้ายด้วยเลขหมุด — เรืองแสงตอน hover/โฟกัสแถว, เปลี่ยนเป็นสีกรมเมื่อแถวนั้นจับคู่แล้ว,
                            // กดหมุดเพื่อโฟกัส dropdown ของแถวนั้น (เหมือน Pop-up Quiz)
                            const matchPairs = answers[question.id]?.type === "matching" ? (answers[question.id] as { type: "matching"; pairs: Record<string, string> }).pairs : {};
                            const linkedLeft = question.interactionType === "matching"
                              ? (question.matching?.left ?? []).find((left) => pinNumberOf(left) === pinIndex + 1)
                              : undefined;
                            const isMatchedPin = linkedLeft !== undefined && Boolean(matchPairs[linkedLeft]);
                            const isActivePin = linkedLeft !== undefined && activeMatchRow?.questionId === question.id && activeMatchRow.left === linkedLeft;
                            return (
                              <span
                                key={pin.id}
                                role={linkedLeft !== undefined ? "button" : undefined}
                                onClick={linkedLeft !== undefined ? () => document.getElementById(`match-${question.id}-${(question.matching?.left ?? []).indexOf(linkedLeft)}`)?.focus() : undefined}
                                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[12px] font-bold text-white ring-2 ring-white transition ${
                                  isMatchedPin ? "bg-[#0F1B3D]" : "bg-[#FF5A3C]"
                                } ${isActivePin ? "scale-125 shadow-[0_0_0_5px_rgba(255,90,60,0.3)]" : ""} ${linkedLeft !== undefined ? "cursor-pointer" : ""}`}
                                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                              >
                                {pinIndex + 1}
                              </span>
                            );
                          })}
                        </div>
                        {question.imageCaption && (
                          <p className="mt-0 text-center text-[12.5px] font-semibold text-[#0F1B3D]/70">{question.imageCaption}</p>
                        )}
                      </div>
                    )}
                    {(question.interactionType === "multiple_choice" || question.interactionType === "true_false") && (
                      <div className="mt-4 space-y-2.5">
                        {question.choices.map((choice, choiceIndex) => {
                          const currentAnswer = answers[question.id];
                          const checked = currentAnswer?.type === "choice" && currentAnswer.choiceIndex === choiceIndex;
                          return (
                            <label key={choiceIndex} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${checked ? "border-[#FF5A3C] bg-[#FF5A3C]/[0.06] text-[#0F1B3D]" : "border-[#0F1B3D]/[0.08] hover:bg-[#F7F8FA]"}`}>
                              <input type="radio" name={question.id} checked={checked} onChange={() => setAnswers((current) => ({ ...current, [question.id]: { type: "choice", choiceIndex } }))} className="accent-[#FF5A3C]" />
                              {choice}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* ===== multi_select — เลือกได้หลายคำตอบ (checkbox) ===== */}
                    {question.interactionType === "multi_select" && (
                      <div className="mt-4 space-y-2.5" role="group" aria-label="เลือกได้หลายคำตอบ">
                        {question.choices.map((choice, choiceIndex) => {
                          const currentAnswer = answers[question.id];
                          const selected = currentAnswer?.type === "multi" ? currentAnswer.choiceIndexes : [];
                          const checked = selected.includes(choiceIndex);
                          return (
                            <label key={choiceIndex} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${checked ? "border-[#FF5A3C] bg-[#FF5A3C]/[0.06] text-[#0F1B3D]" : "border-[#0F1B3D]/[0.08] hover:bg-[#F7F8FA]"}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setAnswers((current) => {
                                    const prev = current[question.id]?.type === "multi" ? (current[question.id] as { type: "multi"; choiceIndexes: number[] }).choiceIndexes : [];
                                    const next = prev.includes(choiceIndex) ? prev.filter((i) => i !== choiceIndex) : [...prev, choiceIndex];
                                    return { ...current, [question.id]: { type: "multi", choiceIndexes: next } };
                                  })
                                }
                                className="h-4 w-4 accent-[#FF5A3C]"
                              />
                              {choice}
                            </label>
                          );
                        })}
                        <p className="text-[12px] font-semibold text-[#0F1B3D]/40">
                          เลือกแล้ว {answers[question.id]?.type === "multi" ? (answers[question.id] as { type: "multi"; choiceIndexes: number[] }).choiceIndexes.length : 0} ข้อ
                        </p>
                      </div>
                    )}

                    {/* ===== matching — จับคู่ซ้าย-ขวา ด้วย dropdown ต่อรายการซ้าย (ปรับสไตล์ใหม่ตาม
                    feedback: การ์ด 2 ฝั่งซ้าย-ขวา + เส้นประเชื่อม แทนแถวเรียบๆ เดิม) ===== */}
                    {question.interactionType === "matching" && question.matching && (
                      <div className="mt-4">
                        {(() => {
                          const currentAnswerAll = answers[question.id];
                          const pairsAll = currentAnswerAll?.type === "matching" ? currentAnswerAll.pairs : {};
                          const total = question.matching!.left.length;
                          const filledCount = question.matching!.left.filter((left) => Boolean(pairsAll[left])).length;
                          return (
                            <>
                              {/* หัวข้อ "จับคู่แล้ว N/M" + แถบความคืบหน้าแบ่งช่อง (เหมือน Pop-up Quiz) */}
                              <div className="mb-2.5 flex items-center justify-between gap-2.5">
                                <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-[#0F1B3D]/55">จับคู่แล้ว {filledCount}/{total}</span>
                                <div className="flex flex-1 gap-1" aria-hidden="true">
                                  {question.matching!.left.map((_, i) => (
                                    <span key={i} className={`h-1 flex-1 rounded-full transition ${i < filledCount ? "bg-[#0F1B3D]" : "bg-slate-200"}`} />
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2.5">
                                {question.matching!.left.map((left, leftIndex) => {
                                  const selectedRight = pairsAll[left] ?? "";
                                  const isFilled = Boolean(selectedRight);
                                  const isActive = activeMatchRow?.questionId === question.id && activeMatchRow.left === left;
                                  const badgeNumber = pinNumberOf(left) ?? leftIndex + 1;
                                  return (
                                    <div
                                      key={left}
                                      className="flex items-center gap-2"
                                      onMouseEnter={() => setActiveMatchRow({ questionId: question.id, left })}
                                      onMouseLeave={() => setActiveMatchRow(null)}
                                    >
                                      <span
                                        className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white transition ${
                                          isFilled ? "bg-[#0F1B3D]" : "bg-[#FF5A3C]"
                                        } ${isActive && !isFilled ? "shadow-[0_0_0_3px_rgba(255,90,60,0.25)]" : ""}`}
                                      >
                                        {badgeNumber}
                                      </span>
                                      <div className={`flex min-w-0 flex-[1_1_40%] items-center rounded-[10px] border-[1.5px] bg-[#F7F8FA] px-3 py-2.5 transition ${isActive ? "border-[#0F1B3D]/35" : "border-slate-200"}`}>
                                        <span className="min-w-0 truncate text-[13.5px] font-semibold text-[#0F1B3D]">{left}</span>
                                      </div>
                                      {/* เส้นเชื่อม: ว่าง = เส้นประเทา / จับคู่แล้ว = เส้นทึบสีกรม + จุดปลาย */}
                                      <div
                                        className={`relative h-0 w-[18px] shrink-0 border-t-2 transition ${isFilled ? "border-solid border-[#0F1B3D]" : "border-dashed border-slate-300"}`}
                                        aria-hidden="true"
                                      >
                                        <span className={`absolute -right-[3px] -top-[4px] h-[7px] w-[7px] rounded-full ${isFilled ? "bg-[#0F1B3D]" : "bg-slate-300"}`} />
                                      </div>
                                      <select
                                        id={`match-${question.id}-${leftIndex}`}
                                        value={selectedRight}
                                        onFocus={() => setActiveMatchRow({ questionId: question.id, left })}
                                        onBlur={() => setActiveMatchRow(null)}
                                        onChange={(event) => {
                                          const nextRight = event.target.value;
                                          setAnswers((current) => {
                                            const prevPairs = current[question.id]?.type === "matching" ? (current[question.id] as { type: "matching"; pairs: Record<string, string> }).pairs : {};
                                            return { ...current, [question.id]: { type: "matching", pairs: { ...prevPairs, [left]: nextRight } } };
                                          });
                                        }}
                                        className={`min-w-0 flex-[1_1_45%] cursor-pointer rounded-[10px] border-[1.5px] px-3 py-2.5 text-[13.5px] outline-none transition focus:border-[#0F1B3D] focus:shadow-[0_0_0_3px_rgba(15,27,61,0.18)] ${
                                          isFilled
                                            ? "border-[#0F1B3D] bg-[#0F1B3D]/[0.06] font-semibold text-[#0F1B3D]"
                                            : "border-slate-200 bg-white text-[#0F1B3D]"
                                        }`}
                                      >
                                        <option value="">— เลือกคำตอบ —</option>
                                        {question.matching!.rightOptions.map((right) => {
                                          const takenByOtherLeft = Object.entries(pairsAll).some(
                                            ([otherLeft, otherRight]) => otherLeft !== left && otherRight === right
                                          );
                                          return (
                                            <option key={right} value={right} disabled={takenByOtherLeft}>
                                              {takenByOtherLeft ? `${right} (เลือกแล้ว)` : right}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {question.interactionType === "drag_drop" && question.dragDrop && (
                      <DragDropQuestion
                        display={question.dragDrop}
                        value={answers[question.id]?.type === "dragdrop" ? (answers[question.id] as { type: "dragdrop"; placements: Record<string, string> }).placements : {}}
                        onChange={(placements) =>
                          setAnswers((current) => ({ ...current, [question.id]: { type: "dragdrop", placements } }))
                        }
                      />
                    )}

                    {/* ===== sequencing — ลากสลับตำแหน่งจริงด้วย @dnd-kit (แทนปุ่มลูกศรขึ้น/ลงเดิม) ===== */}
                    {question.interactionType === "sequencing" && question.sequencing && (
                      <div className="mt-4">
                        <SequencingList
                          items={question.sequencing}
                          order={
                            answers[question.id]?.type === "sequencing"
                              ? (answers[question.id] as { type: "sequencing"; order: string[] }).order
                              : question.sequencing.map((item) => item.id)
                          }
                          onReorder={(nextOrder) =>
                            setAnswers((current) => ({ ...current, [question.id]: { type: "sequencing", order: nextOrder } }))
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button type="button" onClick={submitExam} disabled={submitting} className="mt-6 w-full rounded-full bg-[#FF5A3C] py-4 text-base font-black text-white shadow-lg shadow-orange-200 transition hover:brightness-105 disabled:opacity-60">
            {submitting
              ? "กำลังตรวจคำตอบ..."
              : `ส่งคำตอบ ${exam.questions.filter((question) => isAnswered(question, answers[question.id])).length}/${exam.questions.length} ข้อ`}
          </button>
        </>
      )}
    </div>
  );
}

// ===== เพิ่มใหม่: หน้าเฉลยและคำอธิบายละเอียด (Review Answers) — แสดงคำตอบของนักเรียนแต่ละข้อ,
// ข้อไหนถูก/ผิด, คำตอบที่ถูกต้อง และคำอธิบายเฉลย รองรับทั้ง 4 ชนิดคำถาม =====
function ReviewAnswers({ review, onBack }: { review: FinalExamReviewItem[]; onBack: () => void }) {
  const correctCount = review.filter((item) => item.isCorrect).length;
  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-[#0F1B3D]">เฉลยและคำอธิบายละเอียด</h2>
          <p className="mt-0.5 text-sm text-[#0F1B3D]/55">ตอบถูก {correctCount} จาก {review.length} ข้อ</p>
        </div>
        <button type="button" onClick={onBack} className="rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2.5 text-sm font-extrabold text-[#0F1B3D]">← กลับหน้าสรุปผล</button>
      </div>

      {review.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[#0F1B3D]/15 p-8 text-center text-sm text-[#0F1B3D]/50">ไม่พบข้อมูลเฉลยของการสอบครั้งนี้</p>
      )}

      {review.map((item, index) => (
        <section
          key={item.questionId}
          className={`rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${item.isCorrect ? "border-emerald-200" : "border-red-200"}`}
        >
          <div className="flex items-start gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black ${item.isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">{item.lessonTitle}</p>
                <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${item.isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {item.isCorrect ? "✓ ตอบถูก" : "✗ ตอบผิด"}
                </span>
              </div>
              <h3 className="mt-1.5 text-[16.5px] font-extrabold leading-6 text-[#0F1B3D]">{item.questionText}</h3>
              {item.imageUrl && (
                /* ===== แก้เพิ่ม: คำบรรยายอยู่ด้านล่างภาพ ชิดภาพไม่เว้นช่องว่าง (บั๊กเดียวกับฝั่งคำถาม) ===== */
                <div className="mt-3 mb-1 inline-block max-w-full">
                  {/* ===== แก้: เอา w-full ออก (บั๊กเดียวกับฝั่งคำถาม) ===== */}
                  <div className="relative">
                    <img src={item.imageUrl} alt="" className="max-h-64 max-w-full rounded-xl border border-[#0F1B3D]/[0.08] object-contain bg-[#F1F5F9]" />
                    {/* ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (อ่านอย่างเดียว) ===== */}
                    {(item.imagePins ?? []).map((pin, pinIndex) => (
                      <span
                        key={pin.id}
                        className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[12px] font-bold text-white ring-2 ring-white"
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      >
                        {pinIndex + 1}
                      </span>
                    ))}
                  </div>
                  {item.imageCaption && (
                    <p className="mt-0 text-center text-[12.5px] font-semibold text-[#0F1B3D]/70">{item.imageCaption}</p>
                  )}
                </div>
              )}

              {/* multiple_choice / true_false — ไฮไลต์คำตอบที่ถูก และคำตอบที่นักเรียนเลือก */}
              {item.choices && (
                <div className="mt-4 space-y-2.5">
                  {item.choices.map((choice, choiceIndex) => {
                    // multi_select: เทียบกับชุด index (หลายข้อ) / ประเภทอื่น: index เดียวเหมือนเดิม
                    const isMultiItem = item.interactionType === "multi_select";
                    const isCorrectChoice = isMultiItem
                      ? (item.correctChoiceIndexes ?? []).includes(choiceIndex)
                      : choiceIndex === item.correctChoiceIndex;
                    const isSelected = isMultiItem
                      ? (item.selectedChoiceIndexes ?? []).includes(choiceIndex)
                      : choiceIndex === item.selectedChoiceIndex;
                    const style = isCorrectChoice
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : isSelected
                        ? "border-red-300 bg-red-50 text-red-900"
                        : "border-[#0F1B3D]/[0.08] text-[#0F1B3D]/70";
                    return (
                      <div key={choiceIndex} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${style}`}>
                        <span>{choice}</span>
                        <span className="shrink-0 text-[12px] font-extrabold">
                          {isCorrectChoice && isSelected && "คำตอบของคุณ · ถูกต้อง"}
                          {isCorrectChoice && !isSelected && "คำตอบที่ถูกต้อง"}
                          {!isCorrectChoice && isSelected && "คำตอบของคุณ"}
                        </span>
                      </div>
                    );
                  })}
                  {(item.interactionType === "multi_select" ? (item.selectedChoiceIndexes ?? []).length === 0 : item.selectedChoiceIndex === null) && (
                    <p className="text-[12.5px] text-[#0F1B3D]/45">คุณไม่ได้เลือกคำตอบในข้อนี้</p>
                  )}
                </div>
              )}

              {/* matching — แต่ละคู่แสดงคำตอบที่เลือก ถ้าผิดแสดงคำตอบที่ถูกกำกับ */}
              {item.matching && (
                <div className="mt-4 space-y-2.5">
                  {item.matching.map((row) => (
                    <div key={row.left} className={`rounded-xl border px-4 py-3 text-sm ${row.isCorrect ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-[#0F1B3D]">{row.left}</span>
                        <span className="text-[#0F1B3D]/35" aria-hidden="true">→</span>
                        <span className={row.isCorrect ? "font-semibold text-emerald-800" : "font-semibold text-red-800 line-through decoration-red-400"}>
                          {row.studentRight || "ไม่ได้เลือก"}
                        </span>
                      </div>
                      {!row.isCorrect && (
                        <p className="mt-1 text-[13px] font-bold text-emerald-700">คำตอบที่ถูกต้อง: {row.correctRight}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* drag_drop — โจทย์พร้อมคำที่นักเรียนวาง เทียบกับคำที่ถูก */}
              {item.dragDrop && (
                <div className="mt-4 rounded-xl border border-[#0F1B3D]/[0.08] bg-white p-4">
                  <p className="whitespace-pre-wrap text-[14.5px] leading-[2.4rem] text-[#0F1B3D]">
                    {splitTemplate(item.dragDrop.template, item.dragDrop.blanks.map((b) => b.id)).map((seg, i) => {
                      if (seg.type === "text") return <span key={i}>{seg.text}</span>;
                      const blank = item.dragDrop?.blanks.find((b) => b.id === seg.id);
                      if (!blank) return null;
                      return blank.isCorrect ? (
                        <span key={i} className="mx-0.5 inline-block rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 font-bold text-emerald-900">
                          {blank.correctWord}
                        </span>
                      ) : (
                        <span key={i} className="mx-0.5 inline-flex flex-wrap items-center gap-1.5 align-middle">
                          <span className="rounded-lg border border-red-300 bg-red-50 px-2.5 font-bold text-red-900 line-through decoration-red-400">
                            {blank.studentWord || "ไม่ได้ตอบ"}
                          </span>
                          <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 font-bold text-emerald-900">{blank.correctWord}</span>
                        </span>
                      );
                    })}
                  </p>
                  <p className="mt-2 text-[12px] font-semibold text-[#0F1B3D]/45">เขียว = คำที่ถูก · แดงขีดฆ่า = คำที่คุณเลือก</p>
                </div>
              )}

              {/* sequencing — เทียบลำดับที่นักเรียนจัดกับลำดับที่ถูกต้อง */}
              {item.sequencing && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-[#0F1B3D]/45">ลำดับของคุณ</p>
                    <ol className="space-y-2">
                      {item.sequencing.studentOrder.map((entry, position) => {
                        const matchesCorrect = item.sequencing?.correctOrder[position]?.id === entry.id;
                        return (
                          <li key={entry.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${matchesCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-[12px] font-black">{position + 1}</span>
                            {entry.text}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-emerald-700">ลำดับที่ถูกต้อง</p>
                    <ol className="space-y-2">
                      {item.sequencing.correctOrder.map((entry, position) => (
                        <li key={entry.id} className="flex items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-[12px] font-black">{position + 1}</span>
                          {entry.text}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {item.explanation && (
                <div className="mt-4 rounded-xl border border-[#0F1B3D]/[0.08] bg-[#F7F8FA] px-4 py-3">
                  <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#FF5A3C]">คำอธิบายเฉลย</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#0F1B3D]/80">{item.explanation}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

      <button type="button" onClick={onBack} className="w-full rounded-full bg-[#0F1B3D] py-4 text-base font-black text-white">← กลับหน้าสรุปผล</button>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-white/[0.07] px-3 py-3 text-center"><div className="text-lg font-black">{value}</div><div className="text-[11px] font-semibold text-white/45">{label}</div></div>;
}
