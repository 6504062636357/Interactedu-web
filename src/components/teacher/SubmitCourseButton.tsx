"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCourseForReview } from "@/app/dashboard/teacher/courses/actions";

interface SubmitCourseButtonProps {
  courseId: string;
  ready: boolean;
}

export default function SubmitCourseButton({ courseId, ready }: SubmitCourseButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  // แจ้งเตือนความสำเร็จให้หายไปเองหลังจากแสดงสักครู่ ไม่ต้องรอผู้ใช้กดปิด
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => setSubmitted(false), 4000);
    return () => clearTimeout(timer);
  }, [submitted]);

  function handleClick() {
    setError(null);
    setSubmitted(false);
    startTransition(async () => {
      try {
        const result = await submitCourseForReview(courseId);
        if (result.error) {
          setError(result.error);
        } else {
          setSubmitted(true);
          router.refresh();
        }
      } catch (caughtError) {
        console.error("[SubmitCourseButton] submit failed:", caughtError);
        setError("ส่งคอร์สไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        // ★ ปุ่มนี้อยู่แถวเดียวกับ "เอกสารประกอบ" / "บททดสอบท้ายคอร์ส" / "+ เพิ่มบทเรียนใหม่"
        // ต้องยึด class ชุดเดียวกับปุ่มพวกนั้น (13px) ไม่ใช่ "Edit บทเรียน" (12.5px คนละแถว)
        // ต่างกันแค่สีพื้นหลังตามสถานะ ready/not-ready เพื่อให้หน้าตาเป็นชุดเดียวกัน
        className={`shrink-0 rounded-full px-5 py-2.5 text-[13px] font-bold text-white transition-colors ${
          !ready
            ? "bg-[#0F1B3D]/55 hover:bg-[#0F1B3D]/70"
            : "bg-[#0F1B3D] hover:bg-[#0F1B3D]/90"
        }`}
        title={!ready ? "กดเพื่อตรวจสอบว่ายังขาดข้อมูลส่วนใด" : undefined}
      >
        {isPending ? "กำลังส่ง..." : "ส่งคอร์สเข้าตรวจ"}
      </button>
      {error && (
        <p className="max-w-xs text-right text-[11.5px] font-semibold text-red-600">{error}</p>
      )}
      {submitted && (
        <p className="max-w-xs text-right text-[11.5px] font-semibold text-[#00B37E]">
          ส่งคอร์สเข้าตรวจเรียบร้อยแล้ว
        </p>
      )}
    </span>
  );
}
