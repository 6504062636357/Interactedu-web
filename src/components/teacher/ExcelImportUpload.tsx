// components/teacher/ExcelImportUpload.tsx
"use client";

import { useState, type ChangeEvent, type ReactElement } from "react";
import * as XLSX from "xlsx";
import type { ImportCourseMeta, ImportLessonRow } from "@/app/dashboard/teacher/courses/import/actions";
import { downloadImportTemplate } from "@/lib/generateImportTemplate";
interface ParsedImportData {
  course: ImportCourseMeta;
  rows: ImportLessonRow[];
}

interface ExcelImportUploadProps {
  onParsed: (data: ParsedImportData) => void;
}

const LESSON_HEADER_ROW_INDEX = 6; // แถวที่ 6 (0-indexed = 5) เป็นหัวตาราง lesson
const EXPECTED_LESSON_HEADERS = ["module_name", "lesson_title", "lesson_description", "order"];

function readCourseMeta(sheet: XLSX.WorkSheet): ImportCourseMeta {
  const get = (cell: string): string => {
    const value = sheet[cell]?.v;
    return value != null ? String(value).trim() : "";
  };

  const priceRaw = get("B5");
  const price = priceRaw === "" ? 0 : Number(priceRaw);
  const isFree = priceRaw === "" || price === 0;

  return {
    title: get("B1"),
    courseCode: get("B2"),
    category: get("B3"),
    description: get("B4") || null,
    isFree,
    price: Number.isNaN(price) ? 0 : price,
  };
}

// เดิม: เช็คว่าหัวตารางมีคำว่า module_name, lesson_title, ... ครบไหม
// เปลี่ยนเป็น: เช็คแค่ว่ามี 4 คอลัมน์ครบ ไม่สนใจข้อความ header เพราะ column A ในไฟล์ตอนนี้เป็นภาษาไทยที่ generate เอง

function readLessonRows(sheet: XLSX.WorkSheet): { rows: ImportLessonRow[]; error?: string } {
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    range: LESSON_HEADER_ROW_INDEX,
    defval: "",
  });

  if (allRows.length === 0) {
    return { rows: [], error: "ไม่พบตารางบทเรียนในไฟล์" };
  }

  const headerRow = (allRows[0] as unknown[]).map((h) => String(h).trim());
  if (headerRow.length < 4) {
    return {
      rows: [],
      error: "หัวตารางไม่ครบ 4 คอลัมน์ — กรุณาใช้ไฟล์ที่ดาวน์โหลดจาก Template เท่านั้น อย่าลบหรือสลับคอลัมน์",
    };
  }

  // จับคู่ตามตำแหน่งคอลัมน์ A-D เสมอ ไม่เทียบชื่อ header (รองรับ header ภาษาไทย/อังกฤษได้ทั้งคู่)
  const iModule = 0; // คอลัมน์ A
  const iTitle = 1;  // คอลัมน์ B
  const iDesc = 2;   // คอลัมน์ C
  const iOrder = 3;  // คอลัมน์ D

  const rows: ImportLessonRow[] = [];

  for (let i = 1; i < allRows.length; i++) {
    const raw = allRows[i] as unknown[];
    const isEmptyRow = raw.every((cell) => String(cell ?? "").trim() === "");
    if (isEmptyRow) continue;

    const orderRaw = String(raw[iOrder] ?? "").trim();
    const parsedOrder = orderRaw === "" ? null : Number(orderRaw);

        rows.push({
        moduleName: String(raw[iModule] ?? "").trim(),
        lessonTitle: String(raw[iTitle] ?? "").trim(),
        lessonDescription: String(raw[iDesc] ?? "").trim() || null,
        order: parsedOrder != null && Number.isNaN(parsedOrder) ? null : parsedOrder,
        });
  }

  return { rows };
}

export default function ExcelImportUpload({ onParsed }: ExcelImportUploadProps): ReactElement {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        setError("ไม่พบข้อมูลในไฟล์ Excel");
        return;
      }

      const course = readCourseMeta(sheet);
      if (!course.title || !course.courseCode || !course.category) {
        setError("กรุณากรอกชื่อคอร์ส, รหัสวิชา และหมวดวิชาให้ครบในช่อง B1-B3 ของไฟล์");
        return;
      }

      const { rows, error: rowsError } = readLessonRows(sheet);
      if (rowsError) {
        setError(rowsError);
        return;
      }
      if (rows.length === 0) {
        setError("ไม่พบข้อมูลบทเรียนในไฟล์");
        return;
      }
      // เพิ่มใน handleFileChange หลังเช็ค course.title/courseCode/category
      if (course.price < 0) {
        setError("ราคาต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0");
        return;
    }

      onParsed({ course, rows });
    } catch (err) {
      console.error("[ExcelImportUpload] Failed to parse file:", err);
      setError("อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง");
    } finally {
      setParsing(false);
    }
  };

  return (
  <div className="space-y-4">
    {/* 1. แถบดาวน์โหลด Template (แยกเป็นการ์ดด้านบนชัดเจน) */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#7C5CFF]/[0.06] border border-[#7C5CFF]/20">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#7C5CFF]/15 text-[#7C5CFF] flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h4 className="text-[13px] font-bold text-[#0F1B3D]">ยังไม่มีแบบฟอร์มไฟล์?</h4>
          <p className="text-[12px] text-[#0F1B3D]/60">ดาวน์โหลดแม่แบบ Excel สำหรับกรอกข้อมูลโครงสร้างคอร์ส</p>
        </div>
      </div>

      <button
        type="button"
        onClick={downloadImportTemplate}
        className="inline-flex items-center gap-2 px-3.5 py-2 text-[12.5px] font-bold text-[#7C5CFF] bg-white border border-[#7C5CFF]/30 rounded-lg shadow-sm hover:bg-[#7C5CFF]/10 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        ดาวน์โหลด Template (.xlsx)
      </button>
    </div>

    {/* 2. กล่องอัปโหลดไฟล์ */}
    <div className="rounded-2xl border-2 border-dashed border-[#0F1B3D]/15 hover:border-[#7C5CFF]/50 p-6 bg-[#0F1B3D]/[0.01] transition-all">
      <label className="block text-[13px] font-bold text-[#0F1B3D]/80 mb-2.5">
        อัปโหลดไฟล์ Excel (.xlsx, .xls)
      </label>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="w-full text-[13.5px] text-[#0F1B3D]/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[13px] file:font-bold file:bg-[#0F1B3D]/[0.08] file:text-[#0F1B3D] hover:file:bg-[#0F1B3D]/15 file:cursor-pointer cursor-pointer"
      />

      {/* ข้อความแจ้งเตือนสถานะการอ่านไฟล์ */}
      {fileName && !error && !parsing && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[#00B37E] font-semibold bg-[#00B37E]/10 px-3 py-2 rounded-lg w-fit">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <span>อ่านไฟล์ &quot;{fileName}&quot; สำเร็จ</span>
        </div>
      )}

      {parsing && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[#7C5CFF] font-medium">
          <svg className="animate-spin h-4 w-4 text-[#7C5CFF]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>กำลังประมวลผลไฟล์ Excel...</span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[#EB4A2D] font-semibold bg-[#EB4A2D]/10 px-3 py-2 rounded-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  </div>
);
}