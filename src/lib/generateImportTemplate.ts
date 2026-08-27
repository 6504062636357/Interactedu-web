// lib/generateImportTemplate.ts
import ExcelJS from "exceljs";
import { CATEGORIES } from "@/lib/constants/categories";

export async function downloadImportTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // -----------------------------------------------------------------
  // 1. Sheet นำเข้าข้อมูล (Import)
  // -----------------------------------------------------------------
  const ws = workbook.addWorksheet("Import", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 7 }],
  });

  ws.columns = [
    { key: "colA", width: 30 },
    { key: "colB", width: 44 },
    { key: "colC", width: 52 },
    { key: "colD", width: 16 },
  ];

  const colors = {
    navy: "FF1E293B",
    indigo: "FF4F46E5",
    lightGray: "FFF1F5F9",
    white: "FFFFFFFF",
    textDark: "FF0F172A",
    placeholderGray: "FF94A3B8", // สีเทาอ่อนสำหรับค่าตัวอย่าง (แยกจากข้อมูลจริง)
    warningAmber: "FFB45309",
    warningBg: "FFFFFBEB",
  };

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };

  // --- แถวที่ 1-5: ข้อมูลคอร์ส (Course Details) ---
  // ค่าในคอลัมน์ B เป็น "ตัวอย่าง" ทั้งหมด — ต้องลบทิ้งแล้วพิมพ์ข้อมูลจริงทับ
  // --- แถวที่ 1-5: ข้อมูลคอร์ส ---
const courseMeta: [string, string | number][] = [
  ["ชื่อคอร์ส", "ตัวอย่าง: พื้นฐานการเขียนโปรแกรม Flutter"],
  ["รหัสวิชา", "ตัวอย่าง: CS101"],
  ["หมวดหมู่ (เลือกจาก Dropdown เท่านั้น)", CATEGORIES[0]],
  ["คำอธิบายคอร์ส (ไม่บังคับ)", "ตัวอย่าง: คำอธิบายภาพรวมของคอร์ส (ไม่บังคับ — ลบได้ถ้าไม่ต้องการ)"],
  ["ราคา (บาท)", 0],
];

  courseMeta.forEach(([key, val], idx) => {
    const rowNum = idx + 1;
    const row = ws.getRow(rowNum);
    row.values = [key, val];
    row.height = 24;

    const cellA = ws.getCell(`A${rowNum}`);
    cellA.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: colors.textDark } };
    cellA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.lightGray } };
    cellA.border = thinBorder;
    cellA.alignment = { vertical: "middle", indent: 1 };

    const cellB = ws.getCell(`B${rowNum}`);
    // ตัวอักษรเอียง + สีเทา = สัญญาณภาพว่านี่คือค่าตัวอย่าง ไม่ใช่ข้อมูลจริง
    // ยกเว้นแถว price (ไม่ใช่ placeholder text แต่เป็นค่าเริ่มต้นจริงที่ใช้ได้เลย)
    const isPlaceholderText = key !== "price";
    cellB.font = {
      name: "Segoe UI",
      size: 10,
      italic: isPlaceholderText,
      color: { argb: isPlaceholderText ? colors.placeholderGray : colors.textDark },
    };
    cellB.border = thinBorder;
    cellB.alignment = { vertical: "middle", indent: 1 };
  });

  // --- แถวคำเตือนเล็กๆ ใต้ course meta (ยังอยู่ในแถว 1-5 โซน แทรกเป็น comment แทนแถวใหม่ กัน row index ขยับ) ---
  ws.getCell("B1").note = {
    texts: [
      {
        font: { size: 9, color: { theme: 1 } },
        text: "ลบข้อความตัวอย่างนี้ทิ้งแล้วพิมพ์ชื่อคอร์สจริงแทน",
      },
    ],
  };
  ws.getCell("B2").note = {
    texts: [{ font: { size: 9, color: { theme: 1 } }, text: "รหัสวิชาของคุณเอง เช่น MATH201" }],
  };
  // note ที่ B3 บอกชัดว่าเลือกจาก dropdown
    ws.getCell("B3").note = {
    texts: [
        { font: { size: 9, color: { theme: 1 } }, text: "คลิกที่ช่องนี้แล้วกดลูกศร ▼ เพื่อเลือกหมวดหมู่จากรายการ" },
    ],
    };
  ws.getCell("B4").note = {
    texts: [{ font: { size: 9, color: { theme: 1 } }, text: "ไม่บังคับกรอก — ลบทิ้งได้ถ้าไม่ต้องการคำอธิบาย" }],
  };
  ws.getCell("B5").note = {
    texts: [{ font: { size: 9, color: { theme: 1 } }, text: "0 หรือเว้นว่าง = คอร์สฟรี" }],
  };

  // --- แถวที่ 6: แถบคำเตือนคั่นระหว่างส่วนหัวกับตาราง (แทนแถวว่างเปล่าเดิม) ---
  const noticeRow = ws.getRow(6);
  noticeRow.height = 22;
  ws.mergeCells("A6:D6");
  const noticeCell = ws.getCell("A6");
  noticeCell.value = "⚠ ห้ามลบหรือแก้ไขแถวนี้และแถวหัวตารางด้านล่าง (แถว 7)  โครงสร้างไฟล์ต้องคงเดิม";
  noticeCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: colors.warningAmber } };
  noticeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.warningBg } };
  noticeCell.alignment = { vertical: "middle", horizontal: "center" };

  // --- แถวที่ 7: หัวตารางบทเรียน (Lesson Table Header) ---
const tableHeaderRow = ws.getRow(7);
tableHeaderRow.values = ["ชื่อหมวดบทเรียน", "ชื่อบทเรียน", "คำอธิบายบทเรียน", "ลำดับ"];
  tableHeaderRow.height = 28;

  ["A7", "B7", "C7", "D7"].forEach((cellRef) => {
    const cell = ws.getCell(cellRef);
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: colors.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.indigo } };
    cell.border = thinBorder;
    cell.alignment = {
      vertical: "middle",
      horizontal: cellRef === "D7" ? "center" : "left",
      indent: cellRef === "D7" ? 0 : 1,
    };
  });

  // --- แถวที่ 8 เป็นต้นไป: ตัวอย่างข้อมูลบทเรียน (ตัวเอียง+เทา เหมือนกัน เพื่อบอกว่าเป็นตัวอย่าง) ---
  const sampleLessons: [string, string, string, number][] = [
    ["ตัวอย่าง — บทที่ 1: บทนำและการติดตั้ง", "1.1 ทำความรู้จักกับ Flutter และ Dart", "แนะนำภาพรวมของเครื่องมือ", 0],
    ["ตัวอย่าง — บทที่ 1: บทนำและการติดตั้ง", "1.2 ติดตั้ง Flutter SDK และ VS Code", "", 1],
    ["ตัวอย่าง — บทที่ 2: พื้นฐาน UI Widget", "2.1 โครงสร้าง Stateless & Stateful Widget", "ความแตกต่างและการทำงานของ Widget", 0],
  ];

  sampleLessons.forEach((item, idx) => {
    const rowNum = idx + 8;
    const row = ws.getRow(rowNum);
    row.values = item;
    row.height = 22;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: colors.placeholderGray } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 4 ? "center" : "left",
        indent: colNumber === 4 ? 0 : 1,
      };
    });
  });

  // เพิ่ม comment ที่หัวตารางอธิบายว่าแถวตัวอย่างด้านล่างลบได้/ต้องลบก่อนอัปโหลดจริง
  ws.getCell("A7").note = {
    texts: [
      {
        font: { size: 9, color: { theme: 1 } },
        text: "แถวที่ 8-10 เป็นข้อมูลตัวอย่าง (ตัวเอียงสีเทา) — ลบทิ้งแล้วกรอกบทเรียนจริงแทนก่อนอัปโหลด",
      },
    ],
  };

  // -----------------------------------------------------------------
  // 2. Sheet Categories (สำหรับ Dropdown ในช่อง B3)
  // -----------------------------------------------------------------
  const catSheet = workbook.addWorksheet("Categories", { state: "hidden" });
  CATEGORIES.forEach((cat, index) => {
    catSheet.getCell(`A${index + 1}`).value = cat;
  });

  ws.getCell("B3").dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [`'Categories'!$A$1:$A$${CATEGORIES.length}`],
    showErrorMessage: true,
    errorTitle: "หมวดหมู่ไม่ถูกต้อง",
    error: "กรุณาเลือกหมวดหมู่จากรายการ Dropdown เท่านั้น",
  };

  // -----------------------------------------------------------------
  // 3. Export และ Trigger Download
  // -----------------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "interactedu-course-template.xlsx";
  anchor.click();
  window.URL.revokeObjectURL(url);
}