"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveCourseFinalExam, saveCourseExamConfig, previewCourseExamSample, type CourseExamQuestionInput, type PreviewQuestion } from "@/app/dashboard/course-exam-actions";
import type { DragDropAnswerData, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
import { buildDragDropAnswerData, parseDragDropToForm, type DragDropFormState } from "@/lib/quiz/drag-drop-form";
import DragDropAuthoring from "@/components/teacher/DragDropAuthoring";
import { validateMultiSelectAuthoring } from "@/lib/quiz/validators/authoring";
import { MULTI_SELECT_ENABLED, DRAG_DROP_ENABLED } from "@/lib/quiz/config/rollout";

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (x/y เป็น % ของขนาดภาพ 0-100) ตามแบบ LessonDraftForm.tsx/
// QuestionBankForm.tsx =====
interface ImagePin { id: string; x: number; y: number }
// ชุดสีไล่ตามลำดับคู่จับคู่ — คู่เดียวกัน (ซ้าย+ขวา) ใช้สีเดียวกันเสมอ (เหมือน 2 ไฟล์ข้างต้น)
const MATCHING_PAIR_COLORS = ["#0F1B3D", "#00B37E", "#FF8A3D", "#2F8FFF", "#FF4FA3", "#C98500"];
function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ===== เพิ่มใหม่: matching/sequencing ในโหมด "กำหนดข้อสอบเอง" — เก็บเป็น matchingPairs/
// sequencingItems แยกจาก answerData ระหว่างแก้ไข (เหมือน QuestionBankForm.tsx) แล้วค่อยแปลงเป็น
// answerData ตอนกด "บันทึกบททดสอบท้ายคอร์ส" — ง่ายกว่าให้ผู้ใช้แก้ answerData ดิบตรงๆ
interface MatchingPairState { left: string; right: string }
interface EditableQuestion {
  key: string;
  questionText: string;
  explanation: string | null;
  imageUrl: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  imageCaption: string | null;
  imagePins: ImagePin[] | null;
  interactionType: InteractionType;
  choices: { text: string; isCorrect: boolean }[];
  matchingPairs: MatchingPairState[];
  sequencingItems: string[];
  dragDrop: DragDropFormState;
}

type Difficulty = "easy" | "medium" | "hard";
type ActiveTab = "random" | "manual";
type InteractionType = "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing";
// ยุบโหมด Preset ออกแล้ว (ของจริงไม่มีคอร์สไหนใช้เลย) เหลือ Custom โหมดเดียว — lessonId เป็น ""
// ในสเตตของ UI แปลว่า "ทั้งคอร์ส ไม่ระบุบท" (แปลงเป็น null ตอนส่งให้ server action)
interface CustomConstraintRow {
  key: string;
  lessonId: string;
  difficulty: Difficulty;
  count: number;
}

function emptyQuestion(): EditableQuestion {
  return {
    key: crypto.randomUUID(),
    questionText: "",
    explanation: null,
    imageUrl: null,
    imageCaption: null,
    imagePins: null,
    interactionType: "multiple_choice",
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
    matchingPairs: [{ left: "", right: "" }, { left: "", right: "" }],
    sequencingItems: ["", ""],
    dragDrop: { template: "", answers: [], distractors: [] },
  };
}

// ===== เพิ่มใหม่: แปลงคำถามที่โหลดมาจาก server (CourseExamQuestionInput) เป็น EditableQuestion
// — ถ้าเป็น matching/sequencing ต้องแยก answerData ออกมาเป็น matchingPairs/sequencingItems ก่อน
// (sequencing: เรียง items ตาม correct_order เดิม ไม่ใช่ลำดับดิบใน items[] เพื่อให้ครูเห็น "ลำดับที่ถูก"
// ตามที่เคยบันทึกไว้จริงตอนเปิดมาแก้ไข — เหมือน logic เดียวกับ QuestionBankForm.tsx)
function toEditableQuestion(input: CourseExamQuestionInput): EditableQuestion {
  const answerData = input.answerData ?? null;
  let matchingPairs: MatchingPairState[] = [{ left: "", right: "" }, { left: "", right: "" }];
  let sequencingItems: string[] = ["", ""];
  if (input.interactionType === "matching") {
    const pairs = (answerData as MatchingAnswerData | null)?.pairs;
    if (pairs?.length) matchingPairs = pairs.map((pair) => ({ left: pair.left, right: pair.right }));
  } else if (input.interactionType === "sequencing") {
    const data = answerData as SequencingAnswerData | null;
    if (data?.items?.length && data.correct_order?.length) {
      const textById = new Map(data.items.map((item) => [item.id, item.text]));
      sequencingItems = data.correct_order.map((id) => textById.get(id) ?? "");
    }
  }
  const dragDrop: DragDropFormState =
    (input.interactionType === "drag_drop" ? parseDragDropToForm(answerData) : null) ??
    { template: "", answers: [], distractors: [] };
  return {
    key: crypto.randomUUID(),
    questionText: input.questionText,
    explanation: input.explanation,
    imageUrl: input.imageUrl ?? null,
    imageCaption: input.imageCaption ?? null,
    imagePins: input.imagePins ?? null,
    interactionType: input.interactionType,
    choices: input.choices,
    matchingPairs,
    sequencingItems,
    dragDrop,
  };
}

export default function CourseExamEditor({
  courseId,
  initialQuestions,
  lessons,
  initialExamConfig,
  workspace = "teacher",
  readOnly = false, // ⬅️ ใหม่: default false เพื่อไม่กระทบหน้า teacher เดิม
}: {
  courseId: string;
  initialQuestions: CourseExamQuestionInput[];
  lessons: { id: string; title: string }[];
  workspace?: "teacher" | "admin";
  readOnly?: boolean; // ⬅️ ใหม่
  initialExamConfig?: {
    customConstraints: { lessonId: string | null; difficulty: Difficulty; count: number }[] | null;
  } | null;
}) {
  const router = useRouter();

  // แท็บที่เปิดอยู่ — ถ้ามีกติกาสุ่มอยู่แล้วให้เปิดแท็บสุ่มก่อน ไม่งั้นเปิดแท็บพิมพ์เอง
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialExamConfig ? "random" : "manual");

  const [questions, setQuestions] = useState<EditableQuestion[]>(
    initialQuestions.length ? initialQuestions.map(toEditableQuestion) : [emptyQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  function updateQuestion(key: string, updates: Partial<EditableQuestion>) {
    if (readOnly) return; //กันเผื่อ event หลุดมา
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key ? { ...question, ...updates } : question));
  }

  // ===== เพิ่มใหม่: รูปภาพประกอบคำถาม (ไม่บังคับ) =====
  const [uploadingImageKey, setUploadingImageKey] = useState<string | null>(null);
  const [imageUploadErrors, setImageUploadErrors] = useState<Record<string, string>>({});
  // ===== เพิ่มใหม่: ชื่อ/ขนาดไฟล์รูป + Lightbox (ปักหมุด/แคปชัน) — key ของคำถาม เพราะหน้านี้มีได้หลายข้อ
  // (ตามแบบ LessonDraftForm.tsx ที่เป็น array คำถามเหมือนกัน) =====
  const [imageFileMeta, setImageFileMeta] = useState<Record<string, { name: string; size: number }>>({});
  const [lightboxKey, setLightboxKey] = useState<string | null>(null);

  async function handleQuestionImageUpload(key: string, file: File | null) {
    if (readOnly || !file) return;
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
      updateQuestion(key, { imageUrl: data.publicUrl });
      setImageFileMeta((prev) => ({ ...prev, [key]: { name: file.name, size: file.size } }));
    } catch {
      setImageUploadErrors((prev) => ({ ...prev, [key]: "อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่" }));
    } finally {
      setUploadingImageKey(null);
    }
  }

  function updateChoice(key: string, choiceIndex: number, text: string) {
    if (readOnly) return; 
    setIsDirty(true); 
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      choices: question.choices.map((choice, index) => index === choiceIndex ? { ...choice, text } : choice),
    } : question));
  }

  function setCorrectChoice(key: string, choiceIndex: number) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      // multi_select ติ๊กถูกได้หลายข้อ (สลับค่าเฉพาะข้อที่กด) / ประเภทอื่นถูกได้ข้อเดียว
      choices: question.choices.map((choice, index) =>
        question.interactionType === "multi_select"
          ? (index === choiceIndex ? { ...choice, isCorrect: !choice.isCorrect } : choice)
          : { ...choice, isCorrect: index === choiceIndex }
      ),
    } : question));
  }

   // ===== เพิ่มใหม่: เปลี่ยน interaction_type ของคำถามข้อนั้น =====
  function setInteractionType(key: string, interactionType: InteractionType) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => {
      if (question.key !== key) return question;
      if (interactionType === "true_false") {
        // ล็อก choices เป็น "จริง"/"เท็จ" อัตโนมัติ (ถ้ายังไม่ใช่ True/False อยู่แล้ว)
        const alreadyTrueFalse =
          question.choices.length === 2 && question.choices[0].text === "จริง" && question.choices[1].text === "เท็จ";
        return {
          ...question,
          interactionType,
          choices: alreadyTrueFalse ? question.choices : [
            { text: "จริง", isCorrect: true },
            { text: "เท็จ", isCorrect: false },
          ],
        };
      }
      if (interactionType === "multiple_choice") {
        // สลับมาจาก multi_select ที่ถูกหลายข้อ → เหลือข้อแรกข้อเดียว (กฎของ multiple_choice)
        const firstCorrect = question.choices.findIndex((choice) => choice.isCorrect);
        const correctCount = question.choices.filter((choice) => choice.isCorrect).length;
        if (correctCount > 1) {
          return {
            ...question,
            interactionType,
            choices: question.choices.map((choice, index) => ({ ...choice, isCorrect: index === firstCorrect })),
          };
        }
      }
      return { ...question, interactionType };
    }));
  }

  function setDragDrop(key: string, dragDrop: DragDropFormState) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => (question.key === key ? { ...question, dragDrop } : question)));
  }

  // ===== เพิ่มใหม่: matching (จับคู่ซ้าย-ขวา) — จัดการต่อคำถาม (question.key) เพราะโหมดนี้มีได้หลายข้อ =====
  function updateMatchingPair(key: string, index: number, field: "left" | "right", value: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      matchingPairs: question.matchingPairs.map((pair, i) => i === index ? { ...pair, [field]: value } : pair),
    } : question));
  }
  function addMatchingPair(key: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, matchingPairs: [...question.matchingPairs, { left: "", right: "" }] }
      : question));
  }
  function removeMatchingPair(key: string, index: number) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, matchingPairs: question.matchingPairs.filter((_, i) => i !== index) }
      : question));
  }

  // ===== เพิ่มใหม่: sequencing (เรียงลำดับ) — เก็บแค่ text[] เรียงจากบนลงล่าง (ลำดับที่กรอก = ลำดับที่ถูก) =====
  function updateSequencingItem(key: string, index: number, value: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, sequencingItems: question.sequencingItems.map((text, i) => i === index ? value : text) }
      : question));
  }
  function addSequencingItem(key: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, sequencingItems: [...question.sequencingItems, ""] }
      : question));
  }
  function removeSequencingItem(key: string, index: number) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, sequencingItems: question.sequencingItems.filter((_, i) => i !== index) }
      : question));
  }
  function moveSequencingItem(key: string, index: number, delta: number) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => {
      if (question.key !== key) return question;
      const next = [...question.sequencingItems];
      const target = index + delta;
      if (target < 0 || target >= next.length) return question;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...question, sequencingItems: next };
    }));
  }
  // ===== เพิ่มใหม่: ลาก-วางสลับลำดับ (ตามแบบ LessonDraftForm.tsx/QuestionBankForm.tsx) — ต้องเก็บ
  // key ของคำถามด้วย เพราะหน้านี้มีได้หลายข้อ ลากแค่ในการ์ดคำถามเดียวกันเท่านั้น
  const [draggingSequencing, setDraggingSequencing] = useState<{ key: string; index: number } | null>(null);
  function moveSequencingItemTo(key: string, fromIndex: number, toIndex: number) {
    if (readOnly || fromIndex === toIndex) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => {
      if (question.key !== key) return question;
      const next = [...question.sequencingItems];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...question, sequencingItems: next };
    }));
  }

  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (ตามแบบ LessonDraftForm.tsx/
  // QuestionBankForm.tsx) — ทุกฟังก์ชันกันด้วย readOnly ก่อนเหมือนตัวจัดการอื่นๆ ในไฟล์นี้ =====
  function updateImageCaption(key: string, text: string) {
    if (readOnly) return;
    updateQuestion(key, { imageCaption: text || null });
  }
  function addImagePin(key: string, x: number, y: number) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, imagePins: [...(question.imagePins ?? []), { id: genId(), x, y }] }
      : question));
  }
  function removeImagePin(key: string, pinId: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, imagePins: (question.imagePins ?? []).filter((p) => p.id !== pinId) }
      : question));
  }
  function undoLastImagePin(key: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, imagePins: (question.imagePins ?? []).slice(0, -1) }
      : question));
  }
  function clearImagePins(key: string) {
    if (readOnly) return;
    setIsDirty(true);
    setQuestions((current) => current.map((question) => question.key === key
      ? { ...question, imagePins: [] }
      : question));
  }

  async function save() {
    if (readOnly) return; // ⬅️ ใหม่: กันยิง action จากฝั่ง admin เด็ดขาด

    if (lessons.length === 0) {
      setError("กรุณาเพิ่มและบันทึกบทเรียนอย่างน้อย 1 บทก่อนสร้างบททดสอบท้ายคอร์ส");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q.interactionType === "multiple_choice") {
        // ===== เพิ่มใหม่: validate ตัวเลือกของ multiple_choice ก่อนส่ง — เดิมไม่มีการเช็คนี้เลย
        // ทำให้ถ้าครูเพิ่มช่องตัวเลือกไว้แล้วลืมกรอกข้อความ (เช่นเพิ่มไว้ 4 ช่อง กรอกจริง 3 ช่อง)
        // ระบบจะกดบันทึกผ่านเฉยๆ แล้ว server กรองช่องเปล่าทิ้งไปเงียบๆ (เหลือ 3 ตัวเลือกโดยไม่เตือน)
        const filled = q.choices.filter((c) => c.text.trim());
        if (filled.length < 2) {
          setError(`คำถามข้อ ${i + 1} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก`);
          return;
        }
        if (filled.length !== q.choices.length) {
          setError(`คำถามข้อ ${i + 1} มีตัวเลือกที่กรอกไม่ครบ — กรุณากรอกข้อความให้ครบทุกตัวเลือก หรือกดลบตัวเลือกที่ไม่ใช้ทิ้งก่อนบันทึก`);
          return;
        }
        if (filled.filter((c) => c.isCorrect).length !== 1) {
          setError(`คำถามข้อ ${i + 1} ต้องเลือกคำตอบที่ถูกต้องเพียง 1 ตัวเลือก`);
          return;
        }
      } else if (q.interactionType === "multi_select") {
        // ใช้ตัวตรวจกลางตัวเดียวกับ server — รายงานทุกปัญหาที่เจอ (ช่องว่าง/ซ้ำ/ไม่มีข้อถูก/ถูกทุกข้อ)
        const problems = validateMultiSelectAuthoring(q.choices);
        if (problems.length > 0) {
          setError(`คำถามข้อ ${i + 1} (Multiple Select): ${problems.join(" / ")}`);
          return;
        }
      } else if (q.interactionType === "drag_drop") {
        // ตรวจด้วยตัวสร้าง/validator กลาง (ช่องว่าง/คำซ้ำ/เกินลิมิต) — server ตรวจซ้ำอีกชั้น
        const built = buildDragDropAnswerData(q.dragDrop);
        if (!built.ok) {
          setError(`คำถามข้อ ${i + 1} (Drag & Drop): ${built.errors.join(" / ")}`);
          return;
        }
      } else if (q.interactionType === "true_false") {
        const filled = q.choices.filter((c) => c.text.trim());
        if (filled.length !== 2) {
          setError(`คำถามข้อ ${i + 1} เป็น True/False ต้องมี 2 ตัวเลือกเท่านั้น`);
          return;
        }
      } else if (q.interactionType === "matching") {
        // ===== เพิ่มใหม่: validate matching ก่อนส่ง (server ก็เช็คอีกชั้น แต่เช็คฝั่ง client ก่อนช่วยให้เห็น error เร็วกว่า)
        const filledPairs = q.matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim());
        if (filledPairs.length < 2) {
          setError(`คำถามข้อ ${i + 1} (Matching) ต้องกรอกคู่จับคู่ให้ครบทั้งฝั่งซ้ายและขวา อย่างน้อย 2 คู่`);
          return;
        }
        // ===== เพิ่มใหม่: เช็คว่ามีคู่ที่กรอกไม่ครบ (เว้นว่างไปเลย หรือกรอกแค่ฝั่งเดียว) ค้างอยู่ไหม —
        // เดิมเช็คแค่ "มีครบ 2 คู่ที่กรอกสมบูรณ์" เท่านั้น ถ้ามีคู่ที่ 3 เว้นว่างไว้ (เช่นกดเพิ่มคู่ไว้
        // เผื่อแล้วไม่ได้กรอก) จะผ่านการเช็คนี้ไปเงียบๆ แล้ว server กรองคู่เปล่าทิ้งไปโดยไม่เตือนครูเลย
        if (filledPairs.length !== q.matchingPairs.length) {
          setError(`คำถามข้อ ${i + 1} (Matching) มีคู่จับคู่ที่กรอกไม่ครบ — กรุณากรอกทั้งฝั่งซ้ายและขวาให้ครบทุกคู่ หรือกดลบคู่ที่ไม่ใช้ทิ้งก่อนบันทึก`);
          return;
        }
        const leftValues = filledPairs.map((pair) => pair.left.trim());
        if (new Set(leftValues).size !== leftValues.length) {
          setError(`คำถามข้อ ${i + 1} (Matching) รายการฝั่งซ้ายห้ามซ้ำกัน`);
          return;
        }
      } else if (q.interactionType === "sequencing") {
        // ===== เพิ่มใหม่: validate sequencing ก่อนส่ง
        const filledItems = q.sequencingItems.map((text) => text.trim()).filter(Boolean);
        if (filledItems.length < 2) {
          setError(`คำถามข้อ ${i + 1} (Sequencing) ต้องกรอกรายการที่จะให้เรียงลำดับ อย่างน้อย 2 รายการ`);
          return;
        }
        // ===== เพิ่มใหม่: เช็คว่ามีรายการที่เว้นว่างไว้ค้างอยู่ไหม (เหมือนที่เช็คให้ matching ด้านบน) —
        // เดิมเช็คแค่ "มีครบ 2 รายการที่กรอกแล้ว" เท่านั้น ถ้ามีรายการที่ 3 เว้นว่างไว้จะผ่านไปเงียบๆ
        if (filledItems.length !== q.sequencingItems.length) {
          setError(`คำถามข้อ ${i + 1} (Sequencing) มีรายการที่ยังไม่กรอก — กรุณากรอกข้อความให้ครบทุกรายการ หรือกดลบรายการที่ไม่ใช้ทิ้งก่อนบันทึก`);
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // ===== เพิ่มใหม่: แปลง matchingPairs/sequencingItems เป็น answerData (jsonb) ก่อนส่งให้ server
      // — sequencing ใช้ลำดับที่กรอกจากบนลงล่างเป็นลำดับที่ถูกต้องเลย (เหมือน QuestionBankForm.tsx)
      const payloadQuestions: CourseExamQuestionInput[] = questions.map((q) => {
        let answerData: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null = null;
        if (q.interactionType === "matching") {
          const pairs = q.matchingPairs
            .map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() }))
            .filter((pair) => pair.left && pair.right);
          answerData = { pairs };
        } else if (q.interactionType === "sequencing") {
          const items = q.sequencingItems
            .map((text) => text.trim())
            .filter(Boolean)
            .map((text, index) => ({ id: `item-${index}`, text }));
          answerData = { items, correct_order: items.map((item) => item.id) };
        } else if (q.interactionType === "drag_drop") {
          const built = buildDragDropAnswerData(q.dragDrop);
          if (built.ok) answerData = built.data; // ตรวจผ่านแล้วตอน validate ด้านบน
        }
        return {
          questionText: q.questionText,
          explanation: q.explanation,
          choices: q.choices,
          interactionType: q.interactionType,
          imageUrl: q.imageUrl,
          imageCaption: q.imageCaption,
          imagePins: q.imagePins,
          answerData,
        };
      });
      const result = await saveCourseFinalExam({ courseId, questions: payloadQuestions });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("บันทึกบททดสอบท้ายคอร์สเรียบร้อยแล้ว");
      setIsDirty(false);
      router.refresh();
    } catch {
      setError("เชื่อมต่อระบบบันทึกข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  const [customConstraints, setCustomConstraints] = useState<CustomConstraintRow[]>(
    initialExamConfig?.customConstraints?.length
      ? initialExamConfig.customConstraints.map((c) => ({ ...c, lessonId: c.lessonId ?? "", key: crypto.randomUUID() }))
      : [{ key: crypto.randomUUID(), lessonId: lessons[0]?.id ?? "", difficulty: "easy", count: 1 }]
  );
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const constraintSum = customConstraints.reduce((sum, c) => sum + c.count, 0);

  async function saveConfig() {
    if (readOnly) return; // ⬅️ ใหม่
    if (lessons.length === 0) {
      setConfigError("กรุณาเพิ่มและบันทึกบทเรียนอย่างน้อย 1 บทก่อนตั้งค่าข้อสอบแบบสุ่ม");
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    setConfigMessage(null);
    try {
      const result = await saveCourseExamConfig({
        courseId,
        customConstraints: customConstraints.map(({ lessonId, difficulty, count }) => ({
          lessonId: lessonId || null,
          difficulty,
          count,
        })),
      });
      if (result.error) {
        setConfigError(result.error);
        return;
      }
      setConfigMessage("บันทึกกติกาสุ่มข้อสอบเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      setConfigError("เชื่อมต่อระบบบันทึกกติกาข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setConfigSaving(false);
    }
  }

  function updateConstraint(key: string, updates: Partial<CustomConstraintRow>) {
    if (readOnly) return; // ⬅️ ใหม่
    setCustomConstraints((current) => current.map((c) => (c.key === key ? { ...c, ...updates } : c)));
  }

  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function handlePreview() {
    // หมายเหตุ: ดูตัวอย่างเป็น read-only อยู่แล้วโดยธรรมชาติ (แค่สุ่มโชว์ ไม่เขียนอะไรลง DB)
    // เลยยังปล่อยให้ admin กดดูได้แม้ readOnly=true — ไม่ต้อง guard
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewQuestions(null);
    if (lessons.length === 0) {
      setPreviewLoading(false);
      setPreviewError("กรุณาเพิ่มและบันทึกบทเรียนอย่างน้อย 1 บทก่อนดูตัวอย่างข้อสอบ");
      return;
    }
    // ★ แก้ใหม่: ส่งกติกาปัจจุบันบนหน้าจอ (ที่อาจยังไม่ได้กดบันทึก) ไปพรีวิวตรงๆ แทนที่จะให้ server
    // ไปอ่านกติกาที่บันทึกไว้ล่าสุด — กันไม่ให้พรีวิวคนละโหมดกับที่กำลังดูอยู่บนจอ
    try {
      const result = await previewCourseExamSample({
        courseId,
        customConstraints: customConstraints.map(({ lessonId, difficulty, count }) => ({
          lessonId: lessonId || null,
          difficulty,
          count,
        })),
      });
      if (result.error) {
        setPreviewError(result.error);
        return;
      }
      setPreviewQuestions(result.questions ?? []);
    } catch {
      setPreviewError("โหลดตัวอย่างข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPreviewLoading(false);
    }
  }

  const tabButtonClass = (tab: ActiveTab) =>
    `flex-1 rounded-xl px-5 py-4 text-left transition ${
      activeTab === tab
        ? "border-2 border-[#FF5A3C] bg-[#FF5A3C]/[0.06]"
        : "border-2 border-[#0F1B3D]/[0.08] bg-white hover:border-[#0F1B3D]/20"
    }`;

  // ===== เพิ่มใหม่: หาคำถามที่กำลังเปิด Lightbox อยู่ (ตามแบบ LessonDraftForm.tsx) =====
  const lightboxQuestion = questions.find((q) => q.key === lightboxKey) ?? null;

  return (
    <>
    <div>
      {/* ⬅️ ใหม่: แบนเนอร์บอกว่ากำลังดูโหมดรีวิว (อ่านอย่างเดียว) */}
      {readOnly && (
        <div className="mb-6 rounded-xl border border-[#0F1B3D]/10 bg-[#0F1B3D]/[0.03] px-4 py-3">
          <p className="text-[12.5px] font-bold text-[#0F1B3D]/60">
            โหมดรีวิว ดูบททดสอบท้ายคอร์สได้อย่างเดียว ไม่สามารถแก้ไขจากหน้านี้
          </p>
        </div>
      )}

      {!readOnly && lessons.length === 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-[13.5px] font-bold text-amber-800">ต้องมีบทเรียนก่อนสร้างบททดสอบท้ายคอร์ส</p>
          <p className="mt-1 text-[12.5px] leading-5 text-amber-700">
            ข้อสอบท้ายคอร์สจะผูกกับข้อมูลบทเรียน จึงต้องเพิ่มและบันทึกบทเรียนอย่างน้อย 1 บทก่อน
          </p>
          <Link
            href={`/dashboard/${workspace}/courses/${courseId}/lessons/new`}
            className="mt-3 inline-flex rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#EB4A2D]"
          >
            + เพิ่มบทเรียนแรก
          </Link>
        </div>
      )}

      {/* ===== Tab Switcher ===== */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setActiveTab("random")} className={tabButtonClass("random")}>
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-extrabold ${activeTab === "random" ? "text-[#FF5A3C]" : "text-[#0F1B3D]/70"}`}>สุ่มจากคลังข้อสอบ</span>
            {initialExamConfig && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">ใช้งานอยู่</span>}
          </div>
          <p className="mt-1 text-[12px] text-[#0F1B3D]/45">สุ่มข้อสอบจากคลังอัตโนมัติตามเงื่อนไขที่กำหนด</p>
        </button>
        <button type="button" onClick={() => setActiveTab("manual")} className={tabButtonClass("manual")}>
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-extrabold ${activeTab === "manual" ? "text-[#FF5A3C]" : "text-[#0F1B3D]/70"}`}>กำหนดข้อสอบเอง</span>
            {!initialExamConfig && initialQuestions.length > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">ใช้งานอยู่</span>}
          </div>
          <p className="mt-1 text-[12px] text-[#0F1B3D]/45">สร้างชุดข้อสอบเฉพาะสำหรับคอร์สนี้ ผู้เรียนทุกคนจะได้รับข้อสอบเดียวกัน</p>
        </button>
      </div>

      {!readOnly && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
          💡 หมายเหตุ: ระบบจะใช้รูปแบบข้อสอบตามแท็บที่บันทึกล่าสุดเพียงรูปแบบเดียว
        </p>
      )}

      {/* ===== แท็บ: สุ่มจากคลังข้อสอบ ===== */}
      {activeTab === "random" && (
        <section className="mb-6 rounded-2xl border border-[#0F1B3D]/[0.08] bg-[#F7F8FA] p-5 sm:p-6">
          <h2 className="text-[14.5px] font-bold text-[#0F1B3D]">ตั้งค่าการสุ่มข้อสอบ</h2>
          <p className="mt-0.5 text-[12.5px] text-[#0F1B3D]/40">กำหนดเงื่อนไขเพื่อสุ่มชุดข้อสอบสำหรับผู้เรียน</p>

          {lessons.length === 0 ? (
            // ★ เพิ่มใหม่: คอร์สยังไม่มีบทเรียนเลย ดร็อปดาวน์เลือกบทเรียนจะว่างเปล่าไม่มีตัวเลือกให้กด
            // เลยไม่แสดง UI กำหนดเงื่อนไขรายบทเลย โชว์ข้อความอธิบายแทนให้เข้าใจง่ายกว่า
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700">
              คอร์สนี้ยังไม่มีบทเรียนเลย จึงยังไม่สามารถตั้งค่าข้อสอบท้ายคอร์สได้ กรุณาเพิ่มบทเรียนก่อน
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {customConstraints.map((constraint) => (
                <div key={constraint.key} className="flex flex-wrap items-center gap-2">
                  <select value={constraint.lessonId} disabled={readOnly} onChange={(e) => updateConstraint(constraint.key, { lessonId: e.target.value })} className="rounded-lg border border-[#0F1B3D]/10 bg-white px-3 py-2 text-[13px] disabled:opacity-60">
                    <option value="">— ทั้งคอร์ส (ไม่ระบุบท) —</option>
                    {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                  </select>
                  <select value={constraint.difficulty} disabled={readOnly} onChange={(e) => updateConstraint(constraint.key, { difficulty: e.target.value as Difficulty })} className="rounded-lg border border-[#0F1B3D]/10 bg-white px-3 py-2 text-[13px] disabled:opacity-60">
                    <option value="easy">ง่าย</option>
                    <option value="medium">ปานกลาง</option>
                    <option value="hard">ยาก</option>
                  </select>
                  <input type="number" min={1} value={constraint.count} disabled={readOnly} onChange={(e) => updateConstraint(constraint.key, { count: Number(e.target.value) })} className="w-20 rounded-lg border border-[#0F1B3D]/10 bg-white px-3 py-2 text-[13px] disabled:opacity-60" />
                  <span className="text-[12.5px] text-[#0F1B3D]/40">ข้อ</span>
                  {!readOnly && customConstraints.length > 1 && (
                    <button type="button" onClick={() => setCustomConstraints((c) => c.filter((item) => item.key !== constraint.key))} className="text-xs font-bold text-red-500">ลบ</button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button type="button" onClick={() => setCustomConstraints((c) => [...c, { key: crypto.randomUUID(), lessonId: lessons[0]?.id ?? "", difficulty: "easy", count: 1 }])} className="text-xs font-bold text-[#3157D5]">+ เพิ่มเงื่อนไข</button>
              )}
              <p className="text-[12px] font-semibold text-[#0F1B3D]/50">
                รวมทั้งหมด {constraintSum} ข้อ
              </p>
            </div>
          )}

          {configError && <p role="alert" className="mt-4 whitespace-pre-line rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{configError}</p>}
          {configMessage && <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{configMessage}</p>}

          {!readOnly && (
            lessons.length === 0 ? (
              <Link href={`/dashboard/${workspace}/courses/${courseId}/lessons/new`} className="mt-4 inline-flex rounded-full bg-[#FF5A3C] px-6 py-2.5 text-[13px] font-extrabold text-white hover:bg-[#EB4A2D]">
                + เพิ่มบทเรียนก่อนสร้างข้อสอบ
              </Link>
            ) : (
              <button type="button" disabled={configSaving} onClick={saveConfig} className="mt-4 rounded-full bg-[#0F1B3D] px-6 py-2.5 text-[13px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {configSaving ? "กำลังบันทึก..." : "บันทึกกติกาสุ่มข้อสอบ"}
              </button>
            )
          )}


          {/* ปุ่มดูตัวอย่างปล่อยให้ admin กดได้ด้วย (read-only โดยธรรมชาติ) */}
          <button type="button" disabled={previewLoading || lessons.length === 0} onClick={handlePreview} className="mt-2.5 ml-2.5 rounded-full border border-[#0F1B3D]/15 bg-white px-6 py-2.5 text-[13px] font-bold text-[#0F1B3D] disabled:cursor-not-allowed disabled:opacity-60">
            {previewLoading ? "กำลังสุ่มตัวอย่าง..." : "ดูตัวอย่างชุดข้อสอบ"}
          </button>

          {previewError && (
            <p role="alert" className="mt-3 whitespace-pre-line rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{previewError}</p>
          )}

          {previewQuestions && (
            <div className="mt-4 space-y-2.5 rounded-xl border border-[#0F1B3D]/10 bg-white p-4">
              <p className="text-[12.5px] font-bold text-[#0F1B3D]/50">ตัวอย่างชุดข้อสอบ ({previewQuestions.length} ข้อ) — สุ่มเพื่อดูตัวอย่างเท่านั้น ไม่ใช่ชุดที่นักเรียนจะได้จริง</p>
              {previewQuestions.map((question, index) => (
                <div key={question.id} className="rounded-lg border border-[#0F1B3D]/[0.06] bg-[#F7F8FA] p-3.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-[#0F1B3D]">{index + 1}. {question.questionText}</p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-500">
                      {question.interactionType === "true_false"
                        ? "True/False"
                        : question.interactionType === "multi_select"
                        ? "Multiple Select"
                        : question.interactionType === "drag_drop"
                        ? "Drag & Drop"
                        : question.interactionType === "matching"
                        ? "Matching"
                        : question.interactionType === "sequencing"
                        ? "Sequencing"
                        : "Multiple Choice"}
                    </span>
                  </div>
                  {/* ===== แก้: เพิ่มหมุด + คำบรรยายใต้ภาพ (เดิมมีแค่ imageUrl เฉยๆ ขาดหมุด/คำบรรยายไปเลย) =====
                      ใช้ pattern เดิม: inline-block + max-w-full ให้กรอบพอดีตัวรูปจริง หมุด % จะตรงตำแหน่ง ===== */}
                  {question.imageUrl && (
                    <div className="mt-2 inline-block max-w-full">
                      <div className="relative">
                        <img src={question.imageUrl} alt="" className="h-28 max-w-full rounded-lg border border-[#0F1B3D]/[0.08] object-contain bg-white" />
                        {(question.imagePins ?? []).map((pin, pinIndex) => (
                          <span
                            key={pin.id}
                            className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[10px] font-bold text-white ring-2 ring-white"
                            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                          >
                            {pinIndex + 1}
                          </span>
                        ))}
                      </div>
                      {question.imageCaption && (
                        <p className="mt-0 text-center text-[11.5px] font-semibold text-[#0F1B3D]/50">{question.imageCaption}</p>
                      )}
                    </div>
                  )}
                  {(question.interactionType === "multiple_choice" || question.interactionType === "true_false" || question.interactionType === "multi_select") && (
                    <ul className="mt-2 space-y-1">
                      {question.choices.map((choice, choiceIndex) => (
                        <li key={choiceIndex} className={`text-[12.5px] ${choice.isCorrect ? "font-bold text-emerald-600" : "text-[#0F1B3D]/60"}`}>
                          {choice.isCorrect ? "✓ " : "· "}{choice.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* ===== แก้: เปลี่ยนจากข้อความล้วน "ฝั่งซ้าย: ... / ฝั่งขวา: ..." เป็นการ์ดสีเหมือนหน้าแก้ไขจริง
                      (matching ตอน preview เป็นแบบสลับลำดับ ไม่เฉลยคู่จริง จึงให้สีแค่ฝั่งซ้าย ส่วนฝั่งขวา
                      แสดงเป็นตัวเลือกเฉยๆ ไม่ผูกสี เพื่อไม่ให้ดูเหมือนเฉลยคำตอบ) ===== */}
                  {question.interactionType === "matching" && question.matching && (
                    <div className="mt-2 space-y-1.5">
                      {question.matching.left.map((leftText, leftIndex) => {
                        const color = MATCHING_PAIR_COLORS[leftIndex % MATCHING_PAIR_COLORS.length];
                        return (
                          <div key={leftIndex} className="flex items-center gap-1.5 text-[12.5px]">
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                              style={{ backgroundColor: color }}
                            >
                              {leftIndex + 1}
                            </span>
                            <span className="text-[#0F1B3D]">{leftText}</span>
                          </div>
                        );
                      })}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {question.matching.rightOptions.map((rightText, rightIndex) => (
                          <span key={rightIndex} className="rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0F1B3D]/70">
                            {rightText}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {question.interactionType === "drag_drop" && question.dragDrop && (
                    <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-7 text-[#0F1B3D]">
                      {question.dragDrop.template.replace(/\{\{[^}]+\}\}/g, " ____ ")}
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {question.dragDrop.words.map((word) => (
                          <span key={word.id} className="rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0F1B3D]/70">
                            {word.text}
                          </span>
                        ))}
                      </span>
                    </p>
                  )}
                  {question.interactionType === "sequencing" && question.sequencing && (
                    <ul className="mt-2 space-y-1.5">
                      {question.sequencing.map((item, seqIndex) => (
                        <li key={item.id} className="flex items-center gap-1.5 text-[12.5px]">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[10.5px] font-bold text-white">
                            {seqIndex + 1}
                          </span>
                          <span className="text-[#0F1B3D]">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===== แท็บ: พิมพ์ข้อสอบเอง ===== */}
      {activeTab === "manual" && (
        <div>
          <div className="space-y-5">
            {questions.map((question, questionIndex) => {
              const isChoicesEditable = (question.interactionType === "multiple_choice" || question.interactionType === "multi_select") && !readOnly; // ⬅️ แก้: เพิ่ม !readOnly
              return (
                <section key={question.key} className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 sm:p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-[#0F1B3D]/35">ข้อ {questionIndex + 1}</span>
                    {/* ===== dropdown เลือก interaction type ===== */}
                    <select
                      value={question.interactionType}
                      disabled={readOnly} // ⬅️ ใหม่
                      onChange={(e) => setInteractionType(question.key, e.target.value as InteractionType)}
                      className="rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3 py-1.5 text-[12.5px] font-semibold outline-none focus:border-[#FF5A3C] disabled:opacity-60"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      {(MULTI_SELECT_ENABLED || question.interactionType === "multi_select") && (
                        <option value="multi_select">Multiple Select (เลือกได้หลายคำตอบ)</option>
                      )}
                      {(DRAG_DROP_ENABLED || question.interactionType === "drag_drop") && (
                        <option value="drag_drop">Drag &amp; Drop (เติมคำโดยลากวาง)</option>
                      )}
                      <option value="matching">Matching (จับคู่)</option>
                      <option value="sequencing">Sequencing (เรียงลำดับ)</option>
                    </select>
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      value={question.questionText}
                      readOnly={readOnly} // ⬅️ ใหม่
                      onChange={(event) => updateQuestion(question.key, { questionText: event.target.value })}
                      placeholder="พิมพ์คำถาม"
                      className={`min-w-0 flex-1 rounded-xl border border-[#0F1B3D]/10 bg-[#F7F8FA] px-4 py-2.5 text-sm outline-none focus:border-[#FF5A3C] focus:bg-white ${readOnly ? "opacity-80" : ""}`}
                    />
                    {!readOnly && questions.length > 1 && <button type="button" onClick={() => setQuestions((current) => current.filter((item) => item.key !== question.key))} className="mt-0.5 shrink-0 text-xs font-bold text-red-500">ลบ</button>}
                  </div>

                  {/* ===== ปรับใหม่: รูปภาพประกอบคำถาม — การ์ด 16:9 + Lightbox (ปักหมุด/แคปชัน) ตามแบบ
                      LessonDraftForm.tsx/QuestionBankForm.tsx (กดรูปเพื่อขยายดูเต็ม, ปุ่มจัดการเป็น pill
                      ghost button มีไอคอน) ===== */}
                  <div className="mt-3 sm:pl-0">
                    {question.imageUrl ? (
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setLightboxKey(question.key)}
                          className="group relative aspect-video w-40 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[#0F1B3D]/10 shadow-[0_1px_3px_rgba(15,27,61,0.08)]"
                        >
                          <img src={question.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                          {(question.imagePins ?? []).map((pin, pinIndex) => (
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
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          {imageFileMeta[question.key] && (
                            <p className="text-[11px] text-slate-400">
                              {imageFileMeta[question.key].name} · {formatFileSize(imageFileMeta[question.key].size)}
                            </p>
                          )}
                          <input
                            value={question.imageCaption ?? ""}
                            readOnly={readOnly}
                            onChange={(e) => updateImageCaption(question.key, e.target.value)}
                            placeholder="คำบรรยายใต้ภาพ (ไม่บังคับ) เช่น ภาพที่ 1: แผนผังระบบ"
                            className={`w-full rounded-lg border border-[#0F1B3D]/[0.1] bg-[#F7F8FA] px-2.5 py-1.5 text-[12px] text-[#0F1B3D] outline-none focus:border-[#0F1B3D]/30 focus:bg-white ${readOnly ? "opacity-70" : ""}`}
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setLightboxKey(question.key)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA]"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a2 2 0 104 0 2 2 0 10-4 0" />
                              </svg>
                              ปักหมุด{(question.imagePins ?? []).length > 0 ? ` (${(question.imagePins ?? []).length})` : ""}
                            </button>
                            {!readOnly && (
                              <>
                                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA]">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {uploadingImageKey === question.key ? "กำลังอัปโหลด..." : "เปลี่ยนรูป"}
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    disabled={uploadingImageKey === question.key}
                                    onChange={(e) => handleQuestionImageUpload(question.key, e.target.files?.[0] ?? null)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateQuestion(question.key, { imageUrl: null, imageCaption: null, imagePins: null });
                                    setImageFileMeta((prev) => { const next = { ...prev }; delete next[question.key]; return next; });
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-[#EB4A2D] hover:bg-[#EB4A2D]/10"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 3h5l.5 4h-6l.5-4z" />
                                  </svg>
                                  ลบรูป
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      !readOnly && (
                        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#0F1B3D]/20 bg-[#F7F8FA] px-3 py-2 text-[12px] font-semibold text-[#0F1B3D]/60 hover:border-[#FF5A3C] hover:text-[#FF5A3C]">
                          {uploadingImageKey === question.key ? "กำลังอัปโหลด..." : "+ อัปโหลดรูปภาพประกอบคำถาม"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            disabled={uploadingImageKey === question.key}
                            onChange={(e) => handleQuestionImageUpload(question.key, e.target.files?.[0] ?? null)}
                          />
                        </label>
                      )
                    )}
                    {imageUploadErrors[question.key] && (
                      <p className="mt-1 text-[12px] font-medium text-red-600">{imageUploadErrors[question.key]}</p>
                    )}
                  </div>

                  {/* ===== choices (multiple_choice/true_false เท่านั้น) ===== */}
                  {(question.interactionType === "multiple_choice" || question.interactionType === "true_false" || question.interactionType === "multi_select") && (
                    <div className="mt-4 space-y-2.5 sm:pl-12">
                      {question.interactionType === "multi_select" && (
                        <p className="text-[12.5px] font-medium text-[#0F1B3D]/55">ติ๊กถูกทุกข้อที่เป็นคำตอบที่ถูกต้อง (ถูกได้หลายข้อ ผู้เรียนต้องเลือกให้ครบจึงจะได้คะแนน)</p>
                      )}
                      {question.choices.map((choice, choiceIndex) => (
                        <div key={choiceIndex} className="flex items-center gap-2.5">
                          <button
                            type="button"
                            disabled={readOnly} // ⬅️ ใหม่
                            onClick={() => setCorrectChoice(question.key, choiceIndex)}
                            title="เลือกเป็นคำตอบที่ถูก"
                            className={`flex h-5 w-5 shrink-0 items-center justify-center ${question.interactionType === "multi_select" ? "rounded-md" : "rounded-full"} border-2 disabled:cursor-default ${choice.isCorrect ? "border-emerald-500" : "border-slate-300"}`}
                          >
                            {choice.isCorrect && (question.interactionType === "multi_select"
                              ? <span className="text-[11px] font-black leading-none text-emerald-600">✓</span>
                              : <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />)}
                          </button>
                          <input
                            value={choice.text}
                            onChange={(event) => updateChoice(question.key, choiceIndex, event.target.value)}
                            placeholder={`ตัวเลือกที่ ${choiceIndex + 1}`}
                            readOnly={!isChoicesEditable}
                            className={`min-w-0 flex-1 rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2 text-[13.5px] outline-none focus:border-[#FF5A3C] focus:bg-white ${!isChoicesEditable ? "opacity-70" : ""}`}
                          />
                          {isChoicesEditable && question.choices.length > 2 && <button type="button" onClick={() => updateQuestion(question.key, { choices: question.choices.filter((_, index) => index !== choiceIndex) })} className="text-xs font-bold text-slate-400 hover:text-red-500">✕</button>}
                        </div>
                      ))}
                      {isChoicesEditable && (
                        <button type="button" onClick={() => updateQuestion(question.key, { choices: [...question.choices, { text: "", isCorrect: false }] })} className="pl-8 text-xs font-bold text-[#3157D5]">+ เพิ่มตัวเลือก</button>
                      )}
                    </div>
                  )}

                  {/* ===== ปรับใหม่: matching — การ์ดสีคู่กัน + เส้นเชื่อม (สไตล์เดียวกับ LessonDraftForm.tsx/
                      QuestionBankForm.tsx) ===== */}
                  {question.interactionType === "matching" && (
                    <div className="mt-4 space-y-1.5 sm:pl-12">
                      <p className="mb-2 text-[11.5px] text-[#0F1B3D]/35">นักเรียนจะเห็นฝั่งขวาแบบสลับลำดับ</p>
                      {question.matchingPairs.map((pair, index, arr) => {
                        const color = MATCHING_PAIR_COLORS[index % MATCHING_PAIR_COLORS.length];
                        return (
                          <div key={index} className="flex items-center gap-1.5">
                            <div
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2 transition-colors"
                              style={{ borderColor: `${color}55`, backgroundColor: `${color}0F` }}
                            >
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {index + 1}
                              </span>
                              <input
                                value={pair.left}
                                readOnly={readOnly}
                                onChange={(e) => updateMatchingPair(question.key, index, "left", e.target.value)}
                                placeholder={`ฝั่งซ้าย ${index + 1}`}
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
                                readOnly={readOnly}
                                onChange={(e) => updateMatchingPair(question.key, index, "right", e.target.value)}
                                placeholder={`ฝั่งขวา ${index + 1}`}
                                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#0F1B3D] outline-none placeholder:text-[#0F1B3D]/30"
                              />
                            </div>
                            {!readOnly && arr.length > 2 && (
                              <button type="button" onClick={() => removeMatchingPair(question.key, index)} className="shrink-0 text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D]">✕</button>
                            )}
                          </div>
                        );
                      })}
                      {!readOnly && (
                        <button type="button" onClick={() => addMatchingPair(question.key)} className="mt-1 text-xs font-bold text-[#0F1B3D]">+ เพิ่มคู่จับคู่</button>
                      )}
                    </div>
                  )}

                  {question.interactionType === "drag_drop" && (
                    <div className="sm:pl-12">
                      <DragDropAuthoring
                        value={question.dragDrop}
                        onChange={(next) => setDragDrop(question.key, next)}
                        disabled={readOnly}
                      />
                    </div>
                  )}

                  {/* ===== ปรับใหม่: sequencing — drag handle + native drag-and-drop (สไตล์เดียวกับ
                      LessonDraftForm.tsx/QuestionBankForm.tsx) ===== */}
                  {question.interactionType === "sequencing" && (
                    <div className="mt-4 space-y-1.5 sm:pl-12">
                      <p className="mb-2 text-[11.5px] text-[#0F1B3D]/35">
                        ลากการ์ด หรือกดปุ่มลูกศรเพื่อสลับตำแหน่ง — เรียงจาก<strong>บนลงล่างตามลำดับที่ถูกต้อง</strong>
                      </p>
                      {question.sequencingItems.map((text, index, arr) => {
                        const isDragging = draggingSequencing?.key === question.key && draggingSequencing.index === index;
                        return (
                          <div
                            key={index}
                            draggable={!readOnly}
                            onDragStart={() => !readOnly && setDraggingSequencing({ key: question.key, index })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggingSequencing && draggingSequencing.key === question.key) {
                                moveSequencingItemTo(question.key, draggingSequencing.index, index);
                              }
                              setDraggingSequencing(null);
                            }}
                            onDragEnd={() => setDraggingSequencing(null)}
                            className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 transition-all ${
                              isDragging ? "border-[#0F1B3D]/30 bg-[#0F1B3D]/5 opacity-40" : "border-transparent hover:border-[#0F1B3D]/15"
                            }`}
                          >
                            {!readOnly && (
                              <span className="shrink-0 cursor-grab text-[#0F1B3D]/25" aria-hidden="true" title="ลากเพื่อสลับลำดับ">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                  <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" />
                                  <circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" />
                                  <circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
                                </svg>
                              </span>
                            )}
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[12px] font-bold text-white">
                              {index + 1}
                            </span>
                            <input
                              value={text}
                              readOnly={readOnly}
                              onChange={(e) => updateSequencingItem(question.key, index, e.target.value)}
                              placeholder={`รายการที่ ${index + 1}`}
                              className={`min-w-0 flex-1 rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2 text-[13.5px] outline-none focus:border-[#FF5A3C] focus:bg-white ${readOnly ? "opacity-70" : ""}`}
                            />
                            {!readOnly && (
                              <div className="flex shrink-0 gap-1">
                                <button type="button" disabled={index === 0} onClick={() => moveSequencingItem(question.key, index, -1)} className="rounded-lg border border-[#0F1B3D]/10 px-2 py-1 text-xs font-bold text-[#0F1B3D]/60 disabled:opacity-30">↑</button>
                                <button type="button" disabled={index === arr.length - 1} onClick={() => moveSequencingItem(question.key, index, 1)} className="rounded-lg border border-[#0F1B3D]/10 px-2 py-1 text-xs font-bold text-[#0F1B3D]/60 disabled:opacity-30">↓</button>
                                {arr.length > 2 && (
                                  <button type="button" onClick={() => removeSequencingItem(question.key, index)} className="text-xs font-bold text-slate-400 hover:text-red-500">✕</button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {!readOnly && (
                        <button type="button" onClick={() => addSequencingItem(question.key)} className="mt-1 text-xs font-bold text-[#0F1B3D]">+ เพิ่มรายการ</button>
                      )}
                    </div>
                  )}

                  <div className="mt-4 sm:pl-12">
                    <textarea
                      value={question.explanation ?? ""}
                      readOnly={readOnly} // ⬅️ ใหม่
                      onChange={(event) => updateQuestion(question.key, { explanation: event.target.value || null })}
                      rows={2}
                      placeholder="คำอธิบายเฉลย (ไม่บังคับ)"
                      className={`w-full resize-y rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2 text-[13px] outline-none focus:border-[#FF5A3C] focus:bg-white ${readOnly ? "opacity-80" : ""}`}
                    />
                  </div>
                </section>
              );
            })}
          </div>

          {/* ⬅️ ใหม่: ซ่อนปุ่มเพิ่มคำถาม/บันทึก ทั้งคู่เมื่อ readOnly */}
          {!readOnly && (
            <>
              <button type="button" onClick={() => { setIsDirty(true); setQuestions((current) => [...current, emptyQuestion()]); }} className="mt-4 rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2.5 text-[13px] font-bold text-[#0F1B3D]">+ เพิ่มคำถาม</button>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}

              {message && !isDirty ? (
                <>
                  <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{message}</p>
                  <p className="mt-2 text-[12px] leading-5 text-[#0F1B3D]/40">
                    อย่าลืมกด &quot;ส่งคอร์สเข้าตรวจ&quot; ที่หน้าหลักของคอร์สเพื่อส่งให้แอดมินอนุมัติ
                  </p>
                  <button type="button" onClick={() => setIsDirty(true)} className="mt-5 w-full rounded-full border-2 border-[#0F1B3D]/15 bg-white py-3.5 text-sm font-extrabold text-[#0F1B3D] hover:bg-[#0F1B3D]/[0.03]">
                    แก้ไขแบบทดสอบ
                  </button>
                </>
              ) : (
                lessons.length === 0 ? (
                  <Link href={`/dashboard/${workspace}/courses/${courseId}/lessons/new`} className="mt-5 flex w-full justify-center rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white hover:bg-[#EB4A2D]">
                    + เพิ่มบทเรียนก่อนสร้างข้อสอบ
                  </Link>
                ) : (
                  <button type="button" disabled={saving} onClick={save} className="mt-5 w-full rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? "กำลังบันทึก..." : "บันทึกบททดสอบท้ายคอร์ส"}
                  </button>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>

    {/* ===== เพิ่มใหม่: Lightbox ขยายรูปประกอบคำถาม — ปักหมุด/ย้อนกลับ/ล้างหมุด (สไตล์เดียวกับ
        LessonDraftForm.tsx/QuestionBankForm.tsx) — อ้างด้วย key เพราะหน้านี้มีคำถามได้หลายข้อ ===== */}
    {lightboxKey && lightboxQuestion?.imageUrl && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        onClick={() => setLightboxKey(null)}
      >
        <div
          className="flex max-h-[90vh] w-fit max-w-[min(92vw,640px)] flex-col gap-3 rounded-2xl bg-white p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-[#0F1B3D]/50">
              {readOnly ? "ดูตำแหน่งหมุดบนภาพ" : "คลิกบนภาพเพื่อปักหมุดถัดไป · คลิกที่ตัวหมุดเพื่อลบทีละอัน"}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => undoLastImagePin(lightboxQuestion.key)}
                    disabled={(lightboxQuestion.imagePins ?? []).length === 0}
                    title="ย้อนกลับ (ลบหมุดล่าสุด)"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#0F1B3D]/15 text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l-4-4 4-4m-4 4h11a4 4 0 010 8h-1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => clearImagePins(lightboxQuestion.key)}
                    disabled={(lightboxQuestion.imagePins ?? []).length === 0}
                    className="rounded-full border border-[#0F1B3D]/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ล้างหมุดทั้งหมด
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setLightboxKey(null)}
                aria-label="ปิด"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#0F1B3D]/50 hover:bg-[#F7F8FA] hover:text-[#0F1B3D]"
              >
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative self-center overflow-hidden rounded-xl bg-[#F1F5F9]">
            <img
              src={lightboxQuestion.imageUrl}
              alt=""
              onClick={(e) => {
                if (readOnly) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                addImagePin(lightboxQuestion.key, x, y);
              }}
              className={`block max-h-[65vh] max-w-full object-contain ${readOnly ? "" : "cursor-crosshair"}`}
            />
            {(lightboxQuestion.imagePins ?? []).map((pin, pinIndex) => (
              <button
                key={pin.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!readOnly) removeImagePin(lightboxQuestion.key, pin.id);
                }}
                title={readOnly ? undefined : "กดเพื่อลบหมุดนี้"}
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[12px] font-bold text-white ring-2 ring-white hover:bg-[#EB4A2D]"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              >
                {pinIndex + 1}
              </button>
            ))}
          </div>

          {lightboxQuestion.imageCaption && (
            <p className="text-center text-[12.5px] font-semibold text-[#0F1B3D]">{lightboxQuestion.imageCaption}</p>
          )}
        </div>
      </div>
    )}
    </>
  );
}
