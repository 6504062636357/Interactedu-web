"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCourseFinalExam, type CourseExamQuestionInput } from "@/app/dashboard/course-exam-actions";

type EditableQuestion = CourseExamQuestionInput & { key: string };

function emptyQuestion(): EditableQuestion {
  return {
    key: crypto.randomUUID(),
    questionText: "",
    explanation: null,
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}

export default function CourseExamEditor({
  courseId,
  initialQuestions,
}: {
  courseId: string;
  initialQuestions: CourseExamQuestionInput[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<EditableQuestion[]>(
    initialQuestions.length ? initialQuestions.map((question) => ({ ...question, key: crypto.randomUUID() })) : [emptyQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(key: string, updates: Partial<EditableQuestion>) {
    setQuestions((current) => current.map((question) => question.key === key ? { ...question, ...updates } : question));
  }

  function updateChoice(key: string, choiceIndex: number, text: string) {
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      choices: question.choices.map((choice, index) => index === choiceIndex ? { ...choice, text } : choice),
    } : question));
  }

  function setCorrectChoice(key: string, choiceIndex: number) {
    setQuestions((current) => current.map((question) => question.key === key ? {
      ...question,
      choices: question.choices.map((choice, index) => ({ ...choice, isCorrect: index === choiceIndex })),
    } : question));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveCourseFinalExam({
      courseId,
      questions: questions.map(({ questionText, explanation, choices }) => ({ questionText, explanation, choices })),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("บันทึกบททดสอบท้ายคอร์สเรียบร้อยแล้ว");
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-5">
        {questions.map((question, questionIndex) => (
          <section key={question.key} className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-3 shrink-0 text-[12px] font-extrabold text-[#0F1B3D]/35">ข้อ {questionIndex + 1}</span>
              <input value={question.questionText} onChange={(event) => updateQuestion(question.key, { questionText: event.target.value })} placeholder="พิมพ์คำถาม" className="min-w-0 flex-1 rounded-xl border border-[#0F1B3D]/10 bg-[#F7F8FA] px-4 py-2.5 text-sm outline-none focus:border-[#FF5A3C] focus:bg-white" />
              {questions.length > 1 && <button type="button" onClick={() => setQuestions((current) => current.filter((item) => item.key !== question.key))} className="mt-3 shrink-0 text-xs font-bold text-red-500">ลบ</button>}
            </div>

            <div className="space-y-2.5 sm:pl-12">
              {question.choices.map((choice, choiceIndex) => (
                <div key={choiceIndex} className="flex items-center gap-2.5">
                  <button type="button" onClick={() => setCorrectChoice(question.key, choiceIndex)} title="เลือกเป็นคำตอบที่ถูก" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${choice.isCorrect ? "border-emerald-500" : "border-slate-300"}`}>
                    {choice.isCorrect && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                  </button>
                  <input value={choice.text} onChange={(event) => updateChoice(question.key, choiceIndex, event.target.value)} placeholder={`ตัวเลือกที่ ${choiceIndex + 1}`} className="min-w-0 flex-1 rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2 text-[13.5px] outline-none focus:border-[#FF5A3C] focus:bg-white" />
                  {question.choices.length > 2 && <button type="button" onClick={() => updateQuestion(question.key, { choices: question.choices.filter((_, index) => index !== choiceIndex) })} className="text-xs font-bold text-slate-400 hover:text-red-500">✕</button>}
                </div>
              ))}
              <button type="button" onClick={() => updateQuestion(question.key, { choices: [...question.choices, { text: "", isCorrect: false }] })} className="pl-8 text-xs font-bold text-[#3157D5]">+ เพิ่มตัวเลือก</button>
              <textarea value={question.explanation ?? ""} onChange={(event) => updateQuestion(question.key, { explanation: event.target.value || null })} rows={2} placeholder="คำอธิบายเฉลย (ไม่บังคับ)" className="w-full resize-y rounded-lg border border-[#0F1B3D]/10 bg-[#F7F8FA] px-3.5 py-2 text-[13px] outline-none focus:border-[#FF5A3C] focus:bg-white" />
            </div>
          </section>
        ))}
      </div>

      <button type="button" onClick={() => setQuestions((current) => [...current, emptyQuestion()])} className="mt-4 rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2.5 text-[13px] font-bold text-[#0F1B3D]">+ เพิ่มคำถาม</button>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}
      {message && <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{message}</p>}
      <button type="button" disabled={saving} onClick={save} className="mt-5 w-full rounded-full bg-[#FF5A3C] py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
        {saving ? "กำลังบันทึก..." : "บันทึกบททดสอบท้ายคอร์ส"}
      </button>
    </div>
  );
}
