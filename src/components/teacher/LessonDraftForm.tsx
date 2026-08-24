"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import {
  saveLessonDraft,
  updateLessonDraft,
  submitDraftForReview,
  type DraftQuestionInput,
  type ExistingDraftData,
} from "@/app/dashboard/teacher/courses/[courseId]/lessons/new/actions";
import { approveLesson } from "@/app/dashboard/admin/courses/[courseId]/review/actions";
import { uploadVideoToR2 } from "@/lib/uploadVideoToR2";

interface LessonDraftFormProps {
  courseId: string;
  moduleId: string | null;
  workspace?: "teacher" | "admin";
  initialData?: ExistingDraftData | null;
}

interface QuestionState extends DraftQuestionInput {
  key: string;
}

type TabKey = "info" | "video-quiz";
type QuizSourceMode = "custom" | "bank_manual" | "bank_random";

interface RandomMarkerState {
  key: string;
  markerId: string | null; // null = ยังไม่เคย save (ของใหม่ที่ครูเพิ่งปักหมุด)
  timestampSeconds: number;
  difficulty: "easy" | "medium" | "hard";
}

interface BankQuestionOption {
  id: string;
  questionText: string;
  choices: { text: string; isCorrect: boolean }[];
}


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

export default function LessonDraftForm({
  courseId,
  moduleId,
  initialData,
  workspace = "teacher",
}: LessonDraftFormProps): ReactElement {
  const isAdmin = workspace === "admin";
  const isEditMode = !!initialData;

  const [activeTab, setActiveTab] = useState<TabKey>("info");

  const [title, setTitle] = useState<string>(initialData?.title ?? "");
  const [contentHtml, setContentHtml] = useState<string>(initialData?.contentHtml ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(initialData?.videoUrl ?? null);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);

  // แบบทดสอบท้ายคอร์สจัดการจากหน้าคอร์สโดยเฉพาะ ส่วนนี้เก็บเฉพาะควิซในวิดีโอ
  const initialVideoQuizzes =
    initialData?.questions.filter((q) => q.timestampSeconds != null).map((q) => ({ key: crypto.randomUUID(), ...q })) ?? [];

    const [videoQuizQuestions, setVideoQuizQuestions] = useState<QuestionState[]>(initialVideoQuizzes);
  const [randomMarkers, setRandomMarkers] = useState<RandomMarkerState[]>(
    initialData?.randomMarkers?.map((m) => ({ key: crypto.randomUUID(), ...m })) ?? []
  );

  // ---- Modal ปักหมุด ----
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<QuizSourceMode>("custom");
  const [pinModalTimestamp, setPinModalTimestamp] = useState(0);
  const [bankOptions, setBankOptions] = useState<BankQuestionOption[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedBankQuestionId, setSelectedBankQuestionId] = useState<string | null>(null);
  const [randomDifficulty, setRandomDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  const [saving, setSaving] = useState<boolean>(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(initialData?.draftId ?? null);
  const [savedLessonId, setSavedLessonId] = useState<string | null>(initialData?.lessonId ?? null);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(initialData?.status === "pending_review");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);

  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setError(null);
    setUploadingVideo(true);

    try {
      const url = await uploadVideoToR2(file, () => undefined);
      setVideoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploadingVideo(false);
    }
  };

  // ---------- ตัวช่วยจัดการคำถามในวิดีโอ ----------

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

  // function handleAddQuizAtCurrentTime(): void {
  //   const seconds = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
  //   setVideoQuizQuestions((prev) => [...prev, createEmptyQuestion(seconds)]);
  // }
    function handleAddQuizAtCurrentTime(): void {
    const seconds = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
    setPinModalTimestamp(seconds);
    setPinModalMode("custom");
    setSelectedBankQuestionId(null);
    setBankOptions([]);
    setPinModalOpen(true);
  }

  async function loadBankQuestionsForLesson(): Promise<void> {
    setBankLoading(true);
    try {
      const { getBankQuestionsForLesson } = await import(
        "@/app/dashboard/teacher/courses/[courseId]/lessons/new/actions"
      );
      const result = await getBankQuestionsForLesson(savedLessonId ?? "");
      setBankOptions(result.questions ?? []);
    } catch {
      setBankOptions([]);
    } finally {
      setBankLoading(false);
    }
  }

  function confirmPinModal(): void {
    if (pinModalMode === "custom") {
      setVideoQuizQuestions((prev) => [...prev, createEmptyQuestion(pinModalTimestamp)]);
    } else if (pinModalMode === "bank_manual") {
      const picked = bankOptions.find((q) => q.id === selectedBankQuestionId);
      if (!picked) return;
      setVideoQuizQuestions((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          questionText: picked.questionText,
          timestampSeconds: pinModalTimestamp,
          explanation: null,
          choices: picked.choices,
          sourceType: "bank_manual",
          sourceQuestionId: picked.id,
        } as QuestionState,
      ]);
    } else {
      setRandomMarkers((prev) => [
        ...prev,
        { key: crypto.randomUUID(), markerId: null, timestampSeconds: pinModalTimestamp, difficulty: randomDifficulty },
      ]);
    }
    setPinModalOpen(false);
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

  // const sortedVideoQuizzes = useMemo(
  //   () => [...videoQuizQuestions].sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0)),
  //   [videoQuizQuestions]
  // );
    const sortedVideoQuizzes = useMemo(
    () => [...videoQuizQuestions].sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0)),
    [videoQuizQuestions]
  );
  const sortedRandomMarkers = useMemo(
    () => [...randomMarkers].sort((a, b) => a.timestampSeconds - b.timestampSeconds),
    [randomMarkers]
  );

  // ---------- Save / submit ----------

  const saveCurrentDraft = async (): Promise<{ draftId?: string; lessonId?: string; error?: string }> => {
    if (!title.trim()) {
      setActiveTab("info");
      return { error: "กรุณาใส่ชื่อบทเรียน" };
    }
    if (videoFile && !videoUrl) {
      setActiveTab("info");
      return { error: "กรุณารอให้อัปโหลดวิดีโอเสร็จก่อน" };
    }

    const questionGroups: { questions: QuestionState[]; tab: TabKey; label: string }[] = [
      { questions: videoQuizQuestions, tab: "video-quiz", label: "ควิซแทรกระหว่างวิดีโอ" },
    ];

    for (const group of questionGroups) {
      for (const question of group.questions) {
        const hasPartialContent = question.choices.some((choice) => choice.text.trim()) || Boolean(question.explanation?.trim());
        if (!question.questionText.trim()) {
          if (hasPartialContent) {
            setActiveTab(group.tab);
            return { error: `กรุณากรอกคำถามของ${group.label}ให้ครบ` };
          }
          continue;
        }

        const filledChoices = question.choices.filter((choice) => choice.text.trim());
        if (filledChoices.length < 2) {
          setActiveTab(group.tab);
          return { error: `${group.label}แต่ละข้อต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก` };
        }
        if (!filledChoices.some((choice) => choice.isCorrect)) {
          setActiveTab(group.tab);
          return { error: `กรุณากำหนดคำตอบที่ถูกของ${group.label}` };
        }
      }
    }

        const allQuestions = videoQuizQuestions.map(
      ({ questionText, choices, timestampSeconds, explanation, sourceType, sourceQuestionId }) => ({
        questionText,
        choices,
        timestampSeconds,
        explanation,
        sourceType,
        sourceQuestionId,
      })
    );

    const allRandomMarkers = randomMarkers.map(({ markerId, timestampSeconds, difficulty }) => ({
      markerId,
      timestampSeconds,
      difficulty,
    }));

    return savedDraftId && savedLessonId
      ? await updateLessonDraft({
          courseId,
          draftId: savedDraftId,
          lessonId: savedLessonId,
          title,
          videoUrl,
          contentHtml,
          questions: allQuestions,
          randomMarkers: allRandomMarkers,
        })
      : await saveLessonDraft({
          courseId,
          moduleId,
          title,
          videoUrl,
          contentHtml,
          questions: allQuestions,
          randomMarkers: allRandomMarkers,
        });
   };

  const handleSaveDraft = async (): Promise<void> => {
    setError(null);
    setSubmitError(null);
    setSaving(true);
    const result = await saveCurrentDraft();
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSubmitted(false);
    setSavedDraftId(result.draftId ?? savedDraftId);
    setSavedLessonId(result.lessonId ?? savedLessonId);
  };

  const handleSubmitForReview = async (): Promise<void> => {
    setSubmitting(true);
    setSubmitError(null);
    setError(null);

    // บันทึกค่าล่าสุดก่อนส่งทุกครั้ง ป้องกันคำถามที่เพิ่งแก้หายไปจาก draft
    const savedResult = await saveCurrentDraft();
    if (savedResult.error || !savedResult.draftId || !savedResult.lessonId) {
      const message = savedResult.error ?? "บันทึกฉบับร่างล่าสุดไม่สำเร็จ";
      setError(message);
      setSubmitError(message);
      setSubmitting(false);
      return;
    }

    setSavedDraftId(savedResult.draftId);
    setSavedLessonId(savedResult.lessonId);

    const result = await submitDraftForReview(savedResult.draftId, courseId);

    if (result?.error) {
      console.error("[LessonDraftForm] submitDraftForReview failed:", result.error);
      setSubmitError(result.error);
      setSubmitting(false);
      return;
    }

    // แอดมินสร้างเอง ไม่ต้องมีใครมาตรวจสอบ -> approve ต่อทันทีในคราวเดียว
    // (approveDraft จะสร้าง SCORM package ให้ด้วยในตัว เหมือนตอนแอดมินกด "อนุมัติเพื่อเผยแพร่" ปกติ)
    if (isAdmin) {
      const approveResult = await approveLesson(savedResult.draftId, savedResult.lessonId);
      setSubmitting(false);

      if (approveResult?.error) {
        console.error("[LessonDraftForm] approveDraft failed:", approveResult.error);
        setSubmitError(approveResult.error);
        return;
      }

      setSubmitted(true);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  // ---------- Tabs ----------

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "info", label: "รายละเอียดบทเรียน" },
    { key: "video-quiz", label: "In-Video Quiz", badge: videoQuizQuestions.length || undefined },
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
                  <video src={videoUrl ?? undefined} controls className="w-full rounded-xl bg-black max-h-80" />
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
                  {sortedRandomMarkers.map((m, idx) => {
                    const pct = Math.min(100, (m.timestampSeconds / videoDuration) * 100);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        title={`สุ่มจากคลัง ${idx + 1} — ${formatTime(m.timestampSeconds)}`}
                        onClick={() => handleSeekToMarker(m.timestampSeconds)}
                        style={{ left: `${pct}%` }}
                        className="absolute -top-1 w-4 h-4 -translate-x-1/2 rounded-full bg-[#7C5CFF] border-2 border-white shadow hover:scale-110 transition-transform"
                      />
                    );
                  })}
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
                    {sortedRandomMarkers.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">สุ่มจากคลังข้อสอบ</p>
              {sortedRandomMarkers.map((m) => (
                <div key={m.key} className="flex items-center gap-3 rounded-2xl border border-[#7C5CFF]/20 bg-[#7C5CFF]/[0.04] p-4">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#7C5CFF] bg-[#7C5CFF]/10 px-2.5 py-1 rounded-full shrink-0">
                    ⏱ {formatTime(m.timestampSeconds)}
                  </span>
                  <span className="text-[13px] font-semibold text-[#0F1B3D]">
                    สุ่มจากคลัง · ระดับ{m.difficulty === "easy" ? "ง่าย" : m.difficulty === "medium" ? "ปานกลาง" : "ยาก"}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setRandomMarkers((prev) => prev.filter((item) => item.key !== m.key))}
                    className="text-[12.5px] font-bold text-[#0F1B3D]/40 hover:text-[#EB4A2D]"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== ปุ่มบันทึก/ส่งตรวจ (แสดงทุกแท็บ) ===================== */}
      {error && (
        <div className="mt-6 mb-5 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
        </div>
      )}

      <div className="mt-8">
        {submitted ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-[#00B37E]/20 bg-[#00B37E]/[0.08] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13.5px] font-semibold text-[#00885F]">
                {isAdmin ? "เผยแพร่บทเรียนเรียบร้อยแล้ว" : "ส่งให้แอดมินตรวจสอบเรียบร้อยแล้ว รอการอนุมัติ"}
              </p>
              <p className="mt-1 text-[12px] text-[#00885F]/70">
                {isAdmin
                  ? "หากกลับมาแก้ไข ต้องบันทึกและเผยแพร่ใหม่อีกครั้ง"
                  : "หากกลับมาแก้ไข ต้องบันทึกและส่งตรวจใหม่อีกครั้ง"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setSubmitError(null);
              }}
              className="shrink-0 rounded-full border border-[#00885F]/25 bg-white px-5 py-2.5 text-[12.5px] font-bold text-[#00885F] hover:bg-emerald-50"
            >
              Edit ข้อมูล
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-[#0F1B3D]/10 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-[13.5px] font-semibold text-[#0F1B3D]">
                {savedDraftId
                  ? "บันทึกฉบับร่างแล้ว คุณยังแก้ไขและบันทึกซ้ำได้"
                  : isAdmin
                    ? "บันทึกฉบับร่างของบทเรียนนี้"
                    : "บันทึกฉบับร่างก่อนส่งให้แอดมินตรวจสอบ"}
              </p>
              <p className="mt-1 text-[12px] text-[#0F1B3D]/45">
                {isAdmin
                  ? "เมื่อกดเผยแพร่ ระบบจะบันทึกเนื้อหาและควิซในวิดีโอล่าสุดให้อัตโนมัติ"
                  : "เมื่อกดส่งตรวจ ระบบจะบันทึกเนื้อหาและควิซในวิดีโอล่าสุดให้อัตโนมัติ"}
              </p>
              {submitError && <p className="mt-2 text-[13px] font-semibold text-[#EB4A2D]">{submitError}</p>}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || submitting || uploadingVideo}
                className="inline-flex items-center justify-center rounded-full border border-[#0F1B3D]/15 px-5 py-3 text-[13.5px] font-bold text-[#0F1B3D] transition-colors hover:bg-[#0F1B3D]/[0.04] disabled:opacity-60"
              >
                {saving ? "กำลังบันทึก..." : savedDraftId ? "บันทึกการแก้ไข" : "บันทึกฉบับร่าง"}
              </button>
              <button
                type="button"
                onClick={handleSubmitForReview}
                disabled={saving || submitting || uploadingVideo}
                className="shrink-0 rounded-full bg-[#FF5A3C] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#EB4A2D] disabled:opacity-60"
              >
                {submitting
                  ? isAdmin
                    ? "กำลังบันทึกและเผยแพร่..."
                    : "กำลังบันทึกและส่ง..."
                  : isAdmin
                    ? "บันทึกและเผยแพร่"
                    : "บันทึกและส่งตรวจ"}
              </button>
            </div>
          </div>
        )}
      </div>
  {pinModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h3 className="mb-1 text-[15px] font-bold text-[#0F1B3D]">
        เพิ่มแบบทดสอบที่เวลา {formatTime(pinModalTimestamp)}
      </h3>
      <p className="mb-4 text-[12.5px] text-[#0F1B3D]/50">แหล่งที่มาของข้อสอบ</p>

      {/* ===== แถบแท็บเลือกโหมด (Segmented Control) ===== */}
      <div className="mb-5 flex rounded-xl bg-[#0F1B3D]/[0.05] p-1">
        {([
          ["custom", "สร้างคำถามใหม่"],
          ["bank_manual", "เลือกจากคลังข้อสอบ"],
          ["bank_random", "สุ่มจากคลังข้อสอบ"],
        ] as [QuizSourceMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setPinModalMode(mode);
              if (mode === "bank_manual" && !savedLessonId) {
                setBankOptions([]);
                return;
              }
              if (mode === "bank_manual" && bankOptions.length === 0) void loadBankQuestionsForLesson();
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-bold transition-colors ${
              pinModalMode === mode
                ? "bg-white text-[#0F1B3D] shadow-sm"
                : "text-[#0F1B3D]/45 hover:text-[#0F1B3D]/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ===== เนื้อหาตามแท็บที่เลือก ===== */}

      {/* --- แท็บ: สร้างใหม่ --- */}
      {pinModalMode === "custom" && (
        <div className="mb-5 rounded-xl border border-dashed border-[#0F1B3D]/15 bg-[#F7F8FA] px-4 py-5 text-center">
          <p className="text-[13px] text-[#0F1B3D]/60">
            กดยืนยันเพื่อสร้างคำถามใหม่ที่เวลานี้ แล้วไปกรอกคำถาม/ตัวเลือกได้ในขั้นถัดไป
          </p>
        </div>
      )}

      {/* --- แท็บ: เลือกจากคลัง --- */}
      {pinModalMode === "bank_manual" && (
        <div className="mb-5">
          {!savedLessonId ? (
            <p className="rounded-xl bg-[#F7F8FA] px-4 py-3 text-[12.5px] text-[#0F1B3D]/40">
              กรุณาบันทึกฉบับร่างครั้งแรกก่อน ถึงจะเลือกจากคลังได้
            </p>
          ) : bankLoading ? (
            <p className="rounded-xl bg-[#F7F8FA] px-4 py-3 text-[12.5px] text-[#0F1B3D]/40">กำลังโหลด...</p>
          ) : bankOptions.length === 0 ? (
            <p className="rounded-xl bg-[#F7F8FA] px-4 py-3 text-[12.5px] text-[#0F1B3D]/40">
              ไม่พบคำถาม Pop-up Quiz ที่ผูกกับบทนี้ในคลัง
            </p>
          ) : (
            <>
              <label className="mb-2 block text-[12.5px] font-semibold text-[#0F1B3D]/70">
                เลือกคำถามจากคลัง
              </label>
              <select
                value={selectedBankQuestionId ?? ""}
                onChange={(e) => setSelectedBankQuestionId(e.target.value || null)}
                className="w-full rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2.5 text-[13px] text-[#0F1B3D] outline-none focus:border-[#0F1B3D]/30 focus:bg-white"
              >
                <option value="" disabled>
                  -- เลือกคำถาม --
                </option>
                {bankOptions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.questionText.length > 60 ? `${q.questionText.slice(0, 60)}…` : q.questionText}
                  </option>
                ))}
              </select>

              {/* Preview card ของคำถามที่เลือก */}
              {selectedBankQuestionId && (() => {
                const picked = bankOptions.find((q) => q.id === selectedBankQuestionId);
                if (!picked) return null;
                return (
                  <div className="mt-3 rounded-xl border border-[#0F1B3D]/10 bg-[#F7F8FA] p-4">
                    <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">
                      ตัวอย่างข้อสอบ
                    </p>
                    <p className="mb-3 text-[13.5px] font-semibold text-[#0F1B3D]">{picked.questionText}</p>
                    <div className="space-y-1.5">
                      {picked.choices.map((choice, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              choice.isCorrect ? "border-[#00B37E]" : "border-[#0F1B3D]/20"
                            }`}
                          >
                            {choice.isCorrect && <span className="h-2 w-2 rounded-full bg-[#00B37E]" />}
                          </span>
                          <span className="text-[13px] text-[#0F1B3D]/75">{choice.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* --- แท็บ: สุ่มจากคลัง --- */}
      {pinModalMode === "bank_random" && (
        <div className="mb-5">
          <label className="mb-1.5 block text-[13px] font-semibold text-[#0F1B3D]/70">ระดับความยาก</label>
          <select
            value={randomDifficulty}
            onChange={(e) => setRandomDifficulty(e.target.value as "easy" | "medium" | "hard")}
            className="w-full rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2.5 text-[13.5px] text-[#0F1B3D] outline-none focus:border-[#0F1B3D]/30 focus:bg-white"
          >
            <option value="easy">ง่าย</option>
            <option value="medium">ปานกลาง</option>
            <option value="hard">ยาก</option>
          </select>
          <p className="mt-2 rounded-lg bg-[#7C5CFF]/[0.06] px-3 py-2.5 text-[12px] text-[#7C5CFF]">
            ระบบจะสุ่ม 1 ข้อจากคลัง (Pop-up Quiz • บทนี้) ให้ผู้เรียนแต่ละคนอัตโนมัติ
          </p>
        </div>
      )}

      {/* ===== ปุ่มยืนยัน / ยกเลิก ===== */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setPinModalOpen(false)}
          className="rounded-full border border-[#0F1B3D]/15 px-5 py-2.5 text-[13px] font-bold text-[#0F1B3D]"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={confirmPinModal}
          disabled={pinModalMode === "bank_manual" && !selectedBankQuestionId}
          className="rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          บันทึกหมุดแบบทดสอบ
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}