"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

interface OmiseQrPaymentProps {
  courseId: string;
  slug: string;
}

type ChargeState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "qr"; qrImageUrl: string; chargeId: string }
  | { step: "success" }
  | { step: "error"; message: string };

export default function OmiseQrPayment({ courseId, slug }: OmiseQrPaymentProps): ReactElement {
  const [state, setState] = useState<ChargeState>({ step: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const startPayment = async (): Promise<void> => {
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/omise/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();

      if (!res.ok || !data.qrImageUrl) {
        setState({ step: "error", message: "ไม่สามารถสร้าง QR ได้ กรุณาลองใหม่" });
        return;
      }

      setState({ step: "qr", qrImageUrl: data.qrImageUrl, chargeId: data.chargeId });
    } catch {
      setState({ step: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
    }
  };

  useEffect(() => {
    if (state.step !== "qr") return;

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/omise/charge-status?chargeId=${state.chargeId}`);
      const data = await res.json();

      if (data.status === "successful") {
        if (pollRef.current) clearInterval(pollRef.current);
        setState({ step: "success" });
        setTimeout(() => router.push(`/courses/${slug}/success`), 1200); // เปลี่ยนตรงนี้
      } else if (data.status === "failed" || data.status === "expired") {
        if (pollRef.current) clearInterval(pollRef.current);
        setState({ step: "error", message: "การชำระเงินไม่สำเร็จ กรุณาลองใหม่" });
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, router, slug]);

  if (state.step === "idle") {
    return (
      <button
        type="button"
        onClick={startPayment}
        className="w-full inline-flex items-center justify-center text-[15px] font-bold text-white bg-[#FFCB47] hover:bg-[#f0bc3a] px-7 py-4 rounded-full transition-colors"
      >
        ชำระเงิน
      </button>
    );
  }

  if (state.step === "loading") {
    return (
      <div className="text-center py-6">
        <p className="text-[13.5px] text-[#0F1B3D]/50 font-medium">กำลังสร้าง QR Code...</p>
      </div>
    );
  }

  if (state.step === "qr") {
    return (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.qrImageUrl}
          alt="PromptPay QR Code"
          className="w-52 h-52 mx-auto rounded-xl border border-[#0F1B3D]/10"
        />
        <p className="mt-4 text-[13.5px] text-[#0F1B3D]/60 font-medium">
          สแกน QR ด้วยแอปธนาคารเพื่อชำระเงิน
        </p>
        <p className="mt-1 text-[12px] text-[#0F1B3D]/40 font-medium">กำลังรอการยืนยัน...</p>
      </div>
    );
  }

  if (state.step === "success") {
    return (
      <div className="text-center py-6">
        <p className="text-[15px] font-bold text-[#00B37E]">ชำระเงินสำเร็จ 🎉</p>
        <p className="mt-1 text-[13px] text-[#0F1B3D]/50 font-medium">กำลังพาไปหน้าคอร์ส...</p>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <p className="text-[13.5px] font-semibold text-[#EB4A2D] mb-4">{state.message}</p>
      <button
        type="button"
        onClick={startPayment}
        className="text-[14px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] px-6 py-3 rounded-full transition-colors"
      >
        ลองอีกครั้ง
      </button>
    </div>
  );
}