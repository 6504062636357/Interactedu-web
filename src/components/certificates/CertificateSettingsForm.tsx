"use client";

import { useState } from "react";

interface CertificateSettingsFormProps {
  courseId: string;
  initialEnabled: boolean;
  initialPassPercentage: number;
  initialTitle: string | null;
  initialDescription?: string | null;
}

export default function CertificateSettingsForm({
  courseId,
  initialEnabled,
  initialPassPercentage,
  initialTitle,
  initialDescription = null,
}: CertificateSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [passPercentage, setPassPercentage] = useState(String(initialPassPercentage));
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveSettings() {
    const numericPassPercentage = Number(passPercentage);
    setError(null);
    setMessage(null);
    if (!Number.isFinite(numericPassPercentage) || numericPassPercentage < 0 || numericPassPercentage > 100) {
      setError("คะแนนผ่านต้องอยู่ระหว่าง 0 ถึง 100");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/courses/${courseId}/certificate-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, passPercentage: numericPassPercentage, title, description }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "บันทึกการตั้งค่าไม่สำเร็จ");
      setMessage("บันทึกการตั้งค่า Certificate แล้ว");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#0F1B3D]/[0.08] bg-white p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Certificate Settings</p>
        <h2 className="mt-1 text-[18px] font-extrabold text-[#0F1B3D]">ตั้งค่าใบรับรองหลักสูตร</h2>
        <p className="mt-1 text-[12.5px] text-[#0F1B3D]/50">
          ระบบจะออกใบรับรองเมื่อผู้เรียนจบทุกบทและคะแนนบททดสอบท้ายคอร์สถึงเกณฑ์นี้
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl bg-[#F7F8FA] px-4 py-3">
        <span>
          <span className="block text-[13.5px] font-bold text-[#0F1B3D]">เปิดใช้งาน Certificate</span>
          <span className="block text-[11.5px] text-[#0F1B3D]/45">ปิดเพื่อระงับการออกใบใหม่สำหรับคอร์สนี้</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-5 w-5 accent-[#FF5A3C]"
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold text-[#0F1B3D]/70">Passing Score (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={passPercentage}
            onChange={(event) => setPassPercentage(event.target.value)}
            className="w-full rounded-xl border border-[#0F1B3D]/10 px-3.5 py-2.5 text-[13.5px] text-[#0F1B3D] outline-none focus:border-[#FF5A3C]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold text-[#0F1B3D]/70">Certificate Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Certificate of Completion"
            className="w-full rounded-xl border border-[#0F1B3D]/10 px-3.5 py-2.5 text-[13.5px] text-[#0F1B3D] outline-none focus:border-[#FF5A3C]"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[12px] font-bold text-[#0F1B3D]/70">Description (optional)</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="w-full resize-none rounded-xl border border-[#0F1B3D]/10 px-3.5 py-2.5 text-[13.5px] text-[#0F1B3D] outline-none focus:border-[#FF5A3C]"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={saveSettings}
          className="rounded-full bg-[#0F1B3D] px-5 py-2.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
        {message && <p className="text-[12.5px] font-semibold text-emerald-600" aria-live="polite">{message}</p>}
        {error && <p className="text-[12.5px] font-semibold text-red-600" role="alert">{error}</p>}
      </div>
    </section>
  );
}
