"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCourse } from "@/app/dashboard/teacher/courses/actions";
import { createClient } from "@/utils/supabase/client";

const CATEGORIES = ["เทคโนโลยี", "ธุรกิจ", "ภาษา", "การออกแบบ", "การตลาด", "พัฒนาตนเอง", "อื่นๆ"];

type Workspace = "teacher" | "admin";

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#0F1B3D]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(15,27,61,0.04)]">
      <h2 className="text-[14.5px] font-bold text-[#0F1B3D]">{title}</h2>
      {subtitle ? <p className="mb-4 mt-0.5 text-[12.5px] text-[#0F1B3D]/40">{subtitle}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-[#0F1B3D]/[0.08] bg-[#F7F8FA] px-3.5 py-2.5 text-[13.5px] text-[#0F1B3D] outline-none transition-colors placeholder:text-[#0F1B3D]/30 focus:border-[#0F1B3D]/30 focus:bg-white";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#0F1B3D]/70";

export default function CourseCreateForm({ workspace }: { workspace: Workspace }): ReactElement {
  const router = useRouter();
  const supabase = createClient();
  const basePath = `/dashboard/${workspace}`;

  const [courseCode, setCourseCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("0");
  const [certificateEnabled, setCertificateEnabled] = useState(true);
  const [certificatePassPercentage, setCertificatePassPercentage] = useState("70");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);

  function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const finalCategory = category === "อื่นๆ" ? customCategory.trim() : category;
    setSaving(true);

    try {
      let coverImageUrl: string | null = null;
      if (coverFile) {
        setSavingStep("กำลังอัปโหลดปกคอร์ส...");
        const extension = coverFile.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("course-covers").upload(path, coverFile);
        if (uploadError) throw new Error(`อัปโหลดปกคอร์สไม่สำเร็จ: ${uploadError.message}`);
        coverImageUrl = supabase.storage.from("course-covers").getPublicUrl(path).data.publicUrl;
      }

      setSavingStep("กำลังสร้างคอร์ส...");
      const result = await createCourse({
        title,
        courseCode,
        category: finalCategory,
        description: description || null,
        isFree,
        price: Number(price),
        coverImageUrl,
        certificateEnabled,
        certificatePassPercentage: Number(certificatePassPercentage),
      });

      if (result.error || !result.courseId) throw new Error(result.error ?? "สร้างคอร์สไม่สำเร็จ");
      router.push(`${basePath}/courses/${result.courseId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
      setSaving(false);
      setSavingStep(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`${basePath}/courses`} className="mb-2 inline-block text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D]">
          ← กลับหน้าคอร์ส
        </Link>
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">สร้างคอร์สใหม่</h1>
        <p className="mt-1.5 text-[14px] text-[#0F1B3D]/50">ตั้งค่าคอร์สและเกณฑ์ใบรับรอง จากนั้นเพิ่มบทเรียนและบททดสอบท้ายคอร์ส</p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-lg border border-[#FF5A3C]/20 bg-[#FF5A3C]/[0.08] px-4 py-3 text-[13px] text-[#EB4A2D]">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <SectionCard title="ข้อมูลพื้นฐาน">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className={labelClass}>รหัสวิชา</span><input required value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="เช่น WEB101" className={inputClass} /></label>
            <label><span className={labelClass}>หมวดวิชา</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          {category === "อื่นๆ" && <label className="mt-4 block"><span className={labelClass}>ระบุหมวดวิชา</span><input required value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} className={inputClass} /></label>}
          <label className="mt-4 block"><span className={labelClass}>ชื่อคอร์ส</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น พื้นฐาน React สำหรับผู้เริ่มต้น" className={inputClass} /></label>
          <label className="mt-4 block"><span className={labelClass}>คำอธิบาย (ไม่บังคับ)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={inputClass} /></label>
        </SectionCard>

        <SectionCard title="บททดสอบท้ายคอร์สและใบรับรอง" subtitle="ใบรับรองจะออกอัตโนมัติเมื่อเรียนครบและผ่านบททดสอบท้ายคอร์ส">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={certificateEnabled} onChange={(event) => setCertificateEnabled(event.target.checked)} className="h-4 w-4 accent-[#FF5A3C]" />
            <span className="text-[13.5px] font-semibold text-[#0F1B3D]/70">เปิดใช้งานใบรับรองสำหรับคอร์สนี้</span>
          </label>
          <label className="mt-4 block max-w-xs"><span className={labelClass}>คะแนนผ่านบททดสอบ (%)</span><input type="number" min={0} max={100} step="0.01" required value={certificatePassPercentage} onChange={(event) => setCertificatePassPercentage(event.target.value)} className={inputClass} /></label>
        </SectionCard>

        <SectionCard title="ราคา">
          <label className="mb-3 flex w-fit cursor-pointer items-center gap-2"><input type="checkbox" checked={isFree} onChange={(event) => setIsFree(event.target.checked)} className="h-4 w-4 accent-[#0F1B3D]" /><span className="text-[13.5px] font-medium text-[#0F1B3D]/70">คอร์สเรียนฟรี</span></label>
          {!isFree && <label className="block max-w-xs"><span className={labelClass}>ราคา (บาท)</span><input type="number" min={0} step="1" value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} /></label>}
        </SectionCard>

        <SectionCard title="ปกคอร์ส" subtitle="ไม่บังคับ · แนะนำอัตราส่วน 16:9">
          <div className="flex items-center gap-4">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="ตัวอย่างปกคอร์ส" className="h-20 w-32 rounded-lg border border-[#0F1B3D]/[0.08] object-cover" />
            ) : <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-[#0F1B3D]/20 bg-[#F7F8FA] text-[11px] text-[#0F1B3D]/30">ไม่มีรูป</div>}
            <label className="cursor-pointer rounded-lg bg-[#0F1B3D]/[0.06] px-4 py-2 text-[13px] font-semibold text-[#0F1B3D]/70 hover:bg-[#0F1B3D]/10">เลือกรูปภาพ<input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" /></label>
          </div>
        </SectionCard>

        <button type="submit" disabled={saving} className="w-full rounded-full bg-[#0F1B3D] py-4 text-[15px] font-bold text-white transition-colors hover:bg-[#182852] disabled:opacity-60">
          {saving ? savingStep ?? "กำลังบันทึก..." : "สร้างคอร์ส แล้วไปจัดการเนื้อหา →"}
        </button>
      </form>
    </div>
  );
}
