"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createQuestionBankItem, updateQuestionBankItem, type QuestionBankInput, type QuestionBankTopicTagInput, type Difficulty, type QuestionFormat, type UsageType, type PrivacyScope } from "@/app/dashboard/teacher/question-bank/actions";
import { CATEGORIES, type Category } from "@/lib/constants/categories";
import { validateMultiSelectAuthoring } from "@/lib/quiz/validators/authoring";
import { MULTI_SELECT_ENABLED, DRAG_DROP_ENABLED } from "@/lib/quiz/config/rollout";
import { buildDragDropAnswerData, parseDragDropToForm, type DragDropFormState } from "@/lib/quiz/drag-drop-form";
import DragDropAuthoring from "@/components/teacher/DragDropAuthoring";
interface ChoiceState { text: string; isCorrect: boolean }

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (x/y เป็น % ของขนาดภาพ 0-100) ตามแบบ LessonDraftForm.tsx =====
interface ImagePin { id: string; x: number; y: number }
// ชุดสีไล่ตามลำดับคู่จับคู่ — คู่เดียวกัน (ซ้าย+ขวา) ใช้สีเดียวกันเสมอ (เหมือน LessonDraftForm.tsx)
const MATCHING_PAIR_COLORS = ["#0F1B3D", "#00B37E", "#FF8A3D", "#2F8FFF", "#FF4FA3", "#C98500"];
function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type InteractionType = "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "sequencing" | "matching" | "fill_in_blank" | "note_callout";

// type ที่เปิดให้ครูเลือกได้จริงตอนนี้ (sync กับ lib/quiz/config/enabled-types.ts ฝั่ง backend)
// ===== เพิ่มใหม่: matching/sequencing เดิมเปิดใช้แค่ "เฉพาะ Final Exam" (Pop-up Quiz ยังรองรับแค่
// choice-based เพราะ popup UI ใน generate.ts ยังเป็น choices ล้วน — ดู question-bank-sampling.ts)
// ตอนนี้ popup UI มี matching (dropdown ปรับสไตล์ใหม่) และ sequencing (drag-and-drop ด้วย Pointer
// Events) แล้ว เลยเปิดให้เลือกได้ทั้ง 2 usageType เหมือนกันหมด ไม่ต้องแยกกลุ่มตาม usageType อีกต่อไป
const AVAILABLE_INTERACTION_TYPES: { value: InteractionType; label: string; disabled?: boolean }[] = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  // multi_select เปิดตามสวิตช์ใน lib/quiz/config/rollout.ts (ใช้ได้เฉพาะ usage "final")
  ...(MULTI_SELECT_ENABLED ? [{ value: "multi_select" as const, label: "Multiple Select (เลือกได้หลายคำตอบ)" }] : []),
  // { value: "fill_in_blank", label: "Fill in the blank (เร็วๆ นี้)", disabled: true },
  { value: "matching", label: "Matching (จับคู่)" },
  // drag_drop เปิดตามสวิตช์ใน lib/quiz/config/rollout.ts (ใช้ได้เฉพาะ usage "final")
  ...(DRAG_DROP_ENABLED ? [{ value: "drag_drop" as const, label: "Drag & Drop (เติมคำโดยลากวาง)" }] : []),
  { value: "sequencing", label: "Sequencing (เรียงลำดับ)" },
];

interface ChoiceState { text: string; isCorrect: boolean }

export default function QuestionBankForm({
  questionId,
  lessons,
  initialData,
}: {
  questionId?: string;
  lessons: { id: string; courseId: string; courseTitle: string; courseCategory: string | null; orderIndex: number; title: string }[];
  initialData?: QuestionBankInput | null;
}) {
  const router = useRouter();
  const [questionText, setQuestionText] = useState(initialData?.questionText ?? "");
  const [explanation, setExplanation] = useState(initialData?.explanation ?? "");
  const isKnownCategory = (value: string | null | undefined): value is Category =>
  (CATEGORIES as readonly string[]).includes(value ?? "");

const initialCategory = initialData?.category ?? null;

const [category, setCategory] = useState<Category>(
  isKnownCategory(initialCategory) ? initialCategory : CATEGORIES[0]
);
const [customCategory, setCustomCategory] = useState(
  initialCategory && !isKnownCategory(initialCategory) ? initialCategory : ""
);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialData?.difficulty ?? "medium");
  // ตัดตัวเลือก Code/Practical ออกแล้ว เหลือแค่ multiple_choice อย่างเดียว เลยไม่ต้องมี dropdown
  // ให้เลือกอีกต่อไป (ค่าคงที่เสมอ) — ยังเก็บ field นี้ไว้ส่งตาม schema เดิมของ question_bank.format
  const format: QuestionFormat = "multiple_choice";
  const [usageType, setUsageType] = useState<UsageType>(initialData?.usageType ?? "final");
  // ตัดตัวเลือก "สิทธิ์การเข้าถึง" (ส่วนตัว/หมวดวิชา) ออกจากฟอร์มแล้ว เพราะปัจจุบันไม่มีผลกับใครเลย
  // (ยังไม่มีเคสหลายครูสอนวิชาเดียวกันจริง + ตาราง course_teachers ที่ใช้เช็คสิทธิ์ยังว่างเปล่า)
  // บันทึกเป็น "private" เสมอ — ค่อยกลับมาทำตอนมีเคสจริงพร้อมหน้า "คลังข้อสอบที่แชร์กับฉัน"
  const privacyScope: PrivacyScope = "private";
  const [topicTags, setTopicTags] = useState<QuestionBankTopicTagInput[]>(initialData?.topicTags ?? []);
  const [choices, setChoices] = useState<ChoiceState[]>(
    initialData?.choices?.length ? initialData.choices : [{ text: "", isCorrect: true }, { text: "", isCorrect: false }]
  );
  // ===== เพิ่มใหม่: รูปภาพประกอบคำถาม (ไม่บังคับ) =====
  const [imageUrl, setImageUrl] = useState<string | null>(
    (initialData as unknown as { imageUrl?: string | null })?.imageUrl ?? null
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (ตามแบบ LessonDraftForm.tsx) =====
  const [imageCaption, setImageCaption] = useState<string | null>(
    (initialData as unknown as { imageCaption?: string | null })?.imageCaption ?? null
  );
  const [imagePins, setImagePins] = useState<ImagePin[]>(
    (initialData as unknown as { imagePins?: ImagePin[] | null })?.imagePins ?? []
  );
  const [imageFileMeta, setImageFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ questionText?: string; customCategory?: string }>({});
  const [emptyChoiceIndices, setEmptyChoiceIndices] = useState<Set<number>>(new Set());
  // error ของตัวเลือกแยกออกจาก `error` กลาง เพื่อโชว์ใต้ list ตัวเลือกโดยตรง (ใกล้จุดที่ผิดจริง)
  // แทนที่จะไปกองรวมกับกล่องสรุปด้านล่างสุดของฟอร์มซึ่งอยู่ไกลจากตัวเลือกที่อยู่ด้านบน
  const [choicesError, setChoicesError] = useState<string | null>(null);

  const questionTextRef = useRef<HTMLTextAreaElement>(null);
  const customCategoryRef = useRef<HTMLInputElement>(null);
  const choiceRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [interactionType, setInteractionType] = useState<InteractionType>(
    (initialData as unknown as { interactionType?: InteractionType })?.interactionType ?? "multiple_choice"
  );

   // ===== เพิ่มใหม่: พอเปลี่ยนเป็น true_false ให้ล็อก choices เป็น "จริง"/"เท็จ" อัตโนมัติ =====
  useEffect(() => {
    if (interactionType === "true_false") {
      setChoices((current) => {
        // ถ้าเคยเป็น true_false อยู่แล้ว (กรณีแก้ไขคำถามเดิม) ไม่ต้อง reset ทับ isCorrect ที่ตั้งไว้
        const alreadyTrueFalse =
          current.length === 2 && current[0].text === "จริง" && current[1].text === "เท็จ";
        if (alreadyTrueFalse) return current;
        return [
          { text: "จริง", isCorrect: true },
          { text: "เท็จ", isCorrect: false },
        ];
      });
    }
  }, [interactionType]);

  // multiple_choice ถูกได้ข้อเดียว — ถ้าสลับมาจาก multi_select ที่ติ๊กถูกหลายข้อ ให้เหลือข้อแรกข้อเดียว
  // (กันฟอร์มค้างสถานะ "ถูกหลายข้อ" ที่ server ปฏิเสธ)
  useEffect(() => {
    if (interactionType !== "multiple_choice") return;
    setChoices((current) => {
      if (current.filter((c) => c.isCorrect).length <= 1) return current;
      const firstCorrect = current.findIndex((c) => c.isCorrect);
      return current.map((c, i) => ({ ...c, isCorrect: i === firstCorrect }));
    });
  }, [interactionType]);

  // ===== เพิ่มใหม่: state สำหรับ matching (จับคู่ซ้าย-ขวา) และ sequencing (เรียงลำดับ) =====
  // ดึงค่าเดิมจาก answerData (ตอนแก้ไขคำถาม) มา pre-fill ให้ — ทั้งสองแบบเก็บเป็น answer_data (jsonb)
  // shape ตาม src/types/interaction.ts (MatchingAnswerData / SequencingAnswerData)
  const initialAnswerData = (initialData as unknown as {
    answerData?: {
      pairs?: { left: string; right: string }[];
      items?: { id: string; text: string }[];
      correct_order?: string[];
    } | null;
  })?.answerData;

  const [matchingPairs, setMatchingPairs] = useState<{ left: string; right: string }[]>(
    initialAnswerData?.pairs?.length
      ? initialAnswerData.pairs
      : [{ left: "", right: "" }, { left: "", right: "" }]
  );

  // sequencing: เรียง items ตาม correct_order เดิม (ไม่ใช่ลำดับดิบใน items[]) เพื่อให้ครูเห็น
  // "ลำดับที่ถูก" ตามที่เคยบันทึกไว้จริงตอนเปิดมาแก้ไข
  const [sequencingItems, setSequencingItems] = useState<string[]>(() => {
    if (initialAnswerData?.items?.length && initialAnswerData?.correct_order?.length) {
      const textById = new Map(initialAnswerData.items.map((item) => [item.id, item.text]));
      return initialAnswerData.correct_order.map((id) => textById.get(id) ?? "");
    }
    return ["", ""];
  });

  // drag_drop: pre-fill จาก answer_data เดิมตอนแก้ไข (ผิดรูปแบบ/ไม่มี → ฟอร์มว่าง)
  const [dragDropForm, setDragDropForm] = useState<DragDropFormState>(
    () =>
      ((initialData as unknown as { interactionType?: string })?.interactionType === "drag_drop" ? parseDragDropToForm(initialAnswerData) : null) ?? {
        template: "",
        answers: [],
        distractors: [],
      }
  );

  function updateMatchingPair(index: number, field: "left" | "right", value: string) {
    setMatchingPairs((current) => current.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair)));
    setChoicesError(null);
  }
  function addMatchingPair() {
    setMatchingPairs((current) => [...current, { left: "", right: "" }]);
  }
  function removeMatchingPair(index: number) {
    setMatchingPairs((current) => current.filter((_, i) => i !== index));
  }

  function updateSequencingItem(index: number, value: string) {
    setSequencingItems((current) => current.map((text, i) => (i === index ? value : text)));
    setChoicesError(null);
  }
  function addSequencingItem() {
    setSequencingItems((current) => [...current, ""]);
  }
  function removeSequencingItem(index: number) {
    setSequencingItems((current) => current.filter((_, i) => i !== index));
  }
  function moveSequencingItem(index: number, delta: number) {
    setSequencingItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  // ===== เพิ่มใหม่: ลาก-วางสลับลำดับ (ตามแบบ LessonDraftForm.tsx) =====
  const [draggingSequencing, setDraggingSequencing] = useState<number | null>(null);
  function moveSequencingItemTo(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setSequencingItems((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (ตามแบบ LessonDraftForm.tsx) =====
  function addImagePin(x: number, y: number) {
    setImagePins((current) => [...current, { id: genId(), x, y }]);
  }
  function removeImagePin(pinId: string) {
    setImagePins((current) => current.filter((p) => p.id !== pinId));
  }
  function undoLastImagePin() {
    setImagePins((current) => current.slice(0, -1));
  }
  function clearImagePins() {
    setImagePins([]);
  }

  // ===== ลบ useEffect ที่ reset matching/sequencing กลับเป็น multiple_choice ตอนเปลี่ยนเป็น Pop-up
  // Quiz ออกแล้ว — ตอนนี้ Pop-up Quiz รองรับ matching/sequencing แล้วเหมือน Final Exam ไม่ต้อง reset
  const availableInteractionTypes = AVAILABLE_INTERACTION_TYPES;

  const lessonsByCourse = lessons.reduce<Record<string, { courseId: string; courseTitle: string; courseCategory: string | null; items: typeof lessons }>>((groups, lesson) => {
  if (!groups[lesson.courseId]) groups[lesson.courseId] = { courseId: lesson.courseId, courseTitle: lesson.courseTitle, courseCategory: lesson.courseCategory, items: [] };
  groups[lesson.courseId].items.push(lesson);
  return groups;
}, {});

const courseGroups = Object.values(lessonsByCourse)
  .map((group) => ({ ...group, items: [...group.items].sort((a, b) => a.orderIndex - b.orderIndex) }))
  .sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, "th"));

  // Cascading select: เลือกคอร์สก่อน แล้วค่อยเลือก "ทั้งคอร์ส" หรือบทเรียนใดบทหนึ่งในคอร์สนั้น
  // default ไปที่คอร์สของ tag แรกที่เคยผูกไว้ (ถ้ามี) เพื่อไม่ให้ดูเหมือนค่าเดิมหายตอนเปิดแก้ไข
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => initialData?.topicTags?.[0]?.courseId ?? "");
  const [pendingLessonValue, setPendingLessonValue] = useState<string>("");
  // แทนที่ตัวเลือก "ทั้งคอร์ส" ในดรอปดาวน์เดิมด้วย checkbox แยก เพื่อให้เห็นชัดว่าแลกอะไรไป —
  // แท็กทั้งคอร์สใช้ได้แค่กับข้อสอบปลายภาคแบบรวมทั้งคอร์ส (ไม่ใช้กับ Pop-up Quiz หรือ preset แบบระบุสัดส่วนรายบท)
  const [useWholeCourseTag, setUseWholeCourseTag] = useState(false);

  const courseTitleById = useMemo(() => new Map(courseGroups.map((g) => [g.courseId, g.courseTitle])), [courseGroups]);
  const courseCategoryById = useMemo(() => new Map(courseGroups.map((g) => [g.courseId, g.courseCategory])), [courseGroups]);
  const lessonById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);

  // ===== เพิ่มใหม่: กรองตัวเลือก "เลือกคอร์ส" ให้เหลือแค่คอร์สที่อยู่หมวดเดียวกับคำถามข้อนี้ =====
  // ถ้าไม่มีคอร์สในหมวดนั้นเลย (เช่น ครูยังไม่เคยสร้างคอร์สหมวดนี้ หรือกำลังกรอกหมวดกำหนดเอง "อื่นๆ")
  // fallback กลับไปแสดงคอร์สทั้งหมด กันไม่ให้ครูเลือกคอร์สไม่ได้เลยเพราะหมวดไม่ตรงเป๊ะ
  const finalCategoryForCompare = category === "อื่นๆ" ? customCategory.trim() : category;
  const categoryMatchedCourseGroups = useMemo(
    () => (finalCategoryForCompare ? courseGroups.filter((g) => g.courseCategory === finalCategoryForCompare) : courseGroups),
    [courseGroups, finalCategoryForCompare]
  );
  const isFilteredByCategory = !!finalCategoryForCompare && categoryMatchedCourseGroups.length > 0;
  const visibleCourseGroups = categoryMatchedCourseGroups.length > 0 ? categoryMatchedCourseGroups : courseGroups;
  const noCourseInThisCategory = !!finalCategoryForCompare && categoryMatchedCourseGroups.length === 0 && courseGroups.length > 0;

  // ถ้าคอร์สที่เลือกค้างอยู่ในตัวเลือก (สำหรับผูก tag ถัดไป) หลุดจากรายการที่กรองแล้ว (เพราะเพิ่งเปลี่ยนหมวดคำถาม) ให้ล้างค่าทิ้ง
  useEffect(() => {
    if (selectedCourseId && !visibleCourseGroups.some((g) => g.courseId === selectedCourseId)) {
      setSelectedCourseId("");
      setPendingLessonValue("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCourseGroups]);

  // const lessonsForSelectedCourse = useMemo(
  //   () => courseGroups.find((g) => g.courseId === selectedCourseId)?.items ?? [],
  //   [courseGroups, selectedCourseId]
  // );

  // ===== แก้บั๊ก: คอร์สเดียวกันเคยเพิ่มได้ทั้งแท็ก "บทเรียน X" และแท็ก "ทั้งคอร์สเท่านั้น" พร้อมกัน
  // ซึ่งขัดกับความหมายของตัวเลือก "ทั้งคอร์สเท่านั้น" เอง (แปลว่าไม่ผูกกับบทใดเลย) — เพิ่ม 2 ตัวแปรนี้
  // เพื่อ disable อีกฝั่งเมื่อคอร์สที่เลือกมีแท็กแบบตรงข้ามอยู่แล้ว =====
  const hasLessonTagForSelectedCourse = topicTags.some((tag) => tag.courseId === selectedCourseId && tag.lessonId !== null);
  const hasWholeCourseTagForSelectedCourse = topicTags.some((tag) => tag.courseId === selectedCourseId && tag.lessonId === null);
  const availableLessonsForSelectedCourse = useMemo(
    () => courseGroups.find((g) => g.courseId === selectedCourseId)?.items ?? [],
    [courseGroups, selectedCourseId]
  );

  // ค่าพิเศษของตัวเลือก "ทุกบทในคอร์ส" ใน dropdown บทเรียน (ไม่ใช่ id บทจริง)
  const ALL_LESSONS_VALUE = "__all_lessons__";

  function tagKey(tag: QuestionBankTopicTagInput) {
    return `${tag.courseId}::${tag.lessonId ?? "whole"}`;
  }

  function addPendingSelection() {
    if (!selectedCourseId) return;
    if (!useWholeCourseTag && pendingLessonValue === ALL_LESSONS_VALUE) {
      addAllLessonsOfSelectedCourse();
      return;
    }
    const newTag: QuestionBankTopicTagInput = useWholeCourseTag
      ? { courseId: selectedCourseId, lessonId: null }
      : { courseId: selectedCourseId, lessonId: pendingLessonValue };
    if (!useWholeCourseTag && !pendingLessonValue) return;
    setTopicTags((current) => (current.some((t) => tagKey(t) === tagKey(newTag)) ? current : [...current, newTag]));
    setPendingLessonValue("");
  }

  // Pop-up Quiz: ผูกข้อนี้กับ "ทุกบทในคอร์ส" ในคลิกเดียว (เพิ่มแท็กรายบทให้ครบทุกบท ข้ามบทที่ผูกไว้แล้ว)
  // ใช้แท็กรายบทปกติ จึงไม่กระทบตรรกะ Final Exam/ชุดสอบแบ่งสัดส่วน
  function addAllLessonsOfSelectedCourse() {
    if (!selectedCourseId || hasWholeCourseTagForSelectedCourse) return;
    setTopicTags((current) => {
      const existing = new Set(current.map(tagKey));
      const additions = availableLessonsForSelectedCourse
        .map((lesson) => ({ courseId: selectedCourseId, lessonId: lesson.id }) as QuestionBankTopicTagInput)
        .filter((tag) => !existing.has(tagKey(tag)));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
    setPendingLessonValue("");
  }

  function removeTag(tag: QuestionBankTopicTagInput) {
    setTopicTags((current) => current.filter((t) => tagKey(t) !== tagKey(tag)));
  }

  function updateChoiceText(index: number, text: string) {
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, text } : choice)));
    setEmptyChoiceIndices((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setChoicesError(null);
  }

  function setCorrectChoice(index: number) {
    setChoices((current) => current.map((choice, i) => ({ ...choice, isCorrect: i === index })));
  }

  // multi_select: ติ๊ก/เอาติ๊กออกทีละข้อ (ถูกได้หลายข้อ)
  function toggleCorrectChoice(index: number) {
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, isCorrect: !choice.isCorrect } : choice)));
    setChoicesError(null);
  }

  // ===== เพิ่มใหม่: อัปโหลดรูปภาพประกอบคำถาม ผ่าน presigned URL แล้วเก็บ public URL ไว้ =====
  async function handleImageFileChange(file: File | null) {
    if (!file) return;
    setImageError(null);
    const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!ALLOWED.has(file.type)) {
      setImageError("รองรับเฉพาะไฟล์รูปภาพ PNG, JPEG, WEBP หรือ GIF เท่านั้น");
      return;
    }
    setUploadingImage(true);
    try {
      const res = await fetch("/api/questions/image-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.uploadUrl) {
        setImageError(data.error ?? "เตรียมการอัปโหลดรูปภาพไม่สำเร็จ");
        return;
      }
      const putRes = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setImageError("อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setImageUrl(data.publicUrl);
      setImageFileMeta({ name: file.name, size: file.size });
    } catch {
      setImageError("อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploadingImage(false);
    }
  }

    async function handleSave() {
    setError(null);
    setChoicesError(null);

    // เช็ค field-level ก่อน (คำถาม + ระบุหมวดเนื้อหา) แล้ว auto-focus ไปช่องแรกที่ผิด
    const nextFieldErrors: { questionText?: string; customCategory?: string } = {};
    if (!questionText.trim()) nextFieldErrors.questionText = "กรุณากรอกคำถาม";
    if (category === "อื่นๆ" && !customCategory.trim()) nextFieldErrors.customCategory = "กรุณาระบุหมวดเนื้อหา";
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      if (nextFieldErrors.questionText) questionTextRef.current?.focus();
      else if (nextFieldErrors.customCategory) customCategoryRef.current?.focus();
      return;
    }
    setFieldErrors({});

    if (topicTags.length === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 คอร์ส ก่อนบันทึก");
      return;
    }
    // Pop-up Quiz ต้องผูกกับบทเรียนอย่างน้อย 1 บท (แท็ก "ทั้งคอร์ส" ใช้กับ Pop-up ไม่ได้)
    if (usageType === "popup" && !topicTags.some((tag) => tag.lessonId)) {
      setError("Pop-up Quiz ต้องเลือกบทเรียนอย่างน้อย 1 บท");
      return;
    }
    // ===== เพิ่มใหม่: validate choices ตาม interaction_type =====
    // เช็คทั้ง multiple_choice และ true_false (choice-based ทั้งคู่) ว่าทุกตัวเลือกที่มีอยู่ต้องกรอกครบ
    // ไม่ใช่แค่เช็คว่า "มี" ตัวเลือกเฉยๆ — ไม่งั้นกดสร้างคอร์สหลุดผ่านไปได้ทั้งที่ตัวเลือกว่างอยู่
    if (interactionType === "multiple_choice" || interactionType === "true_false" || interactionType === "multi_select") {
      const missingIndices = new Set(
        choices.reduce<number[]>((acc, c, i) => (c.text.trim() ? acc : [...acc, i]), [])
      );
      if (missingIndices.size > 0) {
        setEmptyChoiceIndices(missingIndices);
        setChoicesError(
          missingIndices.size === choices.length
            ? `กรุณากรอกข้อความให้ครบทุกตัวเลือก (มีทั้งหมด ${choices.length} ตัวเลือก)`
            : `กรุณากรอกข้อความให้ครบทุกตัวเลือก (ยังขาดอีก ${missingIndices.size} จาก ${choices.length} ตัวเลือก)`
        );
        const firstMissingIndex = Math.min(...missingIndices);
        choiceRefs.current[firstMissingIndex]?.focus();
        return;
      }
      setEmptyChoiceIndices(new Set());
      if (interactionType === "multi_select") {
        const problems = validateMultiSelectAuthoring(choices);
        if (problems.length > 0) {
          setChoicesError(problems.join(" · "));
          return;
        }
      } else if (!choices.some((c) => c.isCorrect)) {
        setChoicesError("กรุณาเลือกตัวเลือกที่ถูกต้องอย่างน้อย 1 ข้อ");
        return;
      }
    }

    // ===== เพิ่มใหม่: validate matching (จับคู่ซ้าย-ขวา) =====
    let matchingAnswerData: { pairs: { left: string; right: string }[] } | null = null;
    if (interactionType === "matching") {
      const filledPairs = matchingPairs
        .map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() }))
        .filter((pair) => pair.left && pair.right);
      if (filledPairs.length < 2) {
        setChoicesError("กรุณากรอกคู่จับคู่ให้ครบทั้งฝั่งซ้ายและขวา อย่างน้อย 2 คู่");
        return;
      }
      const leftValues = filledPairs.map((pair) => pair.left);
      if (new Set(leftValues).size !== leftValues.length) {
        setChoicesError("รายการฝั่งซ้ายห้ามซ้ำกัน (จะทำให้ตรวจคำตอบกำกวมว่าหมายถึงข้อไหน)");
        return;
      }
      matchingAnswerData = { pairs: filledPairs };
    }

    // ===== เพิ่มใหม่: validate sequencing (เรียงลำดับ) =====
    let sequencingAnswerData: { items: { id: string; text: string }[]; correct_order: string[] } | null = null;
    if (interactionType === "sequencing") {
      const filledItems = sequencingItems.map((text) => text.trim()).filter((text) => text);
      if (filledItems.length < 2) {
        setChoicesError("กรุณากรอกรายการที่จะให้เรียงลำดับ อย่างน้อย 2 รายการ");
        return;
      }
      // ลำดับที่ครูกรอกจากบนลงล่าง = ลำดับที่ถูกต้อง — ตั้ง id ตามลำดับนั้นไปเลย
      const items = filledItems.map((text, index) => ({ id: `item-${index}`, text }));
      sequencingAnswerData = { items, correct_order: items.map((item) => item.id) };
    }
    // drag_drop: ใช้ได้ทั้ง Final และ Pop-up — แปลงฟอร์มเป็น answer_data แล้วให้ validator กลางตรวจ
    let dragDropAnswerData: unknown = null;
    if (interactionType === "drag_drop") {
      const built = buildDragDropAnswerData(dragDropForm);
      if (!built.ok) {
        setChoicesError(built.errors.join(" · "));
        return;
      }
      dragDropAnswerData = built.data;
    }
    // ===== จบส่วนเพิ่มใหม่ =====
    setSaving(true);
    setError(null);
    const finalCategory = category === "อื่นๆ" ? customCategory.trim() : category;
    const input: QuestionBankInput = {
      questionText,
      explanation: explanation || null,
      category: finalCategory || null,
      difficulty,
      format,
      usageType,
      privacyScope,
      topicTags,
      choices,
      // ===== เพิ่มใหม่ =====
      interactionType,
      answerData: matchingAnswerData ?? sequencingAnswerData ?? dragDropAnswerData ?? null,
      imageUrl,
      imageCaption,
      imagePins,
    } as QuestionBankInput;
    const result = questionId ? await updateQuestionBankItem(questionId, input) : await createQuestionBankItem(input);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/dashboard/teacher/question-bank");
  }


  const inputClass = "w-full rounded-lg border border-[#0F1B3D]/[0.08] bg-[#F7F8FA] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[#FF5A3C] focus:bg-white";
  const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#0F1B3D]/70";

  return (
    <>
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 sm:p-6">
      {/* ===== เพิ่มใหม่: interaction type selector ===== */}
        <label className="mb-4 block">
          <span className={labelClass}>ประเภทคำถาม</span>
          <select
            value={interactionType}
            onChange={(e) => setInteractionType(e.target.value as InteractionType)}
            className={inputClass}
          >
            {availableInteractionTypes.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>คำถาม <span className="text-red-500">*</span></span>
          <textarea
            ref={questionTextRef}
            value={questionText}
            onChange={(e) => {
              setQuestionText(e.target.value);
              setFieldErrors((prev) => (prev.questionText ? { ...prev, questionText: undefined } : prev));
            }}
            rows={2}
            aria-invalid={!!fieldErrors.questionText}
            aria-describedby={fieldErrors.questionText ? "questionText-error" : undefined}
            className={`${inputClass} ${fieldErrors.questionText ? "!border-red-400 focus:!border-red-500" : ""}`}
          />
          {fieldErrors.questionText && (
            <p id="questionText-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">{fieldErrors.questionText}</p>
          )}
        </label>

        {(interactionType === "multiple_choice" || interactionType === "true_false" || interactionType === "multi_select") && (
          <div className="mt-4 space-y-2.5">
            {interactionType === "multi_select" && (
              <p className="text-[12.5px] font-medium text-[#0F1B3D]/55">ติ๊กถูกทุกข้อที่เป็นคำตอบที่ถูกต้อง (ถูกได้หลายข้อ ผู้เรียนต้องเลือกให้ครบจึงจะได้คะแนน)</p>
            )}
            {choices.map((choice, index) => (
              <div key={index} className="flex items-center gap-2.5">
                {interactionType === "multi_select" ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={choice.isCorrect}
                    aria-label={`ตัวเลือกที่ ${index + 1} เป็นคำตอบที่ถูก`}
                    onClick={() => toggleCorrectChoice(index)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${choice.isCorrect ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}
                  >
                    {choice.isCorrect && <span className="text-[11px] font-black leading-none">✓</span>}
                  </button>
                ) : (
                  <button type="button" onClick={() => setCorrectChoice(index)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${choice.isCorrect ? "border-emerald-500" : "border-slate-300"}`}>
                    {choice.isCorrect && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                  </button>
                )}
                <input
                  ref={(el) => { choiceRefs.current[index] = el; }}
                  value={choice.text}
                  onChange={(e) => updateChoiceText(index, e.target.value)}
                  placeholder={`ตัวเลือกที่ ${index + 1}`}
                  aria-invalid={emptyChoiceIndices.has(index)}
                  className={`min-w-0 flex-1 ${inputClass} ${emptyChoiceIndices.has(index) ? "!border-red-400 focus:!border-red-500" : ""}`}
                />
                {choices.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setChoices((c) => c.filter((_, i) => i !== index));
                      // เลื่อน index ของ error ที่ค้างอยู่ให้ตรงกับ choices ที่เหลือหลังลบ
                      setEmptyChoiceIndices((prev) => {
                        const next = new Set<number>();
                        prev.forEach((i) => {
                          if (i < index) next.add(i);
                          else if (i > index) next.add(i - 1);
                        });
                        return next;
                      });
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setChoices((c) => [...c, { text: "", isCorrect: false }])} className="text-xs font-bold text-[#3157D5]">+ เพิ่มตัวเลือก</button>
          </div>
        )}

        {/* ===== เพิ่มใหม่: matching — กรอกคู่ซ้าย-ขวา ===== */}
        {/* ===== ปรับใหม่: การ์ดสีคู่กัน + เส้นเชื่อม (สไตล์เดียวกับ LessonDraftForm.tsx) ===== */}
        {interactionType === "matching" && (
          <div className="mt-4 space-y-1.5">
            <p className="mb-2 text-[11.5px] text-[#0F1B3D]/35">นักเรียนจะเห็นฝั่งขวาแบบสลับลำดับ</p>
            {matchingPairs.map((pair, index, arr) => {
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
                      onChange={(e) => updateMatchingPair(index, "left", e.target.value)}
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
                      onChange={(e) => updateMatchingPair(index, "right", e.target.value)}
                      placeholder={`ฝั่งขวา ${index + 1}`}
                      className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#0F1B3D] outline-none placeholder:text-[#0F1B3D]/30"
                    />
                  </div>
                  {arr.length > 2 && (
                    <button type="button" onClick={() => removeMatchingPair(index)} className="shrink-0 text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D]">
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={addMatchingPair} className="mt-1 text-xs font-bold text-[#0F1B3D]">+ เพิ่มคู่จับคู่</button>
          </div>
        )}

        {/* ===== เพิ่มใหม่: sequencing — กรอกรายการเรียงจากบนลงล่างตามลำดับที่ถูกต้อง ===== */}
        {/* ===== ปรับใหม่: drag handle + native drag-and-drop (สไตล์เดียวกับ LessonDraftForm.tsx) ===== */}
        {interactionType === "sequencing" && (
          <div className="mt-4 space-y-1.5">
            <p className="mb-2 text-[11.5px] text-[#0F1B3D]/35">ลากการ์ด หรือกดปุ่มลูกศรเพื่อสลับตำแหน่ง — เรียงจากบนลงล่างตามลำดับที่ถูกต้อง</p>
            {sequencingItems.map((text, index, arr) => {
              const isDragging = draggingSequencing === index;
              return (
                <div
                  key={index}
                  draggable
                  onDragStart={() => setDraggingSequencing(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingSequencing !== null) moveSequencingItemTo(draggingSequencing, index);
                    setDraggingSequencing(null);
                  }}
                  onDragEnd={() => setDraggingSequencing(null)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 transition-all ${
                    isDragging ? "border-[#0F1B3D]/30 bg-[#0F1B3D]/5 opacity-40" : "border-transparent hover:border-[#0F1B3D]/15"
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
                    {index + 1}
                  </span>
                  <input
                    value={text}
                    onChange={(e) => updateSequencingItem(index, e.target.value)}
                    placeholder={`รายการที่ ${index + 1}`}
                    className={`min-w-0 flex-1 ${inputClass}`}
                  />
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={index === 0} onClick={() => moveSequencingItem(index, -1)} className="rounded-lg border border-[#0F1B3D]/10 px-2 py-1 text-xs font-bold text-[#0F1B3D]/60 disabled:opacity-30">↑</button>
                    <button type="button" disabled={index === arr.length - 1} onClick={() => moveSequencingItem(index, 1)} className="rounded-lg border border-[#0F1B3D]/10 px-2 py-1 text-xs font-bold text-[#0F1B3D]/60 disabled:opacity-30">↓</button>
                    {arr.length > 2 && (
                      <button type="button" onClick={() => removeSequencingItem(index)} className="text-xs font-bold text-slate-400 hover:text-red-500">✕</button>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addSequencingItem} className="mt-1 text-xs font-bold text-[#0F1B3D]">+ เพิ่มรายการ</button>
          </div>
        )}

        {interactionType === "drag_drop" && (
          <DragDropAuthoring
            value={dragDropForm}
            onChange={(next) => {
              setDragDropForm(next);
              setChoicesError(null);
            }}
          />
        )}

        {choicesError && (
          <p className="mt-2 text-[12.5px] font-medium text-red-600">{choicesError}</p>
        )}

        <label className="mt-4 block"><span className={labelClass}>คำอธิบายเฉลย</span><textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className={inputClass} /></label>

        {/* ===== ปรับใหม่: รูปภาพประกอบคำถาม — การ์ด 16:9 + Lightbox (ปักหมุด/แคปชัน) ตามแบบ
            LessonDraftForm.tsx (กดรูปเพื่อขยายดูเต็ม, ปุ่มจัดการเป็น pill ghost button มีไอคอน) ===== */}
        <div className="mt-4">
          <span className={labelClass}>รูปภาพประกอบคำถาม (ไม่บังคับ)</span>
          {imageUrl ? (
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="group relative aspect-video w-40 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[#0F1B3D]/10 shadow-[0_1px_3px_rgba(15,27,61,0.08)]"
              >
                <img src={imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                {imagePins.map((pin, pinIndex) => (
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
                {imageFileMeta && (
                  <p className="text-[11px] text-slate-400">
                    {imageFileMeta.name} · {formatFileSize(imageFileMeta.size)}
                  </p>
                )}
                <input
                  value={imageCaption ?? ""}
                  onChange={(e) => setImageCaption(e.target.value || null)}
                  placeholder="คำบรรยายใต้ภาพ (ไม่บังคับ) เช่น ภาพที่ 1: แผนผังระบบ"
                  className="w-full rounded-lg border border-[#0F1B3D]/[0.1] bg-[#F7F8FA] px-2.5 py-1.5 text-[12px] text-[#0F1B3D] outline-none focus:border-[#0F1B3D]/30 focus:bg-white"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a2 2 0 104 0 2 2 0 10-4 0" />
                    </svg>
                    ปักหมุด{imagePins.length > 0 ? ` (${imagePins.length})` : ""}
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#0F1B3D]/15 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA]">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    เปลี่ยนรูป
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => handleImageFileChange(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl(null);
                      setImageError(null);
                      setImageCaption(null);
                      setImagePins([]);
                      setImageFileMeta(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-[#EB4A2D] hover:bg-[#EB4A2D]/10"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 3h5l.5 4h-6l.5-4z" />
                    </svg>
                    ลบรูป
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#0F1B3D]/20 bg-[#F7F8FA] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#0F1B3D]/60 hover:border-[#FF5A3C] hover:text-[#FF5A3C]">
              {uploadingImage ? "กำลังอัปโหลด..." : "+ อัปโหลดรูปภาพ"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={uploadingImage}
                onChange={(e) => handleImageFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          {imageError && <p className="mt-1.5 text-[12.5px] font-medium text-red-600">{imageError}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-[14.5px] font-bold text-[#0F1B3D]">การจัดหมวดหมู่</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          
          <label><span className={labelClass}>หมวดเนื้อหา</span>
                <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>
                    {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                </label>
                {category === "อื่นๆ" && (
                <label className="sm:col-span-2">
                    <span className={labelClass}>ระบุหมวดเนื้อหา <span className="text-red-500">*</span></span>
                    <input
                      ref={customCategoryRef}
                      value={customCategory}
                      onChange={(e) => {
                        setCustomCategory(e.target.value);
                        setFieldErrors((prev) => (prev.customCategory ? { ...prev, customCategory: undefined } : prev));
                      }}
                      aria-invalid={!!fieldErrors.customCategory}
                      aria-describedby={fieldErrors.customCategory ? "customCategory-error" : undefined}
                      className={`${inputClass} ${fieldErrors.customCategory ? "!border-red-400 focus:!border-red-500" : ""}`}
                    />
                    {fieldErrors.customCategory && (
                      <p id="customCategory-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">{fieldErrors.customCategory}</p>
                    )}
                </label>
                )}
          <label><span className={labelClass}>ระดับความยาก</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={inputClass}>
              <option value="easy">ง่าย</option><option value="medium">ปานกลาง</option><option value="hard">ยาก</option>
            </select>
          </label>
          <label><span className={labelClass}>ใช้สำหรับ</span>
            {/* ===== แก้: Pop-up Quiz ใช้ได้เฉพาะคำถามที่ผูกกับบทเรียนเท่านั้น (ไม่มี "ทั้งคอร์สเท่านั้น")
                เปลี่ยนมาเป็น popup แล้ว ต้องเคลียร์ทั้ง checkbox ที่ติ๊กไว้ค้าง และแท็ก "ทั้งคอร์ส" ที่เคย
                เพิ่มไปแล้วทิ้งไปด้วย ไม่ปล่อยให้ค้างเป็นค่าที่ใช้งานจริงไม่ได้ ===== */}
            <select
              value={usageType}
              onChange={(e) => {
                const next = e.target.value as UsageType;
                setUsageType(next);
                if (next === "popup") {
                  setUseWholeCourseTag(false);
                  setTopicTags((current) => current.filter((t) => t.lessonId !== null));
                }
              }}
              className={inputClass}
            >
              <option value="final">Final Exam</option><option value="popup">Pop-up Quiz</option>
            </select>
          </label>
        </div>

        <div className="mt-4">
            <span className={labelClass}>คอร์ส/บทเรียนที่เกี่ยวข้อง <span className="text-red-500">*</span></span>

            {courseGroups.length === 0 ? (
              <p className="text-[12.5px] text-[#0F1B3D]/40">ยังไม่มีคอร์ส/บทเรียนให้เลือก</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCourseId}
                    onChange={(e) => { setSelectedCourseId(e.target.value); setPendingLessonValue(""); setUseWholeCourseTag(false); }}
                    className={`${inputClass} w-auto min-w-0 max-w-full flex-1 basis-[180px] truncate`}
                  >
                    <option value="">— เลือกคอร์ส —</option>
                    {visibleCourseGroups.map((group) => (
                      <option key={group.courseId} value={group.courseId}>{group.courseTitle}</option>
                    ))}
                  </select>
                  {/* ===== แก้บั๊ก: ถ้าคอร์สนี้ติ๊ก "ทั้งคอร์สเท่านั้น" ไปแล้ว ห้ามเพิ่มแท็กบทเรียนซ้อนสำหรับคอร์สเดียวกันอีก ===== */}
                  <select
                    value={pendingLessonValue}
                    onChange={(e) => setPendingLessonValue(e.target.value)}
                    disabled={!selectedCourseId || useWholeCourseTag || hasWholeCourseTagForSelectedCourse}
                    className={`${inputClass} w-auto min-w-0 max-w-full flex-1 basis-[160px] truncate disabled:opacity-50`}
                  >
                    <option value="">{!selectedCourseId ? "เลือกคอร์สก่อน" : "เลือกบทเรียน..."}</option>
                    {usageType === "popup" && availableLessonsForSelectedCourse.length > 0 && (
                      <option value={ALL_LESSONS_VALUE}>ทุกบทในคอร์ส ({availableLessonsForSelectedCourse.length} บท)</option>
                    )}
                    {availableLessonsForSelectedCourse.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPendingSelection}
                    disabled={
                      !selectedCourseId ||
                      (useWholeCourseTag ? hasLessonTagForSelectedCourse : !pendingLessonValue || hasWholeCourseTagForSelectedCourse)
                    }
                    className="shrink-0 rounded-lg bg-[#0F1B3D] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-40"
                  >
                    + เพิ่ม
                  </button>
                  {selectedCourseId && (
                    <button
                      type="button"
                      onClick={() => { setSelectedCourseId(""); setPendingLessonValue(""); setUseWholeCourseTag(false); }}
                      className="shrink-0 text-[12px] font-bold text-[#0F1B3D]/40 hover:text-[#0F1B3D]"
                    >
                      ล้างค่า
                    </button>
                  )}
                </div>

                {/* ===== แก้บั๊ก: ถ้าคอร์สนี้มีแท็กบทเรียนอยู่แล้ว ห้ามติ๊ก "ทั้งคอร์สเท่านั้น" ซ้อนสำหรับคอร์สเดียวกัน
                    เพราะขัดกับความหมายของตัวเลือกนี้เอง (ต้องไม่ผูกกับบทใดเลย) — disable checkbox ไปเลยพร้อมคำอธิบาย
                    ===== แก้เพิ่ม: Pop-up Quiz ใช้ได้แค่คำถามที่ผูกกับบทเรียนเท่านั้น (สุ่ม/แสดงต่อบท) ไม่มีแนวคิด
                    "ทั้งคอร์ส" สำหรับ Pop-up Quiz เลย เลย disable checkbox ไปตรงๆ ไม่ต้องรอให้มีแท็กบทก่อน ===== */}
                {selectedCourseId && (
                  <label className={`mt-2.5 flex items-start gap-2 text-[12.5px] leading-5 ${(hasLessonTagForSelectedCourse || usageType === "popup") ? "text-[#0F1B3D]/35" : "text-[#0F1B3D]/70"}`}>
                    <input
                      type="checkbox"
                      checked={useWholeCourseTag}
                      disabled={hasLessonTagForSelectedCourse || usageType === "popup"}
                      onChange={(e) => { setUseWholeCourseTag(e.target.checked); setPendingLessonValue(""); }}
                      className="mt-0.5 disabled:cursor-not-allowed"
                    />
                    <span>
                      <strong>ใช้เฉพาะข้อสอบปลายภาคแบบรวมทั้งคอร์ส</strong><br />
                      ข้อนี้จะไม่ผูกกับบทเรียนใด ไม่ถูกสุ่มใน Pop-up Quiz และไม่นับในชุดสอบที่แบ่งสัดส่วนตามบท
                      {usageType === "popup" ? (
                        <>
                          <br /><span className="font-bold text-amber-600">Pop-up Quiz ใช้ได้เฉพาะคำถามที่ผูกกับบทเรียนเท่านั้น</span>
                        </>
                      ) : hasLessonTagForSelectedCourse && (
                        <>
                          <br /><span className="font-bold text-amber-600">ลบแท็กบทเรียนของคอร์สนี้ออกก่อน จึงจะเลือกตัวเลือกนี้ได้</span>
                        </>
                      )}
                    </span>
                  </label>
                )}
                {selectedCourseId && hasWholeCourseTagForSelectedCourse && (
                  <p className="mt-1.5 text-[12px] font-semibold text-amber-600">
                    คอร์สนี้ถูกตั้งเป็น &quot;ทั้งคอร์สเท่านั้น&quot; ไปแล้ว — ลบแท็ก &quot;ทั้งคอร์ส&quot; ด้านล่างก่อน จึงจะเพิ่มแท็กแบบรายบทของคอร์สนี้ได้
                  </p>
                )}

                {/* ===== เพิ่มใหม่: แจ้งสถานะการกรองคอร์สตามหมวดเนื้อหาของคำถาม ===== */}
                {isFilteredByCategory && (
                  <p className="mt-2.5 text-[12px] leading-5 text-[#0F1B3D]/40">
                    กำลังแสดงเฉพาะคอร์สหมวด &quot;{finalCategoryForCompare}&quot; ({categoryMatchedCourseGroups.length} คอร์ส) — เปลี่ยนหมวดเนื้อหาด้านบนถ้าต้องการเลือกคอร์สหมวดอื่น
                  </p>
                )}
                {noCourseInThisCategory && (
                  <p className="mt-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12px] leading-5 text-amber-800">
                    ⚠ ไม่มีคอร์สที่อยู่หมวด &quot;{finalCategoryForCompare}&quot; เลย ระบบเลยแสดงคอร์สทั้งหมดแทนชั่วคราว — เลือกได้ตามปกติ แต่ตรวจสอบว่าตั้งใจผูกข้ามหมวดจริงไหม
                  </p>
                )}

                {topicTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topicTags.map((tag) => {
                      const courseTitle = courseTitleById.get(tag.courseId) ?? "คอร์สที่ไม่พบ";
                      const lessonTitle = tag.lessonId ? lessonById.get(tag.lessonId)?.title : null;
                      const tagCourseCategory = courseCategoryById.get(tag.courseId) ?? null;
                      const tagMismatch = !!tagCourseCategory && !!finalCategoryForCompare && tagCourseCategory !== finalCategoryForCompare;
                      return (
                        <button
                          key={tagKey(tag)}
                          type="button"
                          onClick={() => removeTag(tag)}
                          title={`${courseTitle} · ${tag.lessonId ? (lessonTitle ?? "บทเรียนที่ไม่พบ") : "ทั้งคอร์ส"}${tagMismatch ? ` (หมวดคอร์สไม่ตรงกับคำถาม: คอร์สอยู่หมวด "${tagCourseCategory}")` : ""}`}
                          className={`flex min-w-0 max-w-full items-center gap-2 rounded-2xl px-3.5 py-1.5 text-left text-[12.5px] font-bold text-white ${tagMismatch ? "bg-amber-500" : "bg-[#0F1B3D]"}`}
                        >
                          {tagMismatch && <span className="shrink-0">⚠</span>}
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[11px] font-semibold text-white/60">{courseTitle}</span>
                            <span className="truncate">{tag.lessonId ? (lessonTitle ?? "บทเรียนที่ไม่พบ") : "ทั้งคอร์ส"}</span>
                          </span>
                          <span className="shrink-0 text-white/60">✕</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

           {/* ===== แก้: เขียนกล่องคำแนะนำใหม่ให้ตรงกับ logic จริง — คำถามที่ผูกกับบทเรียนก็ถูกสุ่มเข้า
               ข้อสอบปลายภาครวมทั้งคอร์สได้ด้วย (ดู question-bank-sampling.ts: bucket "ทั้งคอร์ส" กรองด้วย
               course_id เฉยๆ ไม่ได้กันแถวที่มี lesson_id) จึงเติม "และข้อสอบรวมทั้งคอร์ส" ต่อท้ายบรรทัดแรก ===== */}
           <p className="mt-3 rounded-xl bg-blue-50 px-3.5 py-2.5 text-[12px] leading-5 text-blue-800">
            💡 คำแนะนำการเลือก :<br />
            • <strong>เลือกบทเรียน</strong> — ผูกคำถามกับบทนั้น ใช้ได้ใน Pop-up Quiz ระหว่างเรียน และชุดสอบปลายภาคที่แบ่งสัดส่วนตามบท และข้อสอบรวมทั้งคอร์ส<br />
            • <strong>ติ๊ก &quot;ทั้งคอร์สเท่านั้น&quot;</strong> — ไม่ผูกกับบทใด ใช้ได้เฉพาะข้อสอบปลายภาครวมทั้งคอร์ส<br />
            • เลือกได้อย่างใดอย่างหนึ่งเท่านั้น
          </p>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}
      <button type="button" disabled={saving} onClick={handleSave} className="w-full rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
        {saving ? "กำลังบันทึก..." : questionId ? "บันทึกการแก้ไข" : "เพิ่มคำถามลงคลัง"}
      </button>
    </div>

    {/* ===== เพิ่มใหม่: Lightbox ขยายรูปประกอบคำถาม — ปักหมุด/ย้อนกลับ/ล้างหมุด (สไตล์เดียวกับ
        LessonDraftForm.tsx) มีรูปเดียวในฟอร์มนี้ เลยไม่ต้องอ้างด้วย key แบบหน้านั้น ===== */}
    {lightboxOpen && imageUrl && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        onClick={() => setLightboxOpen(false)}
      >
        <div
          className="flex max-h-[90vh] w-fit max-w-[min(92vw,640px)] flex-col gap-3 rounded-2xl bg-white p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-[#0F1B3D]/50">
              คลิกบนภาพเพื่อปักหมุดถัดไป · คลิกที่ตัวหมุดเพื่อลบทีละอัน
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={undoLastImagePin}
                disabled={imagePins.length === 0}
                title="ย้อนกลับ (ลบหมุดล่าสุด)"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#0F1B3D]/15 text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l-4-4 4-4m-4 4h11a4 4 0 010 8h-1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={clearImagePins}
                disabled={imagePins.length === 0}
                className="rounded-full border border-[#0F1B3D]/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-[#0F1B3D] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ล้างหมุดทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
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
              src={imageUrl}
              alt=""
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                addImagePin(x, y);
              }}
              className="block max-h-[65vh] max-w-full cursor-crosshair object-contain"
            />
            {imagePins.map((pin, pinIndex) => (
              <button
                key={pin.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImagePin(pin.id);
                }}
                title="กดเพื่อลบหมุดนี้"
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[12px] font-bold text-white ring-2 ring-white hover:bg-[#EB4A2D]"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              >
                {pinIndex + 1}
              </button>
            ))}
          </div>

          {imageCaption && <p className="text-center text-[12.5px] font-semibold text-[#0F1B3D]">{imageCaption}</p>}
        </div>
      </div>
    )}
    </>
  );
}
