"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createQuestionBankItem, updateQuestionBankItem, type QuestionBankInput, type QuestionBankTopicTagInput, type Difficulty, type QuestionFormat, type UsageType, type PrivacyScope } from "@/app/dashboard/teacher/question-bank/actions";
import { CATEGORIES, type Category } from "@/lib/constants/categories";
interface ChoiceState { text: string; isCorrect: boolean }

type InteractionType = "multiple_choice" | "true_false" | "sequencing" | "matching" | "fill_in_blank" | "note_callout";

// type ที่เปิดให้ครูเลือกได้จริงตอนนี้ (sync กับ lib/quiz/config/enabled-types.ts ฝั่ง backend)
const ENABLED_INTERACTION_TYPES: { value: InteractionType; label: string; disabled?: boolean }[] = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  // { value: "fill_in_blank", label: "Fill in the blank (เร็วๆ นี้)", disabled: true },
  // { value: "sequencing", label: "Sequencing (เร็วๆ นี้)", disabled: true },
  // { value: "matching", label: "Matching (เร็วๆ นี้)", disabled: true },
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

  //const isWholeCourseAlreadyAdded = topicTags.some((tag) => tag.courseId === selectedCourseId && tag.lessonId === null);
  const availableLessonsForSelectedCourse = useMemo(
    () => courseGroups.find((g) => g.courseId === selectedCourseId)?.items ?? [],
    [courseGroups, selectedCourseId]
  );

  function tagKey(tag: QuestionBankTopicTagInput) {
    return `${tag.courseId}::${tag.lessonId ?? "whole"}`;
  }

  function addPendingSelection() {
    if (!selectedCourseId) return;
    const newTag: QuestionBankTopicTagInput = useWholeCourseTag
      ? { courseId: selectedCourseId, lessonId: null }
      : { courseId: selectedCourseId, lessonId: pendingLessonValue };
    if (!useWholeCourseTag && !pendingLessonValue) return;
    setTopicTags((current) => (current.some((t) => tagKey(t) === tagKey(newTag)) ? current : [...current, newTag]));
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
    // ===== เพิ่มใหม่: validate choices ตาม interaction_type =====
    // เช็คทั้ง multiple_choice และ true_false (choice-based ทั้งคู่) ว่าทุกตัวเลือกที่มีอยู่ต้องกรอกครบ
    // ไม่ใช่แค่เช็คว่า "มี" ตัวเลือกเฉยๆ — ไม่งั้นกดสร้างคอร์สหลุดผ่านไปได้ทั้งที่ตัวเลือกว่างอยู่
    if (interactionType === "multiple_choice" || interactionType === "true_false") {
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
      if (!choices.some((c) => c.isCorrect)) {
        setChoicesError("กรุณาเลือกตัวเลือกที่ถูกต้องอย่างน้อย 1 ข้อ");
        return;
      }
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
      answerData: null, // multiple_choice/true_false ไม่ใช้ answer_data (ตาม design ที่ตกลงกันไว้)
      
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
            {ENABLED_INTERACTION_TYPES.map((opt) => (
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

        <div className="mt-4 space-y-2.5">
          {choices.map((choice, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <button type="button" onClick={() => setCorrectChoice(index)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${choice.isCorrect ? "border-emerald-500" : "border-slate-300"}`}>
                {choice.isCorrect && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
              </button>
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
          {choicesError && (
            <p className="mt-1 text-[12.5px] font-medium text-red-600">{choicesError}</p>
          )}
        </div>

        <label className="mt-4 block"><span className={labelClass}>คำอธิบายเฉลย</span><textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className={inputClass} /></label>
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
            <select value={usageType} onChange={(e) => setUsageType(e.target.value as UsageType)} className={inputClass}>
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
                    className={`${inputClass} w-auto min-w-[180px] flex-1`}
                  >
                    <option value="">— เลือกคอร์ส —</option>
                    {visibleCourseGroups.map((group) => (
                      <option key={group.courseId} value={group.courseId}>{group.courseTitle}</option>
                    ))}
                  </select>
                  <select
                    value={pendingLessonValue}
                    onChange={(e) => setPendingLessonValue(e.target.value)}
                    disabled={!selectedCourseId || useWholeCourseTag}
                    className={`${inputClass} w-auto min-w-[160px] flex-1 disabled:opacity-50`}
                  >
                    <option value="">{!selectedCourseId ? "เลือกคอร์สก่อน" : "เลือกบทเรียน..."}</option>
                    {availableLessonsForSelectedCourse.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPendingSelection}
                    disabled={!selectedCourseId || (!useWholeCourseTag && !pendingLessonValue)}
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

                {selectedCourseId && (
                  <label className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-5 text-[#0F1B3D]/70">
                    <input
                      type="checkbox"
                      checked={useWholeCourseTag}
                      onChange={(e) => { setUseWholeCourseTag(e.target.checked); setPendingLessonValue(""); }}
                      className="mt-0.5"
                    />
                    <span>
                      ใช้กับ<strong>ข้อสอบปลายภาคแบบรวมทั้งคอร์สเท่านั้น</strong> (ไม่ระบุบทเรียน) —
                      คำถามนี้จะ<strong>ไม่ถูกสุ่มใช้กับ Pop-up Quiz</strong> และไม่ถูกใช้ในการจัดชุดสอบปลายภาคแบบระบุสัดส่วนรายบท
                    </span>
                  </label>
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
                          title={tagMismatch ? `หมวดคอร์สไม่ตรงกับคำถาม (คอร์สอยู่หมวด "${tagCourseCategory}")` : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white ${tagMismatch ? "bg-amber-500" : "bg-[#0F1B3D]"}`}
                        >
                          {tagMismatch && <span>⚠</span>}
                          <span className="text-white/60">{courseTitle} ·</span>{" "}
                          {tag.lessonId ? (lessonTitle ?? "บทเรียนที่ไม่พบ") : "ทั้งคอร์ส"}
                          <span className="text-white/60">✕</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

           <p className="mt-3 rounded-xl bg-blue-50 px-3.5 py-2.5 text-[12px] leading-5 text-blue-800">
            💡 คำแนะนำการเลือก :<br />
            • <strong>เลือกบทเรียน</strong> — เหมาะสำหรับข้อสอบที่เจาะจงเนื้อหาของบทนั้นๆ (นำไปใช้ทำ Pop-up Quiz ระหว่างเรียน และจัดชุดสอบปลายภาคแบบระบุสัดส่วนรายบทได้)<br />
            • <strong>ติ๊ก &quot;ทั้งคอร์สเท่านั้น&quot;</strong> — ใช้ได้เฉพาะข้อสอบปลายภาคแบบรวมทั้งคอร์สโดยไม่เจาะจงบท จะไม่ถูกสุ่มไปใช้ใน Pop-up Quiz
          </p>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}
      <button type="button" disabled={saving} onClick={handleSave} className="w-full rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
        {saving ? "กำลังบันทึก..." : questionId ? "บันทึกการแก้ไข" : "เพิ่มคำถามลงคลัง"}
      </button>
    </div>
  );
}