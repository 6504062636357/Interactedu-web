// app/teacher/courses/new/page.tsx
"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { createCourse } from "@/app/dashboard/teacher/courses/actions";

const CATEGORIES = ["เทคโนโลยี", "ธุรกิจ", "ภาษา", "การออกแบบ", "การตลาด", "พัฒนาตนเอง", "อื่นๆ"];

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#0F1B3D]/[0.06] shadow-[0_1px_2px_rgba(15,27,61,0.04)] p-6">
      <h2 className="text-[14.5px] font-bold text-[#0F1B3D]">{title}</h2>
      {subtitle && <p className="text-[12.5px] text-[#0F1B3D]/40 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

const inputClass =
  "w-full px-3.5 py-2.5 text-[13.5px] bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-lg text-[#0F1B3D] placeholder:text-[#0F1B3D]/30 outline-none focus:border-[#0F1B3D]/30 focus:bg-white transition-colors";
const labelClass = "block text-[13px] font-semibold text-[#0F1B3D]/70 mb-1.5";

export default function NewCoursePage(): ReactElement {
  const router = useRouter();
  const supabase = createClient();

  const [courseCode, setCourseCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("0");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);

  function handleCoverChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const finalCategory = category === "อื่นๆ" ? customCategory.trim() : category;
    setSaving(true);

    try {
      // ปกคอร์สยังใช้ Supabase Storage ได้ (ไฟล์เล็ก โหลดไม่บ่อยเท่าวิดีโอ)
      let coverImageUrl: string | null = null;
      if (coverFile) {
        setSavingStep("กำลังอัปโหลดปกคอร์ส...");
        const ext = coverFile.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("course-covers").upload(path, coverFile);
        if (uploadError) throw new Error(`อัปโหลดปกคอร์สไม่สำเร็จ: ${uploadError.message}`);
        const { data: publicUrlData } = supabase.storage.from("course-covers").getPublicUrl(path);
        coverImageUrl = publicUrlData.publicUrl;
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
      });

      if (result.error || !result.courseId) {
        throw new Error(result.error ?? "สร้างคอร์สไม่สำเร็จ");
      }

      router.push(`/dashboard/teacher/courses/${result.courseId}/lessons/new`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
      setSaving(false);
      setSavingStep(null);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <main className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/dashboard/teacher"
            className="text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-2 inline-block"
          >
            ← กลับหน้าพื้นที่ครูผู้สอน
          </Link>
          <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">สร้างคอร์สใหม่</h1>
          <p className="mt-1.5 text-[14px] text-[#0F1B3D]/50">
            กรอกข้อมูลพื้นฐานของคอร์สก่อน แล้วค่อยไปเพิ่มบทเรียนทีละบทในขั้นตอนถัดไป
          </p>
        </div>

        {error && (
          <div className="mb-5 text-[13px] text-[#EB4A2D] bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard title="ข้อมูลพื้นฐาน">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>รหัสวิชา</label>
                <input
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="เช่น WEB101"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>หมวดวิชา</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {category === "อื่นๆ" && (
              <div className="mt-4">
                <label className={labelClass}>ระบุหมวดวิชา</label>
                <input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="ระบุหมวดวิชา"
                  className={inputClass}
                />
              </div>
            )}

            <div className="mt-4">
              <label className={labelClass}>ชื่อคอร์ส</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น พื้นฐาน React สำหรับผู้เริ่มต้น"
                className={inputClass}
              />
            </div>

            <div className="mt-4">
              <label className={labelClass}>คำอธิบาย (ไม่บังคับ)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </div>
          </SectionCard>

          <SectionCard title="ราคา">
            <label className="flex items-center gap-2 mb-3 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="accent-[#0F1B3D] w-4 h-4"
              />
              <span className="text-[13.5px] text-[#0F1B3D]/70 font-medium">คอร์สเรียนฟรี</span>
            </label>
            {!isFree && (
              <div className="max-w-xs">
                <label className={labelClass}>ราคา (บาท)</label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard title="ปกคอร์ส" subtitle="ไม่บังคับ · แนะนำอัตราส่วน 16:9">
            <div className="flex items-center gap-4">
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPreview}
                  alt="ตัวอย่างปกคอร์ส"
                  className="w-32 h-18 object-cover rounded-lg border border-[#0F1B3D]/[0.08]"
                />
              ) : (
                <div className="w-32 h-18 rounded-lg border border-dashed border-[#0F1B3D]/20 bg-[#F7F8FA] flex items-center justify-center text-[11px] text-[#0F1B3D]/30">
                  ไม่มีรูป
                </div>
              )}
              <label className="cursor-pointer text-[13px] font-semibold text-[#0F1B3D]/70 bg-[#0F1B3D]/[0.06] hover:bg-[#0F1B3D]/10 px-4 py-2 rounded-lg transition-colors">
                เลือกรูปภาพ
                <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
              </label>
            </div>
          </SectionCard>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#0F1B3D] hover:bg-[#182852] text-white text-[15px] font-bold py-4 rounded-full transition-colors disabled:opacity-60"
          >
            {saving ? (savingStep ?? "กำลังบันทึก...") : "สร้างคอร์ส แล้วไปเพิ่มบทเรียน →"}
          </button>
        </form>
      </main>
    </div>
  );
}