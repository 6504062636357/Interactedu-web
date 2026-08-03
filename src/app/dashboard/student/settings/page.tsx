// app/dashboard/student/settings/page.tsx
"use client";

import { useEffect, useRef, useState, type ReactElement, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import ChangePasswordForm from "@/components/ChangePasswordForm";

const supabase = createClient();

export default function StudentSettingsPage(): ReactElement {
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [language, setLanguage] = useState<"th" | "en">("th");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }
      setEmail(user.email ?? "");

      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, pdpa_consent_at, language")
        .eq("id", user.id)
        .single();

      if (data) {
        setFullName(data.full_name ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setPdpaConsent(!!data.pdpa_consent_at);
        setLanguage((data.language as "th" | "en") ?? "th");
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

    setAvatarUrl(publicUrlData.publicUrl);
    setIsUploading(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        avatar_url: avatarUrl,
        language,
        pdpa_consent_at: pdpaConsent ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setIsSaving(false);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "บันทึกเรียบร้อยแล้ว" });
  }

  if (isLoading) return <p className="text-[13.5px] text-slate-400 py-8 text-center">กำลังโหลด...</p>;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-[24px] font-bold text-blue-950 mb-1">การตั้งค่า</h1>
        <p className="text-[14px] text-slate-500">จัดการข้อมูลบัญชี ความปลอดภัย และความถนัดของคุณ</p>
      </div>

      <section>
        <h2 className="text-[15px] font-bold text-slate-900 mb-4">ข้อมูลส่วนตัว & บัญชี</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden shrink-0 relative">
              {avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
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
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">อีเมล</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-400 cursor-not-allowed"
            />
            <p className="text-[11.5px] text-slate-400 mt-1">ติดต่อฝ่ายสนับสนุนหากต้องการเปลี่ยนอีเมล</p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pdpaConsent}
              onChange={(e) => setPdpaConsent(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-blue-950"
            />
            <span className="text-[13px] text-slate-600">
              ฉันยินยอมให้เก็บและใช้ข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว (PDPA)
            </span>
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-slate-900 mb-4">ความปลอดภัย</h2>
        <ChangePasswordForm />
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-slate-900 mb-4">ความถนัด / ภาษา</h2>
        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">ภาษาที่ใช้งาน</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as "th" | "en")}
          className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="th">ไทย</option>
          <option value="en">English</option>
        </select>
      </section>

      {message && (
        <p className={`text-[13px] font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
          {message.text}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-lg transition-colors"
      >
        {isSaving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
      </button>
    </div>
  );
}