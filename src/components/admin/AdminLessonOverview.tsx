import Link from "next/link";
import type { ReactElement } from "react";
import DragDropAnswerSummary from "@/components/courses/DragDropAnswerSummary";
import type { ExamInteractionType, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
import RegenerateScormButton from "@/components/admin/RegenerateScormButton";

interface QuizChoice {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

// ===== เพิ่มใหม่: image_url/interaction_type/answer_data — เดิม query หน้า page.tsx (admin course
// workspace) ไม่ได้ select 3 ฟิลด์นี้มาเลย ทำให้คำถามจับคู่/เรียงลำดับ (ไม่มี quiz_choices) โชว์เป็น
// การ์ดเปล่าไม่มีเนื้อหา และรูปภาพก็ไม่เคยถูกแสดงเลยไม่ว่าคำถามแบบไหน — แก้ query คู่กันแล้ว
interface QuizQuestion {
  id: string;
  question_text: string;
  video_timestamp_seconds: number | null;
  order_index: number;
  explanation: string | null;
  image_url: string | null;
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ =====
  image_caption?: string | null;
  image_pins?: { id: string; x: number; y: number }[] | null;
  interaction_type: ExamInteractionType | null;
  answer_data: MatchingAnswerData | SequencingAnswerData | null;
  quiz_choices: QuizChoice[] | null;
}

// ===== แก้: เดิมใช้ม่วง #7C5CFF เป็นสีแรก (ก่อนที่ทั้งระบบเปลี่ยนธีมสีเป็นกรมท่า #0F1B3D แล้ว) ทำให้
// หน้าแอดมินนี้สีคู่จับคู่ไม่ตรงกับหน้าครู (LessonDraftForm.tsx/QuestionBankForm.tsx/CourseExamEditor.tsx)
const MATCHING_PAIR_COLORS = ["#0F1B3D", "#00B37E", "#FF8A3D", "#2F8FFF", "#FF4FA3", "#C98500"];

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

// การ์ดแสดงคำถามเดียว ใช้ร่วมกันทั้งฝั่ง "คำถามในบทเรียน" (แทรกในวิดีโอ) และ "คำถามท้ายบทเรียน"
function QuestionCard({ question, index }: { question: QuizQuestion; index: number }): ReactElement {
  const interactionType = question.interaction_type ?? "multiple_choice";
  const matchingData = interactionType === "matching" ? (question.answer_data as MatchingAnswerData | null) : null;
  const sequencingData = interactionType === "sequencing" ? (question.answer_data as SequencingAnswerData | null) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="text-[13px] font-semibold text-[#0F1B3D]">
        {index + 1}. {question.question_text}
        {question.video_timestamp_seconds != null && <span className="ml-2 text-[11px] font-medium text-slate-500">เวลา {formatTime(question.video_timestamp_seconds)}</span>}
      </p>

      {/* [แก้บั๊ก: รูปไม่เคยโชว์] เดิม query ไม่ได้ select image_url มาเลย เลยไม่มีทางแสดงได้ไม่ว่า
          คำถามประเภทไหน — ตอนนี้ select มาแล้ว เลยแสดงได้ */}
      {question.image_url && (
        /* ===== แก้: เอา w-full ออก — ถ้าบังคับกว้างเต็มพร้อม object-contain รูปจะถูกบีบให้มีขอบ
            ว่างซ้าย-ขวา (letterbox) ทำให้ % ของหมุด (คำนวณจากสัดส่วนรูปจริงตอนปัก) เพี้ยนไปจากตำแหน่ง
            ที่ควรอยู่ — ใช้ inline-block ให้กล่องหุ้มพอดีตัวรูปที่ขึ้นจริงแทน (เหมือน Lightbox ฝั่งครู)
            ===== แก้เพิ่ม: คำบรรยายอยู่ด้านล่างภาพ ชิดภาพไม่เว้นช่องว่าง (mt-0) จัดกึ่งกลางเทียบกับ
            "ความกว้างของรูป" (เพราะกล่องนอกเป็น inline-block) ไม่ใช่กึ่งกลางของการ์ดทั้งใบ ===== */
        <div className="mt-2 inline-block max-w-full">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={question.image_url} alt="" className="max-h-48 max-w-full rounded-lg object-contain bg-slate-50" />
            {/* ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพ (อ่านอย่างเดียว) ===== */}
            {(question.image_pins ?? []).map((pin, pinIndex) => (
              <span
                key={pin.id}
                className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5A3C] text-[10px] font-bold text-white ring-2 ring-white"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              >
                {pinIndex + 1}
              </span>
            ))}
          </div>
          {question.image_caption && (
            <p className="mt-0 text-center text-[11.5px] font-semibold text-slate-500">{question.image_caption}</p>
          )}
        </div>
      )}

      {interactionType === "matching" && matchingData && (
        <div className="mt-2 space-y-1.5">
          <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">จับคู่</span>
          {matchingData.pairs.map((pair, pIndex) => {
            const color = MATCHING_PAIR_COLORS[pIndex % MATCHING_PAIR_COLORS.length];
            return (
              <div key={pIndex} className="flex items-center gap-2 text-xs text-slate-700">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: color }}>
                  {pIndex + 1}
                </span>
                <span className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${color}14` }}>{pair.left}</span>
                <span className="text-slate-300" aria-hidden="true">→</span>
                <span className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${color}14` }}>{pair.right}</span>
              </div>
            );
          })}
        </div>
      )}

      {interactionType === "drag_drop" && <DragDropAnswerSummary answerData={question.answer_data} />}

      {interactionType === "sequencing" && sequencingData && (
        <div className="mt-2 space-y-1">
          <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">เรียงลำดับ</span>
          <ol className="space-y-1">
            {sequencingData.correct_order.map((itemId, orderIndex) => {
              const item = sequencingData.items.find((it) => it.id === itemId);
              return (
                <li key={itemId} className="flex items-center gap-2 text-xs text-slate-700">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[9px] font-bold text-white">
                    {orderIndex + 1}
                  </span>
                  {item?.text ?? "(รายการถูกลบ)"}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {(question.quiz_choices ?? []).length > 0 && (
        <ul className="mt-2 space-y-1 pl-4 text-xs text-slate-600">
          {interactionType === "multi_select" && (
            <li className="list-none"><span className="mb-1 inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">เลือกได้หลายคำตอบ</span></li>
          )}
          {[...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index).map((choice, choiceIndex) => (
            <li key={choiceIndex} className={choice.is_correct ? "font-bold text-emerald-700" : undefined}>
              {choice.is_correct ? "✓ " : ""}{choice.choice_text}
            </li>
          ))}
        </ul>
      )}
      {question.explanation && <p className="mt-2 text-xs text-slate-500">คำอธิบาย: {question.explanation}</p>}
    </div>
  );
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
  // แสดงเฉพาะคำถามแทรกในวิดีโอ (มี video_timestamp_seconds) — ไม่เอาคำถามท้ายบทเรียนมาแสดงในหน้านี้ กันสับสน
  const questions = [...(draft?.quiz_questions ?? [])]
    .filter((q) => q.video_timestamp_seconds != null)
    .sort((a, b) => a.order_index - b.order_index);
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-emerald-800">บทเรียน SCORM {lesson.scorm_version ?? ""}</span>
              <Link href={`/play/${courseId}/${lesson.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-800 underline underline-offset-2">
                เล่นดูตัวอย่าง
              </Link>
            </div>
            {/* ===== เพิ่มใหม่: แก้บทเรียนแล้วไฟล์ SCORM เดิมไม่อัปเดตตาม (ดูคอมเมนต์เต็มใน
                RegenerateScormButton.tsx) — ให้แอดมินกดสร้างไฟล์ SCORM ใหม่ได้จากตรงนี้เลย */}
            {draft && <RegenerateScormButton draftId={draft.id} lessonId={lesson.id} />}
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
              <QuestionCard key={question.id} question={question} index={questionIndex} />
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
