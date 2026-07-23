import type { ReactElement } from "react";

export default function FavoritesPage(): ReactElement {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 20s-7-4.4-9.5-9C.9 7.6 3 4.5 6.2 4.5c2 0 3.3 1 5.8 3.5 2.5-2.5 3.8-3.5 5.8-3.5C21 4.5 23.1 7.6 21.5 11c-2.5 4.6-9.5 9-9.5 9z"
            stroke="#0F1B3D"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">คอร์สโปรดของฉัน</h1>
      </div>
      <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
        <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีคอร์สที่บันทึกไว้</p>
      </div>
    </div>
  );
}