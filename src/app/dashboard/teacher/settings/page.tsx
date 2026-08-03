// app/dashboard/teacher/settings/page.tsx
"use client";

import { useEffect, useState, type ReactElement } from "react";
import { createClient } from "@/utils/supabase/client";
import ChangePasswordForm from "@/components/ChangePasswordForm";

const supabase = createClient();

export default function TeacherSettingsPage(): ReactElement {
  const [newStudentNotif, setNewStudentNotif] = useState(true);
  const [language, setLanguage] = useState<"th" | "en">("th");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data } = await supabase
        .from("profiles")
        .select("language, notify_new_student")
        .eq("id", user.id)
        .single();

      if (data) {
        setLanguage((data.language as "th" | "en") ?? "th");
        setNewStudentNotif(data.notify_new_student ?? true);
      }
      setIsLoading(false);
    }
    void load();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const { error } = await supabase
      .from("profiles")
      .update({
        language,
        notify_new_student: newStudentNotif,
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
        <p className="text-[14px] text-slate-500">จัดการความปลอดภัยและการแจ้งเตือน</p>
      </div>

      <section>
        <h2 className="text-[15px] font-bold text-slate-900 mb-4">ความปลอดภัย</h2>
        <ChangePasswordForm />
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-slate-900 mb-4">การแจ้งเตือน</h2>
        <label className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl cursor-pointer">
          <span className="text-[13.5px] font-medium text-slate-700">แจ้งเตือนเมื่อมีนักเรียนสมัครคอร์สใหม่</span>
          <input
            type="checkbox"
            checked={newStudentNotif}
            onChange={(e) => setNewStudentNotif(e.target.checked)}
            className="w-4 h-4 accent-blue-950"
          />
        </label>
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-slate-900 mb-4">ภาษาและระบบ</h2>
        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">ภาษาของ Dashboard</label>
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