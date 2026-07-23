"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { approveDraft, rejectDraft } from "@/app/admin/review/[draftId]/actions";

interface ReviewActionsProps {
  draftId: string;
}

export default function ReviewActions({ draftId }: ReviewActionsProps): ReactElement {
  const [approving, setApproving] = useState<boolean>(false);
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [showRejectForm, setShowRejectForm] = useState<boolean>(false);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setApproving(true);
    const result = await approveDraft(draftId);
    setApproving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/review");
  };

  const handleReject = async (): Promise<void> => {
    setError(null);
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผลที่ปฏิเสธ");
      return;
    }
    setRejecting(true);
    const result = await rejectDraft(draftId, reason);
    setRejecting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/review");
  };

  return (
    <div className="rounded-2xl bg-white border border-[#0F1B3D]/[0.06] p-6">
      {error && (
        <div className="mb-4 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
        </div>
      )}

      {!showRejectForm ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 inline-flex items-center justify-center text-[14.5px] font-bold text-white bg-[#00B37E] hover:bg-[#00996b] px-6 py-3.5 rounded-full transition-colors disabled:opacity-60"
          >
            {approving ? "กำลังสร้าง SCORM..." : "อนุมัติเพื่อเผยแพร่"}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(true)}
            className="flex-1 inline-flex items-center justify-center text-[14.5px] font-bold text-[#0F1B3D]/60 border border-[#0F1B3D]/15 px-6 py-3.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
          >
            ปฏิเสธ
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">เหตุผลที่ปฏิเสธ</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="บอกครูว่าต้องแก้ไขอะไรบ้าง"
            className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-all resize-y mb-4"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="flex-1 inline-flex items-center justify-center text-[14.5px] font-bold text-white bg-[#EB4A2D] hover:bg-[#d43f22] px-6 py-3.5 rounded-full transition-colors disabled:opacity-60"
            >
              {rejecting ? "กำลังส่ง..." : "ยืนยันปฏิเสธ"}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              className="flex-1 text-[14.5px] font-bold text-[#0F1B3D]/50 px-6 py-3.5"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}