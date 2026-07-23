"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface SettingsClientProps {
  fullName: string;
  email: string;
  marketingConsent: boolean | null;
  analyticsConsent: boolean | null;
  contactConsent: boolean | null;
}

export default function SettingsClient({
  fullName,
  email,
  marketingConsent,
  analyticsConsent,
  contactConsent,
}: SettingsClientProps): ReactElement {
  const [editingName, setEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>(fullName);
  const [savingName, setSavingName] = useState<boolean>(false);

  const [consentOpen, setConsentOpen] = useState<boolean>(false);
  const [marketing, setMarketing] = useState<boolean>(marketingConsent ?? true);
  const [analytics, setAnalytics] = useState<boolean>(analyticsConsent ?? true);
  const [contact, setContact] = useState<boolean>(contactConsent ?? true);
  const [savingConsent, setSavingConsent] = useState<boolean>(false);

  const router = useRouter();
  const supabase = createClient();

  const handleSaveName = async (): Promise<void> => {
    if (!nameInput.trim()) return;
    setSavingName(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.auth.updateUser({ data: { full_name: nameInput.trim() } });
    await supabase.from("profiles").upsert({ id: user.id, full_name: nameInput.trim() });

    setSavingName(false);
    setEditingName(false);
    router.refresh();
  };

  const handleSaveConsent = async (): Promise<void> => {
    setSavingConsent(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date().toISOString();

    await supabase.from("profiles").upsert({
      id: user.id,
      marketing_consent: marketing,
      marketing_consent_at: now,
      analytics_consent: analytics,
      analytics_consent_at: now,
      contact_consent: contact,
      contact_consent_at: now,
    });

    setSavingConsent(false);
    setConsentOpen(false);
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="#0F1B3D" strokeWidth="1.8" />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">การตั้งค่า</h1>
      </div>

      <h2 className="text-[16px] font-bold text-[#0F1B3D] mb-5">ข้อมูลส่วนตัว</h2>

      <div className="space-y-6 pb-8 border-b border-[#0F1B3D]/[0.08]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] text-[#0F1B3D]/40 font-medium mb-1">ชื่อ-นามสกุล</p>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="text-[15px] font-bold text-[#0F1B3D] border border-[#0F1B3D]/15 rounded-lg px-3 py-1.5 outline-none focus:border-[#FF5A3C]"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="text-[13px] font-bold text-white bg-[#0F1B3D] px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  {savingName ? "..." : "บันทึก"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setNameInput(fullName);
                  }}
                  className="text-[13px] font-bold text-[#0F1B3D]/50 px-2"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <p className="text-[15px] font-bold text-[#0F1B3D]">{fullName || "ยังไม่ได้ตั้งชื่อ"}</p>
            )}
          </div>
          {!editingName && (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-[13px] font-bold text-[#7C5CFF] flex items-center gap-1.5"
            >
              ✎ แก้ไข
            </button>
          )}
        </div>

        <div>
          <p className="text-[12.5px] text-[#0F1B3D]/40 font-medium mb-1">อีเมลที่ใช้เข้าสู่ระบบ</p>
          <p className="text-[15px] font-bold text-[#0F1B3D]">{email}</p>
        </div>
      </div>

      <div className="pt-8">
        <h2 className="text-[16px] font-bold text-[#0F1B3D] mb-5">การจัดการข้อมูลส่วนตัว</h2>
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-[#0F1B3D]/70 font-medium">ความยินยอมข้อมูลส่วนบุคคล</p>
          <button
            type="button"
            onClick={() => setConsentOpen(true)}
            className="text-[13px] font-bold text-[#7C5CFF] flex items-center gap-1.5"
          >
            ✎ แก้ไข
          </button>
        </div>
      </div>

      {consentOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F1B3D]/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-8">
            <h3 className="text-[20px] font-extrabold text-[#0F1B3D] mb-6">ความยินยอมข้อมูลส่วนบุคคล</h3>

            <ConsentRow
              description="ท่านยินยอมรับข้อมูลส่วนลด โปรโมชันคอร์สเรียน ข่าวสาร กิจกรรมจาก Interact Edu"
              value={marketing}
              onChange={setMarketing}
            />
            <ConsentRow
              description="ท่านยินยอมให้เราวิเคราะห์และเข้าใจพฤติกรรมของท่าน เพื่อแนะนำคอร์สเรียนที่เหมาะสม"
              value={analytics}
              onChange={setAnalytics}
            />
            <ConsentRow
              description="ท่านยินยอมให้เราติดต่อกลับเพื่อสอบถามความคิดเห็นและพัฒนาปรับปรุงคุณภาพการให้บริการ"
              value={contact}
              onChange={setContact}
            />

            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConsentOpen(false)}
                className="flex-1 text-[14px] font-bold text-[#0F1B3D]/60 px-4 py-3 rounded-full border border-[#0F1B3D]/15"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveConsent}
                disabled={savingConsent}
                className="flex-1 text-[14px] font-bold text-white bg-[#FFCB47] px-4 py-3 rounded-full disabled:opacity-60"
              >
                {savingConsent ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentRow({
  description,
  value,
  onChange,
}: {
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): ReactElement {
  return (
    <div className="mb-6">
      <p className="text-[13.5px] text-[#0F1B3D]/70 leading-relaxed mb-3">{description}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-[13.5px] font-bold transition-colors ${
            value ? "border-[#FFCB47] text-[#0F1B3D]" : "border-[#0F1B3D]/10 text-[#0F1B3D]/40"
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              value ? "border-[#FFCB47]" : "border-[#0F1B3D]/20"
            }`}
          >
            {value && <span className="w-2 h-2 rounded-full bg-[#FFCB47]" />}
          </span>
          ยินยอม
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-[13.5px] font-bold transition-colors ${
            !value ? "border-[#FFCB47] text-[#0F1B3D]" : "border-[#0F1B3D]/10 text-[#0F1B3D]/40"
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              !value ? "border-[#FFCB47]" : "border-[#0F1B3D]/20"
            }`}
          >
            {!value && <span className="w-2 h-2 rounded-full bg-[#FFCB47]" />}
          </span>
          ไม่ยินยอม
        </button>
      </div>
    </div>
  );
}