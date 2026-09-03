"use client";

import { useState, useRef, useEffect, type ChangeEvent, type FormEvent, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCourse } from "@/app/dashboard/teacher/courses/actions";
import { createClient } from "@/utils/supabase/client";
import { CATEGORIES, type Category } from "@/lib/constants/categories";
//const CATEGORIES = ["เทคโนโลยี", "ธุรกิจ", "ภาษา", "การออกแบบ", "การตลาด", "พัฒนาตนเอง", "อื่นๆ"];

type Workspace = "teacher" | "admin";

interface CourseFieldErrors {
  courseCode?: string;
  title?: string;
  customCategory?: string;
  price?: string;
}

const OFFLINE_MESSAGE = "ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบสัญญาณเน็ตแล้วลองใหม่อีกครั้ง";
const SYSTEM_ERROR_MESSAGE = "ระบบขัดข้องชั่วคราว ไม่สามารถบันทึกข้อมูลคอร์สได้ กรุณาลองใหม่อีกครั้งในภายหลัง";
// อนุญาตตัวอักษรอังกฤษ/ตัวเลข/ขีดกลาง/ขีดล่างเท่านั้น (เช่น CS101, ENG-201, WEB_01) — กันภาษาไทย/สัญลักษณ์/HTML tag หลุดเข้ามา
const COURSE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const COURSE_CODE_FORMAT_ERROR = "รหัสวิชาต้องเป็นตัวอักษรภาษาอังกฤษและตัวเลขเท่านั้น (เช่น CS101)";

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
  //const [category, setCategory] = useState(CATEGORIES[0]);
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("0");
  const [certificateEnabled, setCertificateEnabled] = useState(true);
  const [certificatePassPercentage, setCertificatePassPercentage] = useState("70");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CourseFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const courseCodeRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const customCategoryRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  // ref แบบ synchronous กันดับเบิลคลิก/กดรัวๆ ยิง request สร้างคอร์สซ้ำ (state update เป็น async)
  const isSavingRef = useRef(false);

  // แถบแจ้งเตือนด้านบนสุดของจอ: เด้งขึ้นทันทีที่เน็ตหลุด ไม่ต้องรอกดบันทึกก่อนถึงจะรู้
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  function validate(): CourseFieldErrors {
    const errors: CourseFieldErrors = {};
    const trimmedCode = courseCode.trim();
    if (!trimmedCode) {
      errors.courseCode = "กรุณากรอกรหัสวิชา";
    } else if (!COURSE_CODE_PATTERN.test(trimmedCode)) {
      errors.courseCode = COURSE_CODE_FORMAT_ERROR;
    }
    if (!title.trim()) errors.title = "กรุณากรอกชื่อคอร์ส";
    if (category === "อื่นๆ" && !customCategory.trim()) errors.customCategory = "กรุณาระบุหมวดวิชา";

    // ราคาบังคับเช็คเฉพาะตอนไม่ติ๊ก "คอร์สเรียนฟรี" — ติ๊กฟรีแล้วราคาถูก force เป็น 0 ที่ server อยู่แล้ว
    if (!isFree) {
      const trimmedPrice = price.trim();
      if (!trimmedPrice) {
        errors.price = "กรุณากรอกราคาคอร์ส หรือติ๊กเลือกคอร์สเรียนฟรี";
      } else {
        const priceNumber = Number(trimmedPrice);
        if (Number.isNaN(priceNumber)) {
          errors.price = "ราคาต้องเป็นตัวเลขเท่านั้น";
        } else if (priceNumber < 0) {
          errors.price = "ราคาต้องมากกว่าหรือเท่ากับ 0";
        }
      }
    }
    return errors;
  }

  // แปล error จาก server/เครือข่ายให้เป็นภาษาที่เข้าใจง่าย ไม่ใช้ศัพท์เทคนิค
  function toFriendlyMessage(err: unknown): string {
    if (typeof navigator !== "undefined" && !navigator.onLine) return OFFLINE_MESSAGE;

    const raw = err instanceof Error ? err.message : String(err);
    const message = raw.toLowerCase();

    // ข้อความเฉพาะที่ server action ส่งมาแล้ว (เช่น รหัสวิชาซ้ำ) ให้ผ่านตรงๆ ไม่ต้อง map ซ้ำ
    if (raw === "รหัสวิชานี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบและใช้รหัสวิชาอื่น") return raw;
    if (raw === SYSTEM_ERROR_MESSAGE) return raw;

    if (message.includes("failed to fetch") || message.includes("network")) return OFFLINE_MESSAGE;
    if (message.includes("timeout") || message.includes("timed out")) return SYSTEM_ERROR_MESSAGE;

    // ข้อความจาก validation ของ server action (เช่น "กรุณาใส่ชื่อคอร์ส") ยังอ่านง่ายอยู่แล้ว ปล่อยผ่าน
    return raw || SYSTEM_ERROR_MESSAGE;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // กันดับเบิลคลิก/กดรัวๆ ยิง request ซ้ำ — เช็ค ref แบบ synchronous ก่อนแม้แต่จะ setState
    if (isSavingRef.current) return;

    setError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(OFFLINE_MESSAGE);
      return;
    }

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // auto-focus ไปช่องแรกสุดที่มีปัญหาตามลำดับในฟอร์ม
      if (errors.courseCode) courseCodeRef.current?.focus();
      else if (errors.title) titleRef.current?.focus();
      else if (errors.customCategory) customCategoryRef.current?.focus();
      else if (errors.price) priceRef.current?.focus();
      return;
    }

    setFieldErrors({});
    const finalCategory = category === "อื่นๆ" ? customCategory.trim() : category;
    isSavingRef.current = true;
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

      if (result.error || !result.courseId) throw new Error(result.error ?? SYSTEM_ERROR_MESSAGE);
      router.push(`${basePath}/courses/${result.courseId}`);
    } catch (submitError) {
      setError(toFriendlyMessage(submitError));
      isSavingRef.current = false;
      setSaving(false);
      setSavingStep(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {isOffline && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-red-600 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg"
        >
          คุณกำลังออฟไลน์ ข้อมูลอาจไม่ถูกบันทึก
        </div>
      )}
      <div className="mb-6">
        <Link href={`${basePath}/courses`} className="mb-2 inline-block text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D]">
          ← กลับหน้าคอร์ส
        </Link>
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">สร้างคอร์สใหม่</h1>
        <p className="mt-1.5 text-[14px] text-[#0F1B3D]/50">ตั้งค่าคอร์สและเกณฑ์ใบรับรอง จากนั้นเพิ่มบทเรียนและบททดสอบท้ายคอร์ส</p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-lg border border-[#FF5A3C]/20 bg-[#FF5A3C]/[0.08] px-4 py-3 text-[13px] text-[#EB4A2D]">{error}</div>}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <SectionCard title="ข้อมูลพื้นฐาน">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>รหัสวิชา <span className="text-red-500">*</span></span>
              <input
                ref={courseCodeRef}
                required
                value={courseCode}
                onChange={(event) => {
                  // แปลงเป็นตัวพิมพ์ใหญ่ให้อัตโนมัติตามมาตรฐานรหัสวิชา (react-2026 -> REACT-2026)
                  setCourseCode(event.target.value.toUpperCase());
                  setFieldErrors((prev) => (prev.courseCode ? { ...prev, courseCode: undefined } : prev));
                }}
                placeholder="เช่น WEB101"
                aria-invalid={!!fieldErrors.courseCode}
                aria-describedby={fieldErrors.courseCode ? "courseCode-error" : undefined}
                className={`${inputClass} ${fieldErrors.courseCode ? "!border-red-400 focus:!border-red-500" : ""}`}
              />
              {fieldErrors.courseCode && (
                <p id="courseCode-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">{fieldErrors.courseCode}</p>
              )}
            </label>

            <label>
              <span className={labelClass}>หมวดวิชา</span>
              <select
                value={category}
                onChange={(event) => {
                  const next = event.target.value as Category;
                  setCategory(next);
                  // TC-CC-10: สลับออกจาก "อื่นๆ" แล้วต้องเคลียร์ค่า/error ของช่อง "ระบุหมวดวิชา" ทันที
                  if (next !== "อื่นๆ") {
                    setCustomCategory("");
                    setFieldErrors((prev) => (prev.customCategory ? { ...prev, customCategory: undefined } : prev));
                  }
                }}
                className={inputClass}
              >
                {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {category === "อื่นๆ" && (
            <label className="mt-4 block">
              <span className={labelClass}>ระบุหมวดวิชา <span className="text-red-500">*</span></span>
              <input
                ref={customCategoryRef}
                required
                value={customCategory}
                onChange={(event) => {
                  setCustomCategory(event.target.value);
                  setFieldErrors((prev) => (prev.customCategory ? { ...prev, customCategory: undefined } : prev));
                }}
                aria-invalid={!!fieldErrors.customCategory}
                aria-describedby={fieldErrors.customCategory ? "customCategory-error" : undefined}
                className={`${inputClass} ${fieldErrors.customCategory ? "!border-red-400 focus:!border-red-500" : ""}`}
              />
              {fieldErrors.customCategory && (
                <p id="customCategory-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">{fieldErrors.customCategory}</p>
              )}
            </label>
          )}
          <label className="mt-4 block">
            <span className={labelClass}>ชื่อคอร์ส <span className="text-red-500">*</span></span>
            <input
              ref={titleRef}
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setFieldErrors((prev) => (prev.title ? { ...prev, title: undefined } : prev));
              }}
              placeholder="เช่น พื้นฐาน React สำหรับผู้เริ่มต้น"
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? "title-error" : undefined}
              className={`${inputClass} ${fieldErrors.title ? "!border-red-400 focus:!border-red-500" : ""}`}
            />
            {fieldErrors.title && (
              <p id="title-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">{fieldErrors.title}</p>
            )}
          </label>
          <label className="mt-4 block"><span className={labelClass}>คำอธิบาย</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={inputClass} /></label>
        </SectionCard>

        <SectionCard title="บททดสอบท้ายคอร์สและใบรับรอง" subtitle="ใบรับรองจะออกอัตโนมัติเมื่อเรียนครบและผ่านบททดสอบท้ายคอร์ส">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={certificateEnabled} onChange={(event) => setCertificateEnabled(event.target.checked)} className="h-4 w-4 accent-[#FF5A3C]" />
            <span className="text-[13.5px] font-semibold text-[#0F1B3D]/70">เปิดใช้งานใบรับรองสำหรับคอร์สนี้</span>
          </label>
          <label className="mt-4 block max-w-xs"><span className={labelClass}>คะแนนผ่านบททดสอบ (%)</span><input type="number" min={0} max={100} step="0.01" required value={certificatePassPercentage} onChange={(event) => setCertificatePassPercentage(event.target.value)} className={inputClass} /></label>
        </SectionCard>

        <SectionCard title="ราคา">
          <label className="mb-3 flex w-fit cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsFree(checked);
                // ติ๊กฟรีแล้วช่องราคาจะถูกซ่อน/ไม่เกี่ยวข้องอีกต่อไป เคลียร์ error ค้างทิ้งด้วย
                if (checked) setFieldErrors((prev) => (prev.price ? { ...prev, price: undefined } : prev));
              }}
              className="h-4 w-4 accent-[#0F1B3D]"
            />
            <span className="text-[13.5px] font-medium text-[#0F1B3D]/70">คอร์สเรียนฟรี</span>
          </label>
          {!isFree && (
            <label className="block max-w-xs">
              <span className={labelClass}>ราคา (บาท) <span className="text-red-500">*</span></span>
              <input
                ref={priceRef}
                type="number"
                min={0}
                step="1"
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setFieldErrors((prev) => (prev.price ? { ...prev, price: undefined } : prev));
                }}
                aria-invalid={!!fieldErrors.price}
                aria-describedby={fieldErrors.price ? "price-error" : undefined}
                className={`${inputClass} ${fieldErrors.price ? "!border-red-400 focus:!border-red-500" : ""}`}
              />
              {fieldErrors.price && (
                <p id="price-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">{fieldErrors.price}</p>
              )}
            </label>
          )}
        </SectionCard>

        <SectionCard title="ปกคอร์ส" subtitle="แนะนำอัตราส่วน 16:9">
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
