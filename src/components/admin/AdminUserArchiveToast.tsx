"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export default function AdminUserArchiveToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("archived") === "1") {
      url.searchParams.delete("archived");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed right-4 top-24 z-50 flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-lg sm:right-6">
      <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
      <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#0F1B3D]">ลบบัญชีเรียบร้อยแล้ว</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">ประวัติเรียน การชำระเงิน และใบรับรองยังคงเก็บไว้</p>
      </div>
      <button type="button" onClick={() => setVisible(false)} aria-label="ปิดการแจ้งเตือน" className="-mr-2 -mt-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
