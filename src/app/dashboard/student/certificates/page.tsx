import type { ReactElement } from "react";

export default function CertificatesPage(): ReactElement {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="5" stroke="#0F1B3D" strokeWidth="1.8" />
          <path d="M8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5" stroke="#0F1B3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">ใบประกาศนียบัตร</h1>
      </div>
      <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
        <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีระบบใบประกาศนียบัตรในตอนนี้</p>
      </div>
    </div>
  );
}