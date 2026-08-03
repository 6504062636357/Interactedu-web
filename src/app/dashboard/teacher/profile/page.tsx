// app/dashboard/teacher/profile/page.tsx
"use client";

import { useEffect, useRef, useState, type ReactElement, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import { THAI_UNIVERSITIES } from "@/lib/universities";

const supabase = createClient();

interface ProfileForm {
  full_name: string;
  avatar_url: string;
  headline: string;
  bio: string;
  phone: string;
  education: string;
  university: string;
  faculty: string;
}

const EMPTY: ProfileForm = {
  full_name: "",
  avatar_url: "",
  headline: "",
  bio: "",
  phone: "",
  education: "",
  university: "",
  faculty: "",
};

export default function TeacherProfilePage(): ReactElement {
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, headline, bio, phone, education, university, faculty")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setForm({
          full_name: data.full_name ?? "",
          avatar_url: data.avatar_url ?? "",
          headline: data.headline ?? "",
          bio: data.bio ?? "",
          phone: data.phone ?? "",
          education: data.education ?? "",
          university: data.university ?? "",
          faculty: data.faculty ?? "",
        });
      }
      setIsLoading(false);
    }
    void load();
  }, []);

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "กรุณาเลือกไฟล์รูปภาพเท่านั้น" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "ไฟล์รูปต้องมีขนาดไม่เกิน 5MB" });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsUploading(false); return; }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setMessage({ type: "error", text: "อัปโหลดรูปไม่สำเร็จ: " + uploadError.message });
      setIsUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);

    setForm((f) => ({ ...f, avatar_url: publicUrlData.publicUrl }));
    setIsUploading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        avatar_url: form.avatar_url,
        headline: form.headline,
        bio: form.bio,
        phone: form.phone,
        education: form.education,
        university: form.university,
        faculty: form.faculty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "บันทึกโปรไฟล์เรียบร้อยแล้ว" });
    setIsSaving(false);
  }

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (isLoading) {
    return <p className="text-[13.5px] text-slate-400 py-8 text-center">กำลังโหลด...</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[24px] font-bold text-blue-950 mb-1">โปรไฟล์</h1>
      <p className="text-[14px] text-slate-500 mb-8">ข้อมูลนี้จะแสดงให้นักเรียนเห็นในหน้าคอร์สของคุณ</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden shrink-0 relative">
            {form.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
            )}
            {isUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">รูปโปรไฟล์</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-[12.5px] font-semibold text-blue-950 border border-slate-200 px-3.5 py-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isUploading ? "กำลังอัปโหลด..." : "เลือกรูปภาพ"}
            </button>
            <p className="text-[11px] text-slate-400 mt-1">JPG, PNG ขนาดไม่เกิน 5MB</p>
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">ชื่อ-นามสกุล</label>
          <input
            type="text"
            required
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">ตำแหน่ง/ความเชี่ยวชาญ</label>
          <input
            type="text"
            value={form.headline}
            onChange={(e) => update("headline", e.target.value)}
            placeholder="เช่น ครูสอนการตลาด"
            className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">มหาวิทยาลัย</label>
            <select
              value={form.university}
              onChange={(e) => update("university", e.target.value)}
              className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">เลือกมหาวิทยาลัย</option>
              {THAI_UNIVERSITIES.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">คณะ / สาขา</label>
            <input
              type="text"
              value={form.faculty}
              onChange={(e) => update("faculty", e.target.value)}
              placeholder="เช่น คณะบริหารธุรกิจ สาขาการตลาด"
              className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">เบอร์โทร</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">วุฒิการศึกษา/ประสบการณ์</label>
          <textarea
            rows={3}
            value={form.education}
            onChange={(e) => update("education", e.target.value)}
            className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">แนะนำตัว</label>
          <textarea
            rows={5}
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
            placeholder="เล่าเกี่ยวกับตัวคุณให้นักเรียนรู้จัก..."
            className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          />
        </div>

        {message && (
          <p className={`text-[13px] font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          {isSaving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
        </button>
      </form>
    </div>
  );
}