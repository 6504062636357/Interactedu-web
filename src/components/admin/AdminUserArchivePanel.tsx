"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2 } from "lucide-react";
import { archiveUserAccount } from "@/app/dashboard/admin/users/actions";

export default function AdminUserArchivePanel({
  userId,
  userName,
  confirmationValue,
  disabledReason,
  archivedAt,
}: {
  userId: string;
  userName: string;
  confirmationValue: string;
  disabledReason: string | null;
  archivedAt: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canConfirm = confirmation.trim().toLowerCase() === confirmationValue.toLowerCase();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm || pending || disabledReason || archivedAt) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await archiveUserAccount(userId, confirmation);
        if (result.error) {
          setError(result.error);
          return;
        }
        dialogRef.current?.close();
        router.replace("/dashboard/admin/users?archived=1");
      } catch {
        setError("ลบบัญชีไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  if (archivedAt) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-2 text-[#0F1B3D]"><Archive size={18} aria-hidden="true" /><h2 className="text-base font-extrabold">บัญชีถูกลบออกจากรายชื่อแล้ว</h2></div>
        <p className="mt-2 text-sm text-slate-500">ลบเมื่อ {new Date(archivedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })} · ประวัติเรียน การชำระเงิน และใบรับรองยังคงเก็บไว้</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-[#0F1B3D]">ลบบัญชี</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">ลบออกจากรายชื่อปกติและปิดการเข้าใช้ระบบ โดยเก็บประวัติเรียน การชำระเงิน และใบรับรองไว้</p>
        </div>
        <div className="shrink-0">
          <button type="button" disabled={disabledReason !== null} onClick={() => { setConfirmation(""); setError(null); dialogRef.current?.showModal(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={16} aria-hidden="true" />ลบบัญชี</button>
          {disabledReason && <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{disabledReason}</p>}
        </div>
      </div>
      <dialog ref={dialogRef} onCancel={(event) => { if (pending) event.preventDefault(); }} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="fixed inset-0 m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-2xl backdrop:bg-slate-950/50">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 size={22} aria-hidden="true" /></div>
        <h2 id={`${id}-title`} className="text-xl font-extrabold text-[#0F1B3D]">ยืนยันลบบัญชี</h2>
        <p id={`${id}-description`} className="mt-2 text-sm leading-6 text-slate-600">บัญชีของ <strong className="break-words text-[#0F1B3D]">{userName}</strong> จะถูกซ่อนจากรายชื่อและใช้งานระบบไม่ได้ ประวัติเรียน การชำระเงิน และใบรับรองยังคงเก็บไว้</p>
        <form onSubmit={submit} className="mt-5">
          <label htmlFor={`${id}-confirmation`} className="block text-sm font-bold text-slate-600">พิมพ์ {confirmationValue === userId ? "รหัสบัญชี" : "อีเมล"}นี้เพื่อยืนยัน</label>
          <p className="mt-1 break-all text-sm font-semibold text-[#0F1B3D]">{confirmationValue}</p>
          <input id={`${id}-confirmation`} name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} maxLength={320} required disabled={pending} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-[#0F1B3D] outline-none focus:border-[#3157D5] focus:ring-2 focus:ring-[#3157D5]/10 disabled:opacity-60" />
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={pending} onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] disabled:opacity-60">ยกเลิก</button>
            <button type="submit" disabled={!canConfirm || pending} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "กำลังลบบัญชี..." : "ยืนยันลบบัญชี"}</button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
