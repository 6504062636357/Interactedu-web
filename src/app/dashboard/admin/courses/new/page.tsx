'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import LogoutButton from '@/components/LogoutButton';

const CATEGORIES = [
  'เทคโนโลยี',
  'ธุรกิจ',
  'ภาษา',
  'การออกแบบ',
  'การตลาด',
  'พัฒนาตนเอง',
  'อื่นๆ',
];

const sidebarLinks = [
  { label: 'ภาพรวมระบบ', href: '/dashboard/admin', active: false },
  { label: 'จัดการผู้ใช้', href: '/dashboard/admin/users', active: false },
  { label: 'จัดการคอร์ส', href: '/dashboard/admin/courses', active: true },
  { label: 'รายงาน', href: '/dashboard/admin/reports', active: false },
  { label: 'ตั้งค่าระบบ', href: '/dashboard/admin/settings', active: false },
];

function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

type MaterialFile = {
  file: File;
  id: string;
};

function SidebarLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
        active ? 'bg-blue-950 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </Link>
  );
}

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
    <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-6">
      <h2 className="text-[14.5px] font-bold text-blue-950">{title}</h2>
      {subtitle && <p className="text-[12.5px] text-slate-400 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

const inputClass =
  'w-full px-3.5 py-2.5 text-[13.5px] bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-950 focus:bg-white transition-colors';
const labelClass = 'block text-[13px] font-semibold text-slate-600 mb-1.5';

export default function NewCoursePage() {
  const router = useRouter();
  const supabase = createClient();

  const [courseCode, setCourseCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');

  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState('0');

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [materials, setMaterials] = useState<MaterialFile[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);

  function handleCoverChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  function handleMaterialsChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const items = files.map((file) => ({ file, id: crypto.randomUUID() }));
    setMaterials((prev) => [...prev, ...items]);
    e.target.value = '';
  }

  function removeMaterial(id: string) {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('กรุณากรอกชื่อคอร์ส');
      return;
    }
    if (!courseCode.trim()) {
      setError('กรุณากรอกรหัสวิชา');
      return;
    }

    const finalCategory = category === 'อื่นๆ' ? customCategory.trim() : category;
    if (!finalCategory) {
      setError('กรุณาระบุหมวดวิชา');
      return;
    }

    const priceValue = isFree ? 0 : Number(price);
    if (Number.isNaN(priceValue) || priceValue < 0) {
      setError('ราคาต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0');
      return;
    }

    setSaving(true);

    try {
      let coverImageUrl: string | null = null;
      if (coverFile) {
        setSavingStep('กำลังอัปโหลดปกคอร์ส...');
        const ext = coverFile.name.split('.').pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('course-covers')
          .upload(path, coverFile);
        if (uploadError) throw new Error(`อัปโหลดปกคอร์สไม่สำเร็จ: ${uploadError.message}`);
        const { data: publicUrlData } = supabase.storage.from('course-covers').getPublicUrl(path);
        coverImageUrl = publicUrlData.publicUrl;
      }

      setSavingStep('กำลังสร้างคอร์ส...');
      const slug = `${slugify(courseCode)}-${Date.now().toString(36)}`;
      const { data: course, error: insertError } = await supabase
        .from('courses')
        .insert({
          title,
          slug,
          description: description || null,
          category: finalCategory,
          price: priceValue,
          cover_image_url: coverImageUrl,
          course_code: courseCode.trim().toUpperCase(),
        })
        .select('id')
        .single();

      if (insertError) throw new Error(insertError.message);

      if (materials.length > 0) {
        for (let i = 0; i < materials.length; i++) {
          const { file } = materials[i];
          setSavingStep(`กำลังอัปโหลดเอกสาร (${i + 1}/${materials.length})...`);
          const path = `${course.id}/${crypto.randomUUID()}-${file.name}`;
          const { error: matUploadError } = await supabase.storage
            .from('course-materials')
            .upload(path, file);
          if (matUploadError) {
            throw new Error(`อัปโหลดเอกสาร "${file.name}" ไม่สำเร็จ: ${matUploadError.message}`);
          }
          const { data: matUrlData } = supabase.storage
            .from('course-materials')
            .getPublicUrl(path);

          const { error: matInsertError } = await supabase.from('course_materials').insert({
            course_id: course.id,
            file_name: file.name,
            file_url: matUrlData.publicUrl,
            file_type: file.type || null,
            file_size_bytes: file.size,
            order_index: i,
          });
          if (matInsertError) throw new Error(matInsertError.message);
        }
      }

      router.push(`/dashboard/admin/courses/${course.id}/lessons`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
      setSaving(false);
      setSavingStep(null);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-slate-100 px-4 py-6">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[15.5px] font-bold text-blue-950">Interact Edu</span>
        </div>
        <nav className="space-y-1">
          {sidebarLinks.map((l) => (
            <SidebarLink key={l.label} {...l} />
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-[13px] font-bold text-slate-700">
              A
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-slate-800 truncate">Admin</p>
              <p className="text-[12px] text-slate-400">Administrator</p>
            </div>
          </div>
          <div className="mt-3 px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10 max-w-3xl">
        <div className="mb-6">
          <Link
            href="/dashboard/admin/courses"
            className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-600 mb-2 inline-block"
          >
            ← กลับหน้าจัดการคอร์ส
          </Link>
          <h1 className="text-[26px] font-bold text-blue-950 tracking-[-0.01em]">สร้างคอร์สใหม่</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500">
            กรอกข้อมูลหลักของคอร์ส แล้วไปเพิ่มบทเรียน/วิดีโอในขั้นตอนถัดไป
          </p>
        </div>

        {error && (
          <div className="mb-5 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
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
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {category === 'อื่นๆ' && (
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
                className="accent-blue-950 w-4 h-4"
              />
              <span className="text-[13.5px] text-slate-600 font-medium">คอร์สเรียนฟรี</span>
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
                  className="w-32 h-18 object-cover rounded-lg border border-slate-200"
                />
              ) : (
                <div className="w-32 h-18 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400">
                  ไม่มีรูป
                </div>
              )}
              <label className="cursor-pointer text-[13px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
                เลือกรูปภาพ
                <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
              </label>
            </div>
          </SectionCard>

          <SectionCard title="เอกสารประกอบ" subtitle="ไม่บังคับ · ไฟล์ PDF หรือสไลด์ที่ผูกกับคอร์สนี้โดยรวม">
            <label className="inline-block cursor-pointer text-[13px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
              เลือกไฟล์
              <input
                type="file"
                multiple
                accept=".pdf,.ppt,.pptx,.doc,.docx"
                onChange={handleMaterialsChange}
                className="hidden"
              />
            </label>

            {materials.length > 0 && (
              <ul className="mt-4 space-y-2">
                {materials.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between text-[13px] bg-slate-50 border border-slate-100 rounded-lg px-3.5 py-2.5"
                  >
                    <span className="text-slate-600 truncate">{m.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeMaterial(m.id)}
                      className="text-red-600 hover:text-red-700 text-[12px] font-semibold shrink-0 ml-3"
                    >
                      ลบ
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-950 hover:bg-blue-900 text-white text-[14px] font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
          >
            {saving ? (savingStep ?? 'กำลังบันทึก...') : 'สร้างคอร์ส → ไปเพิ่มบทเรียน'}
          </button>
        </form>
      </main>
    </div>
  );
}