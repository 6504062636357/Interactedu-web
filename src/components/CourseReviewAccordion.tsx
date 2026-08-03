"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { approveLesson, rejectLesson } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

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
  quiz_choices: QuizChoice[];
}

interface LessonDraft {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  quiz_questions: QuizQuestion[];
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
                    ยังไม่ส่ง draft
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
                  <p className="text-[13.5px] text-[#0F1B3D]/50">บทเรียนนี้ยังไม่มี draft ส่งเข้ามา</p>
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
                      const videoQuizzes = draft.quiz_questions
                        .filter((q) => q.video_timestamp_seconds != null)
                        .sort((a, b) => (a.video_timestamp_seconds ?? 0) - (b.video_timestamp_seconds ?? 0));
                      const finalQuizzes = draft.quiz_questions
                        .filter((q) => q.video_timestamp_seconds == null)
                        .sort((a, b) => a.order_index - b.order_index);

                      const renderQuestion = (q: QuizQuestion, qi: number, showTimestamp: boolean) => (
                        <div key={q.id}>
                          <div className="flex items-center gap-2 mb-1.5">
                            {showTimestamp && (
                              <span className="text-[11px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2 py-0.5 rounded-full shrink-0">
                                ⏱ {formatTimestamp(q.video_timestamp_seconds ?? 0)}
                              </span>
                            )}
                            <p className="text-[13.5px] font-bold text-[#0F1B3D]">
                              {qi + 1}. {q.question_text}
                            </p>
                          </div>
                          <ul className="space-y-1 pl-4">
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
                          {q.explanation && (
                            <p className="text-[12.5px] text-[#0F1B3D]/40 mt-1.5 pl-4">
                              คำอธิบาย: {q.explanation}
                            </p>
                          )}
                        </div>
                      );

                      return (
                        <>
                          {videoQuizzes.length > 0 && (
                            <div className="mb-6">
                              <h3 className="text-[13px] font-bold text-[#0F1B3D] mb-3">
                                In-Video Quiz ({videoQuizzes.length} ข้อ)
                              </h3>
                              <div className="space-y-4">
                                {videoQuizzes.map((q, qi) => renderQuestion(q, qi, true))}
                              </div>
                            </div>
                          )}

                          <div>
                            <h3 className="text-[13px] font-bold text-[#0F1B3D] mb-3">
                              แบบทดสอบท้ายบท ({finalQuizzes.length} ข้อ)
                            </h3>
                            {finalQuizzes.length === 0 ? (
                              <p className="text-[13px] text-[#0F1B3D]/40">ไม่มีแบบทดสอบท้ายบท</p>
                            ) : (
                              <div className="space-y-4">
                                {finalQuizzes.map((q, qi) => renderQuestion(q, qi, false))}
                              </div>
                            )}
                          </div>
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