import Link from "next/link";
import type { ReactElement } from "react";

interface QuizChoice {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  video_timestamp_seconds: number | null;
  order_index: number;
  explanation: string | null;
  quiz_choices: QuizChoice[] | null;
}

interface VideoQuizMarker {
  id: string;
  timestamp_seconds: number;
  random_difficulty: string;
  order_index: number;
}

interface LessonDraft {
  id: string;
  status: string;
  created_at: string;
  video_url: string | null;
  content_html: string | null;
  quiz_questions: QuizQuestion[] | null;
  video_quiz_markers: VideoQuizMarker[] | null;
}

export interface AdminLesson {
  id: string;
  title: string;
  order_index: number;
  video_url: string | null;
  is_scorm: boolean | null;
  scorm_version: string | null;
  lesson_drafts: LessonDraft[] | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "ฉบับร่าง",
  submitted: "รอตรวจ",
  pending_review: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ส่งกลับให้แก้ไข",
};

function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AdminLessonOverview({
  courseId,
  lesson,
  index,
}: {
  courseId: string;
  lesson: AdminLesson;
  index: number;
}): ReactElement {
  const draft = [...(lesson.lesson_drafts ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  const videoUrl = draft?.video_url || lesson.video_url;
  const questions = [...(draft?.quiz_questions ?? [])].sort((a, b) => a.order_index - b.order_index);
  const markers = [...(draft?.video_quiz_markers ?? [])].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div>
          <h3 className="text-[13.5px] font-bold text-[#0F1B3D]">{index + 1}. {lesson.title}</h3>
          <p className="mt-0.5 text-[11.5px] text-slate-500">{draft ? STATUS_LABELS[draft.status] ?? draft.status : "ยังไม่มีฉบับร่าง"}</p>
        </div>
        <Link href={`/dashboard/admin/courses/${courseId}/lessons/new?lessonId=${lesson.id}`} className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-[#0F1B3D] hover:bg-slate-50">
          แก้ไข
        </Link>
      </div>

      <div className="space-y-5 border-t border-slate-100 bg-slate-50/50 p-4">
        {videoUrl && (
          <div>
            <h4 className="mb-2 text-xs font-bold text-slate-600">วิดีโอบทเรียน</h4>
            <video src={videoUrl} controls preload="none" className="max-h-80 w-full rounded-xl bg-black" />
          </div>
        )}

        {lesson.is_scorm && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <span className="text-xs font-semibold text-emerald-800">บทเรียน SCORM {lesson.scorm_version ?? ""}</span>
            <Link href={`/play/${courseId}/${lesson.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-800 underline underline-offset-2">
              เล่นดูตัวอย่าง
            </Link>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-xs font-bold text-slate-600">เนื้อหาบทเรียน</h4>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-[#0F1B3D]/75">
            {draft?.content_html?.trim() || "ยังไม่มีเนื้อหาเพิ่มเติม"}
          </p>
        </div>

        {(questions.length > 0 || markers.length > 0) && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <h4 className="text-xs font-bold text-slate-600">คำถามในบทเรียน ({questions.length + markers.length})</h4>
            {questions.map((question, questionIndex) => (
              <div key={question.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <p className="text-[13px] font-semibold text-[#0F1B3D]">
                  {questionIndex + 1}. {question.question_text}
                  {question.video_timestamp_seconds != null && <span className="ml-2 text-[11px] font-medium text-slate-500">เวลา {formatTime(question.video_timestamp_seconds)}</span>}
                </p>
                {(question.quiz_choices ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1 pl-4 text-xs text-slate-600">
                    {[...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index).map((choice, choiceIndex) => (
                      <li key={choiceIndex} className={choice.is_correct ? "font-bold text-emerald-700" : undefined}>
                        {choice.is_correct ? "✓ " : ""}{choice.choice_text}
                      </li>
                    ))}
                  </ul>
                )}
                {question.explanation && <p className="mt-2 text-xs text-slate-500">คำอธิบาย: {question.explanation}</p>}
              </div>
            ))}
            {markers.map((marker) => (
              <p key={marker.id} className="rounded-xl border border-violet-100 bg-white px-3.5 py-3 text-xs text-violet-700">
                จุดสุ่มคำถามจากคลัง เวลา {formatTime(marker.timestamp_seconds)} · ระดับ {marker.random_difficulty}
              </p>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
