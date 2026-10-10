"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  certificateId: string;
  title: string;
  certificateNo: string;
}

export default function CertificatePreviewButton({ certificateId, title, certificateNo }: Props) {
  const [open, setOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPdfUrl(null);
    setError(false);
    triggerRef.current?.focus();
  }, []);

  // Fetch PDF only when the modal is open (lazy)
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    async function load() {
      try {
        const response = await fetch(`/api/me/certificates/${certificateId}/download?inline=1`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
          throw new Error("PDF unavailable");
        }
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
  }, [open, certificateId, attempt]);

  // Esc to close, scroll lock, focus
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex flex-1 items-center justify-center rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#0F1B3D] hover:bg-[#0F1B3D]/[0.04]"
      >
        ดูตัวอย่าง
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-6"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`ตัวอย่างใบรับรอง ${title}`}
              className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4 border-b border-[#0F1B3D]/[0.07] p-5">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-extrabold text-[#0F1B3D]">{title}</h3>
                  <p className="mt-1 font-mono text-[10.5px] text-[#0F1B3D]/40">{certificateNo}</p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  aria-label="ปิด"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0F1B3D]/60 hover:bg-[#0F1B3D]/[0.06]"
                >
                  ✕
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-6">
                {error ? (
                  <div className="py-16 text-center">
                    <p role="alert" className="text-[13px] text-red-600">
                      โหลดตัวอย่างไม่สำเร็จ ไฟล์อาจไม่พร้อมใช้งานหรือเซสชันหมดอายุ
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setError(false);
                        setPdfUrl(null);
                        setAttempt((value) => value + 1);
                      }}
                      className="mt-4 rounded-full border border-[#0F1B3D]/15 bg-white px-5 py-2 text-[12.5px] font-bold text-[#0F1B3D]"
                    >
                      ลองใหม่
                    </button>
                  </div>
                ) : pdfUrl ? (
                  <iframe
                    src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                    title={`ใบรับรอง ${title}`}
                    className="mx-auto aspect-[1.414/1] min-h-[320px] w-full rounded-lg border-0 bg-white shadow-lg sm:h-[70vh] sm:aspect-auto"
                  />
                ) : (
                  <div role="status" className="mx-auto aspect-[1.414/1] w-full max-w-3xl animate-pulse rounded-lg bg-white/80 shadow">
                    <p className="flex h-full items-center justify-center text-[13px] text-slate-400">กำลังโหลดตัวอย่าง...</p>
                  </div>
                )}
              </div>

              <footer className="flex flex-wrap justify-end gap-3 border-t border-[#0F1B3D]/[0.07] p-4">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-[#0F1B3D]/15 px-5 py-2.5 text-[12.5px] font-bold text-[#0F1B3D]"
                >
                  ปิด
                </button>
                <a
                  href={`/api/me/certificates/${certificateId}/download`}
                  className="rounded-full bg-[#0F1B3D] px-6 py-2.5 text-[12.5px] font-bold text-white hover:opacity-90"
                >
                  ดาวน์โหลด PDF
                </a>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
