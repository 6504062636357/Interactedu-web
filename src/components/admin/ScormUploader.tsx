// components/admin/ScormUploader.tsx
'use client';
import { useRef, useState, type ChangeEvent } from 'react';

const ZIP_EXTENSIONS = ['.zip'];
const ZIP_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
];

export function ScormUploader({
  courseId,
  lessonId,
  onSuccess,
}: {
  courseId: string;
  lessonId: string;
  onSuccess?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function isZipFile(file: File): boolean {
    const nameOk = ZIP_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
    // บาง browser/OS ให้ file.type ว่างเปล่าสำหรับ .zip ได้ ดังนั้นเช็คนามสกุลไฟล์เป็นหลัก
    // แล้วเช็ค MIME type เสริมเฉพาะกรณีที่มันไม่ว่าง
    const typeOk = file.type === '' || ZIP_MIME_TYPES.includes(file.type);
    return nameOk && typeOk;
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isZipFile(file)) {
      setError('กรุณาอัปโหลดไฟล์ .zip เท่านั้น');
      setFileName(null);
      e.target.value = '';
      return;
    }

    setFileName(file.name);
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseId', courseId);
    formData.append('lessonId', lessonId);

    try {
      const res = await fetch('/api/admin/scorm-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'อัปโหลดไม่สำเร็จ');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      e.target.value = ''; // เคลียร์ input เผื่ออัปโหลดไฟล์ชื่อเดิมซ้ำ
    }
  }

  return (
    <div className="space-y-2.5">
      <label
        className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
          uploading
            ? 'border-blue-200 bg-blue-50/60 cursor-not-allowed'
            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
        }`}
      >
        <div className="w-9 h-9 rounded-lg bg-blue-950 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-slate-700">
            {uploading ? 'กำลังอัปโหลดและแตกไฟล์...' : fileName ?? 'เลือกไฟล์ SCORM (.zip)'}
          </p>
          <p className="text-[12px] text-slate-400">คลิกเพื่อเลือกไฟล์ .zip จากเครื่อง</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed,application/x-zip"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {uploading && (
        <div className="flex items-center gap-2 text-[12.5px] text-blue-950 font-medium">
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
            <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          กำลังอัปโหลดและแตกไฟล์...
        </div>
      )}

      {error && (
        <p className="text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}