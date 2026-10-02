"use client";

// ===== เพิ่มใหม่: ปุ่ม "สร้าง SCORM อีกครั้ง" — เดิมหลังแอดมินแก้บทเรียนที่เผยแพร่ไปแล้ว (ผ่าน "โหมด
// แก้ไขเต็มสำหรับแอดมิน") updateLessonDraft จะเซ็ต lesson_drafts.status กลับเป็น "draft" เสมอ (ดู
// actions.ts) ทำให้ไฟล์ SCORM ที่ bake ไว้ยังเป็นเวอร์ชันเก่า ไม่มีทางรีเจนใหม่ได้เลยถ้าคอร์สนั้นไม่ใช่
// ของแอดมินเอง (เพราะ "เตรียมคอร์สก่อนเผยแพร่"/PublishCourseButton ในหน้า workspace โชว์เฉพาะตอน
// isOwnCourse เท่านั้น) — ปุ่มนี้เรียก approveLesson() ตัวเดียวกับที่หน้า /review ใช้ตอนอนุมัติบทเรียน
// (เซ็ตสถานะกลับเป็น approved + generateScormPackage ใหม่ + แจ้งเตือนครูเจ้าของคอร์สถ้าไม่ใช่คอร์ส
// ของแอดมินเอง) ไม่ต้องเขียน action ใหม่ซ้ำ เพราะตัวเดิมรองรับ "สถานะปัจจุบันเป็นอะไรก็ได้" อยู่แล้ว
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveLesson } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

export default function RegenerateScormButton({
  draftId,
  lessonId,
}: {
  draftId: string;
  lessonId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setDone(false);
            try {
              const result = await approveLesson(draftId, lessonId);
              if (result.error) {
                setError(result.error);
              } else {
                setDone(true);
              }
              router.refresh();
            } catch {
              setError("สร้าง SCORM ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
            }
          })
        }
        className="rounded-full border border-emerald-300 bg-white px-3.5 py-1.5 text-[11.5px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "กำลังสร้าง SCORM..." : "สร้าง SCORM อีกครั้ง"}
      </button>
      {error && <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
      {done && !error && <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">สร้างไฟล์ SCORM ใหม่สำเร็จแล้ว</p>}
    </div>
  );
}
