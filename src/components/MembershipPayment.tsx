"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";

type PaymentState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "qr"; imageUrl: string; chargeId: string }
  | { step: "success" }
  | { step: "error"; message: string; chargeId?: string; imageUrl?: string };

export default function MembershipPayment(): ReactElement {
  const [state, setState] = useState<PaymentState>({ step: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const startPayment = async (): Promise<void> => {
    setState({ step: "loading" });
    try {
      const response = await fetch("/api/omise/create-membership-charge", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.qrImageUrl || !data.chargeId) {
        setState({ step: "error", message: response.status === 503 ? "ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" : "ไม่สามารถสร้าง QR ได้ กรุณาลองใหม่" });
        return;
      }
      setState({ step: "qr", imageUrl: data.qrImageUrl, chargeId: data.chargeId });
    } catch {
      setState({ step: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
    }
  };

  useEffect(() => {
    if (state.step !== "qr") return;
    const chargeId = state.chargeId;
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/omise/charge-status?chargeId=${encodeURIComponent(chargeId)}`);
        if (!response.ok) throw new Error("Could not verify payment status");
        const data = await response.json();
        if (data.status === "successful" && data.membershipActive) {
          if (pollRef.current) clearInterval(pollRef.current);
          setState({ step: "success" });
          router.refresh();
        } else if (data.status === "failed" || data.status === "expired") {
          if (pollRef.current) clearInterval(pollRef.current);
          setState({ step: "error", message: "การชำระเงินไม่สำเร็จ กรุณาลองใหม่" });
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        setState({ step: "error", message: "ตรวจสอบสถานะไม่สำเร็จ กรุณากดตรวจสอบรายการเดิมอีกครั้ง", chargeId, imageUrl: state.imageUrl });
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, router]);

  if (state.step === "idle") {
    return (
      <button type="button" onClick={startPayment} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFCB47] px-5 py-3 text-sm font-extrabold text-[#0F1B3D] transition hover:bg-[#f0bc3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2">
        <QrCode size={19} aria-hidden="true" /> ชำระด้วย PromptPay
      </button>
    );
  }
  if (state.step === "loading") return <p role="status" className="flex items-center justify-center gap-2 py-5 text-sm font-semibold text-slate-600"><LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> กำลังเตรียม QR สำหรับชำระเงิน...</p>;
  if (state.step === "qr") {
    return (
      <div className="text-center" aria-live="polite">
        <p className="mb-4 text-sm font-bold text-[#0F1B3D]">สแกน QR เพื่อชำระเงิน</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={state.imageUrl} alt="QR สำหรับชำระเงินด้วย PromptPay" className="mx-auto aspect-square w-full max-w-[220px] rounded-2xl border border-slate-200 bg-white p-2" />
        <p className="mt-4 text-sm leading-6 text-slate-600">เปิดแอปธนาคารเพื่อสแกน QR แล้วรอระบบยืนยันการชำระเงิน</p>
        <p role="status" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-[#3157D5]"><LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> กำลังตรวจสอบรายการอัตโนมัติ</p>
      </div>
    );
  }
  if (state.step === "success") return <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-5 text-center text-sm font-bold text-emerald-700"><Check size={20} aria-hidden="true" /> ชำระเงินสำเร็จ สิทธิ์สมาชิกพร้อมใช้งานแล้ว</p>;
  return (
    <div className="rounded-xl bg-red-50 p-4 text-center">
      <p role="alert" className="flex items-center justify-center gap-2 text-sm font-semibold text-red-700"><AlertCircle size={17} aria-hidden="true" /> {state.message}</p>
      <button
        type="button"
        onClick={state.chargeId && state.imageUrl ? () => setState({ step: "qr", chargeId: state.chargeId!, imageUrl: state.imageUrl! }) : startPayment}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1B3D] px-4 text-sm font-bold text-white transition hover:bg-[#3157D5]"
      >
        {state.chargeId && state.imageUrl ? <ShieldCheck size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
        {state.chargeId && state.imageUrl ? "ตรวจสอบรายการเดิมอีกครั้ง" : "ลองสร้าง QR อีกครั้ง"}
      </button>
    </div>
  );
}
