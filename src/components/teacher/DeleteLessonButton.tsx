"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLesson } from "@/app/dashboard/teacher/courses/actions";

interface DeleteLessonButtonProps {
  lessonId: string;
  courseId: string;
  lessonTitle: string;
}

export default function DeleteLessonButton({ lessonId, courseId, lessonTitle }: DeleteLessonButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleConfirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLesson(lessonId, courseId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[#0F1B3D]/60">
            ลบ &quot;{lessonTitle}&quot; ?
          </span>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={isPending}
            className="shrink-0 rounded-full bg-red-500 px-3.5 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
          >
            {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="shrink-0 rounded-full border border-[#0F1B3D]/15 px-3.5 py-1.5 text-[11.5px] font-bold text-[#0F1B3D]/60 transition-colors hover:bg-slate-50"
          >
            ยกเลิก
          </button>
        </div>
        {error && <p className="max-w-xs text-right text-[11px] font-semibold text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-red-200 px-5 py-2.5 text-[12.5px] font-bold leading-none text-red-500 transition-colors hover:bg-red-50"
    >
      ลบบทเรียน
    </button>
  );
}
