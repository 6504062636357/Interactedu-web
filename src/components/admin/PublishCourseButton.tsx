"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveCourse } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

export default function PublishCourseButton({ courseId, ready }: { courseId: string; ready: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button type="button" disabled={!ready || pending}
        onClick={() => startTransition(async () => {
          setError(null);
          try {
            const result = await approveCourse(courseId);
            if (result.error) setError(result.error);
            router.refresh();
          } catch {
            setError("เผยแพร่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
          }
        })}
        className="rounded-full bg-[#0F1B3D] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#3157D5] disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "กำลังเผยแพร่..." : "เผยแพร่คอร์ส"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
