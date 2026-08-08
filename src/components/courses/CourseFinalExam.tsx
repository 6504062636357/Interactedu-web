"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Question {
  id: string;
  lessonTitle: string;
  questionText: string;
  choices: string[];
}

interface ExamData {
  courseTitle: string;
  passPercentage: number;
  totalLessons: number;
  completedLessons: number;
  eligible: boolean;
  questions: Question[];
}

interface Result {
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  pass_percentage: number;
  passed: boolean;
  certificate_issued: boolean;
  certificate_download_url: string | null;
  message: string;
}

export default function CourseFinalExam({ courseId }: { courseId: string }) {
  const [exam, setExam] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/final-exam`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "โหลดข้อสอบไม่สำเร็จ");
        return data as ExamData;
      })
      .then(setExam)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "โหลดข้อสอบไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function submitExam() {
    if (!exam || Object.keys(answers).length !== exam.questions.length) {
      setError("กรุณาตอบคำถามให้ครบทุกข้อ");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/final-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: exam.questions.map((question) => ({
            questionId: question.id,
            selectedChoiceIndex: answers[question.id],
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ส่งข้อสอบไม่สำเร็จ");
      setResult(data as Result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ส่งข้อสอบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-24 text-center text-sm text-[#0F1B3D]/50">กำลังเตรียมข้อสอบ...</div>;
  if (error && !exam) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if (!exam) return null;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link href={`/dashboard/student/courses/${courseId}`} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[#0F1B3D]/55 hover:text-[#0F1B3D]">
        <span aria-hidden="true">←</span> กลับหน้าคอร์ส
      </Link>

      <section className="overflow-hidden rounded-3xl bg-[#0F1B3D] p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#FF8066]">Course Final Exam</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">บททดสอบท้ายคอร์ส</h1>
        <p className="mt-2 text-sm text-white/65">{exam.courseTitle}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat value={`${exam.questions.length}`} label="ข้อ" />
          <Stat value={`${exam.passPercentage}%`} label="เกณฑ์ผ่าน" />
          <Stat value={`${exam.completedLessons}/${exam.totalLessons}`} label="เรียนจบ" />
        </div>
      </section>

      {!exam.eligible ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-extrabold text-amber-900">ยังเริ่มทำข้อสอบไม่ได้</h2>
          <p className="mt-1 text-sm text-amber-800">กรุณาเรียนให้ครบทุกบทก่อน ปัจจุบันเรียนจบ {exam.completedLessons} จาก {exam.totalLessons} บท</p>
        </section>
      ) : exam.questions.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-dashed border-[#0F1B3D]/15 p-10 text-center text-sm text-[#0F1B3D]/50">
          คอร์สนี้ยังไม่มีบททดสอบท้ายคอร์ส กรุณาแจ้งผู้ดูแลคอร์สให้เพิ่มคำถามอย่างน้อย 1 ข้อ
        </section>
      ) : result ? (
        <section className={`mt-6 rounded-3xl border p-7 text-center ${result.passed ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}>
          <div className="text-5xl font-black text-[#0F1B3D]">{result.score_percentage}%</div>
          <h2 className={`mt-2 text-xl font-black ${result.passed ? "text-emerald-700" : "text-orange-700"}`}>
            {result.passed ? "สอบผ่านแล้ว" : "คะแนนยังไม่ถึงเกณฑ์"}
          </h2>
          <p className="mt-2 text-sm text-[#0F1B3D]/60">ตอบถูก {result.correct_answers} จาก {result.total_questions} ข้อ · เกณฑ์ผ่าน {result.pass_percentage}%</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {result.certificate_download_url && (
              <a href={result.certificate_download_url} className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white">ดาวน์โหลดใบรับรอง</a>
            )}
            {!result.passed && (
              <button type="button" onClick={() => { setResult(null); setAnswers({}); }} className="rounded-full bg-[#0F1B3D] px-6 py-3 text-sm font-extrabold text-white">ทำข้อสอบใหม่</button>
            )}
            <Link href={`/dashboard/student/courses/${courseId}`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-6 py-3 text-sm font-extrabold text-[#0F1B3D]">กลับหน้าคอร์ส</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="mt-6 space-y-5">
            {exam.questions.map((question, index) => (
              <section key={question.id} className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FF5A3C]/10 text-sm font-black text-[#FF5A3C]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F1B3D]/35">{question.lessonTitle}</p>
                    <h2 className="mt-1 text-[15px] font-extrabold leading-6 text-[#0F1B3D]">{question.questionText}</h2>
                    <div className="mt-4 space-y-2.5">
                      {question.choices.map((choice, choiceIndex) => (
                        <label key={choiceIndex} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${answers[question.id] === choiceIndex ? "border-[#FF5A3C] bg-[#FF5A3C]/[0.06] text-[#0F1B3D]" : "border-[#0F1B3D]/[0.08] hover:bg-[#F7F8FA]"}`}>
                          <input type="radio" name={question.id} checked={answers[question.id] === choiceIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id]: choiceIndex }))} className="accent-[#FF5A3C]" />
                          {choice}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button type="button" onClick={submitExam} disabled={submitting} className="mt-6 w-full rounded-full bg-[#FF5A3C] py-4 text-base font-black text-white shadow-lg shadow-orange-200 transition hover:brightness-105 disabled:opacity-60">
            {submitting ? "กำลังตรวจคำตอบ..." : `ส่งคำตอบ ${Object.keys(answers).length}/${exam.questions.length} ข้อ`}
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-white/[0.07] px-3 py-3 text-center"><div className="text-lg font-black">{value}</div><div className="text-[11px] font-semibold text-white/45">{label}</div></div>;
}
