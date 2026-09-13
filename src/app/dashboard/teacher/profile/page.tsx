// app/dashboard/teacher/profile/page.tsx
"use client";

import { useEffect, useRef, useState, type ReactElement, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Building2, GraduationCap, Mail, Pencil, Phone, Sparkles } from "lucide-react";
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

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-[13.5px] text-[#0F1B3D] outline-none transition focus:border-[#3157D5]/50 focus:bg-white focus:ring-4 focus:ring-[#3157D5]/10";
const labelClass = "mb-2 block text-[12px] font-bold text-slate-600";

export default function TeacherProfilePage(): ReactElement {
  const router = useRouter();
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [email, setEmail] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: "error", text: "กรุณาเข้าสู่ระบบก่อนแก้ไขโปรไฟล์" });
        setIsLoading(false);
        return;
      }
      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, headline, bio, phone, education, university, faculty")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        const loadedProfile = {
          full_name: data.full_name ?? "",
          avatar_url: data.avatar_url ?? "",
          headline: data.headline ?? "",
          bio: data.bio ?? "",
          phone: data.phone ?? "",
          education: data.education ?? "",
          university: data.university ?? "",
          faculty: data.faculty ?? "",
        };
        setProfile(loadedProfile);
        setForm(loadedProfile);
      } else {
        setMessage({ type: "error", text: error?.message ?? "ไม่พบข้อมูลโปรไฟล์ กรุณาติดต่อผู้ดูแลระบบ" });
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
    if (isUploading) return;
    setIsSaving(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage({ type: "error", text: "กรุณาเข้าสู่ระบบก่อนแก้ไขโปรไฟล์" });
      setIsSaving(false);
      return;
    }

    const { data: savedProfile, error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        avatar_url: form.avatar_url,
        headline: form.headline,
        bio: form.bio,
        phone: form.phone,
        education: form.education,
        university: form.university,
        faculty: form.faculty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id, full_name")
      .maybeSingle();

    if (error || !savedProfile) {
      setMessage({ type: "error", text: error?.message ?? "บันทึกไม่สำเร็จ: ไม่พบโปรไฟล์ที่แก้ไขได้ กรุณาติดต่อผู้ดูแลระบบ" });
      setIsSaving(false);
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: savedProfile.full_name },
    });
    const updatedProfile = { ...form, full_name: savedProfile.full_name ?? form.full_name.trim() };
    setProfile(updatedProfile);
    setForm(updatedProfile);
    setIsEditing(false);
    setMessage(authError
      ? { type: "error", text: "บันทึกโปรไฟล์แล้ว แต่ปรับชื่อในบัญชีไม่สำเร็จ: " + authError.message }
      : { type: "success", text: "บันทึกโปรไฟล์เรียบร้อยแล้ว" });
    router.refresh();
    setIsSaving(false);
  }

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function cancelEdit() {
    if (profile) setForm(profile);
    setMessage(null);
    setIsEditing(false);
  }

  if (isLoading) {
    return <p className="text-[13.5px] text-slate-400 py-8 text-center">กำลังโหลด...</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#3157D5]">Teacher profile</p>
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#0F1B3D] sm:text-[30px]">{isEditing ? "แก้ไขโปรไฟล์" : "โปรไฟล์ของฉัน"}</h1>
        <p className="mt-1 text-[13px] text-slate-500">ข้อมูลผู้สอนที่นักเรียนจะเห็นเมื่อเข้าชมคอร์สของคุณ</p>
      </div>

      {message && !isEditing && (
        <p role="status" className={`mb-5 rounded-2xl border px-4 py-3 text-[13px] font-medium ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`}>
          {message.text}
        </p>
      )}

      {profile && !isEditing && (
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,#0F1B3D_0%,#1B3267_68%,#3157D5_100%)] p-6 text-white shadow-[0_18px_36px_-22px_rgba(15,27,61,0.7)] sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-20 h-60 w-60 rounded-full bg-white/[0.04]" />
            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-end">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[25px] border-4 border-white/25 bg-white/15 text-3xl font-extrabold shadow-xl sm:h-28 sm:w-28">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
                ) : (profile.full_name.charAt(0).toUpperCase() || "ค")}
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
                  <Sparkles size={13} /> ผู้สอน
                </span>
                <h2 className="mt-3 break-words text-[25px] font-extrabold tracking-[-0.03em] sm:text-[30px]">{profile.full_name || "ยังไม่ได้ระบุชื่อ"}</h2>
                <p className="mt-1 text-[13px] text-white/75">{profile.headline || "เพิ่มตำแหน่งหรือความเชี่ยวชาญเพื่อแนะนำตัวกับนักเรียน"}</p>
              </div>
              <button
                type="button"
                onClick={() => { setForm(profile); setMessage(null); setIsEditing(true); }}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#0F1B3D] shadow-sm transition hover:bg-blue-50"
              >
                <Pencil size={15} /> แก้ไขโปรไฟล์
              </button>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
            <div className="space-y-5">
              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)] sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3157D5]/10 text-[#3157D5]"><BookOpenText size={19} /></span>
                  <h3 className="text-[15px] font-extrabold text-[#0F1B3D]">เกี่ยวกับฉัน</h3>
                </div>
                <p className="mt-5 whitespace-pre-wrap break-words text-[13.5px] leading-7 text-slate-600">{profile.bio || "ยังไม่ได้เขียนคำแนะนำตัว กดแก้ไขโปรไฟล์เพื่อบอกเล่าเกี่ยวกับตัวคุณ"}</p>
              </section>
              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)] sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A3C]/10 text-[#FF5A3C]"><GraduationCap size={20} /></span>
                  <h3 className="text-[15px] font-extrabold text-[#0F1B3D]">การศึกษาและประสบการณ์</h3>
                </div>
                <p className="mt-5 whitespace-pre-wrap break-words text-[13.5px] leading-7 text-slate-600">{profile.education || "ยังไม่ได้ระบุวุฒิการศึกษาหรือประสบการณ์"}</p>
              </section>
            </div>
            <section className="self-start rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)] sm:p-6">
              <h3 className="text-[15px] font-extrabold text-[#0F1B3D]">ข้อมูลผู้สอน</h3>
              <p className="mt-1 text-[12px] text-slate-400">ข้อมูลพื้นฐานในโปรไฟล์ของคุณ</p>
              <div className="mt-5 divide-y divide-slate-100">
                {[
                  { label: "อีเมล", value: email, icon: Mail },
                  { label: "เบอร์โทร", value: profile.phone, icon: Phone },
                  { label: "มหาวิทยาลัย", value: profile.university, icon: Building2 },
                  { label: "คณะ / สาขา", value: profile.faculty, icon: GraduationCap },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon size={16} /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
                      <p className="mt-0.5 break-words text-[12.5px] font-semibold text-[#0F1B3D]">{value || "ยังไม่ได้ระบุ"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {profile && isEditing && <form onSubmit={handleSubmit} className="space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_-24px_rgba(15,27,61,0.3)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-[16px] font-extrabold text-[#0F1B3D]">ข้อมูลส่วนตัว</h2>
            <p className="mt-1 text-[12px] text-slate-500">แก้ไขข้อมูลแล้วกดบันทึกเมื่อพร้อม</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-[#3157D5]">โหมดแก้ไข</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 p-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#0F1B3D] text-white">
            {form.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.avatar_url} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
            )}
            {!form.avatar_url && <span className="flex h-full w-full items-center justify-center text-2xl font-bold">{form.full_name.charAt(0).toUpperCase() || "ค"}</span>}
            {isUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label className={labelClass}>รูปโปรไฟล์</label>
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
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-[#0F1B3D] transition-colors hover:bg-blue-50 disabled:opacity-50"
            >
              {isUploading ? "กำลังอัปโหลด..." : "เลือกรูปภาพ"}
            </button>
            <p className="text-[11px] text-slate-400 mt-1">JPG, PNG ขนาดไม่เกิน 5MB</p>
          </div>
        </div>

        <div>
          <label className={labelClass}>ชื่อ-นามสกุล</label>
          <input
            type="text"
            required
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass}>ตำแหน่ง/ความเชี่ยวชาญ</label>
          <input
            type="text"
            value={form.headline}
            onChange={(e) => update("headline", e.target.value)}
            placeholder="เช่น ครูสอนการตลาด"
            className={fieldClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>มหาวิทยาลัย</label>
            <select
              value={form.university}
              onChange={(e) => update("university", e.target.value)}
              className={fieldClass}
            >
              <option value="">เลือกมหาวิทยาลัย</option>
              {THAI_UNIVERSITIES.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>คณะ / สาขา</label>
            <input
              type="text"
              value={form.faculty}
              onChange={(e) => update("faculty", e.target.value)}
              placeholder="เช่น คณะบริหารธุรกิจ สาขาการตลาด"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>เบอร์โทร</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass}>วุฒิการศึกษา/ประสบการณ์</label>
          <textarea
            rows={3}
            value={form.education}
            onChange={(e) => update("education", e.target.value)}
            className={`${fieldClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>แนะนำตัว</label>
          <textarea
            rows={5}
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
            placeholder="เล่าเกี่ยวกับตัวคุณให้นักเรียนรู้จัก..."
            className={`${fieldClass} resize-none`}
          />
        </div>

        {message && (
          <p role="alert" className={`text-[13px] font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={isSaving || isUploading}
            className="rounded-xl bg-[#0F1B3D] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#1B3267] disabled:opacity-50"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={isSaving || isUploading}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </form>
      }
    </div>
  );
}
