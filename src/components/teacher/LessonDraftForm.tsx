"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
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
  initialData?: ExistingDraftData | null;
}

interface QuestionState extends DraftQuestionInput {
  key: string;
}

type TabKey = "info" | "video-quiz" | "final-quiz";

function createEmptyQuestion(timestampSeconds: number | null): QuestionState {
  return {
    key: crypto.randomUUID(),
    questionText: "",
    timestampSeconds,
    explanation: null,
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LessonDraftForm({ courseId, moduleId, initialData }: LessonDraftFormProps): ReactElement {
  const isEditMode = !!initialData;

  const [activeTab, setActiveTab] = useState<TabKey>("info");

  const [title, setTitle] = useState<string>(initialData?.title ?? "");
  const [contentHtml, setContentHtml] = useState<string>(initialData?.contentHtml ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(initialData?.videoUrl ?? null);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);

  // แยกคำถามเป็น 2 ชุดตั้งแต่ต้น — video quiz (มี timestamp) กับ final quiz (ไม่มี)
  const initialVideoQuizzes =
    initialData?.questions.filter((q) => q.timestampSeconds != null).map((q) => ({ key: crypto.randomUUID(), ...q })) ?? [];
  const initialFinalQuizzes =
    initialData?.questions.filter((q) => q.timestampSeconds == null).map((q) => ({ key: crypto.randomUUID(), ...q })) ?? [];

  const [videoQuizQuestions, setVideoQuizQuestions] = useState<QuestionState[]>(initialVideoQuizzes);
  const [finalQuizQuestions, setFinalQuizQuestions] = useState<QuestionState[]>(
    initialFinalQuizzes.length > 0 ? initialFinalQuizzes : [createEmptyQuestion(null)]
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(initialData?.draftId ?? null);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(initialData?.status === "pending_review");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);

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

  // ---------- Generic question helpers (ใช้ร่วมกันทั้ง 2 แท็บ ผ่าน setter ที่ส่งเข้ามา) ----------

  function addQuestion(setter: typeof setVideoQuizQuestions, timestampSeconds: number | null): void {
    setter((prev) => [...prev, createEmptyQuestion(timestampSeconds)]);
  }

  function removeQuestion(setter: typeof setVideoQuizQuestions, key: string): void {
    setter((prev) => prev.filter((q) => q.key !== key));
  }

  function updateQuestionText(setter: typeof setVideoQuizQuestions, key: string, text: string): void {
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, questionText: text } : q)));
  }

  function updateQuestionExplanation(setter: typeof setVideoQuizQuestions, key: string, text: string): void {
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, explanation: text || null } : q)));
  }

  function updateQuestionTimestamp(setter: typeof setVideoQuizQuestions, key: string, seconds: number): void {
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, timestampSeconds: seconds } : q)));
  }

  function addChoice(setter: typeof setVideoQuizQuestions, key: string): void {
    setter((prev) =>
      prev.map((q) => (q.key === key ? { ...q, choices: [...q.choices, { text: "", isCorrect: false }] } : q))
    );
  }

  function removeChoice(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number): void {
    setter((prev) =>
      prev.map((q) => (q.key === key ? { ...q, choices: q.choices.filter((_, i) => i !== choiceIndex) } : q))
    );
  }

  function updateChoiceText(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number, text: string): void {
    setter((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => (i === choiceIndex ? { ...c, text } : c)) }
          : q
      )
    );
  }

  function setCorrectChoice(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number): void {
    setter((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => ({ ...c, isCorrect: i === choiceIndex })) }
          : q
      )
    );
  }

  // ---------- Video preview + timeline markers ----------

  function handleAddQuizAtCurrentTime(): void {
    const seconds = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
    setVideoQuizQuestions((prev) => [...prev, createEmptyQuestion(seconds)]);
  }

  function handleFetchCurrentTime(key: string): void {
    const seconds = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
    updateQuestionTimestamp(setVideoQuizQuestions, key, seconds);
  }

  function handleSeekToMarker(seconds: number): void {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
  }

  const sortedVideoQuizzes = useMemo(
    () => [...videoQuizQuestions].sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0)),
    [videoQuizQuestions]
  );

  // ---------- Save / submit ----------

  const handleSaveDraft = async (): Promise<void> => {
    setError(null);

    if (!title.trim()) {
      setError("กรุณาใส่ชื่อบทเรียน");
      setActiveTab("info");
      return;
    }
    if (videoFile && !videoUrl) {
      setError("กรุณารอให้อัปโหลดวิดีโอเสร็จก่อน");
      setActiveTab("info");
      return;
    }

    const allQuestions = [...videoQuizQuestions, ...finalQuizQuestions].map(
      ({ questionText, choices, timestampSeconds, explanation }) => ({
        questionText,
        choices,
        timestampSeconds,
        explanation,
      })
    );

    setSaving(true);

    const result = isEditMode
      ? await updateLessonDraft({
          draftId: initialData!.draftId,
          lessonId: initialData!.lessonId,
          title,
          videoUrl,
          contentHtml,
          questions: allQuestions,
        })
      : await saveLessonDraft({
          courseId,
          moduleId,
          title,
          videoUrl,
          contentHtml,
          questions: allQuestions,
        });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

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

    setSubmitted(true);
  };

  // ---------- Tabs ----------

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "info", label: "รายละเอียดบทเรียน" },
    { key: "video-quiz", label: "In-Video Quiz", badge: videoQuizQuestions.length || undefined },
    { key: "final-quiz", label: "แบบทดสอบท้ายบท", badge: finalQuizQuestions.length || undefined },
  ];

  return (
    <div className="max-w-3xl">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-8 border-b border-[#0F1B3D]/[0.08]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-2 px-4 py-3 text-[13.5px] font-bold transition-colors ${
              activeTab === tab.key
                ? "text-[#0F1B3D]"
                : "text-[#0F1B3D]/40 hover:text-[#0F1B3D]/70"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === tab.key ? "bg-[#FF5A3C] text-white" : "bg-[#0F1B3D]/[0.08] text-[#0F1B3D]/50"
                }`}
              >
                {tab.badge}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#0F1B3D] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ===================== TAB 1: รายละเอียดบทเรียน ===================== */}
      {activeTab === "info" && (
        <div>
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
              <>
                <p className="mt-2 mb-3 text-[13px] text-[#00B37E] font-semibold">
                  {isEditMode && !videoFile ? "มีวิดีโอเดิมอยู่แล้ว" : "อัปโหลดวิดีโอสำเร็จแล้ว"}
                </p>
                <video src={videoUrl} controls className="w-full rounded-xl bg-black max-h-80" />
              </>
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
        </div>
      )}

      {/* ===================== TAB 2: In-Video Quiz ===================== */}
      {activeTab === "video-quiz" && (
        <div>
          {!videoUrl ? (
            <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-12 text-center mb-6">
              <p className="text-[13.5px] text-[#0F1B3D]/40 font-medium">
                กรุณาอัปโหลดวิดีโอในแท็บ &quot;รายละเอียดบทเรียน&quot; ก่อน
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-xl bg-black max-h-80"
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                />
              </div>

              {/* Timeline พร้อม marker ตำแหน่งควิซ */}
              {videoDuration > 0 && (
                <div className="relative h-8 mb-2 rounded-lg bg-[#0F1B3D]/[0.04]">
                  {sortedVideoQuizzes.map((q, idx) => {
                    const pct = Math.min(100, ((q.timestampSeconds ?? 0) / videoDuration) * 100);
                    return (
                      <button
                        key={q.key}
                        type="button"
                        title={`ควิซข้อ ${idx + 1} — ${formatTime(q.timestampSeconds ?? 0)}`}
                        onClick={() => handleSeekToMarker(q.timestampSeconds ?? 0)}
                        style={{ left: `${pct}%` }}
                        className="absolute -top-1 w-4 h-4 -translate-x-1/2 rounded-full bg-[#FF5A3C] border-2 border-white shadow hover:scale-110 transition-transform"
                      />
                    );
                  })}
                  {/* current time indicator */}
                  <div
                    style={{ left: `${(videoCurrentTime / videoDuration) * 100}%` }}
                    className="absolute top-0 bottom-0 w-[2px] bg-[#0F1B3D]/30"
                  />
                </div>
              )}

              <div className="flex items-center justify-between mb-6">
                <p className="text-[12px] text-[#0F1B3D]/40 font-medium">
                  เวลาปัจจุบัน: {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
                </p>
                <button
                  type="button"
                  onClick={handleAddQuizAtCurrentTime}
                  className="text-[13px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] px-4 py-2 rounded-full transition-colors"
                >
                  + ปักหมุดควิซที่เวลานี้
                </button>
              </div>
            </>
          )}

          {sortedVideoQuizzes.length === 0 ? (
            <p className="text-[13px] text-[#0F1B3D]/40 font-medium text-center py-6">
              ยังไม่มีควิซแทรกกลางวิดีโอ กด &quot;ปักหมุดควิซที่เวลานี้&quot; เพื่อเริ่ม
            </p>
          ) : (
            <div className="space-y-6">
              {sortedVideoQuizzes.map((q) => (
                <div key={q.key} className="rounded-2xl border border-[#0F1B3D]/[0.08] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2.5 py-1 rounded-full">
                      ⏱ {formatTime(q.timestampSeconds ?? 0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFetchCurrentTime(q.key)}
                      className="text-[12px] font-bold text-[#7C5CFF] hover:underline"
                    >
                      ดึงเวลาปัจจุบัน
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => removeQuestion(setVideoQuizQuestions, q.key)}
                      className="text-[12.5px] font-bold text-[#0F1B3D]/40 hover:text-[#EB4A2D]"
                    >
                      ลบ
                    </button>
                  </div>

                  <input
                    value={q.questionText}
                    onChange={(e) => updateQuestionText(setVideoQuizQuestions, q.key, e.target.value)}
                    placeholder="พิมพ์คำถาม"
                    className="w-full mb-3 px-4 py-2.5 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                  />

                  <div className="space-y-2.5 mb-3">
                    {q.choices.map((choice, cIndex) => (
                      <div key={cIndex} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setCorrectChoice(setVideoQuizQuestions, q.key, cIndex)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            choice.isCorrect ? "border-[#00B37E]" : "border-[#0F1B3D]/20"
                          }`}
                          title="ตั้งเป็นคำตอบที่ถูก"
                        >
                          {choice.isCorrect && <span className="w-2.5 h-2.5 rounded-full bg-[#00B37E]" />}
                        </button>
                        <input
                          value={choice.text}
                          onChange={(e) => updateChoiceText(setVideoQuizQuestions, q.key, cIndex, e.target.value)}
                          placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                          className="flex-1 px-3.5 py-2 text-[13.5px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                        />
                        {q.choices.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeChoice(setVideoQuizQuestions, q.key, cIndex)}
                            className="text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D] shrink-0"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addChoice(setVideoQuizQuestions, q.key)}
                      className="text-[12.5px] font-bold text-[#7C5CFF] hover:underline pl-7"
                    >
                      + เพิ่มตัวเลือก
                    </button>
                  </div>

                  <textarea
                    value={q.explanation ?? ""}
                    onChange={(e) => updateQuestionExplanation(setVideoQuizQuestions, q.key, e.target.value)}
                    placeholder="คำอธิบายเฉลย (แสดงให้นักเรียนเห็นหลังตอบ ไม่บังคับ)"
                    rows={2}
                    className="w-full px-3.5 py-2 text-[13px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: แบบทดสอบท้ายบท ===================== */}
      {activeTab === "final-quiz" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-[13px] font-bold text-[#0F1B3D]/70">แบบทดสอบท้ายบท</label>
            <button
              type="button"
              onClick={() => addQuestion(setFinalQuizQuestions, null)}
              className="text-[13px] font-bold text-[#FF5A3C] hover:underline"
            >
              + เพิ่มคำถาม
            </button>
          </div>

          <div className="space-y-6">
            {finalQuizQuestions.map((q, qIndex) => (
              <div key={q.key} className="rounded-2xl border border-[#0F1B3D]/[0.08] p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-[13px] font-bold text-[#0F1B3D]/30 mt-3 shrink-0">ข้อ {qIndex + 1}</span>
                  <input
                    value={q.questionText}
                    onChange={(e) => updateQuestionText(setFinalQuizQuestions, q.key, e.target.value)}
                    placeholder="พิมพ์คำถาม"
                    className="flex-1 px-4 py-2.5 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                  />
                  {finalQuizQuestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(setFinalQuizQuestions, q.key)}
                      className="text-[12.5px] font-bold text-[#0F1B3D]/40 hover:text-[#EB4A2D] mt-3 shrink-0"
                    >
                      ลบ
                    </button>
                  )}
                </div>

                <div className="pl-8 space-y-2.5 mb-3">
                  {q.choices.map((choice, cIndex) => (
                    <div key={cIndex} className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setCorrectChoice(setFinalQuizQuestions, q.key, cIndex)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          choice.isCorrect ? "border-[#00B37E]" : "border-[#0F1B3D]/20"
                        }`}
                        title="ตั้งเป็นคำตอบที่ถูก"
                      >
                        {choice.isCorrect && <span className="w-2.5 h-2.5 rounded-full bg-[#00B37E]" />}
                      </button>
                      <input
                        value={choice.text}
                        onChange={(e) => updateChoiceText(setFinalQuizQuestions, q.key, cIndex, e.target.value)}
                        placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                        className="flex-1 px-3.5 py-2 text-[13.5px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                      />
                      {q.choices.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeChoice(setFinalQuizQuestions, q.key, cIndex)}
                          className="text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D] shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addChoice(setFinalQuizQuestions, q.key)}
                    className="text-[12.5px] font-bold text-[#7C5CFF] hover:underline pl-7"
                  >
                    + เพิ่มตัวเลือก
                  </button>
                </div>

                <textarea
                  value={q.explanation ?? ""}
                  onChange={(e) => updateQuestionExplanation(setFinalQuizQuestions, q.key, e.target.value)}
                  placeholder="คำอธิบายเฉลย (ไม่บังคับ)"
                  rows={2}
                  className="w-full pl-8 pr-0 text-[13px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y box-content py-2"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== ปุ่มบันทึก/ส่งตรวจ (แสดงทุกแท็บ) ===================== */}
      {error && (
        <div className="mt-6 mb-5 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
        </div>
      )}

      <div className="mt-8">
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
              {submitError && <p className="mt-2 text-[13px] font-semibold text-[#EB4A2D]">{submitError}</p>}
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
    </div>
  );
}