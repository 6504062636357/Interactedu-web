"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF5A3C]/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FF5A3C"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 9v4" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <p className="text-[17px] font-bold text-[#0F1B3D] mb-2">
          เกิดข้อผิดพลาดชั่วคราว
        </p>
        <p className="text-[13.5px] leading-relaxed text-[#0F1B3D]/50 mb-8">
          อาจเกิดจากปัญหาการเชื่อมต่อชั่วคราว ลองใหม่อีกครั้ง
          หากยังไม่หายกรุณาติดต่อแอดมิน
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F1B3D] px-6 py-3 text-[13.5px] font-bold text-white transition-colors hover:bg-[#0F1B3D]/90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 1 3 6.7" />
              <path d="M3 16v-4h4" />
            </svg>
            ลองใหม่อีกครั้ง
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-[#0F1B3D]/10 px-6 py-3 text-[13.5px] font-bold text-[#0F1B3D] transition-colors hover:bg-white"
          >
            กลับหน้าแรก
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-[11px] text-[#0F1B3D]/30">
            รหัสอ้างอิง: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
