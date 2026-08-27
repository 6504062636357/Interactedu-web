// app/dashboard/teacher/courses/import/page.tsx
"use client";

import { useState, type ReactElement } from "react";
import ExcelImportUpload from "@/components/teacher/ExcelImportUpload";
import ExcelImportPreview from "@/components/teacher/ExcelImportPreview";
import ExcelImportResult from "@/components/teacher/ExcelImportResult";
import type {
  ImportCourseMeta,
  ImportLessonRow,
  ImportLessonsResult,
} from "@/app/dashboard/teacher/courses/import/actions";

type Step = "upload" | "preview" | "result";

export default function ImportCoursePage(): ReactElement {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<{ course: ImportCourseMeta; rows: ImportLessonRow[] } | null>(null);
  const [result, setResult] = useState<ImportLessonsResult | null>(null);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-[20px] font-bold text-[#0F1B3D]">นำเข้าคอร์สจากไฟล์ Excel</h1>

      {step === "upload" && (
        <ExcelImportUpload
          onParsed={(data) => {
            setParsed(data);
            setStep("preview");
          }}
        />
      )}

      {step === "preview" && parsed && (
        <ExcelImportPreview
          course={parsed.course}
          rows={parsed.rows}
          onCancel={() => {
            setParsed(null);
            setStep("upload");
          }}
          onImported={(res) => {
            setResult(res);
            setStep("result");
          }}
        />
      )}

      {step === "result" && result && (
        <ExcelImportResult
          result={result}
          onImportAnother={() => {
            setParsed(null);
            setResult(null);
            setStep("upload");
          }}
        />
      )}
    </div>
  );
}