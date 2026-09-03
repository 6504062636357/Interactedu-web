"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCourseForReview } from "@/app/dashboard/teacher/courses/actions";

interface SubmitCourseButtonProps {
  courseId: string;
  ready: boolean;
}

export default function SubmitCourseButton({ courseId, ready }: SubmitCourseButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await submitCourseForReview(courseId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={!ready || isPending}
        // ★ ปุ่มนี้อยู่แถวเดียวกับ "เอกสารประกอบ" / "บททดสอบท้ายคอร์ส" / "+ เพิ่มบทเรียนใหม่"
        // ต้องยึด class ชุดเดียวกับปุ่มพวกนั้น (13px) ไม่ใช่ "Edit บทเรียน" (12.5px คนละแถว)
        // ต่างกันแค่สีพื้นหลังตามสถานะ ready/not-ready เพื่อให้หน้าตาเป็นชุดเดียวกัน
        className={`shrink-0 rounded-full px-5 py-2.5 text-[13px] font-bold text-white transition-colors ${
          !ready
            ? "cursor-not-allowed bg-[#0F1B3D]/20"
            : "bg-[#0F1B3D] hover:bg-[#0F1B3D]/90"
        }`}
        title={!ready ? "กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบก่อน" : undefined}
      >
        {isPending ? "กำลังส่ง..." : "ส่งคอร์สเข้าตรวจ"}
      </button>
      {error && (
        <p className="max-w-xs text-right text-[11.5px] font-semibold text-red-600">{error}</p>
      )}
    </span>
  );
}