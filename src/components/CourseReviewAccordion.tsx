"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { approveCourse, rejectCourse } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

interface QuizChoice {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  order_index: number;
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
  allLessonsReady: boolean;
}

export default function CourseReviewAccordion({
  courseId,
  lessons,
  allLessonsReady,
}: CourseReviewAccordionProps): ReactElement {
  const [openLessonId, setOpenLessonId] = useState<string | null>(lessons[0]?.id ?? null);
  const [approving, setApproving] = useState<boolean>(false);
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [showRejectForm, setShowRejectForm] = useState<boolean>(false);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const toggleLesson = (lessonId: string): void => {
    setOpenLessonId((prev) => (prev === lessonId ? null : lessonId));
  };

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setApproving(true);
    const result = await approveCourse(courseId);
    setApproving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard/admin/courses");   // แก้จาก "/admin/courses"
  };

  const handleReject = async (): Promise<void> => {
    setError(null);
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผลที่ปฏิเสธ");
      return;
    }
    setRejecting(true);
    const result = await rejectCourse(courseId, reason);
    setRejecting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard/admin/courses");   // แก้จาก "/admin/courses"
  };

  return (
    <div className="space-y-4">
      {/* Accordion รายบทเรียน */}
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

                      <div>
                        <h3 className="text-[13px] font-bold text-[#0F1B3D] mb-3">
                          แบบทดสอบ ({draft.quiz_questions.length} ข้อ)
                        </h3>
                        <div className="space-y-4">
                          {draft.quiz_questions
                            .sort((a, b) => a.order_index - b.order_index)
                            .map((q, qi) => (
                              <div key={q.id}>
                                <p className="text-[13.5px] font-bold text-[#0F1B3D] mb-1.5">
                                  {qi + 1}. {q.question_text}
                                </p>
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
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ปุ่มอนุมัติ/ปฏิเสธทั้งคอร์ส */}
      <div className="rounded-2xl bg-white border border-[#0F1B3D]/[0.06] p-6">
        {!allLessonsReady && (
          <div className="mb-4 rounded-xl bg-[#0F1B3D]/[0.04] border border-[#0F1B3D]/10 px-4 py-3">
            <p className="text-[13px] font-semibold text-[#0F1B3D]/60">
              ยังมีบทเรียนที่ไม่มี draft ส่งตรวจครบ ต้องครบทุกบทก่อนถึงจะอนุมัติทั้งคอร์สได้
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
            <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
          </div>
        )}

        {!showRejectForm ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving || !allLessonsReady}
              className="flex-1 inline-flex items-center justify-center text-[14.5px] font-bold text-white bg-[#00B37E] hover:bg-[#00996b] px-6 py-3.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {approving ? "กำลังสร้าง SCORM..." : "อนุมัติเพื่อเผยแพร่ทั้งคอร์ส"}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              className="flex-1 inline-flex items-center justify-center text-[14.5px] font-bold text-[#0F1B3D]/60 border border-[#0F1B3D]/15 px-6 py-3.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
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
              className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y mb-4"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReject}
                disabled={rejecting}
                className="flex-1 inline-flex items-center justify-center text-[14.5px] font-bold text-white bg-[#EB4A2D] hover:bg-[#d43f22] px-6 py-3.5 rounded-full transition-colors disabled:opacity-60"
              >
                {rejecting ? "กำลังส่ง..." : "ยืนยันปฏิเสธทั้งคอร์ส"}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectForm(false)}
                className="flex-1 text-[14.5px] font-bold text-[#0F1B3D]/50 px-6 py-3.5"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}