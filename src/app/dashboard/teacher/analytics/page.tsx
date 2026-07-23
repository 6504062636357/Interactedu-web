// app/dashboard/teacher/analytics/page.tsx
"use client";

import type { ReactElement } from "react";

export default function TeacherAnalyticsPage(): ReactElement {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-blue-950 tracking-[-0.01em]">วิเคราะห์ข้อมูล</h1>
        <p className="mt-1.5 text-[14.5px] text-slate-500">สถิติการเข้าเรียน อัตราเรียนจบ และคะแนนสอบ</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-14 text-center">
        <p className="text-[13.5px] text-slate-400">
          ยังไม่ได้เชื่อมข้อมูล — รอ query สถิติการเข้าเรียน/อัตราเรียนจบจาก Supabase
        </p>
      </div>
    </div>
  );
}