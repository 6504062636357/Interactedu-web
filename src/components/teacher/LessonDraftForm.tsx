"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import {
  saveLessonDraft,
  updateLessonDraft,
  submitDraftForReview,
  type DraftQuestionInput,
  type ExistingDraftData,
} from "@/app/dashboard/teacher/courses/[courseId]/lessons/new/actions";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { uploadVideoToR2 } from "@/lib/uploadVideoToR2";
import { genId } from "@/lib/uuid";
// ===== TEMP FIX (2026-10-01): src/components/teacher/VideoSegmenter.tsx หายไปจากดิสก์จริงๆ (เช็ค
// ทั้งโปรเจกต์แล้วไม่มีไฟล์นี้อยู่เลย) ทำให้ build พัง — คอมเมนต์ import เดิมไว้ก่อน แล้วประกาศ
// type/ฟังก์ชันที่ไฟล์นี้ใช้ขึ้นมาเองแทน (เดาจาก field ที่เรียกใช้จริงในไฟล์นี้) ให้ TypeScript ผ่านไป
// ก่อนเฉยๆ — ส่วน UI แบ่งช่วงวิดีโอ (แท็บ "แบ่งช่วงวิดีโอ") ถูกปิดใช้งานชั่วคราวด้วย (ดูด้านล่าง
// จุดที่เคยเรียก <VideoSegmenter />) ห้ามลบคอมเมนต์นี้ทิ้งจนกว่าจะได้ไฟล์ตัวจริงกลับมา (เช็ค
// `git stash show -p stash@{0}` หรือ `git log --all -- "**/VideoSegmenter.tsx"` ตามที่คุยกันไว้)
// import VideoSegmenter, {
//   normalizeDefaultSegmentTitles,
//   type VideoSegment,
// } from "@/components/teacher/VideoSegmenter";
interface VideoSegment {
  id: string;
  title: string;
  summary?: string;
  start: number;
  end: number;
  source?: "ai" | "manual" | "timed";
  confidence?: number;
}
function normalizeDefaultSegmentTitles(segments: VideoSegment[]): VideoSegment[] {
  return segments;
}
import type { DragDropAnswerData, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
import DragDropAuthoring from "@/components/teacher/DragDropAuthoring";
import DragDropAnswerSummary from "@/components/courses/DragDropAnswerSummary";
import { buildDragDropAnswerData, parseDragDropToForm, type DragDropFormState } from "@/lib/quiz/drag-drop-form";
import { validateMultiSelectAuthoring } from "@/lib/quiz/validators/authoring";
import { DRAG_DROP_ENABLED, MULTI_SELECT_ENABLED } from "@/lib/quiz/config/rollout";

// ประเภทคำถามของควิซแทรกกลางวิดีโอ (multi_select/drag_drop เปิดตามสวิตช์ใน lib/quiz/config/rollout.ts)
type QuizInteractionType = "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing";

interface LessonDraftFormProps {
  courseId: string;
  moduleId: string | null;
  workspace?: "teacher" | "admin";
  initialData?: ExistingDraftData | null;
}

interface QuestionState extends DraftQuestionInput {
  key: string;
}

type TabKey = "info" | "segments" | "video-quiz";
type QuizSourceMode = "custom" | "bank_manual" | "bank_random";

// ===== เพิ่มใหม่: ชุดสีไล่ตามลำดับคู่จับคู่ — คู่เดียวกัน (ซ้าย+ขวา) ใช้สีเดียวกันเสมอ ให้ครูเห็น
// ด้วยตาทันทีว่าการ์ดไหนจับคู่กับการ์ดไหน ไม่ต้องไล่อ่านทีละแถว (วนซ้ำสีถ้ามีคู่เกิน 6 คู่)
const MATCHING_PAIR_COLORS = ["#0F1B3D", "#00B37E", "#FF8A3D", "#2F8FFF", "#FF4FA3", "#C98500"];

interface RandomMarkerState {
  key: string;
  markerId: string | null; // null = ยังไม่เคย save (ของใหม่ที่ครูเพิ่งปักหมุด)
  timestampSeconds: number;
  difficulty: "easy" | "medium" | "hard";
}

interface BankQuestionOption {
  id: string;
  questionText: string;
  imageUrl?: string | null;
  // ===== เพิ่มใหม่: ให้แท็บ "เลือกจากคลังข้อสอบ" โชว์ป้ายระดับ/ประเภท + ตัวนับ และหยิบคำถาม
  // แบบจับคู่/เรียงลำดับไปใช้ได้ถูกต้อง (เดิมมีแค่ choices อย่างเดียว ใช้ได้แค่ปรนัย) =====
  difficulty: "easy" | "medium" | "hard";
  interactionType: QuizInteractionType;
  answerData?: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  imageCaption?: string | null;
  imagePins?: { id: string; x: number; y: number }[] | null;
  explanation?: string | null;
  choices: { text: string; isCorrect: boolean }[];
}

function createEmptyQuestion(
  timestampSeconds: number | null,
  interactionType: QuizInteractionType = "multiple_choice"
): QuestionState {
  return {
    key: genId(),
    questionText: "",
    timestampSeconds,
    explanation: null,
    interactionType,
    // ★ เพิ่มใหม่: คำถามแบบ "ถูก-ผิด" ล็อกตัวเลือกไว้ตายตัวเป็น "ถูก"/"ผิด" 2 ตัวเลือกเสมอ
    // (ผู้สอนแค่เลือกว่าอันไหนคือคำตอบที่ถูก) ต่างจาก multiple_choice ที่เริ่มด้วยช่องว่างให้พิมพ์เอง
    // matching/sequencing ไม่ใช้ choices เลย (เฉลยอยู่ใน answerData ด้านล่างแทน) ปล่อยว่างไว้
    choices:
      interactionType === "true_false"
        ? [
            { text: "ถูก", isCorrect: true },
            { text: "ผิด", isCorrect: false },
          ]
        : interactionType === "matching" || interactionType === "sequencing" || interactionType === "drag_drop"
        ? []
        : interactionType === "multi_select"
        ? [
            { text: "", isCorrect: true },
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
          ]
        : [
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
          ],
    // ===== เพิ่มใหม่: ค่าเริ่มต้นของ matching/sequencing (2 แถว/รายการว่างๆ ให้กรอกต่อ) =====
    answerData:
      interactionType === "matching"
        ? { pairs: [{ left: "", right: "" }, { left: "", right: "" }] }
        : interactionType === "sequencing"
        ? { items: [{ id: "item-0", text: "" }, { id: "item-1", text: "" }], correct_order: ["item-0", "item-1"] }
        : null,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function findVideoSegmentAtTime(segments: VideoSegment[], seconds: number): VideoSegment | null {
  const lastSegment = segments[segments.length - 1];
  return (
    segments.find(
      (segment) =>
        seconds >= segment.start &&
        (seconds < segment.end || (segment.id === lastSegment?.id && seconds <= segment.end))
    ) ?? null
  );
}

export default function LessonDraftForm({
  courseId,
  moduleId,
  initialData,
  workspace = "teacher",
}: LessonDraftFormProps): ReactElement {
  const isAdmin = workspace === "admin";
  const router = useRouter();
  const isEditMode = !!initialData;

  const [activeTab, setActiveTab] = useState<TabKey>("info");

  const [title, setTitle] = useState<string>(initialData?.title ?? "");
  const [contentHtml, setContentHtml] = useState<string>(initialData?.contentHtml ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(initialData?.videoUrl ?? null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [videoSegments, setVideoSegments] = useState<VideoSegment[]>(
    normalizeDefaultSegmentTitles(
      initialData?.videoSegments.map((segment) => ({
        ...segment,
        summary: segment.summary ?? undefined,
        confidence: segment.confidence ?? undefined,
      })) ?? []
    )
  );

  // แบบทดสอบท้ายคอร์สจัดการจากหน้าคอร์สโดยเฉพาะ ส่วนนี้เก็บเฉพาะควิซในวิดีโอ
  const initialVideoQuizzes =
    initialData?.questions.filter((q) => q.timestampSeconds != null).map((q) => ({ key: genId(), ...q })) ?? [];

    const [videoQuizQuestions, setVideoQuizQuestions] = useState<QuestionState[]>(initialVideoQuizzes);
  const [randomMarkers, setRandomMarkers] = useState<RandomMarkerState[]>(
    initialData?.randomMarkers?.map((m) => ({ key: genId(), ...m })) ?? []
  );
  // ===== เพิ่มใหม่: ลาก-วางรายการ sequencing (native HTML5 drag-and-drop) — เก็บว่ากำลังลากรายการ
  // ไหนของคำถามไหนอยู่ (คำถามหลายข้อใช้ state เดียวกันได้ เพราะลากได้ทีละรายการ/ทีละคำถามเท่านั้น)
  const [draggingSequencing, setDraggingSequencing] = useState<{ key: string; index: number } | null>(null);

  // ---- Modal ปักหมุด ----
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<QuizSourceMode>("custom");
  const [pinModalTimestamp, setPinModalTimestamp] = useState(0);
  const [bankOptions, setBankOptions] = useState<BankQuestionOption[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedBankQuestionId, setSelectedBankQuestionId] = useState<string | null>(null);
  // ===== เพิ่มใหม่: ปุ่มกรองระดับความยากในแท็บ "เลือกจากคลังข้อสอบ" — กรองจาก bankOptions ชุดเดียวกัน
  // กับที่ใช้เรนเดอร์รายการ/ตัวนับ เพื่อไม่ให้ตัวนับกับรายการขัดกันเหมือนที่ตัด bank_random ออกไปแล้ว =====
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [randomDifficulty, setRandomDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  // ★ เพิ่มใหม่: ประเภทคำถามที่จะสร้างในแท็บ "สร้างคำถามใหม่" — เดิม hardcode เป็น multiple_choice
  // เสมอ ทั้งที่ quiz_questions มีคอลัมน์ interaction_type รองรับ true_false อยู่แล้ว ตอนนี้เพิ่ม
  // matching/sequencing ด้วย (ควิซนี้เป็น static ตรึงเวลาตายตัว ไม่ใช่สุ่ม — ตรวจในเครื่องได้ทันที)
  const [customQuestionType, setCustomQuestionType] = useState<QuizInteractionType>(
    "multiple_choice"
  );

  // drag_drop: ฟอร์มเติมคำ (โจทย์ที่ใช้ ___ แทนช่องว่าง) แยกต่อคำถาม (key) — คำถามที่โหลดจาก answer_data เดิมจะแปลงกลับมาเป็นฟอร์มตอนเปิดครั้งแรก
  const [dragDropForms, setDragDropForms] = useState<Record<string, DragDropFormState>>({});
  function getDragDropForm(q: QuestionState): DragDropFormState {
    return (
      dragDropForms[q.key] ??
      parseDragDropToForm(q.answerData) ?? { template: "", answers: [], distractors: [] }
    );
  }

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
  // ===== แก้: ตัด bankCounts/bankCountsLoading ออก — เดิมใช้เฉพาะแท็บ "สุ่มจากคลัง" ที่ตัดออกไปแล้ว
  // ไม่มีที่ไหนอ่านค่านี้อีกต่อไป =====
  // ===== เพิ่มใหม่: รูปภาพประกอบคำถาม (ไม่บังคับ) — track ว่ากำลังอัปโหลด/error ของคำถามข้อไหนอยู่ =====
  const [uploadingImageKey, setUploadingImageKey] = useState<string | null>(null);
  const [imageUploadErrors, setImageUploadErrors] = useState<Record<string, string>>({});
  // ===== เพิ่มใหม่: จำชื่อไฟล์/ขนาดไฟล์ไว้โชว์ใต้รูป (เก็บแค่ฝั่ง client ไม่ได้ส่งขึ้น server) =====
  const [imageFileMeta, setImageFileMeta] = useState<Record<string, { name: string; size: number }>>({});
  // ===== เพิ่มใหม่: รูปที่กำลังเปิดแบบขยายเต็ม (Lightbox) — null = ไม่ได้เปิด =====
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  // ครูเพิ่มเอง: โมดัลปักหมุดบนรูปของคำถามข้อที่เลือก (อ้างด้วย key)
  const [pinEditKey, setPinEditKey] = useState<string | null>(null);
  useEffect(() => {
    if (!videoPreviewUrl) return;
    return () => URL.revokeObjectURL(videoPreviewUrl);
  }, [videoPreviewUrl]);
  
  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      (videoSegments.length > 0 || videoQuizQuestions.length > 0 || randomMarkers.length > 0) &&
      !window.confirm("เปลี่ยนวิดีโอแล้วช่วงและควิซที่ปักไว้เดิมจะถูกล้าง ต้องการดำเนินการต่อใช่ไหม?")
    ) {
      e.target.value = "";
      return;
    }
    const fileInput = e.currentTarget;
    const previousVideoUrl = videoUrl;
    setVideoFile(file);
    setVideoUrl(null);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setSubmitError(null);
    setUploadProgress(0);
    setUploadingVideo(true);

    try {
      const url = await uploadVideoToR2(file, setUploadProgress);
      setVideoUrl(url);
      // ล้างตำแหน่งเดิมหลังอัปโหลดไฟล์ใหม่สำเร็จเท่านั้น
      setVideoSegments([]);
      setVideoQuizQuestions([]);
      setRandomMarkers([]);
    } catch (err) {
      // ถ้าอัปโหลดไฟล์ใหม่ล้มเหลว ให้กลับไปใช้วิดีโอเดิมและเลือกไฟล์เดิมซ้ำได้
      setVideoFile(null);
      setVideoUrl(previousVideoUrl);
      setVideoPreviewUrl(null);
      fileInput.value = "";
      setError(err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploadingVideo(false);
      setUploadProgress(null);
    }
  };

  // เรียกทุกครั้งที่มีการแก้ไขเนื้อหา เพื่อสลับกลับจากกล่อง "บันทึกแล้ว" มาเป็นปุ่มบันทึกปกติ
  function markDirty(): void {
    setSubmitted(false);
  }

  // ---------- ตัวช่วยจัดการคำถามในวิดีโอ ----------

  function removeQuestion(setter: typeof setVideoQuizQuestions, key: string): void {
    markDirty();
    setter((prev) => prev.filter((q) => q.key !== key));
  }

  function updateQuestionText(setter: typeof setVideoQuizQuestions, key: string, text: string): void {
    markDirty();
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, questionText: text } : q)));
  }

  function updateQuestionExplanation(setter: typeof setVideoQuizQuestions, key: string, text: string): void {
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, explanation: text || null } : q)));
    markDirty();
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, explanation: text || null } : q)));
  }

  function updateQuestionImageCaption(setter: typeof setVideoQuizQuestions, key: string, text: string): void {
    markDirty();
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, imageCaption: text || null } : q)));
  }
  function updateQuestionPins(
    setter: typeof setVideoQuizQuestions,
    key: string,
    fn: (pins: { id: string; x: number; y: number }[]) => { id: string; x: number; y: number }[]
  ): void {
    markDirty();
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, imagePins: fn(q.imagePins ?? []) } : q)));
  }

  // ===== เพิ่มใหม่: รูปภาพประกอบคำถาม (ไม่บังคับ) =====
  function updateQuestionImageUrl(setter: typeof setVideoQuizQuestions, key: string, url: string | null): void {
    markDirty();
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, imageUrl: url, ...(url === null ? { imageCaption: null, imagePins: null } : {}) } : q)));
    if (url === null) {
      setImageFileMeta((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  async function handleQuestionImageUpload(setter: typeof setVideoQuizQuestions, key: string, file: File | null): Promise<void> {
    if (!file) return;
    const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!ALLOWED.has(file.type)) {
      setImageUploadErrors((prev) => ({ ...prev, [key]: "รองรับเฉพาะไฟล์รูปภาพ PNG, JPEG, WEBP หรือ GIF เท่านั้น" }));
      return;
    }
    setImageUploadErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setUploadingImageKey(key);
    try {
      const res = await fetch("/api/questions/image-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.uploadUrl) {
        setImageUploadErrors((prev) => ({ ...prev, [key]: data.error ?? "เตรียมการอัปโหลดรูปภาพไม่สำเร็จ" }));
        return;
      }
      const putRes = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) {
        setImageUploadErrors((prev) => ({ ...prev, [key]: "อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่" }));
        return;
      }
      updateQuestionImageUrl(setter, key, data.publicUrl);
      setImageFileMeta((prev) => ({ ...prev, [key]: { name: file.name, size: file.size } }));
    } catch {
      setImageUploadErrors((prev) => ({ ...prev, [key]: "อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่" }));
    } finally {
      setUploadingImageKey(null);
    }
  }

  // ===== เพิ่มใหม่: แปลงขนาดไฟล์ (bytes) ให้อ่านง่าย เช่น "1.2 MB" =====
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function updateQuestionTimestamp(setter: typeof setVideoQuizQuestions, key: string, seconds: number): void {
    markDirty();
    setter((prev) => prev.map((q) => (q.key === key ? { ...q, timestampSeconds: seconds } : q)));
  }

  function addChoice(setter: typeof setVideoQuizQuestions, key: string): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => (q.key === key ? { ...q, choices: [...q.choices, { text: "", isCorrect: false }] } : q))
    );
  }

  function removeChoice(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => (q.key === key ? { ...q, choices: q.choices.filter((_, i) => i !== choiceIndex) } : q))
    );
  }

  function updateChoiceText(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number, text: string): void {
    markDirty();
    setter((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => (i === choiceIndex ? { ...c, text } : c)) }
          : q
      )
    );
  }

  // multi_select: ติ๊ก/เอาติ๊กออกทีละตัวเลือก (ถูกได้หลายข้อ)
  function toggleCorrectChoice(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number): void {
    markDirty();
    setter((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => (i === choiceIndex ? { ...c, isCorrect: !c.isCorrect } : c)) }
          : q
      )
    );
  }

  function setCorrectChoice(setter: typeof setVideoQuizQuestions, key: string, choiceIndex: number): void {
    markDirty();
    setter((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, choices: q.choices.map((c, i) => ({ ...c, isCorrect: i === choiceIndex })) }
          : q
      )
    );
  }

  // ===== เพิ่มใหม่: matching (จับคู่) — แก้ answer_data ของคำถามข้อนั้นตรงๆ (shape เดียวกับที่จะ
  // ส่งไป save ทีเดียว ไม่ต้องมี state แยกแล้วค่อยแปลงทีหลังแบบ QuestionBankForm) =====
  function updateMatchingPair(setter: typeof setVideoQuizQuestions, key: string, index: number, field: "left" | "right", value: string): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as MatchingAnswerData | null | undefined) ?? { pairs: [] };
        return { ...q, answerData: { pairs: data.pairs.map((p, i) => (i === index ? { ...p, [field]: value } : p)) } };
      })
    );
  }
  function addMatchingPair(setter: typeof setVideoQuizQuestions, key: string): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as MatchingAnswerData | null | undefined) ?? { pairs: [] };
        return { ...q, answerData: { pairs: [...data.pairs, { left: "", right: "" }] } };
      })
    );
  }
  function removeMatchingPair(setter: typeof setVideoQuizQuestions, key: string, index: number): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as MatchingAnswerData | null | undefined) ?? { pairs: [] };
        return { ...q, answerData: { pairs: data.pairs.filter((_, i) => i !== index) } };
      })
    );
  }

  // ===== เพิ่มใหม่: sequencing (เรียงลำดับ) — เก็บ items ตามลำดับที่ถูกต้อง (บนลงล่าง) เหมือน
  // QuestionBankForm/CourseExamEditor id เป็น "item-N" ตามตำแหน่งเสมอ (regenerate ใหม่ทุกครั้งที่
  // เพิ่ม/ลบ/ย้าย กันชนกันหรือขาดหาย) correct_order จึงตรงกับลำดับ items ในอาเรย์เสมอโดยไม่ต้องเก็บซ้ำ
  function updateSequencingItem(setter: typeof setVideoQuizQuestions, key: string, index: number, text: string): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as SequencingAnswerData | null | undefined) ?? { items: [], correct_order: [] };
        const items = data.items.map((item, i) => (i === index ? { ...item, text } : item));
        return { ...q, answerData: { items, correct_order: items.map((item) => item.id) } };
      })
    );
  }
  function addSequencingItem(setter: typeof setVideoQuizQuestions, key: string): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as SequencingAnswerData | null | undefined) ?? { items: [], correct_order: [] };
        const items = [...data.items, { id: `item-${data.items.length}`, text: "" }];
        return { ...q, answerData: { items, correct_order: items.map((item) => item.id) } };
      })
    );
  }
  function removeSequencingItem(setter: typeof setVideoQuizQuestions, key: string, index: number): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as SequencingAnswerData | null | undefined) ?? { items: [], correct_order: [] };
        const items = data.items.filter((_, i) => i !== index).map((item, i) => ({ id: `item-${i}`, text: item.text }));
        return { ...q, answerData: { items, correct_order: items.map((item) => item.id) } };
      })
    );
  }
  function moveSequencingItem(setter: typeof setVideoQuizQuestions, key: string, index: number, delta: number): void {
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as SequencingAnswerData | null | undefined) ?? { items: [], correct_order: [] };
        const target = index + delta;
        if (target < 0 || target >= data.items.length) return q;
        const texts = data.items.map((item) => item.text);
        const swap = texts[index];
        texts[index] = texts[target];
        texts[target] = swap;
        const items = texts.map((text, i) => ({ id: `item-${i}`, text }));
        return { ...q, answerData: { items, correct_order: items.map((item) => item.id) } };
      })
    );
  }
  // ===== เพิ่มใหม่: ลาก-วาง (native HTML5 drag-and-drop) ย้ายรายการจากตำแหน่งไหนไปไว้ตำแหน่งไหนก็ได้
  // ในคราวเดียว — ต่างจาก moveSequencingItem (สลับกับเพื่อนบ้านทีละสเตป ใช้กับปุ่ม ↑↓) ตรงนี้ลาก
  // ข้ามหลายตำแหน่งได้เลย (splice ออกจากที่เดิม แล้ว insert ตำแหน่งใหม่ เหมือน SortableJS)
  function moveSequencingItemTo(setter: typeof setVideoQuizQuestions, key: string, fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    markDirty();
    setter((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const data = (q.answerData as SequencingAnswerData | null | undefined) ?? { items: [], correct_order: [] };
        const texts = data.items.map((item) => item.text);
        const [moved] = texts.splice(fromIndex, 1);
        texts.splice(toIndex, 0, moved);
        const items = texts.map((text, i) => ({ id: `item-${i}`, text }));
        return { ...q, answerData: { items, correct_order: items.map((item) => item.id) } };
      })
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
    setCustomQuestionType("multiple_choice");
    setSelectedBankQuestionId(null);
    setBankOptions([]);
    setBankDifficultyFilter("all");
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
    markDirty();
    if (pinModalMode === "custom") {
      setVideoQuizQuestions((prev) => [...prev, createEmptyQuestion(pinModalTimestamp, customQuestionType)]);
    } else if (pinModalMode === "bank_manual") {
      const picked = bankOptions.find((q) => q.id === selectedBankQuestionId);
      if (!picked) return;
      // ===== แก้บั๊ก: เดิม copy มาแค่ choices/imageUrl — คำถามแบบจับคู่/เรียงลำดับจากคลังเลยถูกตีเป็น
      // ปรนัยไม่มีตัวเลือกไปเงียบๆ (ไม่มี interactionType/answerData ติดมาด้วย) ตอนนี้ copy ทุกฟิลด์
      // รวมคำบรรยาย/หมุดบนรูปด้วย ให้ตรงกับคำถามต้นฉบับในคลังจริงๆ =====
      setVideoQuizQuestions((prev) => [
        ...prev,
        {
          key: genId(),
          questionText: picked.questionText,
          timestampSeconds: pinModalTimestamp,
          explanation: picked.explanation ?? null,
          imageUrl: picked.imageUrl ?? null,
          imageCaption: picked.imageCaption ?? null,
          imagePins: picked.imagePins ?? null,
          choices: picked.choices,
          interactionType: picked.interactionType,
          answerData: picked.answerData ?? null,
          sourceType: "bank_manual",
          sourceQuestionId: picked.id,
        } as QuestionState,
      ]);
    } else {
      setRandomMarkers((prev) => [
        ...prev,
        { key: genId(), markerId: null, timestampSeconds: pinModalTimestamp, difficulty: randomDifficulty },
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
  const currentVideoSegment = useMemo(
    () => findVideoSegmentAtTime(videoSegments, videoCurrentTime),
    [videoSegments, videoCurrentTime]
  );
  const pinModalVideoSegment = useMemo(
    () => findVideoSegmentAtTime(videoSegments, pinModalTimestamp),
    [videoSegments, pinModalTimestamp]
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

    // กันเลือกข้อสอบจากคลังซ้ำ: ข้อเดียวกันห้ามอยู่ในควิซของบทเรียนนี้เกิน 1 หมุด
    {
      const seenBankIds = new Set<string>();
      for (const q of videoQuizQuestions) {
        const sourceId = q.sourceType === "bank_manual" ? q.sourceQuestionId : null;
        if (!sourceId) continue;
        if (seenBankIds.has(sourceId)) {
          setActiveTab("video-quiz");
          return { error: `ควิซแทรกระหว่างวิดีโอมีข้อสอบจากคลังซ้ำกัน ("${q.questionText.slice(0, 40)}") กรุณาลบข้อที่ซ้ำออกหรือเลือกข้อใหม่` };
        }
        seenBankIds.add(sourceId);
      }
    }

    for (const group of questionGroups) {
      for (const question of group.questions) {
        const interactionType = question.interactionType ?? "multiple_choice";
        const isMatching = interactionType === "matching";
        const isSequencing = interactionType === "sequencing";

        // matching/sequencing เก็บเนื้อหาไว้ใน answerData ไม่ใช่ choices
        // ต้องเช็คว่ามีเนื้อหากรอกไว้บ้างหรือยัง (สำหรับกรณี "กรอกครึ่งๆ กลางๆ" แล้วลืมกรอกคำถาม)
        const isDragDrop = interactionType === "drag_drop";
        const hasPartialContent = isDragDrop
          ? Boolean(getDragDropForm(question).template.trim()) || Boolean(question.explanation?.trim())
          : isMatching
          ? ((question.answerData as MatchingAnswerData | null)?.pairs ?? []).some(
              (pair) => pair.left.trim() || pair.right.trim()
            ) || Boolean(question.explanation?.trim())
          : isSequencing
          ? ((question.answerData as SequencingAnswerData | null)?.items ?? []).some((item) => item.text.trim()) ||
            Boolean(question.explanation?.trim())
          : question.choices.some((choice) => choice.text.trim()) || Boolean(question.explanation?.trim());

        if (!question.questionText.trim()) {
          if (hasPartialContent) {
            setActiveTab(group.tab);
            return { error: `กรุณากรอกคำถามของ${group.label}ให้ครบ` };
          }
          continue;
        }

        if (isMatching) {
          const pairs = (question.answerData as MatchingAnswerData | null)?.pairs ?? [];
          const filledPairs = pairs.filter((pair) => pair.left.trim() && pair.right.trim());
          if (filledPairs.length < 2) {
            setActiveTab(group.tab);
            return { error: `${group.label}แบบจับคู่ต้องมีคู่ที่กรอกครบทั้งสองฝั่งอย่างน้อย 2 คู่` };
          }
          const leftTexts = filledPairs.map((pair) => pair.left.trim());
          if (new Set(leftTexts).size !== leftTexts.length) {
            setActiveTab(group.tab);
            return { error: `${group.label}แบบจับคู่มีฝั่งซ้ายซ้ำกัน กรุณาแก้ไข` };
          }
          continue;
        }

        if (isSequencing) {
          const items = (question.answerData as SequencingAnswerData | null)?.items ?? [];
          const filledItems = items.filter((item) => item.text.trim());
          if (filledItems.length < 2) {
            setActiveTab(group.tab);
            return { error: `${group.label}แบบเรียงลำดับต้องมีรายการที่กรอกอย่างน้อย 2 รายการ` };
          }
          continue;
        }

        if (isDragDrop) {
          const built = buildDragDropAnswerData(getDragDropForm(question));
          if (!built.ok) {
            setActiveTab(group.tab);
            return { error: `${group.label}แบบเติมคำ: ${built.errors.join(" / ")}` };
          }
          continue;
        }

        if (interactionType === "multi_select") {
          const problems = validateMultiSelectAuthoring(question.choices.filter((choice) => choice.text.trim()));
          if (problems.length > 0) {
            setActiveTab(group.tab);
            return { error: `${group.label}แบบเลือกได้หลายคำตอบ: ${problems.join(" / ")}` };
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
      (question) => {
        const { questionText, choices, timestampSeconds, explanation, sourceType, sourceQuestionId, imageUrl, imageCaption, imagePins, interactionType } = question;
        // drag_drop: แปลงฟอร์ม (___ ) เป็น answer_data ตอนบันทึก (ตรวจผ่านแล้วด้านบน)
        let answerData = question.answerData;
        if (interactionType === "drag_drop") {
          const built = buildDragDropAnswerData(getDragDropForm(question));
          if (built.ok) answerData = built.data;
        }
        return {
          questionText,
          choices,
          timestampSeconds,
          explanation,
          sourceType,
          sourceQuestionId,
          imageUrl,
          imageCaption: imageUrl ? imageCaption ?? null : null,
          imagePins: imageUrl && imagePins && imagePins.length > 0 ? imagePins : null,
          interactionType,
          answerData,
        };
      }
    );

    const allRandomMarkers = randomMarkers.map(({ markerId, timestampSeconds, difficulty }) => ({
      markerId,
      timestampSeconds,
      difficulty,
    }));

    const allVideoSegments = videoSegments.map(({ title, summary, start, end, source, confidence }) => ({
      title,
      summary: summary ?? null,
      start,
      end,
      source: source ?? "manual",
      confidence: confidence ?? null,
    }));

    // ความยาววิดีโอจริงที่ browser จับได้จาก <video> ตอนโหลด metadata (videoDuration)
    // ส่งไปเก็บที่ server ด้วย เพราะก่อนหน้านี้ server คำนวณความยาวจาก video segment
    // เท่านั้น ซึ่งบทเรียนส่วนใหญ่ไม่ได้แบ่ง segment เลยได้ 0 เสมอ
    const videoDurationSeconds = videoDuration > 0 ? Math.round(videoDuration) : 0;

    return savedDraftId && savedLessonId
      ? await updateLessonDraft({
          courseId,
          draftId: savedDraftId,
          lessonId: savedLessonId,
          title,
          videoUrl,
          contentHtml,
          videoDurationSeconds,
          videoSegments: allVideoSegments,
          questions: allQuestions,
          randomMarkers: allRandomMarkers,
        })
      : await saveLessonDraft({
          courseId,
          moduleId,
          title,
          videoUrl,
          contentHtml,
          videoDurationSeconds,
          videoSegments: allVideoSegments,
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

    if (isAdmin) {
      setSubmitting(false);
      router.push(`/dashboard/admin/courses/${courseId}`);
      router.refresh();
      return;
    }

    const result = await submitDraftForReview(savedResult.draftId, courseId);

    if (result?.error) {
      console.error("[LessonDraftForm] submitDraftForReview failed:", result.error);
      setSubmitError(result.error);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  // ---------- Tabs ----------

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "info", label: "รายละเอียดบทเรียน" },
    { key: "segments", label: "แบ่งช่วงวิดีโอ", badge: videoSegments.length || undefined },
    { key: "video-quiz", label: "In-Video Quiz", badge: videoQuizQuestions.length || undefined },
  ];

  return (
    <>
    <div className="max-w-3xl">
      {/* Tab bar */}
      <div className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-[#0F1B3D]/[0.08]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-[13.5px] font-bold transition-colors ${
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
            <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">
              ชื่อบทเรียน <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                 markDirty();
                // พิมพ์แก้ไขแล้ว เคลียร์ error เดิมทิ้ง (เดิม error ค้างอยู่จนกว่าจะกด save ใหม่)
                if (error === "กรุณาใส่ชื่อบทเรียน") setError(null);
              }}
              placeholder="เช่น บทที่ 1 บทนำสู่ปัญญาประดิษฐ์"
              aria-invalid={error === "กรุณาใส่ชื่อบทเรียน"}
              className={`w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all ${
                error === "กรุณาใส่ชื่อบทเรียน" ? "border-red-400 focus:!border-red-500" : "border-[#0F1B3D]/[0.08]"
              }`}
            />
            {error === "กรุณาใส่ชื่อบทเรียน" && (
              <p className="mt-1.5 text-[12.5px] font-medium text-red-600">{error}</p>
            )}
          </div>

          <div className="mb-8">
            <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">วิดีโอบทเรียน</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoChange}
              disabled={uploadingVideo}
              className="w-full text-[13.5px] text-[#0F1B3D]/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-[13px] file:font-bold file:bg-[#0F1B3D]/[0.06] file:text-[#0F1B3D] hover:file:bg-[#0F1B3D]/10 disabled:cursor-wait disabled:opacity-60"
            />
            {uploadingVideo && (
              <div className="mt-3" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#0F1B3D]/60">
                  <span>กำลังอัปโหลดวิดีโอ กรุณาอย่าปิดหรือเปลี่ยนหน้า</span>
                  <span>{uploadProgress ?? 0}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0F1B3D]/10">
                  <div
                    className="h-full rounded-full bg-[#FF5A3C] transition-[width] duration-200"
                    style={{ width: `${uploadProgress ?? 0}%` }}
                  />
                </div>
              </div>
            )}
            {videoUrl && !uploadingVideo && (
              <>
                <div className="mt-2 mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] font-semibold text-[#00B37E]">
                    {isEditMode && !videoFile ? "มีวิดีโอเดิมอยู่แล้ว" : "อัปโหลดวิดีโอสำเร็จแล้ว"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("segments")}
                    className="text-left text-[12px] font-bold text-[#FF5A3C] hover:text-[#EB4A2D] sm:text-right"
                  >
                    ไปแบ่งช่วงวิดีโอ →
                  </button>
                </div>
                <video
                  src={videoPreviewUrl ?? videoUrl ?? undefined}
                  controls
                  className="w-full rounded-xl bg-black max-h-80"
                  // ★ บั๊กที่แก้: เดิมจับความยาววิดีโอ (videoDuration) จาก <video> ในแท็บ
                  // "In-Video Quiz" เท่านั้น ถ้าครูแก้บทเรียนแล้วบันทึกโดยไม่เคยเปิดแท็บนั้นเลย
                  // videoDuration จะค้างที่ 0 (ค่าเริ่มต้น) แล้ว handleSave ส่ง 0 ไปทับค่าที่ถูกต้อง
                  // เดิมใน DB ทุกครั้ง — เพิ่ม onLoadedMetadata ที่นี่ด้วย เพราะวิดีโอตัวนี้โหลดทันที
                  // ที่เปิดแท็บ "รายละเอียดบทเรียน" (แท็บ default) จึงจับความยาวได้เร็วกว่าและชัวร์กว่า
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                />
              </>
            )}
          </div>

          <div className="mb-8">
            <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">เนื้อหา / เอกสารประกอบ</label>
            <textarea
              value={contentHtml}
              onChange={(e) => { setContentHtml(e.target.value); markDirty(); }}
              rows={8}
              placeholder="พิมพ์เนื้อหาบทเรียน สรุปประเด็นสำคัญ หรือวางลิงก์เอกสารประกอบ"
              className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y"
            />
          </div>
        </div>
      )}

      {/* ===================== TAB 2: แบ่งช่วงวิดีโอ ===================== */}
      {activeTab === "segments" && (
        <div>
          {isAdmin && (
            <div className="mb-4 rounded-2xl border border-[#FF5A3C]/15 bg-[#FF5A3C]/[0.04] px-4 py-3">
              <p className="text-[12.5px] font-bold text-[#EB4A2D]">โหมดแก้ไขเต็มสำหรับแอดมิน</p>
              <p className="mt-1 text-[11.5px] text-[#0F1B3D]/55">
                แอดมินสามารถเพิ่ม/ตัด/แก้ช่วงวิดีโอได้เต็มแบบเดียวกับครูฝึกสอน
              </p>
            </div>
          )}

          {!videoPreviewUrl && !videoUrl ? (
            <div className="mb-6 rounded-2xl border border-dashed border-[#0F1B3D]/15 bg-white px-6 py-12 text-center">
              <p className="text-[13.5px] font-bold text-[#0F1B3D]/55">อัปโหลดวิดีโอก่อนเริ่มแบ่งช่วง</p>
              <p className="mt-2 text-[12px] text-[#0F1B3D]/40">
                กลับไปที่แท็บ &quot;รายละเอียดบทเรียน&quot; แล้วเลือกไฟล์วิดีโอที่ต้องการใช้
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("info")}
                className="mt-5 rounded-full bg-[#0F1B3D] px-5 py-2.5 text-[12.5px] font-bold text-white transition hover:bg-[#19284F]"
              >
                ไปอัปโหลดวิดีโอ
              </button>
            </div>
          ) : (
            // TEMP FIX (2026-10-01): ปิดใช้งานชั่วคราวเพราะไฟล์ VideoSegmenter.tsx หายไปจากดิสก์
            // (ดูคอมเมนต์ยาวบนสุดของไฟล์นี้) — เอากลับมาใช้ทันทีที่ได้ไฟล์ตัวจริงคืน:
            // <VideoSegmenter
            //   courseId={courseId}
            //   sourceUrl={videoPreviewUrl ?? videoUrl!}
            //   analysisVideoUrl={videoUrl}
            //   sourceFile={videoFile}
            //   segments={videoSegments}
            //   onSegmentsChange={(segments) => { setVideoSegments(segments); markDirty(); }}
            // />
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 py-12 text-center">
              <p className="text-[13.5px] font-semibold text-amber-800">ฟีเจอร์แบ่งช่วงวิดีโอไม่พร้อมใช้งานชั่วคราว</p>
              <p className="mt-1 text-[12px] text-amber-700/80">ไฟล์คอมโพเนนต์หายไปจากเครื่อง — กู้คืนไฟล์ VideoSegmenter.tsx แล้วจะกลับมาใช้ได้ตามปกติ</p>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: In-Video Quiz ===================== */}
      {activeTab === "video-quiz" && (
        <div>
          {!videoPreviewUrl && !videoUrl ? (
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
                  src={videoPreviewUrl ?? videoUrl ?? undefined}
                  controls
                  className="w-full rounded-xl bg-black max-h-80"
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                />
              </div>

              {videoSegments.length > 0 ? (
                <div className="mb-4 rounded-2xl border border-[#0F1B3D]/15 bg-[#EEF2FF] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12.5px] font-extrabold text-[#0F1B3D]">เลือกบทของวิดีโอ</p>
                      <p className="mt-0.5 text-[10.5px] text-[#0F1B3D]/45">ควิซยังอ้างอิงเวลารวมของวิดีโอต้นฉบับ</p>
                    </div>
                    {currentVideoSegment && (
                      <span className="rounded-full bg-white px-3 py-1.5 text-[10.5px] font-bold text-[#0F1B3D] ring-1 ring-[#0F1B3D]/10">
                        กำลังอยู่: {currentVideoSegment.title}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {videoSegments.map((segment) => {
                      const active = currentVideoSegment?.id === segment.id;
                      return (
                        <button
                          key={segment.id}
                          type="button"
                          onClick={() => handleSeekToMarker(segment.start)}
                          className={`rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-[#0F1B3D]/45 bg-white shadow-sm"
                              : "border-transparent bg-white/60 hover:border-[#0F1B3D]/20 hover:bg-white"
                          }`}
                        >
                          <span className="block truncate text-[11.5px] font-extrabold text-[#0F1B3D]">{segment.title}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-[#0F1B3D]">
                            {formatTime(segment.start)}–{formatTime(segment.end)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mb-4 rounded-xl border border-dashed border-[#0F1B3D]/12 bg-[#F7F8FA] px-4 py-3 text-[11.5px] text-[#0F1B3D]/45">
                  ยังไม่ได้แบ่งบท ควิซจะอ้างอิงเวลาของวิดีโอเต็มตามปกติ
                </div>
              )}

              {/* Timeline พร้อม marker ตำแหน่งควิซ */}
              {videoDuration > 0 && (
                <div className="relative mb-2 h-8 overflow-hidden rounded-lg bg-[#0F1B3D]/[0.04]">
                  {videoSegments.map((segment, index) => {
                    const left = Math.max(0, Math.min(100, (segment.start / videoDuration) * 100));
                    const width = Math.max(0, Math.min(100 - left, ((segment.end - segment.start) / videoDuration) * 100));
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        title={`${segment.title} — ${formatTime(segment.start)}–${formatTime(segment.end)}`}
                        onClick={() => handleSeekToMarker(segment.start)}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={`absolute inset-y-0 border-r border-white/70 ${index % 2 === 0 ? "bg-[#FFDED6]/70" : "bg-[#DDD7FF]/70"}`}
                      />
                    );
                  })}
                  {sortedVideoQuizzes.map((q, idx) => {
                    const pct = Math.min(100, ((q.timestampSeconds ?? 0) / videoDuration) * 100);
                    return (
                      <button
                        key={q.key}
                        type="button"
                        title={`ควิซข้อ ${idx + 1} — ${formatTime(q.timestampSeconds ?? 0)}`}
                        onClick={() => handleSeekToMarker(q.timestampSeconds ?? 0)}
                        style={{ left: `${pct}%` }}
                        className="absolute -top-1 z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#FF5A3C] shadow transition-transform hover:scale-110"
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
                        className="absolute -top-1 z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#0F1B3D] shadow transition-transform hover:scale-110"
                      />
                    );
                  })}
                  <div
                    style={{ left: `${(videoCurrentTime / videoDuration) * 100}%` }}
                    className="absolute bottom-0 top-0 z-20 w-[2px] bg-[#0F1B3D]/30"
                  />
                </div>
              )}

              <div className="flex items-center justify-between mb-6">
                <p className="text-[12px] text-[#0F1B3D]/40 font-medium">
                  เวลาปัจจุบัน: {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
                  {currentVideoSegment ? ` • ${currentVideoSegment.title}` : ""}
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
              {sortedVideoQuizzes.map((q) => {
                const segment = findVideoSegmentAtTime(videoSegments, q.timestampSeconds ?? 0);
                return (
                <div key={q.key} className="rounded-2xl border border-[#0F1B3D]/[0.08] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2.5 py-1 rounded-full">
                      ⏱ {formatTime(q.timestampSeconds ?? 0)}
                    </span>
                    {segment && (
                      <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[11px] font-bold text-[#0F1B3D]">
                        {segment.title}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleFetchCurrentTime(q.key)}
                      className="text-[12px] font-bold text-[#0F1B3D] hover:underline"
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

                  {/* ===== เพิ่มใหม่: รูปภาพประกอบคำถาม (ไม่บังคับ) — ปรับ UX ใหม่: กดรูปเพื่อขยายดูเต็ม
                      (Lightbox), ปุ่มจัดการเป็น pill ghost button มีไอคอน, โชว์ชื่อไฟล์+ขนาดไฟล์ ===== */}
                  <div className="mb-3">
                    {q.imageUrl ? (
                      <div className="flex items-start gap-3">
                        {/* ===== แก้บั๊ก: เดิม thumbnail นี้บังคับ aspect-video + object-cover (ครอปรูป
                            ให้เต็มกรอบ) ซึ่งทำให้หมุด % (คำนวณจากสัดส่วนรูปจริงไม่ครอป) ไม่มีทางวางตรงตำแหน่ง
                            ได้เลย แถมไม่เคยมีการวาดหมุดในนี้ด้วย — เปลี่ยนเป็น object-contain + max-h/max-w
                            (ไม่บังคับ w-full) ให้กรอบพอดีเนื้อรูปจริง แล้ววาดหมุดทับได้ถูกตำแหน่ง ===== */}
                        <button
                          type="button"
                          onClick={() => setPinEditKey(q.key)}
                          className="group relative inline-block max-h-28 max-w-[10rem] shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[#0F1B3D]/10 shadow-[0_1px_3px_rgba(15,27,61,0.08)]"
                        >
                          <img src={q.imageUrl} alt="" className="block max-h-28 max-w-[10rem] object-contain transition-transform duration-200 group-hover:scale-105" />
                          {(q.imagePins ?? []).map((pin, pinIndex) => (
                            <span
                              key={pin.id}
                              className="absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[9px] font-bold text-white ring-1 ring-white"
                              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                            >
                              {pinIndex + 1}
                            </span>
                          ))}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                            <svg className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                            </svg>
                          </div>
                        </button>
                        <div className="flex flex-col gap-1.5">
                          <>
                              <input
                                value={q.imageCaption ?? ""}
                                onChange={(e) => updateQuestionImageCaption(setVideoQuizQuestions, q.key, e.target.value)}
                                placeholder="ชื่อภาพ / คำบรรยายใต้ภาพ (ไม่บังคับ)"
                                className="w-full min-w-[14rem] rounded-lg border border-[#0F1B3D]/[0.1] bg-[#F7F8FA] px-2.5 py-1.5 text-[12px] text-[#0F1B3D] outline-none focus:border-[#0F1B3D]/30 focus:bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => setPinEditKey(q.key)}
                                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA]"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a2 2 0 104 0 2 2 0 10-4 0" />
                                </svg>
                                ปักหมุด{(q.imagePins ?? []).length > 0 ? ` (${(q.imagePins ?? []).length})` : ""}
                              </button>
                          </>
                          {imageFileMeta[q.key] && (
                            <p className="text-[11px] text-slate-400">
                              {imageFileMeta[q.key].name} · {formatFileSize(imageFileMeta[q.key].size)}
                            </p>
                          )}
                          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA]">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            เปลี่ยนรูป
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) => handleQuestionImageUpload(setVideoQuizQuestions, q.key, e.target.files?.[0] ?? null)}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => updateQuestionImageUrl(setVideoQuizQuestions, q.key, null)}
                            className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-[#EB4A2D] hover:bg-[#EB4A2D]/10"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 3h5l.5 4h-6l.5-4z" />
                            </svg>
                            ลบรูป
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#0F1B3D]/20 bg-[#F7F8FA] px-3 py-2 text-[12px] font-semibold text-[#0F1B3D]/60 hover:border-[#0F1B3D] hover:text-[#0F1B3D]">
                        {uploadingImageKey === q.key ? "กำลังอัปโหลด..." : "+ อัปโหลดรูปภาพประกอบคำถาม"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          disabled={uploadingImageKey === q.key}
                          onChange={(e) => handleQuestionImageUpload(setVideoQuizQuestions, q.key, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    {imageUploadErrors[q.key] && (
                      <p className="mt-1 text-[12px] font-medium text-[#EB4A2D]">{imageUploadErrors[q.key]}</p>
                    )}
                  </div>

                  {/* ★ เพิ่มใหม่: คำถามแบบ "ถูก-ผิด" ล็อกข้อความตัวเลือกไว้ตายตัว ผู้สอนแค่กดเลือก
                      ว่าอันไหนคือคำตอบที่ถูก แก้ข้อความ/เพิ่ม/ลบตัวเลือกไม่ได้ (ต่างจาก multiple_choice
                      เดิมที่พิมพ์ตัวเลือกเองได้อิสระและเพิ่ม/ลบได้) — ตอนนี้เพิ่ม matching/sequencing
                      อีก 2 แบบ (เขียน answerData ตรงๆ แทน choices) */}
                  {(q.interactionType ?? "multiple_choice") === "true_false" ? (
                    <div className="space-y-2.5 mb-3">
                      <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#0F1B3D]">
                        ถูก-ผิด
                      </span>
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
                          <span className="flex-1 px-3.5 py-2 text-[13.5px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg">
                            {choice.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : q.interactionType === "drag_drop" ? (
                    <div className="mb-3">
                      <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#0F1B3D]">
                        เติมคำ (ลากวาง)
                      </span>
                      <DragDropAuthoring
                        value={getDragDropForm(q)}
                        onChange={(next) => {
                          markDirty();
                          setDragDropForms((prev) => ({ ...prev, [q.key]: next }));
                        }}
                      />
                    </div>
                  ) : q.interactionType === "matching" ? (
                    // ===== Redesign: matching (จับคู่) — การ์ดสีคู่กัน + เส้นเชื่อม เหมือนตัวอย่าง
                    // interactive demo ที่ผู้ใช้ส่งมา (คู่เดียวกันใช้สีเดียวกันทั้งซ้าย-ขวา-เลขลำดับ
                    // ให้มองแล้วรู้ทันทีว่าการ์ดไหนคู่กับการ์ดไหน ไม่ใช่แค่ input เปล่าๆเรียงกัน) =====
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#0F1B3D]">
                          จับคู่
                        </span>
                        <p className="text-[11.5px] text-[#0F1B3D]/35">นักเรียนจะเห็นฝั่งขวาแบบสลับลำดับ</p>
                      </div>
                      {((q.answerData as MatchingAnswerData | null)?.pairs ?? []).map((pair, pIndex, arr) => {
                        const color = MATCHING_PAIR_COLORS[pIndex % MATCHING_PAIR_COLORS.length];
                        return (
                          <div key={pIndex} className="flex items-center gap-1.5">
                            <div
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2 transition-colors"
                              style={{ borderColor: `${color}55`, backgroundColor: `${color}0F` }}
                            >
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {pIndex + 1}
                              </span>
                              <input
                                value={pair.left}
                                onChange={(e) => updateMatchingPair(setVideoQuizQuestions, q.key, pIndex, "left", e.target.value)}
                                placeholder={`ฝั่งซ้าย ${pIndex + 1}`}
                                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#0F1B3D] outline-none placeholder:text-[#0F1B3D]/30"
                              />
                            </div>
                            <div className="h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                            <div
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2 transition-colors"
                              style={{ borderColor: `${color}55`, backgroundColor: `${color}0F` }}
                            >
                              <input
                                value={pair.right}
                                onChange={(e) => updateMatchingPair(setVideoQuizQuestions, q.key, pIndex, "right", e.target.value)}
                                placeholder={`ฝั่งขวา ${pIndex + 1}`}
                                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#0F1B3D] outline-none placeholder:text-[#0F1B3D]/30"
                              />
                            </div>
                            {arr.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeMatchingPair(setVideoQuizQuestions, q.key, pIndex)}
                                className="shrink-0 text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D]"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addMatchingPair(setVideoQuizQuestions, q.key)}
                        className="text-[12.5px] font-bold text-[#0F1B3D] hover:underline"
                      >
                        + เพิ่มคู่จับคู่
                      </button>
                    </div>
                  ) : q.interactionType === "sequencing" ? (
                    // ===== Redesign: sequencing (เรียงลำดับ) — เพิ่ม drag handle + native HTML5
                    // drag-and-drop (ลากข้ามหลายตำแหน่งได้ในทีเดียว ผ่าน moveSequencingItemTo) ตาม
                    // ตัวอย่าง interactive demo ที่ผู้ใช้ส่งมา โดยคงปุ่มลูกศร ↑↓ ไว้เป็นทางเลือกสำรอง
                    // (ลากด้วยนิ้ว/คีย์บอร์ดบางอุปกรณ์ไม่สะดวก) แถวที่ถูกลากอยู่จะจางลง แถวที่ลากเข้า
                    // ใกล้จะไฮไลต์กรอบสีม่วงให้เห็นว่าจะไปวางตรงไหน
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#0F1B3D]">
                          เรียงลำดับ
                        </span>
                        <p className="text-[11.5px] text-[#0F1B3D]/35">ลากการ์ด หรือกดปุ่มลูกศรเพื่อสลับตำแหน่ง</p>
                      </div>
                      {((q.answerData as SequencingAnswerData | null)?.items ?? []).map((item, iIndex, arr) => {
                        const isDragging = draggingSequencing?.key === q.key && draggingSequencing.index === iIndex;
                        return (
                          <div
                            key={iIndex}
                            draggable
                            onDragStart={() => setDraggingSequencing({ key: q.key, index: iIndex })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggingSequencing && draggingSequencing.key === q.key) {
                                moveSequencingItemTo(setVideoQuizQuestions, q.key, draggingSequencing.index, iIndex);
                              }
                              setDraggingSequencing(null);
                            }}
                            onDragEnd={() => setDraggingSequencing(null)}
                            className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 transition-all ${
                              isDragging
                                ? "border-[#0F1B3D]/30 bg-[#0F1B3D]/5 opacity-40"
                                : "border-transparent hover:border-[#0F1B3D]/15"
                            }`}
                          >
                            <span className="shrink-0 cursor-grab text-[#0F1B3D]/25" aria-hidden="true" title="ลากเพื่อสลับลำดับ">
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" />
                                <circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" />
                                <circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
                              </svg>
                            </span>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[12px] font-bold text-white">
                              {iIndex + 1}
                            </span>
                            <input
                              value={item.text}
                              onChange={(e) => updateSequencingItem(setVideoQuizQuestions, q.key, iIndex, e.target.value)}
                              placeholder={`รายการที่ ${iIndex + 1}`}
                              className="min-w-0 flex-1 px-3.5 py-2 text-[13.5px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all"
                            />
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                disabled={iIndex === 0}
                                onClick={() => moveSequencingItem(setVideoQuizQuestions, q.key, iIndex, -1)}
                                className="rounded-lg border border-[#0F1B3D]/10 px-2 py-1 text-xs font-bold text-[#0F1B3D]/60 disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={iIndex === arr.length - 1}
                                onClick={() => moveSequencingItem(setVideoQuizQuestions, q.key, iIndex, 1)}
                                className="rounded-lg border border-[#0F1B3D]/10 px-2 py-1 text-xs font-bold text-[#0F1B3D]/60 disabled:opacity-30"
                              >
                                ↓
                              </button>
                              {arr.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeSequencingItem(setVideoQuizQuestions, q.key, iIndex)}
                                  className="text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D]"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addSequencingItem(setVideoQuizQuestions, q.key)}
                        className="text-[12.5px] font-bold text-[#0F1B3D] hover:underline"
                      >
                        + เพิ่มรายการ
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 mb-3">
                      {q.interactionType === "multi_select" && (
                        <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#0F1B3D]">
                          เลือกได้หลายคำตอบ — ติ๊กทุกข้อที่ถูก
                        </span>
                      )}
                      {q.choices.map((choice, cIndex) => (
                        <div key={cIndex} className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              q.interactionType === "multi_select"
                                ? toggleCorrectChoice(setVideoQuizQuestions, q.key, cIndex)
                                : setCorrectChoice(setVideoQuizQuestions, q.key, cIndex)
                            }
                            className={`w-5 h-5 ${q.interactionType === "multi_select" ? "rounded-md" : "rounded-full"} border-2 flex items-center justify-center shrink-0 transition-colors ${
                              choice.isCorrect ? "border-[#00B37E]" : "border-[#0F1B3D]/20"
                            }`}
                            title="ตั้งเป็นคำตอบที่ถูก"
                          >
                            {choice.isCorrect &&
                              (q.interactionType === "multi_select" ? (
                                <span className="text-[12px] font-black leading-none text-[#00B37E]">✓</span>
                              ) : (
                                <span className="w-2.5 h-2.5 rounded-full bg-[#00B37E]" />
                              ))}
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
                        className="text-[12.5px] font-bold text-[#0F1B3D] hover:underline pl-7"
                      >
                        + เพิ่มตัวเลือก
                      </button>
                    </div>
                  )}

                  <textarea
                    value={q.explanation ?? ""}
                    onChange={(e) => updateQuestionExplanation(setVideoQuizQuestions, q.key, e.target.value)}
                    placeholder="คำอธิบายเฉลย (แสดงให้นักเรียนเห็นหลังตอบ ไม่บังคับ)"
                    rows={2}
                    className="w-full px-3.5 py-2 text-[13px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y"
                  />
                </div>
                );
              })}
            </div>
            
          )}
                    {sortedRandomMarkers.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">สุ่มจากคลังข้อสอบ</p>
              {sortedRandomMarkers.map((m) => {
                const segment = findVideoSegmentAtTime(videoSegments, m.timestampSeconds);
                return (
                <div key={m.key} className="flex items-center gap-3 rounded-2xl border border-[#0F1B3D]/20 bg-[#0F1B3D]/[0.04] p-4">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0F1B3D] bg-[#0F1B3D]/10 px-2.5 py-1 rounded-full shrink-0">
                    ⏱ {formatTime(m.timestampSeconds)}
                  </span>
                  <span className="text-[13px] font-semibold text-[#0F1B3D]">
                    สุ่มจากคลัง · ระดับ{m.difficulty === "easy" ? "ง่าย" : m.difficulty === "medium" ? "ปานกลาง" : "ยาก"}
                    {segment ? ` · ${segment.title}` : ""}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => { setRandomMarkers((prev) => prev.filter((item) => item.key !== m.key)); markDirty(); }}
                    className="text-[12.5px] font-bold text-[#0F1B3D]/40 hover:text-[#EB4A2D]"
                  >
                    ลบ
                  </button>
                </div>
                );
              })}
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
              {/* [แก้คำ] เดิมบอกว่า "ส่งให้แอดมินตรวจสอบเรียบร้อยแล้ว รอการอนุมัติ" ทำให้เข้าใจผิดว่า
                  ถึงแอดมินแล้วจริง ๆ ทั้งที่ submitDraftForReview ส่งแค่บทเรียนนี้บทเดียว — ถ้าคอร์ส
                  ยังเป็นฉบับร่าง (ไม่เคย publish มาก่อน) จะยังไม่ถึงแอดมินจนกว่าจะกด "ส่งคอร์สเข้าตรวจ"
                  ที่หน้าคอร์สด้วย (เว้นแต่คอร์ส publish แล้วและกำลังแก้บทที่ publish ไปแล้ว กรณีนั้น
                  ระบบจะดึงคอร์สกลับเข้าคิว pending ให้อัตโนมัติ) */}
              <p className="text-[13.5px] font-semibold text-[#00885F]">
                บันทึกบทเรียนนี้เรียบร้อยแล้ว
              </p>
              <p className="mt-1 text-[12px] text-[#00885F]/70">
                {isAdmin
                  ? "จัดทำบททดสอบท้ายคอร์สให้ครบ แล้วเผยแพร่จากหน้าจัดการคอร์ส"
                  : "ทำครบทุกบทแล้วอย่าลืมกด \"ส่งคอร์สเข้าตรวจ\" ที่หน้าหลักของคอร์ส คอร์สถึงจะไปถึงแอดมิน (หากกลับมาแก้ไขบทนี้ ต้องบันทึกและส่งตรวจใหม่อีกครั้ง)"}
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
              {/* [แก้คำ] ย่อให้สั้น กระชับที่สุดตามที่ครูขอ — ข้อความเดิมยาวเกินไป และแบ่งเคส
                  savedDraftId/isAdmin จนซับซ้อนเกินจำเป็นสำหรับฝั่งครู (non-admin) รวบเหลือ
                  หัวข้อ+คำอธิบายคงที่อันเดียว ยังคงบอกให้ไปกด "ส่งคอร์สเข้าตรวจ" ที่หน้าคอร์สด้วย
                  เพราะปุ่มนี้ส่งแค่บทเรียนนี้บทเดียว (ดูรายละเอียดกลไกที่ submitDraftForReview) */}
              <p className="text-[13.5px] font-semibold text-[#0F1B3D]">
                {isAdmin
                  ? savedDraftId
                    ? "บันทึกฉบับร่างแล้ว คุณยังแก้ไขและบันทึกซ้ำได้"
                    : "บันทึกฉบับร่างของบทเรียนนี้"
                  : "จัดการบทเรียน"}
              </p>
              <p className="mt-1 text-[12px] text-[#0F1B3D]/45">
                {isAdmin
                  ? "บันทึกบทเรียนก่อน แล้วจัดทำบททดสอบท้ายคอร์สให้ครบก่อนเผยแพร่ทั้งคอร์ส"
                  : "บันทึกร่างไว้แก้ต่อได้ เมื่อครบทุกบทให้ไปกดส่งตรวจที่หน้าหลัก"}
              </p>
              {submitError && <p className="mt-2 text-[13px] font-semibold text-[#EB4A2D]">{submitError}</p>}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {/* [แก้ UI] เดิมปุ่มขาวใช้ข้อความยาว ("บันทึกการแก้ไข"/"บันทึกฉบับร่าง") ตกบรรทัดเป็น
                  2 บรรทัดในบางความกว้างหน้าจอ ขณะที่ปุ่มส้มอยู่บรรทัดเดียว ทำให้สองปุ่มดูไม่สมมาตร
                  กัน — ย่อคำให้สั้นลงเหลือคำเดียวทั้งคู่ (บันทึก / ส่งตรวจ) และเติม whitespace-nowrap
                  กันตกบรรทัดอีก ความหมายเต็มยังอยู่ใน subtext ด้านบนอยู่แล้ว ไม่ต้องพึ่งปุ่มสื่อสารเอง
                  ทั้งหมด */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || submitting || uploadingVideo}
                title={uploadingVideo ? "กรุณารอให้อัปโหลดวิดีโอเสร็จก่อน" : undefined}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[#0F1B3D]/15 px-6 py-3 text-[13.5px] font-bold text-[#0F1B3D] transition-colors hover:bg-[#0F1B3D]/[0.04] disabled:opacity-60"
              >
                {uploadingVideo
                  ? `รออัปโหลด ${uploadProgress ?? 0}%`
                  : saving
                    ? "กำลังบันทึก..."
                    : "บันทึกร่าง"}
              </button>
              <button
                type="button"
                onClick={handleSubmitForReview}
                disabled={saving || submitting || uploadingVideo}
                title={uploadingVideo ? "กรุณารอให้อัปโหลดวิดีโอเสร็จก่อน" : undefined}
                className="shrink-0 whitespace-nowrap rounded-full bg-[#FF5A3C] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#EB4A2D] disabled:opacity-60"
              >
                {uploadingVideo
                  ? `รออัปโหลด ${uploadProgress ?? 0}%`
                  : submitting
                  ? "กำลังบันทึก..."
                  : isAdmin
                    ? "บันทึกและกลับไปที่คอร์ส"
                    : "บันทึกบทเรียน"}
              </button>
            </div>
          </div>
        )}
      </div>
  {pinModalOpen && typeof document !== "undefined" && createPortal(
  <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h3 className="mb-1 text-[15px] font-bold text-[#0F1B3D]">
        เพิ่มแบบทดสอบที่เวลา {formatTime(pinModalTimestamp)}
      </h3>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-[#0F1B3D]/50">แหล่งที่มาของข้อสอบ</p>
        {pinModalVideoSegment && (
          <span className="rounded-full bg-[#0F1B3D]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#0F1B3D]">
            {pinModalVideoSegment.title}
          </span>
        )}
      </div>

      {/* ===== แก้: ตัดแท็บ "สุ่มจากคลังข้อสอบ" ออกตามที่ตกลงกัน — Pop-up Quiz ใช้กติกาเดียว: คำถาม
          ของบทนั้น ทุกคนเห็นข้อเดียวกัน ไม่สุ่มต่อคนอีกต่อไป เหลือแค่ "สร้างคำถามใหม่" และ "เลือกจากคลัง
          ข้อสอบ" (หมุดสุ่มที่ปักไว้เดิมก่อนหน้านี้ยังแก้ไข/ลบได้ตามปกติในส่วนรายการด้านล่าง ไม่กระทบ) ===== */}
      <div className="mb-5 flex rounded-xl bg-[#0F1B3D]/[0.05] p-1">
        {([
          ["custom", "สร้างคำถามใหม่"],
          ["bank_manual", "เลือกจากคลังข้อสอบ"],
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
        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-[#0F1B3D]/70">ประเภทคำถาม</label>
          {/* ★ เพิ่มใหม่: ให้เลือกประเภทคำถามได้ตั้งแต่ตอนสร้าง (เดิม hardcode เป็นปรนัยเสมอ) — ตอนนี้
              เพิ่ม Matching/Sequencing ด้วย เปลี่ยนจากแถวเดียว (flex) เป็น grid 2x2 เพราะมี 4 ตัวเลือก
              แล้ว แถวเดียวจะแคบเกินไปในโมดัลกว้าง max-w-md นี้ */}
          {/* เปลี่ยนจากปุ่ม grid 2x2 เป็น dropdown (select) */}
          <div className="relative mb-3">
            <select
              value={customQuestionType}
              onChange={(e) => setCustomQuestionType(e.target.value as typeof customQuestionType)}
              className="w-full cursor-pointer appearance-none rounded-xl border border-[#0F1B3D]/15 bg-white px-4 py-2.5 pr-10 text-[13px] font-bold text-[#0F1B3D] shadow-sm outline-none transition-colors hover:border-[#0F1B3D]/30 focus:border-[#FF5C3A] focus:ring-2 focus:ring-[#FF5C3A]/20"
            >
              {(
                [
                  ["multiple_choice", "ปรนัย (เลือกตอบ)"],
                  ["true_false", "ถูก-ผิด"],
                  ...(MULTI_SELECT_ENABLED ? ([["multi_select", "เลือกหลายคำตอบ"]] as [typeof customQuestionType, string][]) : []),
                  ...(DRAG_DROP_ENABLED ? ([["drag_drop", "เติมคำ (ลากวาง)"]] as [typeof customQuestionType, string][]) : []),
                  ["matching", "จับคู่"],
                  ["sequencing", "เรียงลำดับ"],
                ] as [typeof customQuestionType, string][]
              ).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F1B3D]/50"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 7.5l5 5 5-5" />
            </svg>
          </div>
          <div className="rounded-xl border border-dashed border-[#0F1B3D]/15 bg-[#F7F8FA] px-4 py-5 text-center">
            <p className="text-[13px] text-[#0F1B3D]/60">
              {(() => {
                const labelByType: Record<typeof customQuestionType, string> = {
                  multiple_choice: "ปรนัย",
                  true_false: "แบบถูก-ผิด",
                  multi_select: "แบบเลือกหลายคำตอบ",
                  drag_drop: "แบบเติมคำ",
                  matching: "แบบจับคู่",
                  sequencing: "แบบเรียงลำดับ",
                };
                const nextStepByType: Record<typeof customQuestionType, string> = {
                  multiple_choice: "คำถาม/ตัวเลือก",
                  true_false: "คำถาม",
                  multi_select: "คำถาม/ตัวเลือก (ติ๊กข้อที่ถูกได้หลายข้อ)",
                  drag_drop: "โจทย์/คำตอบของแต่ละช่องว่าง",
                  matching: "คำถาม/คู่ที่จับคู่",
                  sequencing: "คำถาม/รายการที่จะเรียง",
                };
                return (
                  <>
                    กดยืนยันเพื่อสร้างคำถาม{labelByType[customQuestionType]}ที่เวลานี้
                    แล้วไปกรอก{nextStepByType[customQuestionType]}ได้ในขั้นถัดไป
                  </>
                );
              })()}
            </p>
          </div>
        </div>
      )}

      {/* --- แท็บ: เลือกจากคลัง ===== แก้ใหม่ทั้งหมด: เดิมเป็น <select> ธรรมดา ไม่มีป้ายระดับ/ประเภท
          ไม่มีตัวนับ ไม่มีปุ่มกรอง — ตอนนี้เพิ่มทั้งหมด โดยตัวนับ/ปุ่มกรอง/รายการ ใช้ bankOptions
          ชุดเดียวกันทั้งหมด (คำนวณด้วย useMemo ด้านล่าง) ไม่ยิง query แยกอีกชุดเหมือน bank_random เดิม
          เพื่อกันปัญหา "ตัวนับบอกมี แต่รายการบอกไม่พบ" (หรือกลับกัน) ที่เคยเกิดจากสองแหล่งข้อมูลไม่ตรงกัน --- */}
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
          ) : (() => {
            const DIFFICULTY_LABEL: Record<"easy" | "medium" | "hard", string> = { easy: "ง่าย", medium: "ปานกลาง", hard: "ยาก" };
            const DIFFICULTY_BADGE: Record<"easy" | "medium" | "hard", string> = {
              easy: "bg-emerald-50 text-emerald-700",
              medium: "bg-amber-50 text-amber-700",
              hard: "bg-red-50 text-red-700",
            };
            const TYPE_LABEL: Record<BankQuestionOption["interactionType"], string> = {
              multiple_choice: "ปรนัย",
              true_false: "ถูก-ผิด",
              multi_select: "เลือกหลายคำตอบ",
              drag_drop: "เติมคำ",
              matching: "จับคู่",
              sequencing: "เรียงลำดับ",
            };
            // ===== ตัวนับแยกระดับ — นับจาก bankOptions ชุดเดียวกับที่ใช้เรนเดอร์รายการด้านล่างเป๊ะๆ =====
            // ซ่อนข้อที่ถูกเลือกไปแล้วในบทเรียนนี้ (กันเลือกซ้ำ)
            const usedBankIds = new Set(
              videoQuizQuestions.filter((vq) => vq.sourceType === "bank_manual" && vq.sourceQuestionId).map((vq) => vq.sourceQuestionId as string)
            );
            const availableBankOptions = bankOptions.filter((q) => !usedBankIds.has(q.id));
            const counts = { easy: 0, medium: 0, hard: 0 };
            for (const q of availableBankOptions) counts[q.difficulty] += 1;
            const filteredBankOptions =
              bankDifficultyFilter === "all" ? availableBankOptions : availableBankOptions.filter((q) => q.difficulty === bankDifficultyFilter);
            const picked = bankOptions.find((q) => q.id === selectedBankQuestionId) ?? null;
            return (
              <>
                {/* ===== ปุ่มกรองระดับความยาก พร้อมตัวนับต่อป้าย ===== */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {([
                    ["all", `ทั้งหมด (${availableBankOptions.length})`],
                    ["easy", `ง่าย (${counts.easy})`],
                    ["medium", `ปานกลาง (${counts.medium})`],
                    ["hard", `ยาก (${counts.hard})`],
                  ] as [typeof bankDifficultyFilter, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBankDifficultyFilter(key)}
                      className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                        bankDifficultyFilter === key
                          ? "bg-[#0F1B3D] text-white"
                          : "bg-[#0F1B3D]/[0.06] text-[#0F1B3D]/60 hover:bg-[#0F1B3D]/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="mb-2 block text-[12.5px] font-semibold text-[#0F1B3D]/70">
                  เลือกคำถามจากคลัง
                </label>
                {filteredBankOptions.length === 0 ? (
                  <p className="rounded-xl bg-[#F7F8FA] px-4 py-3 text-[12.5px] text-[#0F1B3D]/40">
                    ไม่พบคำถามระดับ{DIFFICULTY_LABEL[bankDifficultyFilter as "easy" | "medium" | "hard"] ?? ""}ที่กรองไว้ — ลองเลือกระดับอื่น
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-[#0F1B3D]/10 bg-[#F7F8FA] p-2">
                    {filteredBankOptions.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setSelectedBankQuestionId(q.id)}
                        className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          selectedBankQuestionId === q.id
                            ? "border-[#FF5C3A] bg-white shadow-sm"
                            : "border-transparent bg-white/60 hover:bg-white"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            selectedBankQuestionId === q.id ? "border-[#FF5C3A]" : "border-[#0F1B3D]/20"
                          }`}
                        >
                          {selectedBankQuestionId === q.id && <span className="h-2 w-2 rounded-full bg-[#FF5C3A]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-[#0F1B3D]">
                            {q.questionText.length > 60 ? `${q.questionText.slice(0, 60)}…` : q.questionText}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${DIFFICULTY_BADGE[q.difficulty]}`}>
                              {DIFFICULTY_LABEL[q.difficulty]}
                            </span>
                            <span className="rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10.5px] font-bold text-[#0F1B3D]/60">
                              {TYPE_LABEL[q.interactionType]}
                            </span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Preview card ของคำถามที่เลือก — รองรับทุกประเภท (เดิมรองรับแค่ปรนัย/ถูกผิด) */}
                {picked && (
                  <div className="mt-3 rounded-xl border border-[#0F1B3D]/10 bg-[#F7F8FA] p-4">
                    <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">
                      ตัวอย่างข้อสอบ
                    </p>
                    <p className="mb-3 text-[13.5px] font-semibold text-[#0F1B3D]">{picked.questionText}</p>
                    {/* ===== แก้บั๊ก: ตัวอย่างข้อสอบตรงนี้ขาดรูปประกอบ + หมุดไปเลยตั้งแต่แรก (เดิมแสดงแค่
                        questionText กับ choices/matching/sequencing) — เพิ่มรูป+หมุด+คำบรรยายด้วย ใช้
                        pattern เดียวกับที่อื่น: inline-block + max-w-full ไม่ใช้ w-full กันหมุด % เพี้ยน ===== */}
                    {picked.imageUrl && (
                      <div className="mb-3 inline-block max-w-full">
                        <div className="relative">
                          <img src={picked.imageUrl} alt="" className="max-h-48 max-w-full rounded-lg border border-[#0F1B3D]/[0.08] object-contain bg-white" />
                          {(picked.imagePins ?? []).map((pin, pinIndex) => (
                            <span
                              key={pin.id}
                              className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[10px] font-bold text-white ring-2 ring-white"
                              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                            >
                              {pinIndex + 1}
                            </span>
                          ))}
                        </div>
                        {picked.imageCaption && (
                          <p className="mt-0 text-center text-[11.5px] font-semibold text-[#0F1B3D]/50">{picked.imageCaption}</p>
                        )}
                      </div>
                    )}
                    {picked.interactionType === "drag_drop" && <DragDropAnswerSummary answerData={picked.answerData} />}
                    {(picked.interactionType === "multiple_choice" || picked.interactionType === "true_false" || picked.interactionType === "multi_select") && (
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
                    )}
                    {picked.interactionType === "matching" && (() => {
                      const data = (picked.answerData as MatchingAnswerData | null) ?? { pairs: [] };
                      return (
                        <div className="space-y-1.5">
                          {data.pairs.map((pair, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[13px]">
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                                style={{ backgroundColor: MATCHING_PAIR_COLORS[i % MATCHING_PAIR_COLORS.length] }}
                              >
                                {i + 1}
                              </span>
                              <span className="text-[#0F1B3D]">{pair.left}</span>
                              <span className="text-[#0F1B3D]/30">→</span>
                              <span className="text-[#0F1B3D]/75">{pair.right}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {picked.interactionType === "sequencing" && (() => {
                      const data = (picked.answerData as SequencingAnswerData | null) ?? { items: [], correct_order: [] };
                      const orderedTexts = data.correct_order
                        .map((itemId) => data.items.find((item) => item.id === itemId)?.text)
                        .filter((text): text is string => !!text);
                      return (
                        <ul className="space-y-1.5">
                          {orderedTexts.map((text, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[13px]">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[10.5px] font-bold text-white">
                                {i + 1}
                              </span>
                              <span className="text-[#0F1B3D]">{text}</span>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ===== แก้: ตัดแท็บ "สุ่มจากคลัง" ออกทั้งบล็อก ตามที่ตกลงกันว่า Pop-up Quiz ไม่สุ่มต่อคนอีกต่อไป
          randomDifficulty ยังเหลือไว้เฉยๆ เพราะ confirmPinModal's else-branch (รองรับ type "bank_random")
          ยังอ้างถึงอยู่ — แต่ไม่มีทางถูกเรียกใช้จาก UI นี้แล้ว เพราะไม่มีปุ่มแท็บให้เลือกอีก ===== */}

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
  </div>,
  document.body
)}
    </div>

    {pinEditKey && typeof document !== "undefined" && createPortal((() => {
      const pq = videoQuizQuestions.find((x) => x.key === pinEditKey);
      if (!pq || !pq.imageUrl) return null;
      const pins = pq.imagePins ?? [];
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6" onClick={() => setPinEditKey(null)}>
          <div className="flex max-h-[90vh] w-fit max-w-[min(92vw,640px)] flex-col gap-3 rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-[#0F1B3D]/50">คลิกบนภาพเพื่อปักหมุดถัดไป · คลิกที่ตัวหมุดเพื่อลบทีละอัน</p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" disabled={pins.length === 0} title="ย้อนกลับ (ลบหมุดล่าสุด)" onClick={() => updateQuestionPins(setVideoQuizQuestions, pq.key, (p) => p.slice(0, -1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#0F1B3D]/15 text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-30">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l-4-4 4-4m-4 4h11a4 4 0 010 8h-1" /></svg>
                </button>
                <button type="button" disabled={pins.length === 0} onClick={() => updateQuestionPins(setVideoQuizQuestions, pq.key, () => [])} className="rounded-full border border-[#0F1B3D]/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-30">ล้างหมุดทั้งหมด</button>
                <button type="button" onClick={() => setPinEditKey(null)} aria-label="ปิด" className="flex h-8 w-8 items-center justify-center rounded-full text-[#0F1B3D]/50 hover:bg-[#F7F8FA] hover:text-[#0F1B3D]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="relative self-center overflow-hidden rounded-xl bg-[#F1F5F9]">
              <img
                src={pq.imageUrl}
                alt=""
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  updateQuestionPins(setVideoQuizQuestions, pq.key, (p) => [...p, { id: genId(), x, y }]);
                }}
                className="block max-h-[65vh] max-w-full cursor-crosshair object-contain"
              />
              {pins.map((pin, pinIndex) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); updateQuestionPins(setVideoQuizQuestions, pq.key, (p) => p.filter((x) => x.id !== pin.id)); }}
                  title="กดเพื่อลบหมุดนี้"
                  className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[12px] font-bold text-white ring-2 ring-white hover:bg-[#EB4A2D]"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                >
                  {pinIndex + 1}
                </button>
              ))}
            </div>
            {pq.imageCaption && <p className="text-center text-[12.5px] font-semibold text-[#0F1B3D]">{pq.imageCaption}</p>}
          </div>
        </div>
      );
    })(), document.body)}

    {/* ===== เพิ่มใหม่: Lightbox ขยายรูปประกอบคำถามแบบเต็มจอ ===== */}
    {lightboxImageUrl && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6"
        onClick={() => setLightboxImageUrl(null)}
      >
        <button
          type="button"
          onClick={() => setLightboxImageUrl(null)}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="ปิด"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <img
          src={lightboxImageUrl}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        />
      </div>
    , document.body)}
    </>
  );
}
