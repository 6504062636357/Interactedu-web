// app/dashboard/teacher/students/page.tsx
"use client";

import type { ReactElement } from "react";

export default function TeacherStudentsPage(): ReactElement {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-blue-950 tracking-[-0.01em]">นักเรียนทั้งหมด</h1>
        <p className="mt-1.5 text-[14.5px] text-slate-500">รายชื่อนักเรียนและการติดตามผลรายบุคคล</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-14 text-center">
        <p className="text-[13.5px] text-slate-400">
          ยังไม่ได้เชื่อมข้อมูล — รอ query รายชื่อนักเรียนจาก enrollments/profiles
        </p>
      </div>
    </div>
  );
}