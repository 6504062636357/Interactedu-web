"use client";

import { useEffect, useState } from "react";

export default function CertificatePdfViewer({ certificateId }: { certificateId: string }) {
  const url = `/api/admin/certificates/${certificateId}/pdf`;
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("PDF unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, attempt]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="ตัวอย่างใบรับรอง PDF">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <h2 className="text-base font-extrabold text-[#0F1B3D]">ใบรับรอง PDF</h2>
        <div className="flex flex-wrap gap-3 text-[13px] font-bold">
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-[#3157D5] hover:bg-blue-50">เปิดแท็บใหม่</a>
          <a href={`${url}?download=1`} className="rounded-xl bg-[#0F1B3D] px-4 py-2 text-white hover:bg-[#3157D5]">ดาวน์โหลด PDF</a>
        </div>
      </div>
      {error ? (
        <div className="p-8 text-center">
          <p role="alert" className="text-sm text-red-600">โหลด PDF ไม่สำเร็จ ไฟล์อาจไม่พร้อมใช้งานหรือเซสชันหมดอายุ</p>
          <button type="button" onClick={() => { setError(false); setPdfUrl(null); setAttempt((value) => value + 1); }} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-[#3157D5]">ลองใหม่</button>
        </div>
      ) : pdfUrl ? (
        <iframe src={`${pdfUrl}#view=FitH`} title="ใบรับรองฉบับที่ออกให้ผู้เรียน" className="h-[65vh] min-h-[360px] w-full border-0 bg-slate-50 sm:h-[75vh]" />
      ) : <p role="status" className="p-10 text-center text-sm text-slate-500">กำลังโหลด PDF...</p>}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">หากเบราว์เซอร์ไม่แสดงตัวอย่าง ให้เลือกเปิดแท็บใหม่หรือดาวน์โหลด PDF</p>
    </section>
  );
}
