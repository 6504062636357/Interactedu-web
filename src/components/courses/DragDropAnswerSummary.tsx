import { describeDragDropAnswer } from "@/lib/quiz/drag-drop-form";

/** สรุปเฉลย drag_drop สำหรับครู/แอดมิน: โจทย์พร้อมคำที่ถูกในแต่ละช่อง + คำหลอก (อ่านอย่างเดียว) */
export default function DragDropAnswerSummary({ answerData }: { answerData: unknown }) {
  const info = describeDragDropAnswer(answerData);
  if (!info) {
    return <p className="mt-2 text-xs font-semibold text-red-600">ข้อมูลโจทย์เติมคำผิดรูปแบบ — กรุณาแก้ไขโจทย์ข้อนี้</p>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      <span className="inline-flex items-center rounded-full bg-[#0F1B3D]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0F1B3D]/60">เติมคำโดยลากวาง</span>
      <p className="whitespace-pre-wrap text-xs leading-6 text-slate-700">
        {info.segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <span key={i} className="mx-0.5 rounded border border-emerald-300 bg-emerald-50 px-1.5 font-bold text-emerald-800">{seg.text}</span>
          )
        )}
      </p>
      {info.distractors.length > 0 && (
        <p className="text-[11px] text-slate-500">คำหลอก: {info.distractors.join(", ")}</p>
      )}
    </div>
  );
}
