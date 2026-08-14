"use client";

import { useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";

interface AdminUserProfileFormProps {
  userId: string;
  initialFullName: string | null;
  initialPhone: string | null;
  initialUniversity: string | null;
  initialFaculty: string | null;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#3157D5] focus:bg-white";
const labelClass = "mb-1.5 block text-xs font-bold text-slate-600";

export default function AdminUserProfileForm({
  userId,
  initialFullName,
  initialPhone,
  initialUniversity,
  initialFaculty,
}: AdminUserProfileFormProps): ReactElement {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [university, setUniversity] = useState(initialUniversity ?? "");
  const [faculty, setFaculty] = useState(initialFaculty ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, university, faculty }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกข้อมูลผู้ใช้ไม่สำเร็จ");

      setSuccess("บันทึกข้อมูลผู้ใช้แล้ว");
      setEditing(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-[#0F1B3D]">ข้อมูลโปรไฟล์</h2>
          <p className="mt-0.5 text-xs text-slate-400">ชื่อ เบอร์โทร มหาวิทยาลัย และคณะ/สาขา</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing((value) => !value);
            setError(null);
            setSuccess(null);
          }}
          className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-[#3157D5] hover:bg-slate-50"
        >
          {editing ? "ยกเลิก" : "แก้ไขข้อมูล"}
        </button>
      </div>

      {success && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {editing && (
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={labelClass}>ชื่อ-นามสกุล</span>
            <input required maxLength={150} value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>เบอร์โทร</span>
            <input maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>มหาวิทยาลัย</span>
            <input maxLength={200} value={university} onChange={(event) => setUniversity(event.target.value)} className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>คณะ/สาขา</span>
            <input maxLength={200} value={faculty} onChange={(event) => setFaculty(event.target.value)} className={inputClass} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-full bg-[#0F1B3D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
