"use client";

import { useState, type ChangeEvent, type ReactElement } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  saveLessonDraft,
  updateLessonDraft,
  submitDraftForReview,
  type DraftQuestionInput,
  type ExistingDraftData,
} from "@/app/dashboard/teacher/courses/[courseId]/lessons/new/actions";
import { uploadVideoToR2 } from "@/lib/uploadVideoToR2";

interface LessonDraftFormProps {
  courseId: string;
  moduleId: string | null;
  initialData?: ExistingDraftData | null; // เพิ่มใหม่: สำหรับโหมดแก้ไข
}

interface QuestionState extends DraftQuestionInput {
  key: string;
}

function createEmptyQuestion(): QuestionState {
  return {
    key: crypto.randomUUID(),
    questionText: "",
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}

export default function LessonDraftForm({ courseId, moduleId, initialData }: LessonDraftFormProps): ReactElement {
  const isEditMode = !!initialData;

  const [title, setTitle] = useState<string>(initialData?.title ?? "");
  const [contentHtml, setContentHtml] = useState<string>(initialData?.contentHtml ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(initialData?.videoUrl ?? null);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionState[]>(
    initialData && initialData.questions.length > 0
      ? initialData.questions.map((q) => ({ key: crypto.randomUUID(), ...q }))
      : [createEmptyQuestion()]
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(initialData?.draftId ?? null);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(initialData?.status === "pending_review");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const supabase = createClient();

  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setError(null);
    setUploadingVideo(true);

    try {
      const url = await uploadVideoToR2(file, (percent) => {
        // ถ้าอยากโชว์ % ค่อยเพิ่ม state ทีหลังได้
      });
      setVideoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploadingVideo(false);
    }
  };

  const addQuestion = (): void => {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  };

  const removeQuestion = (key: string): void => {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
  };

  const updateQuestionText = (key: string, text: string): void => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, questionText: text } : q)));
  };

  const addChoice = (key: string): void => {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, choices: [...q.choices, { text: "", isCorrect: false }] } : q))
    );
  };

  const removeChoice = (key: string, choiceIndex: number): void => {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, choices: q.choices.filter((_, i) => i !== choiceIndex) } : q))
    );
  };

  const updateChoiceText = (key: string, choiceIndex: number, text: string): void => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => (i === choiceIndex ? { ...c, text } : c)) }
          : q
      )
    );
  };

  const setCorrectChoice = (key: string, choiceIndex: number): void => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => ({ ...c, isCorrect: i === choiceIndex })) }
          : q
      )
    );
  };

  const handleSaveDraft = async (): Promise<void> => {
    setError(null);

    if (!title.trim()) {
      setError("กรุณาใส่ชื่อบทเรียน");
      return;
    }
    if (videoFile && !videoUrl) {
      setError("กรุณารอให้อัปโหลดวิดีโอเสร็จก่อน");
      return;
    }

    setSaving(true);

    const result = isEditMode
      ? await updateLessonDraft({
          draftId: initialData!.draftId,
          lessonId: initialData!.lessonId,
          title,
          videoUrl,
          contentHtml,
          questions: questions.map(({ questionText, choices }) => ({ questionText, choices })),
        })
      : await saveLessonDraft({
          courseId,
          moduleId,
          title,
          videoUrl,
          contentHtml,
          questions: questions.map(({ questionText, choices }) => ({ questionText, choices })),
        });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // แก้ไขแล้วต้องส่งตรวจใหม่เสมอ (สถานะกลับเป็น draft ที่ backend แล้ว)
    setSubmitted(false);
    setSubmitError(null);
    setSavedDraftId(result.draftId ?? null);
  };

  const handleSubmitForReview = async (): Promise<void> => {
    if (!savedDraftId) return;

    setSubmitting(true);
    setSubmitError(null);

    const result = await submitDraftForReview(savedDraftId, courseId);

    setSubmitting(false);

    if (result?.error) {
      console.error("[LessonDraftForm] submitDraftForReview failed:", result.error);
      setSubmitError(result.error);
      return;
    }

    console.log("[LessonDraftForm] submitDraftForReview success, draftId:", savedDraftId);
    setSubmitted(true);
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">ชื่อบทเรียน</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น บทที่ 1 บทนำสู่ปัญญาประดิษฐ์"
          className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
        />
      </div>

      <div className="mb-8">
        <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">วิดีโอบทเรียน</label>
        <input
          type="file"
          accept="video/*"
          onChange={handleVideoChange}
          className="w-full text-[13.5px] text-[#0F1B3D]/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-[13px] file:font-bold file:bg-[#0F1B3D]/[0.06] file:text-[#0F1B3D] hover:file:bg-[#0F1B3D]/10"
        />
        {uploadingVideo && <p className="mt-2 text-[13px] text-[#0F1B3D]/50 font-medium">กำลังอัปโหลด...</p>}
        {videoUrl && !uploadingVideo && (
          <p className="mt-2 text-[13px] text-[#00B37E] font-semibold">
            {isEditMode && !videoFile ? "มีวิดีโอเดิมอยู่แล้ว" : "อัปโหลดวิดีโอสำเร็จแล้ว"}
          </p>
        )}
      </div>

      <div className="mb-8">
        <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">เนื้อหา / เอกสารประกอบ</label>
        <textarea
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          rows={8}
          placeholder="พิมพ์เนื้อหาบทเรียน สรุปประเด็นสำคัญ หรือวางลิงก์เอกสารประกอบ"
          className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y"
        />
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[13px] font-bold text-[#0F1B3D]/70">แบบทดสอบท้ายบท</label>
          <button
            type="button"
            onClick={addQuestion}
            className="text-[13px] font-bold text-[#FF5A3C] hover:underline"
          >
            + เพิ่มคำถาม
          </button>
        </div>

        <div className="space-y-6">
          {questions.map((q, qIndex) => (
            <div key={q.key} className="rounded-2xl border border-[#0F1B3D]/[0.08] p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-[13px] font-bold text-[#0F1B3D]/30 mt-3 shrink-0">
                  ข้อ {qIndex + 1}
                </span>
                <input
                  value={q.questionText}
                  onChange={(e) => updateQuestionText(q.key, e.target.value)}
                  placeholder="พิมพ์คำถาม"
                  className="flex-1 px-4 py-2.5 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                />
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(q.key)}
                    className="text-[12.5px] font-bold text-[#0F1B3D]/40 hover:text-[#EB4A2D] mt-3 shrink-0"
                  >
                    ลบ
                  </button>
                )}
              </div>

              <div className="pl-8 space-y-2.5">
                {q.choices.map((choice, cIndex) => (
                  <div key={cIndex} className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCorrectChoice(q.key, cIndex)}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        choice.isCorrect ? "border-[#00B37E]" : "border-[#0F1B3D]/20"
                      }`}
                      title="ตั้งเป็นคำตอบที่ถูก"
                    >
                      {choice.isCorrect && <span className="w-2.5 h-2.5 rounded-full bg-[#00B37E]" />}
                    </button>
                    <input
                      value={choice.text}
                      onChange={(e) => updateChoiceText(q.key, cIndex, e.target.value)}
                      placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                      className="flex-1 px-3.5 py-2 text-[13.5px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                    />
                    {q.choices.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeChoice(q.key, cIndex)}
                        className="text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D] shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addChoice(q.key)}
                  className="text-[12.5px] font-bold text-[#7C5CFF] hover:underline pl-7"
                >
                  + เพิ่มตัวเลือก
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
        </div>
      )}

      {!savedDraftId ? (
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || uploadingVideo}
          className="w-full sm:w-auto inline-flex items-center justify-center text-[15px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] px-7 py-4 rounded-full transition-colors disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : isEditMode ? "บันทึกการแก้ไข" : "บันทึกฉบับร่าง"}
        </button>
      ) : submitted ? (
        <div className="rounded-2xl bg-[#00B37E]/[0.08] border border-[#00B37E]/20 p-5">
          <p className="text-[13.5px] font-semibold text-[#00885F]">
            ส่งให้แอดมินตรวจสอบเรียบร้อยแล้ว รอการอนุมัติ
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#00B37E]/[0.08] border border-[#00B37E]/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[13.5px] font-semibold text-[#00885F]">
              บันทึกฉบับร่างแล้ว ตรวจสอบเรียบร้อยแล้วส่งให้แอดมินได้เลย
            </p>
            {submitError && (
              <p className="mt-2 text-[13px] font-semibold text-[#EB4A2D]">{submitError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={submitting}
            className="text-[14px] font-bold text-white bg-[#FF5A3C] hover:bg-[#EB4A2D] px-6 py-3 rounded-full transition-colors shrink-0 disabled:opacity-60"
          >
            {submitting ? "กำลังส่ง..." : "ส่งให้แอดมินตรวจสอบ"}
          </button>
        </div>
      )}
    </div>
  );
}