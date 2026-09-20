"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ClaimCertificateButton({ courseId, attemptId }: { courseId: string; attemptId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => {
        setError(null);
        try {
          const response = await fetch(`/api/courses/${courseId}/certificate/issue`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId }),
          });
          const data = await response.json();
          if (!response.ok || !data.certificate_issued) throw new Error("ยังออกใบรับรองไม่ได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ");
          router.refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "ออกใบรับรองไม่สำเร็จ กรุณาลองใหม่");
        }
      })} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "กำลังเตรียมใบรับรอง..." : "รับใบรับรอง"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
