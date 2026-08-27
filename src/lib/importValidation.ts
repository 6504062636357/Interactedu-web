// lib/importValidation.ts
import type { ImportLessonRow } from "@/app/dashboard/teacher/courses/import/actions";

export interface ValidatedRow extends ImportLessonRow {
  rowIndex: number; // ลำดับในไฟล์ (สำหรับอ้างอิงตอนแสดง error)
  errors: string[];
}

export interface ValidationSummary {
  rows: ValidatedRow[];
  hasErrors: boolean;
  moduleCount: number;
  lessonCount: number;
}

export function validateImportRows(rawRows: ImportLessonRow[]): ValidationSummary {
  const rows: ValidatedRow[] = rawRows.map((row, i) => ({
    ...row,
    rowIndex: i + 1,
    errors: [],
  }));

  // 1. เช็ค required field ต่อแถว
  for (const row of rows) {
    if (!row.lessonTitle.trim()) {
      row.errors.push("ไม่มีชื่อบทเรียน");
    }
    if (!row.moduleName.trim()) {
      row.errors.push("ไม่มีชื่อหมวด (module_name)");
    }
    if (row.order != null && (Number.isNaN(row.order) || row.order < 0)) {
      row.errors.push("ลำดับ (order) ต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0");
    }
  }

  // 2. เช็ค order ซ้ำกันภายใน module เดียวกัน (เฉพาะแถวที่ระบุ order มา ไม่ใช่ null)
  const groupedByModule = new Map<string, ValidatedRow[]>();
  for (const row of rows) {
    const key = row.moduleName.trim();
    if (!key) continue; // ข้ามแถวที่ไม่มีชื่อ module อยู่แล้ว (มี error ข้อ 1 ไปแล้ว)
    if (!groupedByModule.has(key)) groupedByModule.set(key, []);
    groupedByModule.get(key)!.push(row);
  }

  for (const moduleRows of groupedByModule.values()) {
    const orderSeen = new Map<number, ValidatedRow[]>();
    for (const row of moduleRows) {
      if (row.order == null) continue;
      if (!orderSeen.has(row.order)) orderSeen.set(row.order, []);
      orderSeen.get(row.order)!.push(row);
    }
    for (const dupRows of orderSeen.values()) {
      if (dupRows.length > 1) {
        for (const row of dupRows) {
          row.errors.push(`ลำดับ ${row.order} ซ้ำกับแถวอื่นในหมวดเดียวกัน`);
        }
      }
    }
  }

  const hasErrors = rows.some((r) => r.errors.length > 0);

  return {
    rows,
    hasErrors,
    moduleCount: groupedByModule.size,
    lessonCount: rows.length,
  };
}