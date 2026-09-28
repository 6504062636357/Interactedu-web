"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import CourseOverview, { type CourseOverviewDetails } from "./CourseOverview";

interface AdminCourseDetailsFormProps {
  courseId: string;
  initialTitle: string;
  initialCourseCode: string | null;
  initialCategory: string | null;
  initialDescription: string | null;
  initialPrice: number;
  initialCoverImageUrl: string | null;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#3157D5] focus:bg-white";
const labelClass = "mb-1.5 block text-xs font-bold text-slate-600";

export default function AdminCourseDetailsForm({
  courseId,
  initialTitle,
  initialCourseCode,
  initialCategory,
  initialDescription,
  initialPrice,
  initialCoverImageUrl,
}: AdminCourseDetailsFormProps): ReactElement {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [savedDetails, setSavedDetails] = useState<CourseOverviewDetails>({
    title: initialTitle,
    courseCode: initialCourseCode,
    category: initialCategory,
    description: initialDescription,
    price: initialPrice,
    coverImageUrl: initialCoverImageUrl,
  });
  const [title, setTitle] = useState(initialTitle);
  const [courseCode, setCourseCode] = useState(initialCourseCode ?? "");
  const [category, setCategory] = useState(initialCategory ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [isFree, setIsFree] = useState(initialPrice === 0);
  const [price, setPrice] = useState(String(initialPrice));
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initialCoverImageUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialCoverImageUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  function toggleEditing() {
    if (editing) {
      setTitle(savedDetails.title);
      setCourseCode(savedDetails.courseCode ?? "");
      setCategory(savedDetails.category ?? "");
      setDescription(savedDetails.description ?? "");
      setIsFree(savedDetails.price === 0);
      setPrice(String(savedDetails.price));
      setCoverImageUrl(savedDetails.coverImageUrl);
      setCoverFile(null);
      setCoverPreview(savedDetails.coverImageUrl);
    }
    setEditing(!editing);
    setError(null);
    setSuccess(null);
  }

  function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("รูปปกต้องมีขนาดไม่เกิน 5 MB");
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  function removeCover() {
    setCoverFile(null);
    setCoverImageUrl(null);
    setCoverPreview(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    // ราคาขั้นต่ำ 20 บาท เช็คก่อนยิง request เหมือนฟิลด์อื่นๆ ในฟอร์มนี้ (ยกเว้นติ๊กคอร์สเรียนฟรี)
    if (!isFree && Number(price) < 20) {
      setError("ราคาคอร์สขั้นต่ำ 20 บาท");
      return;
    }

    setSaving(true);

    try {
      let nextCoverUrl = coverImageUrl;
      if (coverFile) {
        const extension = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${courseId}/${crypto.randomUUID()}.${extension}`;
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("course-covers")
          .upload(path, coverFile, { contentType: coverFile.type, upsert: false });
        if (uploadError) throw new Error(`อัปโหลดรูปปกไม่สำเร็จ: ${uploadError.message}`);
        nextCoverUrl = supabase.storage.from("course-covers").getPublicUrl(path).data.publicUrl;
      }

      const response = await fetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          courseCode,
          category,
          description,
          price: isFree ? 0 : Number(price),
          coverImageUrl: nextCoverUrl,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        course?: {
          title: string;
          course_code: string;
          category: string;
          description: string | null;
          price: number;
          cover_image_url: string | null;
        };
      };
      if (!response.ok || !result.course) throw new Error(result.error ?? "บันทึกข้อมูลคอร์สไม่สำเร็จ");

      const updated = result.course;
      setSavedDetails({
        title: updated.title,
        courseCode: updated.course_code,
        category: updated.category,
        description: updated.description,
        price: Number(updated.price),
        coverImageUrl: updated.cover_image_url,
      });
      setTitle(updated.title);
      setCourseCode(updated.course_code);
      setCategory(updated.category);
      setDescription(updated.description ?? "");
      setPrice(String(updated.price));
      setIsFree(Number(updated.price) === 0);
      setCoverImageUrl(updated.cover_image_url);
      setCoverFile(null);
      setCoverPreview(updated.cover_image_url);
      setSuccess("บันทึกข้อมูลคอร์สแล้ว");
      setEditing(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-7 rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-[#0F1B3D]">ข้อมูลหลักของคอร์ส</h2>
          <p className="mt-0.5 text-xs text-slate-400">ชื่อ รหัส หมวด คำอธิบาย ราคา และรูปปก</p>
        </div>
        <button
          type="button"
          onClick={toggleEditing}
          className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-[#3157D5] hover:bg-slate-50"
        >
          {editing ? "ยกเลิก" : "แก้ไขข้อมูล"}
        </button>
      </div>

      {success && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!editing && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <CourseOverview {...savedDetails} />
        </div>
      )}

      {editing && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>ชื่อคอร์ส</span>
              <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className={labelClass}>รหัสคอร์ส</span>
              <input required maxLength={50} value={courseCode} onChange={(event) => setCourseCode(event.target.value)} className={inputClass} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClass}>หมวดวิชา</span>
              <input required maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass} />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>คำอธิบาย</span>
            <textarea maxLength={5_000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
          </label>

          <div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-600">
              <input type="checkbox" checked={isFree} onChange={(event) => setIsFree(event.target.checked)} className="h-4 w-4 accent-[#3157D5]" />
              คอร์สเรียนฟรี
            </label>
            {!isFree && (
              <label className="mt-3 block max-w-xs">
                <span className={labelClass}>ราคา (บาท)</span>
                <input type="number" min={0} max={10_000_000} step="1" required value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} />
              </label>
            )}
          </div>

          <div>
            <span className={labelClass}>รูปปกคอร์ส</span>
            <div className="flex flex-wrap items-center gap-4">
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="ตัวอย่างรูปปกคอร์ส" className="h-24 w-40 rounded-xl border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-24 w-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">ไม่มีรูปปก</div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
                  เลือกรูปใหม่
                  <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
                </label>
                {coverPreview && <button type="button" onClick={removeCover} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50">ลบรูปปก</button>}
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="rounded-full bg-[#0F1B3D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </form>
      )}
    </section>
  );
}
