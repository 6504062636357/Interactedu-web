"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { approveCourseExam, rejectCourseExam } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

export default function CourseExamReviewActions({
  courseId,
  examStatus, // ⬅️ เปลี่ยนจาก courseStatus เป็น examStatus (pending | approved | rejected)
}: {
  courseId: string;
  examStatus: "pending" | "approved" | "rejected";
}): ReactElement | null {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // บททดสอบอนุมัติแล้ว — ไม่ต้องโชว์ปุ่มซ้ำ (แต่ให้ตีกลับใหม่ได้ถ้าจำเป็น)
  if (examStatus === "approved") {
    return (
      <div className="rounded-xl bg-[#00B37E]/[0.08] border border-[#00B37E]/20 px-4 py-3">
        <p className="text-[13px] font-bold text-[#00B37E]">✓ บททดสอบท้ายคอร์สนี้อนุมัติแล้ว</p>
        <p className="mt-1 text-[12px] text-[#0F1B3D]/45">
          หมายเหตุ: คอร์สจะเปิดให้นักเรียนเข้าเรียนได้ก็ต่อเมื่อบทเรียนทุกบทถูกอนุมัติครบด้วย
        </p>
      </div>
    );
  }

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setApproving(true);
    const result = await approveCourseExam(courseId);
    setApproving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleReject = async (): Promise<void> => {
    setError(null);
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผลที่ปฏิเสธ");
      return;
    }
    setRejecting(true);
    const result = await rejectCourseExam(courseId, reason);
    setRejecting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowRejectForm(false);
    setReason("");
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5">
      <h3 className="mb-1 text-[14px] font-bold text-[#0F1B3D]">อนุมัติบททดสอบท้ายคอร์ส</h3>
      <p className="mb-4 text-[12.5px] text-[#0F1B3D]/50">
        อนุมัติเฉพาะบททดสอบท้ายคอร์สนี้เท่านั้น ไม่กระทบสถานะคอร์สโดยรวม — คอร์สจะ publish ให้นักเรียนเรียนได้ก็ต่อเมื่อบทเรียนทุกบทถูกอนุมัติครบด้วย
      </p>

      {error && (
        <div className="mb-3 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
        </div>
      )}

      {!showRejectForm ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-white bg-[#00B37E] hover:bg-[#00996b] px-5 py-2.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {approving ? "กำลังอนุมัติ..." : "อนุมัติคอร์ส"}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(true)}
            disabled={approving}
            className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-[#0F1B3D]/60 border border-[#0F1B3D]/15 px-5 py-2.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
          >
            ตีกลับ
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">เหตุผลที่ตีกลับ</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="บอกครูว่าต้องแก้ไขอะไรบ้าง"
            className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y mb-3"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-white bg-[#EB4A2D] hover:bg-[#d43f22] px-5 py-2.5 rounded-full transition-colors disabled:opacity-60"
            >
              {rejecting ? "กำลังส่ง..." : "ยืนยันตีกลับ"}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              disabled={rejecting}
              className="flex-1 text-[13.5px] font-bold text-[#0F1B3D]/50 px-5 py-2.5"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}