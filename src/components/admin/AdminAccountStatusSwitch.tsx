"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserActive } from "@/app/dashboard/admin/users/actions";

export default function AdminAccountStatusSwitch({
  userId,
  userName,
  initialActive,
  disabled,
}: {
  userId: string;
  userName: string;
  initialActive: boolean;
  disabled: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggle() {
    if (active && !window.confirm(`ปิดใช้งานบัญชี “${userName}” ?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await setUserActive(userId, !active);
      if (result.error) {
        setError(result.error);
        return;
      }
      setActive(!active);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`สถานะบัญชี ${userName}: ${active ? "Active" : "Deactive"}`}
        title={disabled ? "ไม่สามารถเปลี่ยนสถานะบัญชีนี้" : `กดเพื่อ${active ? "ปิด" : "เปิด"}ใช้งานบัญชี`}
        onClick={toggle}
        disabled={disabled || pending}
        className="inline-flex items-center gap-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${active ? "left-1 translate-x-5" : "left-1"}`} />
        </span>
        <span className={active ? "text-emerald-700" : "text-slate-500"}>{pending ? "กำลังบันทึก..." : active ? "Active" : "Deactive"}</span>
      </button>
      {error && <span role="alert" className="max-w-44 text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
