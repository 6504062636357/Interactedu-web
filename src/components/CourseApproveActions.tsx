"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { approveCourse, rejectCourse } from "@/app/dashboard/admin/courses/[courseId]/review/actions";

export default function CourseApproveActions({
  courseId,
  courseStatus,
}: {
  courseId: string;
  courseStatus: string;
}): ReactElement {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setApproving(true);
    const result = await approveCourse(courseId);
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
    const result = await rejectCourse(courseId, reason);
    setRejecting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowRejectForm(false);
    setReason("");
    router.refresh();
  };

  if (courseStatus === "published") {
    return (
      <div className="mb-6 rounded-2xl border border-[#00B37E]/20 bg-[#00B37E]/[0.06] px-5 py-4">
        <p className="text-[13.5px] font-bold text-[#00B37E]">คอร์สนี้อนุมัติและเผยแพร่แล้ว นักเรียนเข้าเรียนได้แล้ว</p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5">
      <h2 className="mb-1 text-[15px] font-bold text-[#0F1B3D]">อนุมัติคอร์สทั้งหมด</h2>
      <p className="mb-4 text-[12.5px] text-[#0F1B3D]/50">
        ต้องมีบทเรียนทุกบทส่ง draft พร้อมตรวจแล้ว (สถานะ "รอตรวจ") ถึงจะอนุมัติทั้งคอร์สได้ — เมื่ออนุมัติแล้วคอร์สจะเปิดให้นักเรียนเข้าเรียนทันที
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
            {approving ? "กำลังอนุมัติ..." : "อนุมัติคอร์ส (Publish)"}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(true)}
            disabled={approving}
            className="flex-1 inline-flex items-center justify-center text-[13.5px] font-bold text-[#0F1B3D]/60 border border-[#0F1B3D]/15 px-5 py-2.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
          >
            ตีกลับทั้งคอร์ส
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