"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserActive } from "@/app/dashboard/admin/users/actions";

export default function AdminAccountStatusSwitch({
  userId,
  userName,
  initialActive,
  disabledReason,
}: {
  userId: string;
  userName: string;
  initialActive: boolean | null;
  disabledReason: string | null;
}) {
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const router = useRouter();
  const disabled = disabledReason !== null || active === null;

  function changeStatus(nextActive: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setUserActive(userId, nextActive);
      if (result.error) {
        setError(result.error);
        return;
      }
      setActive(nextActive);
      router.refresh();
    });
  }

  function toggle() {
    if (disabled || pending) return;
    if (active) {
      confirmDialogRef.current?.showModal();
      return;
    }
    changeStatus(true);
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={active === true}
        aria-label={`สถานะบัญชี ${userName}: ${active === null ? "ไม่ทราบสถานะ" : active ? "ใช้งานอยู่" : "พักการใช้งาน"}`}
        title={disabledReason ?? (active ? "พักการใช้งานบัญชี" : "เปิดใช้งานบัญชีอีกครั้ง")}
        onClick={toggle}
        disabled={disabled || pending}
        className="inline-flex items-center gap-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${active ? "left-1 translate-x-5" : "left-1"}`} />
        </span>
        <span className={active ? "text-emerald-700" : "text-slate-500"}>{pending ? "กำลังบันทึก..." : active === null ? "ไม่ทราบสถานะ" : active ? "ใช้งานอยู่" : "พักการใช้งาน"}</span>
      </button>
      {disabledReason && <span className="max-w-44 text-[11px] leading-4 text-amber-700">{disabledReason}</span>}
      {error && <span role="alert" className="max-w-44 text-[11px] text-red-600">{error}</span>}
      <dialog
        ref={confirmDialogRef}
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        className="fixed inset-0 m-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-2xl backdrop:bg-slate-950/50"
      >
        <div className="p-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-xl text-amber-700" aria-hidden="true">!</div>
          <h2 id={dialogTitleId} className="text-lg font-extrabold text-[#0F1B3D]">พักการใช้งานบัญชีนี้?</h2>
          <p id={dialogDescriptionId} className="mt-2 text-sm leading-6 text-slate-600">
            บัญชีของ <strong className="break-words text-[#0F1B3D]">{userName}</strong> จะเข้าแดชบอร์ดและใช้สิทธิ์เรียนไม่ได้จนกว่าแอดมินจะเปิดใช้งานอีกครั้ง
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => confirmDialogRef.current?.close()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]">ยกเลิก</button>
            <button type="button" onClick={() => { confirmDialogRef.current?.close(); changeStatus(false); }} className="rounded-xl bg-[#B42336] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#921C2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B42336] focus-visible:ring-offset-2">ยืนยันพักการใช้งาน</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
