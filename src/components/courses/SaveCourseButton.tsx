"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";

export default function SaveCourseButton({ courseId, initialSaved = false, available = true }: {
  courseId: string; initialSaved?: boolean; available?: boolean;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = initialSaved || savedLocally;

  async function save() {
    if (inFlight.current || saved || !available) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/student/course-library", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const result = await response.json() as { saved?: boolean; error?: string };
      if (!response.ok || result.saved !== true) throw new Error(result.error || "เพิ่มคอร์สไม่สำเร็จ กรุณาลองใหม่");
      setSavedLocally(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เพิ่มคอร์สไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return <div className="min-w-0">
    <button type="button" onClick={() => void save()} disabled={pending || saved || !available}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-[#3157D5] transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] disabled:cursor-default disabled:opacity-60">
      {pending ? <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" /> : saved ? <Check size={15} className="shrink-0" aria-hidden="true" /> : <Plus size={15} className="shrink-0" aria-hidden="true" />}
      {pending ? "กำลังเพิ่ม..." : saved ? "เพิ่มเข้าคอร์สของฉันแล้ว" : "เพิ่มเข้าคอร์สของฉัน"}
    </button>
    {savedLocally && <p role="status" className="mt-2 text-xs text-emerald-700">เก็บคอร์สไว้แล้ว ยังไม่ได้เริ่มเรียน</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {!available && !saved && <p className="mt-2 text-xs text-slate-500">ยังไม่พร้อมเพิ่มคอร์ส กรุณาลองใหม่ภายหลัง</p>}
  </div>;
}
