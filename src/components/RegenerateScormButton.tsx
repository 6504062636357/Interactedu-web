// src/components/RegenerateScormButton.tsx
"use client";

import { useState, useTransition } from "react";
import { regenerateScormPackage } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

export default function RegenerateScormButton({ lessonId }: { lessonId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await regenerateScormPackage(lessonId);
      if (result.error) {
        setMessage(`"สร้างไม่สำเร็จ : " ${result.error}`);
      } else {
        setMessage("สร้างใหม่สำเร็จ");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-3 py-1.5 rounded-full transition"
      >
        {isPending ? "กำลังสร้าง..." : "สร้าง SCORM ใหม่"}
      </button>
      {message && <p className="text-[11px] text-slate-500">{message}</p>}
    </div>
  );
}