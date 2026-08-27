// components/teacher/ExcelImportPreview.tsx
"use client";

import { useMemo, useState, type ReactElement } from "react";
import type { ImportCourseMeta, ImportLessonRow, ImportLessonsResult } from "@/app/dashboard/teacher/courses/import/actions";
import { importLessonsFromExcel } from "@/app/dashboard/teacher/courses/import/actions";
import { validateImportRows, type ValidatedRow } from "@/lib/importValidation";

interface ExcelImportPreviewProps {
  course: ImportCourseMeta;
  rows: ImportLessonRow[];
  onCancel: () => void;
  onImported: (result: ImportLessonsResult) => void;
}

export default function ExcelImportPreview({
  course,
  rows,
  onCancel,
  onImported,
}: ExcelImportPreviewProps): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validation = useMemo(() => validateImportRows(rows), [rows]);

  // จัดกลุ่มตาม module สำหรับแสดงผล (เรียงตามที่ปรากฏในไฟล์)
  const groupedRows = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ValidatedRow[]>();
    for (const row of validation.rows) {
      const key = row.moduleName.trim() || "(ไม่มีชื่อหมวด)";
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(row);
    }
    return order.map((name) => ({ name, rows: map.get(name)! }));
  }, [validation.rows]);

  const handleConfirm = async (): Promise<void> => {
    if (validation.hasErrors) return;

    setSubmitting(true);
    setSubmitError(null);

    const result = await importLessonsFromExcel({ course, rows });
    setSubmitting(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    onImported(result);
  };

  return (
    <div className="max-w-4xl">
      {/* ---- Course summary ---- */}
      <div className="mb-6 rounded-2xl border border-[#0F1B3D]/10 bg-[#F7F8FA] p-5">
        <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#0F1B3D]/40">ข้อมูลคอร์ส</p>
        <div className="grid grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <span className="text-[#0F1B3D]/50">ชื่อคอร์ส: </span>
            <span className="font-semibold text-[#0F1B3D]">{course.title}</span>
          </div>
          <div>
            <span className="text-[#0F1B3D]/50">รหัสวิชา: </span>
            <span className="font-semibold text-[#0F1B3D]">{course.courseCode}</span>
          </div>
          <div>
            <span className="text-[#0F1B3D]/50">หมวดวิชา: </span>
            <span className="font-semibold text-[#0F1B3D]">{course.category}</span>
          </div>
          <div>
            <span className="text-[#0F1B3D]/50">ราคา: </span>
            <span className="font-semibold text-[#0F1B3D]">{course.isFree ? "ฟรี" : `${course.price} บาท`}</span>
          </div>
        </div>
      </div>

      {/* ---- Validation summary ---- */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13.5px] font-semibold text-[#0F1B3D]/70">
          {validation.moduleCount} หมวด · {validation.lessonCount} บทเรียน
        </p>
        {validation.hasErrors ? (
          <span className="text-[13px] font-bold text-[#EB4A2D]">
            พบข้อผิดพลาด {validation.rows.filter((r) => r.errors.length > 0).length} แถว — แก้ไขไฟล์แล้วอัปโหลดใหม่
          </span>
        ) : (
          <span className="text-[13px] font-bold text-[#00885F]">ข้อมูลถูกต้อง พร้อมสร้างคอร์ส</span>
        )}
      </div>

      {/* ---- Grouped table ---- */}
      <div className="space-y-6">
        {groupedRows.map((group) => (
          <div key={group.name} className="rounded-2xl border border-[#0F1B3D]/[0.08] overflow-hidden">
            <div className="bg-[#0F1B3D]/[0.03] px-4 py-2.5">
              <p className="text-[13px] font-bold text-[#0F1B3D]">{group.name}</p>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#0F1B3D]/[0.06] text-[#0F1B3D]/40">
                  <th className="px-4 py-2 text-left font-semibold">ลำดับ</th>
                  <th className="px-4 py-2 text-left font-semibold">ชื่อบทเรียน</th>
                  <th className="px-4 py-2 text-left font-semibold">คำอธิบาย</th>
                  <th className="px-4 py-2 text-left font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={`border-b border-[#0F1B3D]/[0.04] last:border-0 ${
                      row.errors.length > 0 ? "bg-[#FF5A3C]/[0.04]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-[#0F1B3D]/60">{row.order ?? "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-[#0F1B3D]">{row.lessonTitle || "—"}</td>
                    <td className="px-4 py-2.5 text-[#0F1B3D]/50">
                      {row.lessonDescription
                        ? row.lessonDescription.length > 40
                          ? `${row.lessonDescription.slice(0, 40)}…`
                          : row.lessonDescription
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.errors.length > 0 ? (
                        <span className="text-[12px] font-semibold text-[#EB4A2D]">{row.errors.join(", ")}</span>
                      ) : (
                        <span className="text-[12px] font-semibold text-[#00885F]">พร้อมนำเข้า</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {submitError && (
        <div className="mt-6 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#EB4A2D]">{submitError}</p>
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="mt-8 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-full border border-[#0F1B3D]/15 px-5 py-3 text-[13.5px] font-bold text-[#0F1B3D] disabled:opacity-60"
        >
          ยกเลิก / อัปโหลดไฟล์ใหม่
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={validation.hasErrors || submitting}
          className="rounded-full bg-[#FF5A3C] px-6 py-3 text-[14px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? "กำลังสร้างคอร์ส..." : "ยืนยันสร้างคอร์ส"}
        </button>
      </div>
    </div>
  );
}