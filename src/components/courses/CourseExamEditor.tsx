"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCourseFinalExam, saveCourseExamConfig, previewCourseExamSample, type CourseExamQuestionInput, type PreviewQuestion } from "@/app/dashboard/course-exam-actions";
type EditableQuestion = CourseExamQuestionInput & { key: string };

type Difficulty = "easy" | "medium" | "hard";
type BuildMode = "custom" | "preset";
type PresetType = "quick_check" | "standard_final" | "challenging_final";
type ActiveTab = "random" | "manual";
type InteractionType = "multiple_choice" | "true_false";
interface CustomConstraintRow {
  key: string;
  lessonId: string;
  difficulty: Difficulty;
  count: number;
}

const PRESET_LABELS: Record<PresetType, string> = {
  quick_check: "Quick Check (ง่าย 60% / ปานกลาง 40%)",
  standard_final: "Standard Final (ง่าย 30% / ปานกลาง 50% / ยาก 20%)",
  challenging_final: "Challenging Final (ปานกลาง 50% / ยาก 50%)",
};

function emptyQuestion(): EditableQuestion {
  return {
    key: crypto.randomUUID(),
    questionText: "",
    explanation: null,
    interactionType: "multiple_choice",
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}

export default function CourseExamEditor({
  courseId,
  initialQuestions,
  lessons,
  initialExamConfig,
  readOnly = false, // ⬅️ ใหม่: default false เพื่อไม่กระทบหน้า teacher เดิม
}: {
  courseId: string;
  initialQuestions: CourseExamQuestionInput[];
  lessons: { id: string; title: string }[];
  readOnly?: boolean; // ⬅️ ใหม่
  initialExamConfig?: {
    buildMode: BuildMode;
    totalQuestions: number;
    presetType: PresetType | null;
    customConstraints: { lessonId: string; difficulty: Difficulty; count: number }[] | null;
  } | null;
}) {
  const router = useRouter();

  // แท็บที่เปิดอยู่ — ถ้ามีกติกาสุ่มอยู่แล้วให้เปิดแท็บสุ่มก่อน ไม่งั้นเปิดแท็บพิมพ์เอง
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialExamConfig ? "random" : "manual");

  const [questions, setQuestions] = useState<EditableQuestion[]>(
    initialQuestions.length ? initialQuestions.map((question) => ({ ...question, key: crypto.randomUUID() })) : [emptyQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(key: string, updates: Partial<EditableQuestion>) {
    if (readOnly) return; // ⬅️ ใหม่: กันเผื่อ event หลุดมา
    setQuestions((current) => current.map((question) => question.key === key ? { ...question, ...updates } : question));
  }

  function updateChoice(key: string, choiceIndex: number, text: string) {
    if (readOnly) return; // ⬅️ ใหม่
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      choices: question.choices.map((choice, index) => index === choiceIndex ? { ...choice, text } : choice),
    } : question));
  }

  function setCorrectChoice(key: string, choiceIndex: number) {
    if (readOnly) return; // ⬅️ ใหม่
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      choices: question.choices.map((choice, index) => ({ ...choice, isCorrect: index === choiceIndex })),
    } : question));
  }

   // ===== เพิ่มใหม่: เปลี่ยน interaction_type ของคำถามข้อนั้น =====
  function setInteractionType(key: string, interactionType: InteractionType) {
    if (readOnly) return; // ⬅️ ใหม่
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
      return { ...question, interactionType };
    }));
  }

  async function save() {
    if (readOnly) return; // ⬅️ ใหม่: กันยิง action จากฝั่ง admin เด็ดขาด

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q.interactionType === "true_false") {
        const filled = q.choices.filter((c) => c.text.trim());
        if (filled.length !== 2) {
          setError(`คำถามข้อ ${i + 1} เป็น True/False ต้องมี 2 ตัวเลือกเท่านั้น`);
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveCourseFinalExam({
      courseId,
      questions: questions.map(({ questionText, explanation, choices, interactionType }) => ({ questionText, explanation, choices, interactionType })),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("บันทึกบททดสอบท้ายคอร์สเรียบร้อยแล้ว");
    router.refresh();
  }

  const [buildMode, setBuildMode] = useState<BuildMode>(initialExamConfig?.buildMode ?? "preset");
  const [totalQuestions, setTotalQuestions] = useState(initialExamConfig?.totalQuestions ?? 10);
  const [presetType, setPresetType] = useState<PresetType>(initialExamConfig?.presetType ?? "standard_final");
  const [customConstraints, setCustomConstraints] = useState<CustomConstraintRow[]>(
    initialExamConfig?.customConstraints?.length
      ? initialExamConfig.customConstraints.map((c) => ({ ...c, key: crypto.randomUUID() }))
      : [{ key: crypto.randomUUID(), lessonId: lessons[0]?.id ?? "", difficulty: "easy", count: 1 }]
  );
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const constraintSum = customConstraints.reduce((sum, c) => sum + c.count, 0);

  async function saveConfig() {
    if (readOnly) return; // ⬅️ ใหม่
    setConfigSaving(true);
    setConfigError(null);
    setConfigMessage(null);
    const result = await saveCourseExamConfig({
      courseId,
      buildMode,
      totalQuestions,
      presetType: buildMode === "preset" ? presetType : null,
      customConstraints: buildMode === "custom"
        ? customConstraints.map(({ lessonId, difficulty, count }) => ({ lessonId, difficulty, count }))
        : null,
    });
    setConfigSaving(false);
    if (result.error) {
      setConfigError(result.error);
      return;
    }
    setConfigMessage("บันทึกกติกาสุ่มข้อสอบเรียบร้อยแล้ว");
    router.refresh();
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
    // ★ แก้ใหม่: ส่งกติกาปัจจุบันบนหน้าจอ (ที่อาจยังไม่ได้กดบันทึก) ไปพรีวิวตรงๆ แทนที่จะให้ server
    // ไปอ่านกติกาที่บันทึกไว้ล่าสุด — กันไม่ให้พรีวิวคนละโหมดกับที่กำลังดูอยู่บนจอ
    const result = await previewCourseExamSample({
      courseId,
      buildMode,
      totalQuestions,
      presetType: buildMode === "preset" ? presetType : null,
      customConstraints: buildMode === "custom"
        ? customConstraints.map(({ lessonId, difficulty, count }) => ({ lessonId, difficulty, count }))
        : null,
    });
    setPreviewLoading(false);
    if (result.error) {
      setPreviewError(result.error);
      return;
    }
    setPreviewQuestions(result.questions ?? []);
  }

  // ★ เพิ่มใหม่: สลับโหมด preset/custom แล้วล้าง error/message เก่าของอีกโหมดทิ้งด้วย
  // เพราะก่อนหน้านี้ configError/previewError ค้างอยู่ข้ามโหมด ทำให้เห็น error ของ preset
  // ปนกับ error ของ custom พร้อมกัน ทั้งที่ตอนนี้กำลังดูอยู่แค่โหมดเดียว
  function handleModeChange(mode: BuildMode) {
    if (readOnly) return;
    setBuildMode(mode);
    setConfigError(null);
    setConfigMessage(null);
    setPreviewError(null);
    setPreviewQuestions(null);
  }

  const tabButtonClass = (tab: ActiveTab) =>
    `flex-1 rounded-xl px-5 py-4 text-left transition ${
      activeTab === tab
        ? "border-2 border-[#FF5A3C] bg-[#FF5A3C]/[0.06]"
        : "border-2 border-[#0F1B3D]/[0.08] bg-white hover:border-[#0F1B3D]/20"
    }`;

  return (
    <div>
      {/* ⬅️ ใหม่: แบนเนอร์บอกว่ากำลังดูโหมดรีวิว (อ่านอย่างเดียว) */}
      {readOnly && (
        <div className="mb-6 rounded-xl border border-[#0F1B3D]/10 bg-[#0F1B3D]/[0.03] px-4 py-3">
          <p className="text-[12.5px] font-bold text-[#0F1B3D]/60">
            โหมดรีวิว ดูบททดสอบท้ายคอร์สได้อย่างเดียว ไม่สามารถแก้ไขจากหน้านี้
          </p>
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

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={readOnly} onClick={() => handleModeChange("preset")} className={`rounded-full px-4 py-2 text-[13px] font-bold disabled:opacity-60 disabled:cursor-not-allowed ${buildMode === "preset" ? "bg-[#0F1B3D] text-white" : "bg-white text-[#0F1B3D]/60 border border-[#0F1B3D]/10"}`}>สุ่มตามระดับความยาก (Preset)</button>
            <button type="button" disabled={readOnly} onClick={() => handleModeChange("custom")} className={`rounded-full px-4 py-2 text-[13px] font-bold disabled:opacity-60 disabled:cursor-not-allowed ${buildMode === "custom" ? "bg-[#0F1B3D] text-white" : "bg-white text-[#0F1B3D]/60 border border-[#0F1B3D]/10"}`}>กำหนดเงื่อนไขรายบท (Custom)</button>
          </div>

          <label className="mt-4 block max-w-[200px]">
            <span className="mb-1.5 block text-[13px] font-semibold text-[#0F1B3D]/70">จำนวนข้อสอบทั้งหมด</span>
            <input type="number" min={1} value={totalQuestions} disabled={readOnly} onChange={(e) => setTotalQuestions(Number(e.target.value))} className="w-full rounded-lg border border-[#0F1B3D]/10 bg-white px-3.5 py-2 text-sm outline-none focus:border-[#FF5A3C] disabled:opacity-60" />
          </label>

          {buildMode === "preset" ? (
            <label className="mt-4 block max-w-md">
              <span className="mb-1.5 block text-[13px] font-semibold text-[#0F1B3D]/70">แม่แบบ</span>
              <select value={presetType} disabled={readOnly} onChange={(e) => setPresetType(e.target.value as PresetType)} className="w-full rounded-lg border border-[#0F1B3D]/10 bg-white px-3.5 py-2 text-sm outline-none focus:border-[#FF5A3C] disabled:opacity-60">
                {(Object.entries(PRESET_LABELS) as [PresetType, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          ) : lessons.length === 0 ? (
            // ★ เพิ่มใหม่: คอร์สยังไม่มีบทเรียนเลย ดร็อปดาวน์เลือกบทเรียนจะว่างเปล่าไม่มีตัวเลือกให้กด
            // เลยไม่แสดง UI กำหนดเงื่อนไขรายบทเลย โชว์ข้อความอธิบายแทนให้เข้าใจง่ายกว่า
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700">
              คอร์สนี้ยังไม่มีบทเรียนเลย จึงยังไม่สามารถกำหนดเงื่อนไขรายบทได้ กรุณาเพิ่มบทเรียนก่อน
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {customConstraints.map((constraint) => (
                <div key={constraint.key} className="flex flex-wrap items-center gap-2">
                  <select value={constraint.lessonId} disabled={readOnly} onChange={(e) => updateConstraint(constraint.key, { lessonId: e.target.value })} className="rounded-lg border border-[#0F1B3D]/10 bg-white px-3 py-2 text-[13px] disabled:opacity-60">
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
              <p className={`text-[12px] font-semibold ${constraintSum === totalQuestions ? "text-emerald-600" : "text-orange-600"}`}>
                รวม {constraintSum} / {totalQuestions} ข้อ
              </p>
            </div>
          )}

          {configError && <p role="alert" className="mt-4 whitespace-pre-line rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{configError}</p>}
          {configMessage && <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{configMessage}</p>}

          {/* ⬅️ ใหม่: ซ่อนปุ่มบันทึกกติกาสุ่มข้อสอบเมื่อ readOnly */}
          {!readOnly && (
            <button type="button" disabled={configSaving || (buildMode === "custom" && lessons.length === 0)} onClick={saveConfig} className="mt-4 rounded-full bg-[#0F1B3D] px-6 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60">
              {configSaving ? "กำลังบันทึก..." : "บันทึกกติกาสุ่มข้อสอบ"}
            </button>
          )}

          {/* ปุ่มดูตัวอย่างปล่อยให้ admin กดได้ด้วย (read-only โดยธรรมชาติ) */}
          <button type="button" disabled={previewLoading || (buildMode === "custom" && lessons.length === 0)} onClick={handlePreview} className="mt-2.5 ml-2.5 rounded-full border border-[#0F1B3D]/15 bg-white px-6 py-2.5 text-[13px] font-bold text-[#0F1B3D] disabled:opacity-60">
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
                      {question.interactionType === "true_false" ? "True/False" : "Multiple Choice"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {question.choices.map((choice, choiceIndex) => (
                      <li key={choiceIndex} className={`text-[12.5px] ${choice.isCorrect ? "font-bold text-emerald-600" : "text-[#0F1B3D]/60"}`}>
                        {choice.isCorrect ? "✓ " : "· "}{choice.text}
                      </li>
                    ))}
                  </ul>
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
              const isChoicesEditable = question.interactionType === "multiple_choice" && !readOnly; // ⬅️ แก้: เพิ่ม !readOnly
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

                  <div className="mt-4 space-y-2.5 sm:pl-12">
                    {question.choices.map((choice, choiceIndex) => (
                      <div key={choiceIndex} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          disabled={readOnly} // ⬅️ ใหม่
                          onClick={() => setCorrectChoice(question.key, choiceIndex)}
                          title="เลือกเป็นคำตอบที่ถูก"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 disabled:cursor-default ${choice.isCorrect ? "border-emerald-500" : "border-slate-300"}`}
                        >
                          {choice.isCorrect && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
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
              <button type="button" onClick={() => setQuestions((current) => [...current, emptyQuestion()])} className="mt-4 rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2.5 text-[13px] font-bold text-[#0F1B3D]">+ เพิ่มคำถาม</button>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}
              {message && <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{message}</p>}
              <button type="button" disabled={saving} onClick={save} className="mt-5 w-full rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
                {saving ? "กำลังบันทึก..." : "บันทึกบททดสอบท้ายคอร์ส"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}