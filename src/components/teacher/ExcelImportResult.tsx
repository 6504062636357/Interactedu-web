// components/teacher/ExcelImportResult.tsx
"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import type { ImportLessonsResult } from "@/app/dashboard/teacher/courses/import/actions";

interface ExcelImportResultProps {
  result: ImportLessonsResult;
  onImportAnother: () => void;
}

export default function ExcelImportResult({ result, onImportAnother }: ExcelImportResultProps): ReactElement {
  const successRows = result.results.filter((r) => !r.error);
  const failedRows = result.results.filter((r) => r.error);
  const allSucceeded = failedRows.length === 0;

  return (
    <div className="max-w-3xl">
      <div
        className={`mb-6 rounded-2xl border p-6 ${
          allSucceeded
            ? "border-[#00B37E]/20 bg-[#00B37E]/[0.06]"
            : "border-[#FF5A3C]/20 bg-[#FF5A3C]/[0.05]"
        }`}
      >
        <p className={`text-[15px] font-bold ${allSucceeded ? "text-[#00885F]" : "text-[#0F1B3D]"}`}>
          {allSucceeded
            ? `สร้างคอร์สสำเร็จ พร้อมบทเรียน ${successRows.length} บท`
            : `สร้างคอร์สแล้ว — สำเร็จ ${successRows.length} บท / ล้มเหลว ${failedRows.length} บท`}
        </p>
        <p className="mt-1.5 text-[13px] text-[#0F1B3D]/60">
          บทเรียนที่นำเข้าสำเร็จยังไม่มีวิดีโอ — เข้าไปอัปโหลดวิดีโอทีละบทในหน้าจัดการคอร์ส แล้วกด &quot;บันทึกและส่งตรวจ&quot;
          ตามปกติ
        </p>
      </div>

      {failedRows.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#0F1B3D]/40">
            แถวที่นำเข้าไม่สำเร็จ
          </p>
          <div className="space-y-2">
            {failedRows.map((row, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#FF5A3C]/20 bg-[#FF5A3C]/[0.04] px-4 py-3"
              >
                <p className="text-[13px] font-semibold text-[#0F1B3D]">
                  {row.moduleName} → {row.lessonTitle || "(ไม่มีชื่อ)"}
                </p>
                <p className="mt-0.5 text-[12.5px] text-[#EB4A2D]">{row.error}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-[#0F1B3D]/45">
            แถวเหล่านี้ยังไม่ถูกสร้าง — แก้ไฟล์ Excel เฉพาะแถวที่ผิดแล้วนำเข้าซ้ำเป็นคอร์สใหม่ หรือสร้างบทเรียนเพิ่มเองในหน้าคอร์ส
          </p>
        </div>
      )}

      {successRows.length > 0 && (
        <div className="mb-8">
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#0F1B3D]/40">
            บทเรียนที่นำเข้าสำเร็จ
          </p>
          <div className="rounded-2xl border border-[#0F1B3D]/[0.08] divide-y divide-[#0F1B3D]/[0.06]">
            {successRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-[12px] text-[#0F1B3D]/40 mr-2">{row.moduleName}</span>
                  <span className="text-[13px] font-medium text-[#0F1B3D]">{row.lessonTitle}</span>
                </div>
                <span className="text-[11.5px] font-bold text-[#00885F] bg-[#00B37E]/10 px-2 py-0.5 rounded-full">
                  พร้อมใส่วิดีโอ
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {result.courseId && (
          <Link
            href={`/dashboard/teacher/courses/${result.courseId}`}
            className="rounded-full bg-[#FF5A3C] px-6 py-3 text-[14px] font-bold text-white hover:bg-[#EB4A2D] transition-colors"
          >
            ไปที่หน้าคอร์สเพื่ออัปโหลดวิดีโอ
          </Link>
        )}
        <button
          type="button"
          onClick={onImportAnother}
          className="rounded-full border border-[#0F1B3D]/15 px-5 py-3 text-[13.5px] font-bold text-[#0F1B3D] hover:bg-[#0F1B3D]/[0.04] transition-colors"
        >
          นำเข้าไฟล์อื่น
        </button>
      </div>
    </div>
  );
}