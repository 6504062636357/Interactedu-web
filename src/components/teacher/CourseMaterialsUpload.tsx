// components/teacher/CourseMaterialsUpload.tsx
"use client";

import { useState, type ChangeEvent, type ReactElement } from "react";
import { createClient } from "@/utils/supabase/client";

interface MaterialItem {
  id: string;
  file_name: string;
  file_url: string;
}

interface CourseMaterialsUploadProps {
  courseId: string;
  initialMaterials: MaterialItem[];
}

export default function CourseMaterialsUpload({
  courseId,
  initialMaterials,
}: CourseMaterialsUploadProps): ReactElement {
  const [materials, setMaterials] = useState<MaterialItem[]>(initialMaterials);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const res = await fetch("/api/materials/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          fileName: file.name,
          fileType: file.type,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(
          body?.error === "forbidden"
            ? "คุณไม่มีสิทธิ์อัปโหลดเอกสารในคอร์สนี้"
            : "ไม่สามารถขอลิงก์อัปโหลดได้"
        );
        return;
      }

      const { uploadUrl, key, publicUrl } = await res.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putRes.ok) {
        setError("อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      const supabase = createClient();
      const { data: inserted, error: insertError } = await supabase
        .from("course_materials")
        .insert({
          course_id: courseId,
          file_name: file.name,
          file_url: publicUrl,
          file_key: key,
          file_type: file.type,
          file_size_bytes: file.size,
          order_index: materials.length,
        })
        .select("id, file_name, file_url")
        .single();

      if (insertError || !inserted) {
        setError("อัปโหลดไฟล์สำเร็จ แต่บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      setMaterials((prev) => [...prev, inserted]);
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async (materialId: string): Promise<void> => {
    const prevMaterials = materials;
    setMaterials((prev) => prev.filter((m) => m.id !== materialId));
    setError(null);

    try {
      const res = await fetch("/api/materials/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId }),
      });

      if (!res.ok) {
        setMaterials(prevMaterials);
        setError("ลบเอกสารไม่สำเร็จ กรุณาลองใหม่");
      }
    } catch {
      setMaterials(prevMaterials);
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    }
  };

  return (
    <div className="mb-8">
      <label className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-2">
        เอกสารประกอบการเรียน (PDF, สไลด์, ฯลฯ)
      </label>

      <input
        type="file"
        accept=".pdf,.ppt,.pptx,.doc,.docx"
        onChange={handleFileChange}
        disabled={uploading}
        className="w-full text-[13.5px] text-[#0F1B3D]/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-[13px] file:font-bold file:bg-[#0F1B3D]/[0.06] file:text-[#0F1B3D] hover:file:bg-[#0F1B3D]/10"
      />

      {uploading && (
        <p className="mt-2 text-[13px] text-[#0F1B3D]/50 font-medium">กำลังอัปโหลด...</p>
      )}

      {error && (
        <p className="mt-2 text-[13px] font-semibold text-[#EB4A2D]">{error}</p>
      )}

      {materials.length > 0 && (
        <ul className="mt-4 space-y-2">
          {materials.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between bg-[#F7F8FA] rounded-xl px-4 py-2.5"
            >
              <a
                href={m.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13.5px] font-semibold text-[#0F1B3D] hover:text-[#FF5A3C] truncate"
              >
                {m.file_name}
              </a>
              <button
                type="button"
                onClick={() => handleRemove(m.id)}
                className="text-[12px] font-bold text-[#0F1B3D]/30 hover:text-[#EB4A2D] shrink-0 ml-3"
              >
                ลบ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}