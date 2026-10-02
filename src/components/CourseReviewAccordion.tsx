"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { approveLesson, rejectLesson } from "@/app/dashboard/admin/courses/[courseId]/review/actions";
import DragDropAnswerSummary from "@/components/courses/DragDropAnswerSummary";
import type { ExamInteractionType, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";

interface QuizChoice {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  order_index: number;
  video_timestamp_seconds: number | null;
  explanation: string | null;
  image_url?: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ + ประเภทคำถาม/เฉลย (จับคู่/เรียงลำดับ) —
  // เดิมหน้านี้ query ไม่ได้ select field พวกนี้มาเลย ทำให้คำถามจับคู่/เรียงลำดับโชว์เป็นการ์ดเปล่า
  // (ไม่มี quiz_choices ให้ใช้) และรูปก็ไม่เคยมีหมุด/แคปชันให้เห็น (เหมือนบั๊กเดียวกับที่เคยแก้ใน
  // AdminLessonOverview.tsx — ที่นี่เป็นคนละ component คนละ query เลยต้องแก้แยกอีกจุด)
  image_caption?: string | null;
  image_pins?: { id: string; x: number; y: number }[] | null;
  interaction_type?: ExamInteractionType | null;
  answer_data?: MatchingAnswerData | SequencingAnswerData | Record<string, unknown> | null;
  quiz_choices: QuizChoice[];
}

const MATCHING_PAIR_COLORS = ["#0F1B3D", "#00B37E", "#FF8A3D", "#2F8FFF", "#FF4FA3", "#C98500"];

interface VideoQuizMarker {
  id: string;
  timestamp_seconds: number;
  random_difficulty: "easy" | "medium" | "hard";
  order_index: number;
}

interface LessonDraft {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  quiz_questions: QuizQuestion[];
  video_quiz_markers?: VideoQuizMarker[];
}

interface LessonWithDraft {
  id: string;
  title: string;
  order_index: number;
  video_url: string | null;
  latestDraft: LessonDraft | null;
}

interface CourseReviewAccordionProps {
  courseId: string;
  lessons: LessonWithDraft[];
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const difficultyLabel: Record<"easy" | "medium" | "hard", string> = {
  easy: "ง่าย",
  medium: "ปานกลาง",
  hard: "ยาก",
};

// การ์ดแสดงจุดที่ตั้งให้ "สุ่มคำถามจากคลังข้อสอบ" — ไม่มีคำถามตายตัวให้โชว์ (สุ่มไม่ซ้ำต่อผู้เรียนแต่ละคน)
// เลยโชว์แค่ตำแหน่งเวลา + ระดับความยากที่ตั้งไว้ ให้แอดมินเห็นว่าจุดนี้มีอยู่จริงตอนรีวิว
function RandomBankMarkerRow({ marker, index }: { marker: VideoQuizMarker; index: number }): ReactElement {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2 py-0.5 rounded-full shrink-0">
          ⏱ {formatTimestamp(marker.timestamp_seconds)}
        </span>
        <p className="text-[13.5px] font-bold text-[#0F1B3D]">{index + 1}. สุ่มจากคลังข้อสอบ</p>
      </div>
      <p className="text-[13px] text-[#0F1B3D]/60 pl-4">
        ระบบจะสุ่ม 1 ข้อจากคลังระดับ{difficultyLabel[marker.random_difficulty]}ให้ผู้เรียนแต่ละคน (คำถามไม่ตายตัว)
      </p>
    </div>
  );
}

// ปุ่มอนุมัติ/ปฏิเสธ ของ "บทเรียนเดียว" — เรียก server action ระดับ lesson ไม่ใช่ระดับคอร์ส
function LessonReviewActions({
  lessonId,
  draft,
}: {
  lessonId: string;
  draft: LessonDraft;
}): ReactElement | null {
  const [approving, setApproving] = useState<boolean>(false);
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [showRejectForm, setShowRejectForm] = useState<boolean>(false);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isReviewable = draft.status === "submitted" || draft.status === "pending_review";

  if (draft.status === "approved") {
    return (
      <div className="mt-4 rounded-xl bg-[#00B37E]/[0.08] border border-[#00B37E]/20 px-4 py-3">
        <p className="text-[13px] font-bold text-[#00B37E]">✓ บทเรียนนี้อนุมัติแล้ว</p>
      </div>
    );
  }

  if (!isReviewable) {
    // เช่น status = "draft" (ครูยังไม่กดส่งตรวจ) หรือ "rejected"
    return draft.status === "rejected" ? (
      <div className="mt-4 rounded-xl bg-[#EB4A2D]/[0.08] border border-[#EB4A2D]/20 px-4 py-3">
        <p className="text-[13px] font-bold text-[#EB4A2D]">บทเรียนนี้ถูกปฏิเสธ รอครูแก้ไขและส่งใหม่</p>
      </div>
    ) : null;
  }

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setApproving(true);
    const result = await approveLesson(draft.id, lessonId);
    setApproving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleReject = async (): Promise<void> => {
    setError(null);
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผลที่ปฏิเสธ");
      return;
    }
    setRejecting(true);
    const result = await rejectLesson(draft.id, reason);
    setRejecting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setShowRejectForm(false);
    setReason("");
    router.refresh();
  };

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-3 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
        </div>
      )}

      {!showRejectForm ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-white bg-[#00B37E] hover:bg-[#00996b] px-5 py-2.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {approving ? "กำลังสร้าง SCORM..." : "อนุมัติบทนี้"}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(true)}
            disabled={approving}
            className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-[#0F1B3D]/60 border border-[#0F1B3D]/15 px-5 py-2.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
          >
            ปฏิเสธ
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">เหตุผลที่ปฏิเสธ</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="บอกครูว่าต้องแก้ไขอะไรบ้าง"
            className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y mb-3"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-white bg-[#EB4A2D] hover:bg-[#d43f22] px-5 py-2.5 rounded-full transition-colors disabled:opacity-60"
            >
              {rejecting ? "กำลังส่ง..." : "ยืนยันปฏิเสธบทนี้"}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              disabled={rejecting}
              className="flex-1 text-[13.5px] font-bold text-[#0F1B3D]/50 px-5 py-2.5"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseReviewAccordion({
  lessons,
}: CourseReviewAccordionProps): ReactElement {
  const [openLessonId, setOpenLessonId] = useState<string | null>(lessons[0]?.id ?? null);

  const toggleLesson = (lessonId: string): void => {
    setOpenLessonId((prev) => (prev === lessonId ? null : lessonId));
  };

  return (
    <div className="space-y-3">
      {lessons.map((lesson, i) => {
        const isOpen = openLessonId === lesson.id;
        const draft = lesson.latestDraft;
        const hasDraft = draft !== null;

        return (
          <div
            key={lesson.id}
            className="rounded-2xl bg-white border border-[#0F1B3D]/[0.06] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleLesson(lesson.id)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-[#0F1B3D]/40">{i + 1}</span>
                <span className="text-[15px] font-bold text-[#0F1B3D]">{lesson.title}</span>
                {!hasDraft && (
                  <span className="text-[11px] font-bold text-[#EB4A2D] bg-[#EB4A2D]/10 px-2 py-0.5 rounded-full">
                    ยังไม่ส่งร่าง
                  </span>
                )}
                {hasDraft && draft.status === "approved" && (
                  <span className="text-[11px] font-bold text-[#00B37E] bg-[#00B37E]/10 px-2 py-0.5 rounded-full">
                    อนุมัติแล้ว
                  </span>
                )}
                {hasDraft && (draft.status === "submitted" || draft.status === "pending_review") && (
                  <span className="text-[11px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2 py-0.5 rounded-full">
                    รอตรวจ
                  </span>
                )}
                {hasDraft && draft.status === "rejected" && (
                  <span className="text-[11px] font-bold text-[#EB4A2D] bg-[#EB4A2D]/10 px-2 py-0.5 rounded-full">
                    ถูกปฏิเสธ
                  </span>
                )}
              </div>
              <span className="text-[#0F1B3D]/40 text-[13px]">{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="px-6 pb-6 border-t border-[#0F1B3D]/[0.06] pt-4">
                {!hasDraft ? (
                  <p className="text-[13.5px] text-[#0F1B3D]/50">บทเรียนนี้ยังไม่มีร่างส่งเข้ามา</p>
                ) : (
                  <>
                    {draft.video_url && (
                      <div className="mb-6 rounded-xl overflow-hidden bg-black">
                        <video src={draft.video_url} controls className="w-full" />
                      </div>
                    )}

                    {draft.content_html && (
                      <div className="mb-6">
                        <h3 className="text-[13px] font-bold text-[#0F1B3D] mb-2">เนื้อหา</h3>
                        <p className="text-[13.5px] text-[#0F1B3D]/70 leading-relaxed whitespace-pre-line">
                          {draft.content_html}
                        </p>
                      </div>
                    )}

                    {(() => {
                      const fixedQuizzes = draft.quiz_questions.filter((q) => q.video_timestamp_seconds != null);
                      const randomMarkers = draft.video_quiz_markers ?? [];

                      // รวมทั้งคำถามตายตัว (quiz_questions) และจุดสุ่มจากคลัง (video_quiz_markers)
                      // เป็นไทม์ไลน์เดียว เรียงตามวินาทีในวิดีโอ — ไม่งั้นจุดสุ่มจากคลังจะหายไปจากหน้ารีวิวเลย
                      type TimelineItem =
                        | { kind: "fixed"; ts: number; question: QuizQuestion }
                        | { kind: "random"; ts: number; marker: VideoQuizMarker };

                      const timeline: TimelineItem[] = [
                        ...fixedQuizzes.map((q) => ({ kind: "fixed" as const, ts: q.video_timestamp_seconds ?? 0, question: q })),
                        ...randomMarkers.map((m) => ({ kind: "random" as const, ts: m.timestamp_seconds, marker: m })),
                      ].sort((a, b) => a.ts - b.ts);

                      const renderQuestion = (q: QuizQuestion, qi: number) => {
                        const interactionType = q.interaction_type ?? "multiple_choice";
                        const matchingData = interactionType === "matching" ? (q.answer_data as MatchingAnswerData | null) : null;
                        const sequencingData = interactionType === "sequencing" ? (q.answer_data as SequencingAnswerData | null) : null;
                        return (
                          <div key={q.id}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[11px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2 py-0.5 rounded-full shrink-0">
                                ⏱ {formatTimestamp(q.video_timestamp_seconds ?? 0)}
                              </span>
                              <p className="text-[13.5px] font-bold text-[#0F1B3D]">
                                {qi + 1}. {q.question_text}
                              </p>
                            </div>
                            {q.image_url && (
                              /* ===== แก้เพิ่ม: คำบรรยายอยู่ด้านล่างภาพ ชิดภาพไม่เว้นช่องว่าง จัดกึ่งกลางเทียบกับ
                                  ความกว้างของรูป (กล่องนอกเป็น inline-block) ไม่ใช่กึ่งกลางการ์ด ===== */
                              <div className="mb-1.5 inline-block max-w-full">
                                <div className="relative">
                                  <img src={q.image_url} alt="" className="h-20 w-auto max-w-full rounded-lg border border-[#0F1B3D]/[0.08] object-contain bg-white" />
                                  {/* ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (อ่านอย่างเดียว) ===== */}
                                  {(q.image_pins ?? []).map((pin, pinIndex) => (
                                    <span
                                      key={pin.id}
                                      className="absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[9px] font-bold text-white ring-1 ring-white"
                                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                                    >
                                      {pinIndex + 1}
                                    </span>
                                  ))}
                                </div>
                                {q.image_caption && (
                                  <p className="mt-0 text-center text-[11.5px] font-semibold text-[#0F1B3D]/50">{q.image_caption}</p>
                                )}
                              </div>
                            )}

                            {/* ===== เพิ่มใหม่: แสดงคู่จับคู่พร้อมเฉลย (เดิมคำถามประเภทนี้ไม่มี
                                quiz_choices เลยโชว์เป็นการ์ดเปล่าไม่มีเนื้อหาให้รีวิวอะไรเลย) ===== */}
                            {interactionType === "matching" && matchingData && (
                              <div className="space-y-1 pl-4">
                                <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">จับคู่</span>
                                {matchingData.pairs.map((pair, pIndex) => {
                                  const color = MATCHING_PAIR_COLORS[pIndex % MATCHING_PAIR_COLORS.length];
                                  return (
                                    <div key={pIndex} className="flex items-center gap-2 text-[13px] text-[#0F1B3D]/70">
                                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: color }}>
                                        {pIndex + 1}
                                      </span>
                                      <span className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${color}14` }}>{pair.left}</span>
                                      <span className="text-[#0F1B3D]/30" aria-hidden="true">→</span>
                                      <span className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${color}14` }}>{pair.right}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {interactionType === "drag_drop" && <DragDropAnswerSummary answerData={q.answer_data} />}

                            {/* ===== เพิ่มใหม่: แสดงลำดับที่ถูกต้องของ sequencing (เหตุผลเดียวกับ matching
                                ด้านบน) ===== */}
                            {interactionType === "sequencing" && sequencingData && (
                              <div className="space-y-1 pl-4">
                                <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">เรียงลำดับ</span>
                                <ol className="space-y-1">
                                  {sequencingData.correct_order.map((itemId, orderIndex) => {
                                    const item = sequencingData.items.find((it) => it.id === itemId);
                                    return (
                                      <li key={itemId} className="flex items-center gap-2 text-[13px] text-[#0F1B3D]/70">
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[9px] font-bold text-white">
                                          {orderIndex + 1}
                                        </span>
                                        {item?.text ?? "(รายการถูกลบ)"}
                                      </li>
                                    );
                                  })}
                                </ol>
                              </div>
                            )}

                            {(q.quiz_choices ?? []).length > 0 && (
                              <ul className="space-y-1 pl-4">
                                {interactionType === "multi_select" && (
                                  <li className="list-none"><span className="mb-1 inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">เลือกได้หลายคำตอบ</span></li>
                                )}
                                {q.quiz_choices
                                  .sort((a, b) => a.order_index - b.order_index)
                                  .map((c, ci) => (
                                    <li
                                      key={ci}
                                      className={`text-[13px] flex items-center gap-2 ${
                                        c.is_correct ? "text-[#00B37E] font-bold" : "text-[#0F1B3D]/60"
                                      }`}
                                    >
                                      {c.is_correct && "✓"} {c.choice_text}
                                    </li>
                                  ))}
                              </ul>
                            )}
                            {q.explanation && (
                              <p className="text-[12.5px] text-[#0F1B3D]/40 mt-1.5 pl-4">
                                คำอธิบาย: {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      };

                      return (
                        <>
                          {timeline.length > 0 && (
                            <div className="mb-6">
                              <h3 className="text-[13px] font-bold text-[#0F1B3D] mb-3">
                                In-Video Quiz ({timeline.length} ข้อ)
                              </h3>
                              <div className="space-y-4">
                                {timeline.map((item, i) =>
                                  item.kind === "fixed" ? (
                                    renderQuestion(item.question, i)
                                  ) : (
                                    <RandomBankMarkerRow key={item.marker.id} marker={item.marker} index={i} />
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <LessonReviewActions lessonId={lesson.id} draft={draft} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
