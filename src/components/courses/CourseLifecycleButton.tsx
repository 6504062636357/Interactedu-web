"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftCourse, setCourseArchived } from "@/app/dashboard/teacher/courses/actions";

type Mode = "archive" | "restore" | "delete";

export default function CourseLifecycleButton({
  courseId,
  courseTitle,
  mode,
  onDeleted,
  redirectTo,
}: {
  courseId: string;
  courseTitle: string;
  mode: Mode;
  onDeleted?: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = mode === "archive" ? "เก็บเข้าคลัง" : mode === "restore" ? "นำออกจากคลัง" : "ลบฉบับร่าง";

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = mode === "delete"
          ? await deleteDraftCourse(courseId)
          : await setCourseArchived(courseId, mode === "archive");
        if (result.error) {
          setError(result.error);
          setConfirming(false);
          return;
        }
        setConfirming(false);
        if (mode === "delete" && onDeleted) onDeleted();
        else if (mode === "delete" && redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch {
        setError("ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-600">{label} “{courseTitle}” ?</span>
          <button type="button" onClick={confirm} disabled={pending} className="rounded-full bg-[#0F1B3D] px-3 py-1.5 font-bold text-white disabled:opacity-50">
            {pending ? "กำลังบันทึก..." : "ยืนยัน"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="rounded-full border border-slate-200 px-3 py-1.5 font-bold text-slate-600">
            ยกเลิก
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`rounded-full border px-4 py-2 text-xs font-bold ${mode === "delete" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-200 text-[#0F1B3D] hover:bg-slate-50"}`}>
          {label}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
