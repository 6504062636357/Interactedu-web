"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createQuestionBankItem, updateQuestionBankItem, type QuestionBankInput, type QuestionBankTopicTagInput, type Difficulty, type QuestionFormat, type UsageType, type PrivacyScope } from "@/app/dashboard/teacher/question-bank/actions";
import { CATEGORIES, type Category } from "@/lib/constants/categories";
interface ChoiceState { text: string; isCorrect: boolean }

const WHOLE_COURSE_VALUE = "__whole_course__";

export default function QuestionBankForm({
  questionId,
  lessons,
  initialData,
}: {
  questionId?: string;
  lessons: { id: string; courseId: string; courseTitle: string; orderIndex: number; title: string }[];
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
  const [format, setFormat] = useState<QuestionFormat>(initialData?.format ?? "multiple_choice");
  const [usageType, setUsageType] = useState<UsageType>(initialData?.usageType ?? "final");
  const [privacyScope, setPrivacyScope] = useState<PrivacyScope>(initialData?.privacyScope ?? "private");
  const [topicTags, setTopicTags] = useState<QuestionBankTopicTagInput[]>(initialData?.topicTags ?? []);
  const [choices, setChoices] = useState<ChoiceState[]>(
    initialData?.choices?.length ? initialData.choices : [{ text: "", isCorrect: true }, { text: "", isCorrect: false }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lessonsByCourse = lessons.reduce<Record<string, { courseId: string; courseTitle: string; items: typeof lessons }>>((groups, lesson) => {
  if (!groups[lesson.courseId]) groups[lesson.courseId] = { courseId: lesson.courseId, courseTitle: lesson.courseTitle, items: [] };
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

  const courseTitleById = useMemo(() => new Map(courseGroups.map((g) => [g.courseId, g.courseTitle])), [courseGroups]);
  const lessonById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);

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
    if (!selectedCourseId || !pendingLessonValue) return;
    const newTag: QuestionBankTopicTagInput =
      pendingLessonValue === WHOLE_COURSE_VALUE
        ? { courseId: selectedCourseId, lessonId: null }
        : { courseId: selectedCourseId, lessonId: pendingLessonValue };
    setTopicTags((current) => (current.some((t) => tagKey(t) === tagKey(newTag)) ? current : [...current, newTag]));
    setPendingLessonValue("");
  }

  function removeTag(tag: QuestionBankTopicTagInput) {
    setTopicTags((current) => current.filter((t) => tagKey(t) !== tagKey(tag)));
  }

  function updateChoiceText(index: number, text: string) {
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, text } : choice)));
  }

  function setCorrectChoice(index: number) {
    setChoices((current) => current.map((choice, i) => ({ ...choice, isCorrect: i === index })));
  }

    async function handleSave() {
    if (topicTags.length === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 คอร์ส ก่อนบันทึก");
      return;
    }
    setSaving(true);
    setError(null);
    const finalCategory = category === "อื่นๆ" ? customCategory.trim() : category;
    const input: QuestionBankInput = { questionText, explanation: explanation || null, category: finalCategory || null, difficulty, format, usageType, privacyScope, topicTags, choices };
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
        <label className="block"><span className={labelClass}>คำถาม</span><textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={2} className={inputClass} /></label>

        <div className="mt-4 space-y-2.5">
          {choices.map((choice, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <button type="button" onClick={() => setCorrectChoice(index)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${choice.isCorrect ? "border-emerald-500" : "border-slate-300"}`}>
                {choice.isCorrect && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
              </button>
              <input value={choice.text} onChange={(e) => updateChoiceText(index, e.target.value)} placeholder={`ตัวเลือกที่ ${index + 1}`} className={`min-w-0 flex-1 ${inputClass}`} />
              {choices.length > 2 && <button type="button" onClick={() => setChoices((c) => c.filter((_, i) => i !== index))} className="text-xs font-bold text-slate-400 hover:text-red-500">✕</button>}
            </div>
          ))}
          <button type="button" onClick={() => setChoices((c) => [...c, { text: "", isCorrect: false }])} className="text-xs font-bold text-[#3157D5]">+ เพิ่มตัวเลือก</button>
        </div>

        <label className="mt-4 block"><span className={labelClass}>คำอธิบายเฉลย (ไม่บังคับ)</span><textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className={inputClass} /></label>
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
                <label className="sm:col-span-2"><span className={labelClass}>ระบุหมวดเนื้อหา</span>
                    <input required value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className={inputClass} />
                </label>
                )}
          <label><span className={labelClass}>ระดับความยาก</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={inputClass}>
              <option value="easy">ง่าย</option><option value="medium">ปานกลาง</option><option value="hard">ยาก</option>
            </select>
          </label>
          <label><span className={labelClass}>รูปแบบคำถาม</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as QuestionFormat)} className={inputClass}>
              <option value="multiple_choice">Multiple Choice</option><option value="code_practical">Code/Practical</option>
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
                    onChange={(e) => { setSelectedCourseId(e.target.value); setPendingLessonValue(""); }}
                    className={`${inputClass} w-auto min-w-[180px] flex-1`}
                  >
                    <option value="">— เลือกคอร์ส —</option>
                    {courseGroups.map((group) => (
                      <option key={group.courseId} value={group.courseId}>{group.courseTitle}</option>
                    ))}
                  </select>
                  <select
                    value={pendingLessonValue}
                    onChange={(e) => setPendingLessonValue(e.target.value)}
                    disabled={!selectedCourseId}
                    className={`${inputClass} w-auto min-w-[160px] flex-1 disabled:opacity-50`}
                  >
                    <option value="">{!selectedCourseId ? "เลือกคอร์สก่อน" : "เลือกขอบเขต..."}</option>
                    {selectedCourseId && (
                      <option value={WHOLE_COURSE_VALUE}>— ทั้งคอร์ส (ไม่ระบุบทเรียน) —</option>
                    )}
                    {availableLessonsForSelectedCourse.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPendingSelection}
                    disabled={!pendingLessonValue}
                    className="shrink-0 rounded-lg bg-[#0F1B3D] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-40"
                  >
                    + เพิ่ม
                  </button>
                  {selectedCourseId && (
                    <button
                      type="button"
                      onClick={() => { setSelectedCourseId(""); setPendingLessonValue(""); }}
                      className="shrink-0 text-[12px] font-bold text-[#0F1B3D]/40 hover:text-[#0F1B3D]"
                    >
                      ล้างค่า
                    </button>
                  )}
                </div>

                {topicTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topicTags.map((tag) => {
                      const courseTitle = courseTitleById.get(tag.courseId) ?? "คอร์สที่ไม่พบ";
                      const lessonTitle = tag.lessonId ? lessonById.get(tag.lessonId)?.title : null;
                      return (
                        <button
                          key={tagKey(tag)}
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="flex items-center gap-1.5 rounded-full bg-[#0F1B3D] px-3.5 py-1.5 text-[12.5px] font-bold text-white"
                        >
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
            • <strong>เลือกบทเรียน</strong> — เหมาะสำหรับข้อสอบที่เจาะจงเนื้อหาของบทนั้นๆ (นำไปใช้ทำ Quiz ระหว่างเรียน และจัดชุดสอบปลายภาคแบบระบุสัดส่วนรายบทได้)<br />
            • <strong>เลือกทั้งคอร์ส</strong> — ใช้ได้กับการจัดสอบปลายภาคแบบระบุคอร์สโดยไม่เจาะจงบท
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-[14.5px] font-bold text-[#0F1B3D]">สิทธิ์การเข้าถึง</h2>
        <div className="flex gap-2">
          {([["private", " ส่วนตัว"], ["department", " หมวดวิชา"], ["public", " สาธารณะ"]] as [PrivacyScope, string][]).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPrivacyScope(value)} className={`rounded-full px-4 py-2 text-[13px] font-bold ${privacyScope === value ? "bg-[#0F1B3D] text-white" : "bg-white border border-[#0F1B3D]/10 text-[#0F1B3D]/60"}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}
      <button type="button" disabled={saving} onClick={handleSave} className="w-full rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
        {saving ? "กำลังบันทึก..." : questionId ? "บันทึกการแก้ไข" : "เพิ่มคำถามลงคลัง"}
      </button>
    </div>
  );
}